-- Hotfix 2026-05-11: `consume_signup_attestation` captured ROW_COUNT into a
-- BOOLEAN variable, then compared that BOOLEAN to `> 0`. On hosted Postgres
-- this raises `operator does not exist: boolean > integer`, which makes every
-- valid nonce-based signup fail inside `auth.admin.createUser(...)` with a
-- generic "Database error creating new user" response.
--
-- Keep this as a forward migration so fresh environments apply the original
-- schema, then this correction.

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
  v_rows_updated BIGINT;
BEGIN
  UPDATE public.signup_attestations
  SET consumed_at = now()
  WHERE nonce = p_nonce
    AND email_lower = lower(p_email)
    AND expires_at > now()
    AND consumed_at IS NULL;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_signup_attestation(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_signup_attestation(UUID, TEXT) TO service_role;
