-- App Review hotfix 2026-06-30:
-- keep direct email/password signups behind `secure-signup`, while allowing
-- GoTrue-managed OAuth inserts for Apple/Google when the feature flag is on.

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
  v_provider    TEXT;
  v_providers   JSONB;
BEGIN
  SELECT enabled INTO v_flag_active
  FROM public.security_feature_flags
  WHERE flag = 'enforce_signup_nonce';
  IF v_flag_active IS NULL OR v_flag_active = FALSE THEN
    RETURN NEW;
  END IF;

  IF NEW.invited_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- OAuth users are provisioned by GoTrue. End users can set raw_user_meta_data,
  -- but not raw_app_meta_data, so this bypass does not reopen direct email signup.
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', '');
  v_providers := COALESCE(NEW.raw_app_meta_data->'providers', '[]'::jsonb);
  IF v_provider IN ('apple', 'google') OR v_providers ?| ARRAY['apple', 'google'] THEN
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

  NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'signup_nonce';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_signup_nonce() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_signup_nonce() TO authenticator, service_role;

COMMENT ON FUNCTION public.enforce_signup_nonce() IS
  'AUTH-VULN-01/02: rejects direct email signups without secure-signup attestation; allows GoTrue-managed Apple/Google OAuth users.';
