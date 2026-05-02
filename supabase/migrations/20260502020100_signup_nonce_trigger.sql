-- AUTH-VULN-01/02 fix (Wave 2.4): bypass-proof signup enforcement.
--
-- This trigger rejects any INSERT on `auth.users` that didn't come through
-- `secure-signup` (which is the only caller that creates a `signup_attestation`
-- row and includes the nonce in `raw_user_meta_data.signup_nonce`).
--
-- IMPORTANT: this migration installs the trigger DISABLED. After Wave 2.5
-- (AuthContext migration) ships and OTA adoption is ≥99%, the operator runs:
--
--     ALTER TABLE auth.users ENABLE TRIGGER enforce_signup_nonce_trigger;
--
-- Once enabled, direct calls to `/auth/v1/signup` with the public anon key
-- (the bypass exploited by Shannon AUTH-VULN-01 and AUTH-VULN-02) will fail
-- with `signup_nonce_invalid`.
--
-- Rollback: `ALTER TABLE auth.users DISABLE TRIGGER enforce_signup_nonce_trigger;`
-- Removes the protection but does NOT touch existing user rows.
--
-- Edge cases handled:
--   - Admin-invited users (`auth.users.invited_at IS NOT NULL`) bypass the
--     check, since invitations don't go through the signup wrapper.
--   - The nonce is stripped from `raw_user_meta_data` after consumption so
--     it never persists on the user row.

CREATE OR REPLACE FUNCTION auth.enforce_signup_nonce()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_nonce_text TEXT;
  v_nonce_uuid UUID;
  v_consumed   BOOLEAN;
BEGIN
  -- Allow admin-initiated invitations to bypass the nonce requirement.
  IF NEW.invited_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Allow rows whose email is NULL (some Supabase internals create such
  -- rows during, e.g., third-party OAuth provisioning before email is set).
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_nonce_text := NEW.raw_user_meta_data->>'signup_nonce';

  IF v_nonce_text IS NULL OR length(v_nonce_text) = 0 THEN
    RAISE EXCEPTION 'signup_nonce_invalid: must use the secure-signup wrapper'
      USING ERRCODE = 'P0001', HINT = 'Direct GoTrue signups are not allowed';
  END IF;

  BEGIN
    v_nonce_uuid := v_nonce_text::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'signup_nonce_invalid: malformed nonce'
      USING ERRCODE = 'P0001';
  END;

  v_consumed := public.consume_signup_attestation(v_nonce_uuid, NEW.email);
  IF NOT v_consumed THEN
    RAISE EXCEPTION 'signup_nonce_invalid: unknown, expired, or reused nonce'
      USING ERRCODE = 'P0001';
  END IF;

  -- Strip the nonce so it never persists on the user row.
  NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_nonce';

  RETURN NEW;
END;
$$;

-- The function owner is the table owner of `auth.users` (typically
-- `supabase_auth_admin`). Ensure SECURITY DEFINER doesn't widen privileges.
COMMENT ON FUNCTION auth.enforce_signup_nonce() IS
  'AUTH-VULN-01/02: rejects auth.users INSERTs that did not pre-create a signup_attestation via secure-signup.';

-- Drop any prior version (re-run safety).
DROP TRIGGER IF EXISTS enforce_signup_nonce_trigger ON auth.users;

CREATE TRIGGER enforce_signup_nonce_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.enforce_signup_nonce();

-- *** ROLLOUT SAFETY: install DISABLED. ***
-- The operator MUST run `ALTER TABLE auth.users ENABLE TRIGGER ...` only
-- AFTER Wave 2.5 (AuthContext migration) has shipped to ≥99% of clients.
-- Activating this trigger before the client switch will break ALL signups.
ALTER TABLE auth.users DISABLE TRIGGER enforce_signup_nonce_trigger;

COMMENT ON TRIGGER enforce_signup_nonce_trigger ON auth.users IS
  'Wave 2.4: ships DISABLED. Enable manually only after secure-signup client adoption ≥99%.';
