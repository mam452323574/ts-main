-- AUTH-VULN-01/02 fix (Wave 2.4): bypass-proof signup enforcement.
--
-- This trigger rejects any INSERT on `auth.users` that didn't come through
-- `secure-signup` (which is the only caller that creates a `signup_attestation`
-- row and includes the nonce in `raw_user_meta_data.signup_nonce`).
--
-- ROLLOUT MODEL — feature-flag controlled:
-- Managed Supabase doesn't grant the migration role permission to
-- `ALTER TABLE auth.users DISABLE TRIGGER`, so we can't ship the trigger in a
-- DISABLED state from a migration. Instead the trigger is always enabled and
-- consults `public.security_feature_flags` on each invocation. When the flag
-- is FALSE the trigger short-circuits (returns NEW unmodified), making it a
-- functional no-op without needing privileged DDL.
--
-- ACTIVATION (when client adoption ≥99%):
--     UPDATE public.security_feature_flags
--     SET enabled = TRUE
--     WHERE flag = 'enforce_signup_nonce';
--
-- This `UPDATE` works from the dashboard SQL editor, the supabase CLI, or any
-- service-role context — no special privileges needed.
--
-- ROLLBACK (instant kill-switch):
--     UPDATE public.security_feature_flags
--     SET enabled = FALSE
--     WHERE flag = 'enforce_signup_nonce';
--
-- Edge cases handled:
--   - Admin-invited users (`auth.users.invited_at IS NOT NULL`) bypass the
--     check, since invitations don't go through the signup wrapper.
--   - The nonce is stripped from `raw_user_meta_data` after consumption so
--     it never persists on the user row.

-- 1. Feature flags table (shared infra, idempotent).
CREATE TABLE IF NOT EXISTS public.security_feature_flags (
  flag       TEXT        PRIMARY KEY,
  enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);

ALTER TABLE public.security_feature_flags ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only.

-- Seed the flag in DISABLED state. ON CONFLICT keeps any existing value if
-- this migration is somehow re-run.
INSERT INTO public.security_feature_flags (flag, enabled, notes)
VALUES (
  'enforce_signup_nonce',
  FALSE,
  'AUTH-VULN-01/02. Set to TRUE once mobile-client adoption of secure-signup is ≥99%.'
)
ON CONFLICT (flag) DO NOTHING;

-- NOTE: function lives in `public` schema (not `auth`). Managed Supabase
-- denies CREATE on the auth schema, but triggers ON auth.users tables are
-- allowed when the trigger function is in public — this is the same pattern
-- as the official "handle_new_user" example in Supabase docs.

CREATE OR REPLACE FUNCTION public.enforce_signup_nonce()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, auth
AS $$
DECLARE
  v_nonce_text  TEXT;
  v_nonce_uuid  UUID;
  v_consumed    BOOLEAN;
  v_flag_active BOOLEAN;
BEGIN
  -- Feature-flag short-circuit. While `enforce_signup_nonce` is FALSE the
  -- trigger is a no-op — this lets us ship the trigger in production without
  -- the privileged ALTER TABLE DISABLE TRIGGER call. Flip the flag in
  -- public.security_feature_flags when you're ready to enforce.
  SELECT enabled INTO v_flag_active
  FROM public.security_feature_flags
  WHERE flag = 'enforce_signup_nonce';
  IF v_flag_active IS NULL OR v_flag_active = FALSE THEN
    RETURN NEW;
  END IF;

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

REVOKE ALL ON FUNCTION public.enforce_signup_nonce() FROM PUBLIC, anon, authenticated;
-- supabase_auth_admin needs EXECUTE because the trigger fires under the
-- table owner's role context for SECURITY INVOKER triggers; we use SECURITY
-- DEFINER so the function runs as its definer (postgres) which already has
-- the rights to call public.consume_signup_attestation. Granting EXECUTE
-- to authenticator (the umbrella role) keeps things simple.
GRANT EXECUTE ON FUNCTION public.enforce_signup_nonce() TO authenticator, service_role;

COMMENT ON FUNCTION public.enforce_signup_nonce() IS
  'AUTH-VULN-01/02: rejects auth.users INSERTs that did not pre-create a signup_attestation via secure-signup.';

-- Drop any prior version (re-run safety).
DROP TRIGGER IF EXISTS enforce_signup_nonce_trigger ON auth.users;

CREATE TRIGGER enforce_signup_nonce_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_nonce();

-- The trigger is created in the ENABLED state (managed Supabase doesn't
-- grant the migration role permission to ALTER TABLE auth.users). The
-- enforcement is gated by the public.security_feature_flags row above —
-- with `enforce_signup_nonce.enabled = FALSE` (the seeded default) the
-- trigger is a no-op.
COMMENT ON TRIGGER enforce_signup_nonce_trigger ON auth.users IS
  'Wave 2.4: gated by public.security_feature_flags.enforce_signup_nonce. No-op until flag is TRUE.';
