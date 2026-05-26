-- Keep Google and Apple onboarding out of the custom email OTP gate.
-- Email/password accounts remain verified only through verify-email-code.

CREATE OR REPLACE FUNCTION public.repair_missing_user_profile(
  p_avatar_url text DEFAULT NULL
)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_provider text;
  v_oauth_verified boolean;
  v_result public.user_profiles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    email,
    email_confirmed_at,
    COALESCE(raw_app_meta_data->>'provider', '')
  INTO
    v_email,
    v_email_confirmed_at,
    v_provider
  FROM auth.users
  WHERE id = v_user_id;

  v_oauth_verified :=
    v_provider IN ('google', 'apple')
    AND v_email_confirmed_at IS NOT NULL;

  INSERT INTO public.user_profiles (id, email, avatar_url, email_verified)
  VALUES (
    v_user_id,
    COALESCE(v_email, v_user_id::text || '@oauth.temp'),
    NULLIF(btrim(COALESCE(p_avatar_url, '')), ''),
    v_oauth_verified
  )
  ON CONFLICT (id) DO UPDATE
    SET email_verified = CASE
      WHEN v_oauth_verified THEN true
      ELSE public.user_profiles.email_verified
    END
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_missing_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_missing_user_profile(text) TO authenticated;

UPDATE public.user_profiles AS profile
SET email_verified = true
FROM auth.users AS auth_user
WHERE profile.id = auth_user.id
  AND profile.email_verified = false
  AND COALESCE(auth_user.raw_app_meta_data->>'provider', '') IN ('google', 'apple')
  AND auth_user.email_confirmed_at IS NOT NULL;

COMMENT ON FUNCTION public.repair_missing_user_profile(text) IS
  'Idempotent and race-safe repair of missing user_profiles rows. '
  'Confirmed OAuth users bypass only the custom email OTP gate; '
  'email/password accounts keep their existing verification path.';

SELECT pg_notify('pgrst', 'reload schema');
