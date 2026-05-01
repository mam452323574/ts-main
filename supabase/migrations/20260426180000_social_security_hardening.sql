-- Social security hardening (audit 2026-04-26)
--   S-03 : defense-in-depth garde auth.uid() dans les SECURITY DEFINER acceptant un user_id parametre
--   S-04 : check admin SQL (defense-in-depth) dans admin_eradicate_social_user_content et set_social_post_admin_reaction_adjustments
--   S-05 : REVOKE access aux VIEWS sensibles (social_moderation_queue, social_report_rollups)
--   S-06 : exclure les self-reports du seuil auto-flag dans apply_social_report_thresholds
--   S-07 : trigger reaction counter incremental + ajout du rate-limit 'impression'

-- =====================================================================
-- S-05 : restreindre l'acces aux VIEWS sensibles aux roles non-service
-- =====================================================================

REVOKE ALL ON public.social_moderation_queue FROM PUBLIC;
REVOKE ALL ON public.social_moderation_queue FROM anon;
REVOKE ALL ON public.social_moderation_queue FROM authenticated;

REVOKE ALL ON public.social_report_rollups FROM PUBLIC;
REVOKE ALL ON public.social_report_rollups FROM anon;
REVOKE ALL ON public.social_report_rollups FROM authenticated;

-- =====================================================================
-- S-03 : defense-in-depth dans les RPC SECURITY DEFINER acceptant un user_id
--   Pattern : autoriser l'invocation seulement si p_user_id correspond a auth.uid()
--             OU si l'invocateur est service_role (auth.uid() vaut alors NULL).
--   Cela ne change rien pour les Edge Functions (qui appellent en service_role
--   et passent toujours user.id du JWT) et bloque tout caller authenticated
--   qui essaierait d'usurper un autre user_id.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_social_post_reaction(
  p_post_id uuid,
  p_user_id uuid,
  p_reaction text
)
RETURNS TABLE (
  post_id uuid,
  viewer_reaction text,
  like_count integer,
  dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_reaction text := COALESCE(NULLIF(btrim(COALESCE(p_reaction, '')), ''), 'neutral');
  target_post public.social_posts%ROWTYPE;
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- defense-in-depth : seul service_role (auth.uid() IS NULL) ou le user lui-meme
  IF invoker_uid IS NOT NULL AND invoker_uid <> p_user_id THEN
    RAISE EXCEPTION 'p_user_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction NOT IN ('like', 'dislike', 'neutral') THEN
    RAISE EXCEPTION 'Unsupported reaction: %', normalized_reaction
      USING ERRCODE = '22023';
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  IF target_post.id IS NULL OR target_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    target_post.moderation_state = 'approved'
    OR (
      target_post.moderation_state = 'pending'
      AND target_post.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social post reactions are only allowed on approved posts or your own pending posts'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction = 'neutral' THEN
    DELETE FROM public.social_post_likes AS post_like
    WHERE post_like.post_id = p_post_id
      AND post_like.user_id = p_user_id;
  ELSE
    INSERT INTO public.social_post_likes (
      post_id,
      user_id,
      reaction_type
    )
    VALUES (
      p_post_id,
      p_user_id,
      normalized_reaction
    )
    ON CONFLICT ON CONSTRAINT social_post_likes_post_user_unique DO UPDATE
    SET
      reaction_type = EXCLUDED.reaction_type,
      updated_at = now();
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_post.id AS post_id,
    normalized_reaction AS viewer_reaction,
    public.get_effective_social_reaction_count(
      target_post.like_count,
      target_post.admin_like_adjustment
    ) AS like_count,
    public.get_effective_social_reaction_count(
      target_post.dislike_count,
      target_post.admin_dislike_adjustment
    ) AS dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_social_impressions(
  p_post_ids uuid[],
  p_viewer_id uuid,
  p_source text DEFAULT 'feed'
)
RETURNS TABLE (
  recorded_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_source text := COALESCE(NULLIF(btrim(COALESCE(p_source, '')), ''), 'feed');
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF invoker_uid IS NOT NULL AND invoker_uid <> p_viewer_id THEN
    RAISE EXCEPTION 'p_viewer_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_source NOT IN ('feed', 'detail', 'comments') THEN
    RAISE EXCEPTION 'Unsupported impression source: %', normalized_source
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH inserted_rows AS (
    INSERT INTO public.social_post_impressions (
      post_id,
      viewer_id,
      source,
      impression_window
    )
    SELECT DISTINCT
      post_id,
      p_viewer_id,
      normalized_source,
      date_trunc('hour', now())
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) AS post_id
    WHERE post_id IS NOT NULL
    ON CONFLICT (post_id, viewer_id, source, impression_window) DO NOTHING
    RETURNING post_id
  ),
  refreshed AS (
    SELECT public.refresh_social_post_impression_count(inserted_rows.post_id)
    FROM inserted_rows
    GROUP BY inserted_rows.post_id
  )
  SELECT COUNT(*)::integer
  FROM inserted_rows;
END;
$$;

-- record_social_impressions garde sa visibilite originelle (heritage de la migration foundation)
-- Elle ne fait pas l'objet d'un GRANT/REVOKE explicite ici car les Edge Functions l'invoquent en service_role.

CREATE OR REPLACE FUNCTION public.set_social_comment_like(
  p_comment_id uuid,
  p_user_id uuid,
  p_liked boolean
)
RETURNS TABLE (
  comment_id uuid,
  viewer_has_liked boolean,
  like_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_comment public.social_comments%ROWTYPE;
  parent_post public.social_posts%ROWTYPE;
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF invoker_uid IS NOT NULL AND invoker_uid <> p_user_id THEN
    RAISE EXCEPTION 'p_user_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT social_comment.*
  INTO target_comment
  FROM public.social_comments AS social_comment
  WHERE social_comment.id = p_comment_id
  LIMIT 1;

  IF target_comment.id IS NULL OR target_comment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social comment not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT social_post.*
  INTO parent_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = target_comment.post_id
  LIMIT 1;

  IF parent_post.id IS NULL OR parent_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    parent_post.moderation_state = 'approved'
    OR (
      parent_post.moderation_state = 'pending'
      AND parent_post.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social comment likes are only allowed on approved posts or your own pending posts'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    target_comment.moderation_state = 'approved'
    OR (
      target_comment.moderation_state = 'pending'
      AND target_comment.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social comment likes are only allowed on approved comments or your own pending comments'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_liked THEN
    INSERT INTO public.social_comment_likes (
      comment_id,
      user_id
    )
    VALUES (
      p_comment_id,
      p_user_id
    )
    ON CONFLICT (comment_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.social_comment_likes AS comment_like
    WHERE comment_like.comment_id = p_comment_id
      AND comment_like.user_id = p_user_id;
  END IF;

  SELECT social_comment.*
  INTO target_comment
  FROM public.social_comments AS social_comment
  WHERE social_comment.id = p_comment_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_comment.id AS comment_id,
    EXISTS (
      SELECT 1
      FROM public.social_comment_likes AS comment_like
      WHERE comment_like.comment_id = p_comment_id
        AND comment_like.user_id = p_user_id
    ) AS viewer_has_liked,
    COALESCE(target_comment.like_count, 0) AS like_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.record_social_post_views(
  p_post_ids uuid[],
  p_viewer_id uuid
)
RETURNS TABLE (
  recorded_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF invoker_uid IS NOT NULL AND invoker_uid <> p_viewer_id THEN
    RAISE EXCEPTION 'p_viewer_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH inserted_rows AS (
    INSERT INTO public.social_post_views (
      post_id,
      viewer_id
    )
    SELECT DISTINCT
      post_id,
      p_viewer_id
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) AS post_id
    WHERE post_id IS NOT NULL
    ON CONFLICT (post_id, viewer_id) DO NOTHING
    RETURNING post_id
  )
  SELECT COUNT(*)::integer
  FROM inserted_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.record_social_post_views(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_social_post_views(uuid[], uuid) TO service_role;

-- =====================================================================
-- S-04 : check admin SQL (defense-in-depth) sur les RPC admin
--   Aujourd'hui les Edge Functions verifient deja account_tier='admin' et
--   les RPCs sont GRANT service_role only. On ajoute ici une garde
--   redondante pour bloquer toute future invocation directe sans check admin.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_social_post_admin_reaction_adjustments(
  p_post_id uuid,
  p_admin_like_adjustment integer,
  p_admin_dislike_adjustment integer
)
RETURNS TABLE (
  post_id uuid,
  raw_like_count integer,
  raw_dislike_count integer,
  admin_like_adjustment integer,
  admin_dislike_adjustment integer,
  effective_like_count integer,
  effective_dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  updated_post public.social_posts%ROWTYPE;
  invoker_uid uuid := auth.uid();
BEGIN
  -- defense-in-depth : si invocation par un user authentifie (et pas service_role),
  -- exiger le tier admin. service_role conserve un acces non bloquant.
  IF invoker_uid IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = invoker_uid
        AND account_tier = 'admin'
    ) THEN
      RAISE EXCEPTION 'Admin access is required to adjust reactions'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id is required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_posts AS social_post
  SET
    admin_like_adjustment = COALESCE(p_admin_like_adjustment, 0),
    admin_dislike_adjustment = COALESCE(p_admin_dislike_adjustment, 0),
    updated_at = now()
  WHERE social_post.id = p_post_id
  RETURNING social_post.*
  INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    updated_post.id AS post_id,
    COALESCE(updated_post.like_count, 0) AS raw_like_count,
    COALESCE(updated_post.dislike_count, 0) AS raw_dislike_count,
    COALESCE(updated_post.admin_like_adjustment, 0) AS admin_like_adjustment,
    COALESCE(updated_post.admin_dislike_adjustment, 0) AS admin_dislike_adjustment,
    public.get_effective_social_reaction_count(
      updated_post.like_count,
      updated_post.admin_like_adjustment
    ) AS effective_like_count,
    public.get_effective_social_reaction_count(
      updated_post.dislike_count,
      updated_post.admin_dislike_adjustment
    ) AS effective_dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_admin_reaction_adjustments(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_admin_reaction_adjustments(uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_eradicate_social_user_content(
  p_target_user_id uuid,
  p_actor_id uuid,
  p_note text DEFAULT NULL
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
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id is required'
      USING ERRCODE = '22023';
  END IF;

  -- defense-in-depth : si invocation par un user authentifie (pas service_role),
  -- exiger que p_actor_id corresponde et que ce soit un admin. service_role est libre.
  IF invoker_uid IS NOT NULL THEN
    IF invoker_uid <> p_actor_id THEN
      RAISE EXCEPTION 'p_actor_id must match auth.uid()'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.user_profiles
      WHERE id = invoker_uid
        AND account_tier = 'admin'
    ) THEN
      RAISE EXCEPTION 'Admin access is required to eradicate user content'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

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
      SELECT user_post.id
      FROM user_posts AS user_post
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
            SELECT user_post.id
            FROM user_posts AS user_post
          )
        )
        OR
        (
          social_report.target_type = 'comment'
          AND social_report.target_comment_id IN (
            SELECT own_comment.id
            FROM own_comments AS own_comment
            UNION
            SELECT cascaded_comment.id
            FROM cascaded_comments AS cascaded_comment
          )
        )
      )
    RETURNING social_report.id
  )
  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM user_posts
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM own_comments
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM cascaded_comments
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM resolved_reports
    ), 0),
    COALESCE((
      SELECT ARRAY_AGG(DISTINCT user_post.asset_path)
      FROM user_posts AS user_post
      WHERE user_post.asset_path IS NOT NULL
        AND btrim(user_post.asset_path) <> ''
    ), '{}'::text[])
  INTO
    v_post_count,
    v_own_comment_count,
    v_cascaded_comment_count,
    v_resolved_report_count,
    v_asset_paths;

  SELECT user_ban.id
  INTO v_active_ban_id
  FROM public.user_bans AS user_ban
  WHERE user_ban.user_id = p_target_user_id
    AND user_ban.scope = 'all'
    AND user_ban.starts_at <= v_now
    AND (user_ban.ends_at IS NULL OR user_ban.ends_at > v_now)
    AND user_ban.revoked_at IS NULL
  ORDER BY user_ban.created_at DESC
  LIMIT 1;

  IF v_active_ban_id IS NULL THEN
    INSERT INTO public.user_bans (
      user_id,
      scope,
      reason,
      starts_at,
      ends_at,
      issued_by
    )
    VALUES (
      p_target_user_id,
      'all',
      'admin_eradication',
      v_now,
      NULL,
      p_actor_id
    )
    RETURNING id
    INTO v_active_ban_id;

    v_ban_created := true;
  ELSE
    UPDATE public.user_bans AS user_ban
    SET
      ends_at = NULL,
      reason = COALESCE(NULLIF(user_ban.reason, ''), 'admin_eradication'),
      updated_at = v_now
    WHERE user_ban.id = v_active_ban_id;
  END IF;

  UPDATE public.user_profiles AS user_profile
  SET
    avatar_url = NULL,
    updated_at = v_now
  WHERE user_profile.id = p_target_user_id;

  INSERT INTO public.social_moderation_events (
    target_type,
    target_post_id,
    target_comment_id,
    target_user_id,
    actor_id,
    actor_type,
    actor_label,
    action,
    previous_moderation_state,
    next_moderation_state,
    reason_code,
    note,
    linked_report_ids,
    metadata_json
  )
  VALUES (
    'user',
    NULL,
    NULL,
    p_target_user_id,
    p_actor_id,
    'admin',
    NULL,
    'eradicate_user_content',
    NULL,
    NULL,
    'admin_eradication',
    p_note,
    '{}'::uuid[],
    jsonb_build_object(
      'operation_id', v_operation_id,
      'source', 'social_admin_eradicate_user',
      'eradicated_by', p_actor_id,
      'eradicated_at', v_now,
      'post_count', v_post_count,
      'own_comment_count', v_own_comment_count,
      'cascaded_comment_count', v_cascaded_comment_count,
      'resolved_report_count', v_resolved_report_count,
      'ban_created', v_ban_created,
      'ban_scope', 'all',
      'ban_id', v_active_ban_id,
      'asset_path_count', COALESCE(array_length(v_asset_paths, 1), 0),
      'storage_cleanup_status', 'pending'
    )
  )
  RETURNING id
  INTO v_event_id;

  RETURN QUERY
  SELECT
    v_operation_id AS operation_id,
    v_event_id AS event_id,
    p_target_user_id AS target_user_id,
    v_post_count AS post_count,
    v_own_comment_count AS own_comment_count,
    v_cascaded_comment_count AS cascaded_comment_count,
    v_resolved_report_count AS resolved_report_count,
    v_ban_created AS ban_created,
    v_asset_paths AS asset_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_eradicate_social_user_content(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_eradicate_social_user_content(uuid, uuid, text) TO service_role;

-- =====================================================================
-- S-06 : exclure les self-reports du seuil auto-flag
--   Defense-in-depth en plus du check applicatif assertReportableTargetNotOwnedByUser.
--   Empeche aussi qu'un compte attaquant qui aurait reussi a poster un report
--   sur son propre contenu (via futur bug ou admin compromis) ne pollue le compteur.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_social_report_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  unique_reporters_24h integer := 0;
  auto_hide_threshold constant integer := 3;
  target_post_author uuid;
  target_comment_author uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.target_type = 'post' AND NEW.target_post_id IS NOT NULL THEN
    SELECT social_post.author_id
    INTO target_post_author
    FROM public.social_posts AS social_post
    WHERE social_post.id = NEW.target_post_id
    LIMIT 1;

    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'post'
      AND target_post_id = NEW.target_post_id
      AND created_at >= (now() - interval '24 hours')
      AND (target_post_author IS NULL OR reporter_id <> target_post_author);

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_posts
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_post_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  ELSIF NEW.target_type = 'comment' AND NEW.target_comment_id IS NOT NULL THEN
    SELECT social_comment.author_id
    INTO target_comment_author
    FROM public.social_comments AS social_comment
    WHERE social_comment.id = NEW.target_comment_id
    LIMIT 1;

    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'comment'
      AND target_comment_id = NEW.target_comment_id
      AND created_at >= (now() - interval '24 hours')
      AND (target_comment_author IS NULL OR reporter_id <> target_comment_author);

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_comments
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_comment_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- S-07 : trigger reaction counter incremental + rate-limit 'impression'
--   1) handle_social_post_like_counter passe d'un full COUNT(*) a un UPDATE
--      incremental qui prend O(1) sur la table sociale.
--   2) check_social_rate_limit accepte une nouvelle action 'impression' avec
--      une fenetre 5 minutes / 100 calls (defense-in-depth contre flood).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_social_post_like_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts
    SET
      like_count = CASE
        WHEN NEW.reaction_type = 'like' THEN COALESCE(like_count, 0) + 1
        ELSE COALESCE(like_count, 0)
      END,
      dislike_count = CASE
        WHEN NEW.reaction_type = 'dislike' THEN COALESCE(dislike_count, 0) + 1
        ELSE COALESCE(dislike_count, 0)
      END,
      updated_at = now()
    WHERE id = NEW.post_id;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts
    SET
      like_count = CASE
        WHEN OLD.reaction_type = 'like' THEN GREATEST(COALESCE(like_count, 0) - 1, 0)
        ELSE COALESCE(like_count, 0)
      END,
      dislike_count = CASE
        WHEN OLD.reaction_type = 'dislike' THEN GREATEST(COALESCE(dislike_count, 0) - 1, 0)
        ELSE COALESCE(dislike_count, 0)
      END,
      updated_at = now()
    WHERE id = OLD.post_id;

    RETURN OLD;
  END IF;

  -- TG_OP = 'UPDATE'
  IF NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    -- decrement de l'ancien post
    UPDATE public.social_posts
    SET
      like_count = CASE
        WHEN OLD.reaction_type = 'like' THEN GREATEST(COALESCE(like_count, 0) - 1, 0)
        ELSE COALESCE(like_count, 0)
      END,
      dislike_count = CASE
        WHEN OLD.reaction_type = 'dislike' THEN GREATEST(COALESCE(dislike_count, 0) - 1, 0)
        ELSE COALESCE(dislike_count, 0)
      END,
      updated_at = now()
    WHERE id = OLD.post_id;

    UPDATE public.social_posts
    SET
      like_count = CASE
        WHEN NEW.reaction_type = 'like' THEN COALESCE(like_count, 0) + 1
        ELSE COALESCE(like_count, 0)
      END,
      dislike_count = CASE
        WHEN NEW.reaction_type = 'dislike' THEN COALESCE(dislike_count, 0) + 1
        ELSE COALESCE(dislike_count, 0)
      END,
      updated_at = now()
    WHERE id = NEW.post_id;

    RETURN NEW;
  END IF;

  IF NEW.reaction_type IS DISTINCT FROM OLD.reaction_type THEN
    UPDATE public.social_posts
    SET
      like_count = CASE
        WHEN NEW.reaction_type = 'like' THEN COALESCE(like_count, 0) + 1
        WHEN OLD.reaction_type = 'like' THEN GREATEST(COALESCE(like_count, 0) - 1, 0)
        ELSE COALESCE(like_count, 0)
      END,
      dislike_count = CASE
        WHEN NEW.reaction_type = 'dislike' THEN COALESCE(dislike_count, 0) + 1
        WHEN OLD.reaction_type = 'dislike' THEN GREATEST(COALESCE(dislike_count, 0) - 1, 0)
        ELSE COALESCE(dislike_count, 0)
      END,
      updated_at = now()
    WHERE id = NEW.post_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_social_rate_limit(
  p_action text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  allowed boolean,
  limit_count integer,
  window_seconds integer,
  recent_count bigint,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  feature_flags public.app_feature_flags%ROWTYPE;
  oldest_event timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO feature_flags
  FROM public.app_feature_flags
  WHERE scope = 'mobile'
  LIMIT 1;

  IF p_action = 'post' THEN
    limit_count := COALESCE(feature_flags.post_rate_limit_per_day, 3);
    window_seconds := 86400;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_posts
    WHERE author_id = p_user_id
      AND created_at >= (now() - interval '1 day');
  ELSIF p_action = 'comment' THEN
    limit_count := COALESCE(feature_flags.comment_rate_limit_per_hour, 10);
    window_seconds := 3600;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_comments
    WHERE author_id = p_user_id
      AND created_at >= (now() - interval '1 hour');
  ELSIF p_action = 'report' THEN
    limit_count := COALESCE(feature_flags.report_rate_limit_per_day, 10);
    window_seconds := 86400;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_reports
    WHERE reporter_id = p_user_id
      AND created_at >= (now() - interval '1 day');
  ELSIF p_action = 'impression' THEN
    -- defense-in-depth contre le flood d'impressions/views.
    -- La protection principale reste la contrainte UNIQUE sur
    -- social_post_impressions(post_id, viewer_id, source, impression_window),
    -- qui plafonne deja les nouvelles lignes a 1/post/source/heure.
    limit_count := 100;
    window_seconds := 300;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_post_impressions
    WHERE viewer_id = p_user_id
      AND created_at >= (now() - interval '5 minutes');
  ELSE
    RAISE EXCEPTION 'Unsupported social rate limit action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  recent_count := COALESCE(recent_count, 0);
  allowed := recent_count < limit_count;

  IF allowed THEN
    retry_after_seconds := 0;
  ELSIF oldest_event IS NULL THEN
    retry_after_seconds := window_seconds;
  ELSIF p_action = 'comment' THEN
    retry_after_seconds := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((oldest_event + interval '1 hour') - now())))::integer
    );
  ELSIF p_action = 'impression' THEN
    retry_after_seconds := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((oldest_event + interval '5 minutes') - now())))::integer
    );
  ELSE
    retry_after_seconds := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((oldest_event + interval '1 day') - now())))::integer
    );
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_social_rate_limit(text, uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
