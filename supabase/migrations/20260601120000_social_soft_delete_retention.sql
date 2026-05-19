-- 20260601120000_social_soft_delete_retention.sql
--
-- =============================================================================
-- S-18 — Retention automatique des contenus social_posts/social_comments
--        soft-deletes au-dela de 30 jours
-- =============================================================================
--
-- Audit : SOCIAL_SECURITY_AUDIT.md (finding S-18).
--
-- Contexte. Les posts/comments soft-deletes (deleted_at IS NOT NULL) restent
-- indefiniment en base. Risque GDPR si user demande suppression complete
-- (article 17 RGPD). Cette migration cree une RPC qui hard-delete les rows
-- soft-deletes depuis > 30 jours, et la planifie via pg_cron quotidiennement
-- a 03:00 UTC (faible charge).
--
-- Les asset paths a purger du bucket storage `social-posts` sont retournes
-- par la RPC pour traitement asynchrone par une Edge Function dediee
-- (purge-soft-deleted-social-assets, non incluse dans cette migration).

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_old_soft_deleted_social_content(
  p_retention_days integer DEFAULT 30
)
RETURNS TABLE (
  purged_post_count integer,
  purged_comment_count integer,
  asset_paths_to_cleanup text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cutoff timestamptz;
  v_post_count integer;
  v_comment_count integer;
  v_asset_paths text[];
BEGIN
  -- S-18 — garde defensive : retention ≥ 7 jours, ≤ 365 jours.
  IF p_retention_days IS NULL OR p_retention_days < 7 OR p_retention_days > 365 THEN
    RAISE EXCEPTION 'p_retention_days must be between 7 and 365 (got %)', p_retention_days
      USING ERRCODE = '22023';
  END IF;

  v_cutoff := now() - make_interval(days => p_retention_days);

  -- Collecte d'abord les asset paths a purger storage, AVANT de DELETE
  -- (cascade RLS pourrait masquer certains).
  SELECT array_agg(DISTINCT social_post.asset_path) FILTER (
    WHERE social_post.asset_path IS NOT NULL
  )
  INTO v_asset_paths
  FROM public.social_posts AS social_post
  WHERE social_post.deleted_at IS NOT NULL
    AND social_post.deleted_at < v_cutoff;

  WITH deleted_posts AS (
    DELETE FROM public.social_posts
      WHERE deleted_at IS NOT NULL
        AND deleted_at < v_cutoff
      RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_post_count FROM deleted_posts;

  WITH deleted_comments AS (
    DELETE FROM public.social_comments
      WHERE deleted_at IS NOT NULL
        AND deleted_at < v_cutoff
      RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_comment_count FROM deleted_comments;

  RETURN QUERY SELECT
    COALESCE(v_post_count, 0),
    COALESCE(v_comment_count, 0),
    COALESCE(v_asset_paths, '{}'::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_soft_deleted_social_content(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_soft_deleted_social_content(integer) TO service_role;

COMMENT ON FUNCTION public.purge_old_soft_deleted_social_content(integer) IS
  'S-18 : hard-delete les social_posts/social_comments soft-deletes depuis '
  '> p_retention_days jours. Retourne les asset_paths a purger du bucket '
  'social-posts (cleanup async par Edge Function dediee). Voir '
  'SOCIAL_SECURITY_AUDIT.md S-18.';

-- =============================================================================
-- Planification pg_cron (optionnelle : ne plante pas si pg_cron n'est pas active)
-- =============================================================================
--
-- Si pg_cron est disponible sur le projet Supabase, on planifie quotidiennement
-- a 03:00 UTC (heure creuse). Sinon on log un avertissement et l'operateur
-- devra invoquer manuellement la RPC ou via une Edge Function planifiee.

DO $$
DECLARE
  v_cron_available boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_cron_available;

  IF v_cron_available THEN
    -- Nettoie les anciens jobs avec le meme nom (idempotent).
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'social_soft_delete_purge_daily';

    PERFORM cron.schedule(
      'social_soft_delete_purge_daily',
      '0 3 * * *',
      $cron$SELECT public.purge_old_soft_deleted_social_content(30);$cron$
    );

    RAISE NOTICE 'S-18: scheduled daily purge at 03:00 UTC via pg_cron';
  ELSE
    RAISE WARNING 'S-18: pg_cron extension not available — schedule purge_old_soft_deleted_social_content() manually or via Edge Function scheduler';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
