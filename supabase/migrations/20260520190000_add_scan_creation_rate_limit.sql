-- SC-01 (cf. SCANNER_COACH_AUDIT_2026_05.md §4) — rate limit Edge sur la
-- creation/reservation de scans.
--
-- Contrairement au coach (C-01) qui applique deja un rate limit a 3 niveaux,
-- les fonctions `check-and-record-scan` et `fridge-scan-submit` ne reposaient
-- jusqu'ici que sur le quota daily (RPC reserve_scan_quota). Un attaquant
-- pouvait spammer la fonction 1000x/sec : 30 acceptes par le quota, 970
-- rejetes "quota_exhausted" mais TOUS facturent une invocation Edge + un hit
-- RPC + log noise.
--
-- Le rate limit ajoute ici (10/min, 60/h, 200/jour) est volontairement plus
-- permissif que celui du coach (5/min, 30/h, 120/jour) car (a) les scans sont
-- deja bornés par quota daily, (b) un user legitime peut faire des bursts en
-- onboarding ou en testant la qualite d'image avant le scan definitif.

CREATE TABLE IF NOT EXISTS public.scan_creation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_creation_attempts_user_attempted_at
  ON public.scan_creation_attempts(user_id, attempted_at DESC);

ALTER TABLE public.scan_creation_attempts ENABLE ROW LEVEL SECURITY;

-- Pas de policy pour authenticated/anon : seul service_role (bypass RLS) lit/ecrit.

CREATE OR REPLACE FUNCTION public.record_scan_creation_attempt(
  p_user_id uuid,
  p_per_minute integer DEFAULT 10,
  p_per_hour integer DEFAULT 60,
  p_per_day integer DEFAULT 200
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
  FROM public.scan_creation_attempts
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

  INSERT INTO public.scan_creation_attempts(user_id, attempted_at)
  VALUES (p_user_id, v_now);

  -- Garbage-collect rows older than 25 hours pour ce user (fenêtre max 24h + safety)
  DELETE FROM public.scan_creation_attempts
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

REVOKE EXECUTE ON FUNCTION public.record_scan_creation_attempt(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_scan_creation_attempt(uuid, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.record_scan_creation_attempt(uuid, integer, integer, integer) IS
  'SC-01: sliding-window rate limit for scan creation. Defaults: 10/min, 60/h, 200/day.';

SELECT pg_notify('pgrst', 'reload schema');
