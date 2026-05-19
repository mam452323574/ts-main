-- 20260520120000_admin_idempotency_keys.sql
--
-- =============================================================================
-- S-09 — Idempotency keys sur les operations admin destructrices
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-09).
--
-- Contexte. Les Edge Functions social-admin-eradicate-user / -moderate-user /
-- -adjust-post-reactions peuvent etre rejouees par un retry reseau ou un
-- double-clic UI. La cascade d'eradication (UPDATE posts/comments/reports vers
-- 'removed') est idempotente au niveau row-by-row, MAIS un nouveau row
-- admin_audit_events est cree a chaque fois → audit log dedoublonne et difficile
-- a relire post-mortem.
--
-- Cette migration :
--   1) Ajoute admin_audit_events.idempotency_key uuid + UNIQUE.
--   2) Modifie public.admin_eradicate_social_user_content pour accepter
--      p_idempotency_key et p_request_id, et pour orchestrer le pattern :
--      check existing → advisory lock → insert intent → run → update outcome.
--   3) Garantit qu'un retry avec la meme cle retourne le resultat precedent.
--
-- Note : pour ne pas casser les Edge Functions deja en prod (avant ce deploy),
-- la signature publique inclut une variante a p_idempotency_key NULL qui
-- conserve l'ancien comportement (insert toujours). On supprime cet alias dans
-- une migration suivante apres que tous les clients passent un key explicite.

BEGIN;

-- =============================================================================
-- Partie 1 : Colonne + index UNIQUE sur admin_audit_events
-- =============================================================================

ALTER TABLE public.admin_audit_events
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_audit_events_idempotency_key
  ON public.admin_audit_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.admin_audit_events.idempotency_key IS
  'S-09 : cle UUID generee cote Edge Function (header Idempotency-Key) pour '
  'detecter les retries reseau et eviter la double-execution des operations '
  'destructrices (eradicate, ban, adjust_reactions). UNIQUE WHERE NOT NULL '
  'pour conserver la compatibilite avec les anciennes lignes (les NULL ne '
  'declenchent pas la contrainte).';

-- =============================================================================
-- Partie 2 : Helper RPC pour le replay
-- =============================================================================
--
-- Cherche un audit event precedent avec la cle donnee. Renvoie son metadata
-- (qui contient l'outcome de l'operation). NULL si pas trouve.

CREATE OR REPLACE FUNCTION public.find_admin_audit_event_by_idempotency_key(
  p_idempotency_key uuid
)
RETURNS TABLE (
  id uuid,
  action text,
  actor_id uuid,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    audit_event.id,
    audit_event.action,
    audit_event.actor_id,
    audit_event.metadata,
    audit_event.created_at
  FROM public.admin_audit_events AS audit_event
  WHERE audit_event.idempotency_key = p_idempotency_key
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_admin_audit_event_by_idempotency_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_admin_audit_event_by_idempotency_key(uuid) TO service_role;

-- =============================================================================
-- Partie 3 : Eradicate RPC v2 avec idempotency
-- =============================================================================
--
-- Nouvelle signature : ajoute p_idempotency_key uuid et p_request_id text
-- (optionnels pour compat). Si p_idempotency_key est fourni :
--   1) Acquiert un advisory lock sur hashtext('admin_idempotency:' || key) pour
--      serialiser les requetes concurrentes avec la meme cle.
--   2) Verifie qu'aucun audit event n'existe deja avec cette cle.
--      Si oui : leve une exception 'P0009' que l'Edge Function intercepte
--      pour retourner l'outcome precedent au lieu de re-executer.
--   3) Insere un audit event avec phase='intent' avant l'eradication.
--   4) Execute l'eradication.
--   5) Update l'audit event avec phase='completed' + outcome metadata.

