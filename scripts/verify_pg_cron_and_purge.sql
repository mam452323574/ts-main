-- Verify pg_cron availability and S-18 purge job status.
-- Run on the prod Supabase project (Dashboard → SQL Editor).
-- Le projet TSE est sur le plan Free oui pg_cron n'est PAS dispo, donc on
-- s'attend a ce que `pg_cron available = false` et qu'on utilise le fallback
-- scheduler externe (Edge Function `purge-soft-deleted-social-assets`).

\echo '--- pg_cron extension availability ---'
SELECT
  CASE WHEN extname IS NULL THEN false ELSE true END AS pg_cron_available,
  extname,
  extversion
FROM pg_extension
WHERE extname = 'pg_cron';

\echo ''
\echo '--- Scheduled jobs (only meaningful if pg_cron is active) ---'
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  username
FROM cron.job
WHERE jobname LIKE '%social%'
ORDER BY jobid DESC;

\echo ''
\echo '--- Last successful runs (if pg_cron + job present) ---'
SELECT
  runid,
  jobid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname = 'social_soft_delete_purge_daily'
)
ORDER BY start_time DESC
LIMIT 5;

\echo ''
\echo '--- Soft-deleted content that would be purged at next run (preview, no DELETE) ---'
WITH preview AS (
  SELECT
    (SELECT COUNT(*) FROM public.social_posts
      WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days') AS posts_eligible,
    (SELECT COUNT(*) FROM public.social_comments
      WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days') AS comments_eligible,
    (SELECT COUNT(DISTINCT asset_path) FROM public.social_posts
      WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days' AND asset_path IS NOT NULL) AS asset_paths_eligible
)
SELECT * FROM preview;
