-- N-D of COACH_SECURITY_AUDIT_2026_05: rate limit the `coach-screen-snapshot`
-- Edge Function. The UI calls it ~1× per Coach screen open, so we pick a
-- generous default (30/min, 600/h, 2000/day). Same shape and pattern as
-- `record_coach_generation_attempt` (migration 20260426190000) so the calling
-- code can reuse the existing 429 handling.
--
-- A dedicated attempts table keeps the snapshot counter separate from the
-- generation counter — a user opening Coach 20× / minute (UX glitch, fast
-- swiping) should not consume their LLM rate budget.

CREATE TABLE IF NOT EXISTS public.coach_snapshot_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_snapshot_attempts_user_attempted_at
  ON public.coach_snapshot_attempts(user_id, attempted_at DESC);

ALTER TABLE public.coach_snapshot_attempts ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon: only service_role (which bypasses RLS)
-- may read/write. Keeps the attempt log out of reach of client code.

CREATE OR REPLACE FUNCTION public.record_coach_snapshot_attempt(
  p_user_id uuid,
  p_per_minute integer DEFAULT 30,
  p_per_hour integer DEFAULT 600,
  p_per_day integer DEFAULT 2000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
  v_window_exceeded text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF COALESCE(p_per_minute, 0) < 1
     OR COALESCE(p_per_hour, 0) < 1
     OR COALESCE(p_per_day, 0) < 1 THEN
    RAISE EXCEPTION 'rate limit windows must be positive integers';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 minute'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 hour'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 day')
  INTO v_minute_count, v_hour_count, v_day_count
  FROM public.coach_snapshot_attempts
  WHERE user_id = p_user_id
    AND attempted_at > v_now - interval '1 day';

  IF v_minute_count >= p_per_minute THEN
    v_window_exceeded := 'minute';
  ELSIF v_hour_count >= p_per_hour THEN
    v_window_exceeded := 'hour';
  ELSIF v_day_count >= p_per_day THEN
    v_window_exceeded := 'day';
  END IF;

  IF v_window_exceeded IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'window_exceeded', v_window_exceeded,
      'attempts_minute', v_minute_count,
      'attempts_hour', v_hour_count,
      'attempts_day', v_day_count
    );
  END IF;

  INSERT INTO public.coach_snapshot_attempts(user_id, attempted_at)
  VALUES (p_user_id, v_now);

  -- Garbage-collect rows older than 25h for this user to keep the table
  -- bounded (the longest sliding window is 24h; 25h gives a safety margin).
  DELETE FROM public.coach_snapshot_attempts
  WHERE user_id = p_user_id
    AND attempted_at < v_now - interval '25 hours';

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts_minute', v_minute_count + 1,
    'attempts_hour', v_hour_count + 1,
    'attempts_day', v_day_count + 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coach_snapshot_attempt(uuid, integer, integer, integer) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
