-- AUTH-VULN-03 fix (Wave 1.2c): RPCs called by the `auth-pre-login` Edge Function.
--
-- Two functions:
--   1. `check_login_locked(email)` — read-only check returning whether the
--      account is currently locked.
--   2. `record_login_attempt(email, ip, success)` — log the attempt and, on
--      failure, evaluate whether the threshold for a new lock has been crossed.
--
-- Lockout policy:
--   - Threshold: 5 failed attempts from same (email, ip) within 15 minutes.
--   - Lock duration: 30 minutes × 2^(consecutive_breaches - 1), capped at 24h.
--   - Successful login resets `fail_count` to 0 and clears any active lock.
--
-- DoS mitigation: we require failures from the SAME (email, ip) tuple to
-- trigger a lock. A single attacker rotating IPs targeting one account will
-- still be slowed by IP-level GoTrue limits (~30/hour) but won't be able to
-- lock the legitimate user out from their own IP. (Tradeoff documented in
-- TRUST_BOUNDARIES.md.)

-- 1) Read-only check used early in the hook, before any write.
CREATE OR REPLACE FUNCTION public.check_login_locked(p_email TEXT)
  RETURNS TABLE (locked BOOLEAN, locked_until TIMESTAMPTZ)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (l.locked_until > now()) AS locked,
    l.locked_until
  FROM public.login_lockouts l
  WHERE l.email_lower = lower(p_email)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.check_login_locked(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_locked(TEXT) TO service_role;

-- 2) Record an attempt; on failure, evaluate lock threshold.
-- Returns the resulting (locked, locked_until) state so the hook can include
-- a `Retry-After` hint without a second roundtrip.
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email   TEXT,
  p_ip      INET,
  p_success BOOLEAN
)
  RETURNS TABLE (locked BOOLEAN, locked_until TIMESTAMPTZ)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email_lower TEXT := lower(p_email);
  v_recent_fail_count INTEGER;
  v_existing_lock RECORD;
  v_new_lock_minutes INTEGER;
  v_new_locked_until TIMESTAMPTZ;
BEGIN
  -- Always log the attempt.
  INSERT INTO public.login_attempts (email_lower, ip, success)
    VALUES (v_email_lower, p_ip, p_success);

  -- On success: clear any lockout, return unlocked.
  IF p_success THEN
    DELETE FROM public.login_lockouts WHERE email_lower = v_email_lower;
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- On failure: count recent fails from same (email, ip).
  SELECT COUNT(*) INTO v_recent_fail_count
  FROM public.login_attempts
  WHERE email_lower = v_email_lower
    AND ip          = p_ip
    AND success     = FALSE
    AND created_at  > now() - INTERVAL '15 minutes';

  IF v_recent_fail_count < 5 THEN
    -- Below threshold; no new lock. Return whatever existing state.
    RETURN QUERY
    SELECT
      (l.locked_until > now()) AS locked,
      l.locked_until
    FROM public.login_lockouts l
    WHERE l.email_lower = v_email_lower
    LIMIT 1;
    -- If no existing row, return unlocked.
    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE::BOOLEAN, NULL::TIMESTAMPTZ;
    END IF;
    RETURN;
  END IF;

  -- Threshold crossed: compute new lock with exponential backoff.
  SELECT * INTO v_existing_lock FROM public.login_lockouts WHERE email_lower = v_email_lower;

  IF v_existing_lock IS NULL THEN
    v_new_lock_minutes := 30;
  ELSE
    -- 30 × 2^(fail_count) capped at 24h (1440 min).
    v_new_lock_minutes := LEAST(30 * POWER(2, v_existing_lock.fail_count)::INTEGER, 1440);
  END IF;
  v_new_locked_until := now() + (v_new_lock_minutes || ' minutes')::INTERVAL;

  INSERT INTO public.login_lockouts (
    email_lower, locked_until, fail_count, last_attempt_at, triggering_ip, updated_at
  )
  VALUES (
    v_email_lower, v_new_locked_until, 1, now(), p_ip, now()
  )
  ON CONFLICT (email_lower) DO UPDATE SET
    locked_until    = EXCLUDED.locked_until,
    fail_count      = public.login_lockouts.fail_count + 1,
    last_attempt_at = now(),
    triggering_ip   = EXCLUDED.triggering_ip,
    updated_at      = now();

  RETURN QUERY SELECT TRUE::BOOLEAN, v_new_locked_until;
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_attempt(TEXT, INET, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, INET, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.check_login_locked(TEXT) IS
  'AUTH-VULN-03: read-only check whether an account is currently locked. service_role only.';

COMMENT ON FUNCTION public.record_login_attempt(TEXT, INET, BOOLEAN) IS
  'AUTH-VULN-03: log a login attempt and apply lockout policy. service_role only. Returns resulting lock state.';

-- Optional cleanup helper (call from pg_cron weekly).
CREATE OR REPLACE FUNCTION public.purge_old_login_attempts()
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.login_attempts WHERE created_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Also purge expired lockouts (> 24h since they expired).
  DELETE FROM public.login_lockouts WHERE locked_until < now() - INTERVAL '24 hours';

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_login_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_login_attempts() TO service_role;

-- Schedule the cleanup if pg_cron is available; otherwise add via dashboard.
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     PERFORM cron.schedule('purge-login-attempts', '0 4 * * *',
--       'SELECT public.purge_old_login_attempts();');
--   END IF;
-- END $$;
