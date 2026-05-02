-- AUTH-VULN-03 fix (Wave 1.2b): persistent per-account lockouts.
--
-- One row per locked email. The `auth-pre-login` Edge Function reads this
-- table on every login attempt and rejects if `locked_until > now()`.
--
-- Lockout policy (enforced in `record_login_attempt()` RPC, migration
-- 20260502010200): 5 failures from same (email, ip) tuple within 15 minutes
-- triggers a 30-minute lock. `fail_count` doubles the lock duration on each
-- subsequent breach (exponential backoff): 30m → 60m → 120m → 240m → max 24h.

CREATE TABLE IF NOT EXISTS public.login_lockouts (
  email_lower      TEXT        PRIMARY KEY,
  locked_until     TIMESTAMPTZ NOT NULL,
  fail_count       INTEGER     NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Keeping the IP that triggered the most-recent lock helps incident
  -- response and security analytics; not used for the lockout decision.
  triggering_ip    INET,
  -- For audit: when the row was first created and last refreshed.
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plain B-tree index (not partial). A partial `WHERE locked_until > now()`
-- predicate is rejected by Postgres because `now()` is STABLE, not IMMUTABLE.
-- The hot path query (`SELECT ... WHERE email_lower = $1 AND locked_until > now()`)
-- already filters by the unique `email_lower` PK first, so the index on
-- `locked_until` is mostly used for the (rare) cleanup scans — a non-partial
-- index is fine.
CREATE INDEX IF NOT EXISTS idx_login_lockouts_locked_until
  ON public.login_lockouts (locked_until);

ALTER TABLE public.login_lockouts ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only (deny-by-default for anon/authenticated).

COMMENT ON TABLE public.login_lockouts IS
  'AUTH-VULN-03: per-account login lockout state. service_role only. Read on every login by `auth-pre-login`.';