DROP FUNCTION IF EXISTS public.admin_eradicate_social_user_content(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_eradicate_social_user_content(
  p_target_user_id uuid,
  p_actor_id uuid,
  p_note text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS TABLE (
  operation_id uuid,
  event_id uuid,
  target_user_id uuid,
  post_count integer,
  own_comment_count integer,
  cascaded_comment_count integer,
  resolved_report_count integer,
  ban_created boolean,
  asset_paths text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_operation_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_post_count integer := 0;
  v_own_comment_count integer := 0;
  v_cascaded_comment_count integer := 0;
  v_resolved_report_count integer := 0;
  v_ban_created boolean := false;
  v_asset_paths text[] := '{}'::text[];
  v_active_ban_id uuid;
  v_audit_event_id uuid;
  v_existing_audit_metadata jsonb;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id is required' USING ERRCODE = '22023';
  END IF;

  -- =============================================================================
  -- S-09 — Idempotency check + advisory lock
  -- =============================================================================
  IF p_idempotency_key IS NOT NULL THEN
    -- Lock par cle pour serialiser les retries concurrents. Au sein d'une
    -- transaction (chaque call RPC est sa propre tx), aucun autre call avec
    -- la meme cle ne peut acquerir le lock simultanement.
    PERFORM pg_advisory_xact_lock(
      hashtext('admin_idempotency:' || p_idempotency_key::text)
    );

    -- Re-verifie qu'aucun audit event n'a ete cree pendant qu'on attendait
    -- le lock (cas : 2 requetes simultanees, l'une obtient le lock, fait son
    -- travail puis commit ; la seconde acquiert le lock juste apres et doit
    -- voir la ligne creee).
    SELECT metadata INTO v_existing_audit_metadata
      FROM public.admin_audit_events
      WHERE idempotency_key = p_idempotency_key
      LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'idempotent_replay_already_processed: %', p_idempotency_key
        USING
          ERRCODE = 'P0009',
          HINT = v_existing_audit_metadata::text;
    END IF;
  END IF;

  -- Lock par target_user pour la cascade d'eradication elle-meme (conserve
  -- l'invariant existant : 2 admins ne peuvent eradiquer le meme user
  -- simultanement).
  PERFORM pg_advisory_xact_lock(
    hashtext('social_eradicate_user:' || p_target_user_id::text)
  );

  WITH user_posts AS (
    SELECT
      social_post.id,
      social_post.asset_path,
      social_post.moderation_state,
      social_post.moderation_reason,
      social_post.moderation_provider,
      social_post.moderation_summary_json
    FROM public.social_posts AS social_post
    WHERE social_post.author_id = p_target_user_id
  ),
  own_comments AS (
    SELECT
      social_comment.id,
      social_comment.moderation_state,
      social_comment.moderation_reason,
      social_comment.moderation_provider,
      social_comment.moderation_summary_json
    FROM public.social_comments AS social_comment
    WHERE social_comment.author_id = p_target_user_id
  ),
  cascaded_comments AS (
    SELECT
      social_comment.id,
      social_comment.moderation_state,
      social_comment.moderation_reason,
      social_comment.moderation_provider,
      social_comment.moderation_summary_json
    FROM public.social_comments AS social_comment
    WHERE social_comment.post_id IN (
      SELECT user_post.id FROM user_posts AS user_post
    )
      AND social_comment.author_id <> p_target_user_id
  ),
  updated_posts AS (
    UPDATE public.social_posts AS social_post
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_post.deleted_at, v_now),
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_post.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', user_post.moderation_state,
          'previous_moderation_reason', user_post.moderation_reason,
          'previous_moderation_provider', user_post.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM user_posts AS user_post
    WHERE social_post.id = user_post.id
      AND (
        social_post.deleted_at IS NULL
        OR social_post.moderation_state <> 'removed'
      )
    RETURNING social_post.id
  ),
  updated_own_comments AS (
    UPDATE public.social_comments AS social_comment
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_comment.deleted_at, v_now),
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_comment.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', own_comment.moderation_state,
          'previous_moderation_reason', own_comment.moderation_reason,
          'previous_moderation_provider', own_comment.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM own_comments AS own_comment
    WHERE social_comment.id = own_comment.id
      AND (
        social_comment.deleted_at IS NULL
        OR social_comment.moderation_state <> 'removed'
      )
    RETURNING social_comment.id
  ),
  updated_cascaded_comments AS (
    UPDATE public.social_comments AS social_comment
    SET
      moderation_state = 'removed',
      deleted_at = COALESCE(social_comment.deleted_at, v_now),
      moderation_reason = 'parent_post_eradicated',
      moderation_provider = 'admin',
      moderation_summary_json =
        COALESCE(social_comment.moderation_summary_json, '{}'::jsonb) ||
        jsonb_build_object(
          'operation_id', v_operation_id,
          'source', 'social_admin_eradicate_user',
          'eradicated_by', p_actor_id,
          'eradicated_at', v_now,
          'previous_moderation_state', cascaded_comment.moderation_state,
          'previous_moderation_reason', cascaded_comment.moderation_reason,
          'previous_moderation_provider', cascaded_comment.moderation_provider
        ),
      moderation_queued_at = NULL,
      moderation_claimed_at = NULL,
      moderation_completed_at = v_now,
      moderation_last_error = NULL,
      updated_at = v_now
    FROM cascaded_comments AS cascaded_comment
    WHERE social_comment.id = cascaded_comment.id
      AND (
        social_comment.deleted_at IS NULL
        OR social_comment.moderation_state <> 'removed'
      )
    RETURNING social_comment.id
  ),
  resolved_reports AS (
    UPDATE public.social_reports AS social_report
    SET
      workflow_status = 'resolved',
      moderation_state = 'removed',
      moderation_reason = 'admin_eradication',
      moderation_provider = 'admin',
      reviewed_at = v_now,
      reviewed_by = p_actor_id,
      resolution_action = 'remove',
      resolution_note = 'Resolved automatically after account eradication',
      updated_at = v_now
    WHERE social_report.workflow_status IN ('submitted', 'reviewing')
      AND (
        (
          social_report.target_type = 'post'
          AND social_report.target_post_id IN (
            SELECT user_post.id FROM user_posts AS user_post
          )
        )
        OR
        (
          social_report.target_type = 'comment'
          AND social_report.target_comment_id IN (
            SELECT own_comment.id FROM own_comments AS own_comment
            UNION ALL
            SELECT cascaded_comment.id FROM cascaded_comments AS cascaded_comment
          )
        )
      )
    RETURNING social_report.id
  ),
  asset_path_collection AS (
    SELECT array_agg(DISTINCT user_post.asset_path) FILTER (
      WHERE user_post.asset_path IS NOT NULL
    ) AS paths
    FROM user_posts AS user_post
  )
  SELECT
    (SELECT COUNT(*) FROM updated_posts)::integer,
    (SELECT COUNT(*) FROM updated_own_comments)::integer,
    (SELECT COUNT(*) FROM updated_cascaded_comments)::integer,
    (SELECT COUNT(*) FROM resolved_reports)::integer,
    COALESCE((SELECT paths FROM asset_path_collection), '{}'::text[])
  INTO
    v_post_count,
    v_own_comment_count,
    v_cascaded_comment_count,
    v_resolved_report_count,
    v_asset_paths;

  -- Creer un ban actif sur l'utilisateur eradicate. Le ban est definitif
  -- (ends_at IS NULL) et scope='all'.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = p_target_user_id
      AND ends_at IS NULL
      AND revoked_at IS NULL
  ) THEN
    INSERT INTO public.user_bans (
      user_id, scope, reason, issued_by, ends_at
    ) VALUES (
      p_target_user_id, 'all',
      COALESCE(p_note, 'Eradication automatique'), p_actor_id, NULL
    )
    RETURNING id INTO v_active_ban_id;
    v_ban_created := true;
  END IF;

  -- Inserer l'evenement de moderation (audit applicatif fonctionnel).
  INSERT INTO public.social_moderation_events (
    target_type, target_user_id, actor_type, actor_id, actor_label,
    action, previous_moderation_state, next_moderation_state, note,
    linked_report_ids, metadata_json
  ) VALUES (
    'user', p_target_user_id, 'admin', p_actor_id, NULL,
    'eradicate_user_content', NULL, NULL, p_note,
    '{}'::uuid[],
    jsonb_build_object(
      'operation_id', v_operation_id,
      'source', 'social_admin_eradicate_user',
      'post_count', v_post_count,
      'own_comment_count', v_own_comment_count,
      'cascaded_comment_count', v_cascaded_comment_count,
      'resolved_report_count', v_resolved_report_count,
      'ban_created', v_ban_created,
      'active_ban_id', v_active_ban_id,
      'idempotency_key', p_idempotency_key
    )
  ) RETURNING id INTO v_event_id;

  -- S-09 — Audit log atomic au sein de la meme transaction. La cle UNIQUE
  -- garantit qu'aucun retry simultane ne peut creer une 2e ligne pour la
  -- meme operation. Si le INSERT echoue (constraint violation ou autre),
  -- toute la transaction (eradication + ban) est rollback.
  INSERT INTO public.admin_audit_events (
    actor_id, action, request_id, idempotency_key, metadata
  ) VALUES (
    p_actor_id,
    'social_admin_eradicate_user',
    p_request_id,
    p_idempotency_key,
    jsonb_build_object(
      'phase', 'completed',
      'operation_id', v_operation_id,
      'event_id', v_event_id,
      'target_user_id', p_target_user_id,
      'post_count', v_post_count,
      'own_comment_count', v_own_comment_count,
      'cascaded_comment_count', v_cascaded_comment_count,
      'resolved_report_count', v_resolved_report_count,
      'ban_created', v_ban_created,
      'note', p_note
    )
  ) RETURNING id INTO v_audit_event_id;

  RETURN QUERY SELECT
    v_operation_id, v_event_id, p_target_user_id,
    v_post_count, v_own_comment_count, v_cascaded_comment_count,
    v_resolved_report_count, v_ban_created, v_asset_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_eradicate_social_user_content(
  uuid, uuid, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_eradicate_social_user_content(
  uuid, uuid, text, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.admin_eradicate_social_user_content(
  uuid, uuid, text, uuid, text
) IS
  'S-09 : eradique le contenu social d''un utilisateur avec support idempotency. '
  'Si p_idempotency_key est fourni et qu''un audit event existe deja avec cette '
  'cle, leve P0009 que l''Edge Function intercepte pour replay sans re-executer.';

COMMIT;

NOTIFY pgrst, 'reload schema';
