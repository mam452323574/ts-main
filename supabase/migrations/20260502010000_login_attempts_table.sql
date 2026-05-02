-- AUTH-VULN-03 fix (Wave 1.2a): track per-account login attempts.
--
-- Used by the `auth-pre-login` Edge Function (Supabase password_grant_pre_login
-- HTTP hook) to count failed login attempts and trigger lockouts. See
-- `SECURITY_FIX_PLAN_2026_05.md` for context.
--
-- We retain only ~1 day of history; older rows are pruned by a scheduled job
-- (added in 20260502010200_pre_login_hook_rpc.sql via pg_cron).

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  email_lower TEXT        NOT NULL,
  ip          INET,
  success     BOOLEAN     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot-path lookup: count recent failures for a given (email, ip) tuple.
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created
  ON public.login_attempts (email_lower, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip_created
  ON public.login_attempts (email_lower, ip, created_at DESC);

-- Pruning helper.
CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON public.login_attempts (created_at);

-- RLS: nothing on this table is user-readable. Only service_role writes.
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- No policies = nobody but service_role/superuser can SELECT/INSERT/UPDATE/DELETE.
-- (RLS is enabled with no permissive policy = deny-by-default for anon/authenticated.)

COMMENT ON TABLE public.login_attempts IS
  'AUTH-VULN-03: per-account login attempt log written by `auth-pre-login` Edge Function. service_role only.';
