-- AUTH-VULN-01/02 fix (Wave 2.2): nonce-based attestation that a signup went
-- through `secure-signup` (not direct GoTrue bypass).
--
-- The new `secure-signup` Edge Function (Wave 2.3) generates a nonce, inserts
-- a row here, then includes the nonce in the GoTrue admin user-create call's
-- `user_metadata.signup_nonce`. The trigger from migration 20260502020100
-- consumes the nonce in a BEFORE INSERT on `auth.users`. Any signup that did
-- NOT pre-create an attestation (e.g. direct curl on /auth/v1/signup with the
-- public anon key) is rejected at the database layer.
--
-- Lifecycle:
--   - Created: by `secure-signup` after all checks pass.
--   - Consumed: by the trigger when GoTrue inserts the user.
--   - Expired: 5 minutes after creation if never consumed.
--   - Pruned: weekly cron (or `purge_old_signup_attestations` RPC).

CREATE TABLE IF NOT EXISTS public.signup_attestations (
  nonce         UUID         PRIMARY KEY,
  email_lower   TEXT         NOT NULL,
  ip            INET,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  consumed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signup_attestations_expires
  ON public.signup_attestations (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signup_attestations_email
  ON public.signup_attestations (email_lower, created_at DESC);

ALTER TABLE public.signup_attestations ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only (deny-by-default for anon/authenticated).

COMMENT ON TABLE public.signup_attestations IS
  'AUTH-VULN-01/02: nonce attestations issued by secure-signup; consumed by auth.users INSERT trigger.';

-- Validate + atomically consume an attestation. Returns TRUE if a matching,
-- unexpired, unconsumed attestation existed and was consumed in this call.
CREATE OR REPLACE FUNCTION public.consume_signup_attestation(
  p_nonce UUID,
  p_email TEXT
)
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_consumed BOOLEAN;
BEGIN
  UPDATE public.signup_attestations
  SET consumed_at = now()
  WHERE nonce = p_nonce
    AND email_lower = lower(p_email)
    AND expires_at > now()
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_consumed = ROW_COUNT;
  RETURN v_consumed > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_signup_attestation(UUID, TEXT) FROM PUBLIC, anon, authenticated;
-- The trigger runs with the table owner's permissions (SECURITY DEFINER on
-- the trigger function), but the consume function ALSO needs to be callable
-- from the trigger context. service_role grant covers Edge Function callers.
GRANT EXECUTE ON FUNCTION public.consume_signup_attestation(UUID, TEXT) TO service_role;

-- Pruning helper.
CREATE OR REPLACE FUNCTION public.purge_old_signup_attestations()
  RETURNS INTEGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.signup_attestations
  WHERE created_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_signup_attestations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_signup_attestations() TO service_role;

COMMENT ON FUNCTION public.consume_signup_attestation(UUID, TEXT) IS
  'AUTH-VULN-01/02: atomically validate + consume a signup nonce. Returns TRUE iff consumed.';
