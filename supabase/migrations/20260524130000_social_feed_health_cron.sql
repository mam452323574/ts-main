-- Social feed health — pg_cron schedule for D7 materialized view refresh.
--
-- Tries to schedule a nightly refresh of social_feed_health_v1 via pg_cron.
-- If the extension isn't available on this project, raises a NOTICE so the
-- operator can wire a manual refresh (or schedule via Supabase scheduled
-- functions / external cron).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any previous job with the same name (idempotent).
    PERFORM cron.unschedule(jobid)
       FROM cron.job
      WHERE jobname = 'refresh_social_feed_health_v1';

    -- Schedule fresh: 03:00 UTC every day.
    PERFORM cron.schedule(
      'refresh_social_feed_health_v1',
      '0 3 * * *',
      $cron$ SELECT public.refresh_social_feed_health(); $cron$
    );

    RAISE NOTICE 'pg_cron job "refresh_social_feed_health_v1" scheduled for 03:00 UTC daily.';
  ELSE
    RAISE NOTICE 'pg_cron extension not available; refresh_social_feed_health() must be invoked manually or via an external scheduler.';
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
