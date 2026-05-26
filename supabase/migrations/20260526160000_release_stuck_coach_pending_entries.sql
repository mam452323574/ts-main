-- Coach pending-entry safety net: release stuck `coach_entries` whose
-- background generation never completed.
--
-- Why this exists. The happy path in coach-generate-response/handler.ts wraps
-- the background task in a try/catch that flips the entry to status='error'
-- and refunds the linked coach_usage_events row. The retry layer added in
-- _shared/coachQuota.ts:refundCoachQuotaEventWithRetry handles transient DB
-- failures. But two edge cases stay uncovered:
--   * The Deno edge runtime is killed (OOM, hard timeout, hot redeploy) after
--     the entry+event are committed but before the background task can mark
--     the entry as terminal.
--   * The refund retries are exhausted (the CRITICAL log fires, but the credit
--     is still leaked).
-- In both cases the user is left with `status='pending'` and an `accepted`
-- usage event counted against their quota. This RPC sweeps such rows.
--
-- Threshold. Coach webhook timeout is 45s (COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS).
-- Default sweep cutoff is 10 minutes so we never race a slow-but-healthy run
-- and never reverse a valid response that finished writing one second after
-- the check. Callers can lower it for tests via p_max_age_minutes.
--
-- Idempotency. The UPDATE filters on `status='pending'` and `status='accepted'`
-- respectively, so re-running the RPC on the same dataset is a no-op once the
-- transitions have been applied. Safe to run on a 1-minute cron without
-- duplicating refunds or clobbering successful generations that completed
-- between two ticks.

BEGIN;

CREATE OR REPLACE FUNCTION public.release_stuck_coach_pending_entries(
  p_max_age_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cutoff timestamptz;
  v_released_count integer := 0;
  v_refunded_count integer := 0;
  v_now timestamptz := now();
BEGIN
  IF p_max_age_minutes IS NULL OR p_max_age_minutes < 1 THEN
    RAISE EXCEPTION 'release_stuck_coach_pending_entries: p_max_age_minutes must be >= 1';
  END IF;

  v_cutoff := v_now - make_interval(mins => p_max_age_minutes);

  -- Step 1 — refund any usage event still 'accepted' that is bound to an
  -- entry which has been stuck in 'pending' past the cutoff. Done first so a
  -- partial failure (rare) keeps the entry visible for the next sweep.
  -- The `coach_quota_bucket_for_source` mapping is preserved naturally
  -- because refund_coach_quota_event doesn't care about source — it flips a
  -- single row by id and the bucket is derived from the (unchanged) source
  -- column.
  WITH stuck_entries AS (
    SELECT id
    FROM public.coach_entries
    WHERE status = 'pending'
      AND created_at < v_cutoff
  ),
  refunded_events AS (
    UPDATE public.coach_usage_events evt
    SET
      status = 'refunded',
      refunded_at = v_now,
      metadata = COALESCE(evt.metadata, '{}'::jsonb)
        || jsonb_build_object('refund_reason', 'coach_generation_timeout')
    WHERE evt.status = 'accepted'
      AND evt.coach_entry_id IN (SELECT id FROM stuck_entries)
    RETURNING evt.id
  )
  SELECT COUNT(*)::integer INTO v_refunded_count FROM refunded_events;

  -- Step 2 — flip the entries themselves to 'error'. updated_at is bumped by
  -- the existing phase2_set_updated_at trigger.
  WITH released AS (
    UPDATE public.coach_entries
    SET
      status = 'error',
      error_code = 'coach_generation_timeout',
      response_payload_json = COALESCE(response_payload_json, '{}'::jsonb)
        || jsonb_build_object(
          'released_by', 'release_stuck_coach_pending_entries',
          'released_at', to_jsonb(v_now) #>> '{}',
          'max_age_minutes', p_max_age_minutes
        )
    WHERE status = 'pending'
      AND created_at < v_cutoff
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_released_count FROM released;

  RETURN jsonb_build_object(
    'released_count', v_released_count,
    'refunded_count', v_refunded_count,
    'cutoff_at', to_jsonb(v_cutoff) #>> '{}',
    'ran_at', to_jsonb(v_now) #>> '{}'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_stuck_coach_pending_entries(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stuck_coach_pending_entries(integer) TO service_role;

COMMENT ON FUNCTION public.release_stuck_coach_pending_entries(integer) IS
  'Safety net for coach_entries stuck in status=pending. Flips them to '
  'status=error with error_code=coach_generation_timeout and refunds the '
  'linked coach_usage_events row (sets status=refunded). Idempotent; safe to '
  'run on a recurring schedule (default cutoff: 10 minutes). Service-role '
  'only.';

-- Optional pg_cron schedule — guarded so the migration does not fail on
-- environments without the extension. Same pattern as
-- 20260524130000_social_feed_health_cron.sql. Runs every 5 minutes which is
-- well below the 10-minute cutoff (so a stuck entry is released within
-- at most ~15 minutes after the original request).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
       FROM cron.job
      WHERE jobname = 'release_stuck_coach_pending_entries';

    PERFORM cron.schedule(
      'release_stuck_coach_pending_entries',
      '*/5 * * * *',
      $job$SELECT public.release_stuck_coach_pending_entries();$job$
    );

    RAISE NOTICE 'pg_cron job "release_stuck_coach_pending_entries" scheduled for every 5 minutes.';
  ELSE
    RAISE NOTICE 'pg_cron extension not available; release_stuck_coach_pending_entries() must be invoked manually or via an external scheduler.';
  END IF;
END;
$cron$;

COMMIT;

NOTIFY pgrst, 'reload schema';
