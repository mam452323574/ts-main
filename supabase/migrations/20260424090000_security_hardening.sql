-- Security hardening: MFA-gated data access, safe verification codes,
-- atomic quota reservations, and social upload reservations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verification codes are service-role only. Codes are stored as hashes.
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text,
  type text NOT NULL DEFAULT 'signup',
  request_ip text,
  attempts_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_codes_type_check CHECK (type IN ('signup'))
);

ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS request_ip text,
  ADD COLUMN IF NOT EXISTS attempts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.verification_codes
  DROP COLUMN IF EXISTS code;

DELETE FROM public.verification_codes
WHERE code_hash IS NULL;

ALTER TABLE public.verification_codes
  ALTER COLUMN attempts_count SET DEFAULT 0;

UPDATE public.verification_codes
SET type = 'signup'
WHERE type <> 'signup';

ALTER TABLE public.verification_codes
  DROP CONSTRAINT IF EXISTS verification_codes_type_check;

ALTER TABLE public.verification_codes
  ADD CONSTRAINT verification_codes_type_check CHECK (type IN ('signup'));

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages verification codes" ON public.verification_codes;
CREATE POLICY "Service role manages verification codes"
  ON public.verification_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_type_created
  ON public.verification_codes(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type_created
  ON public.verification_codes(email, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_codes_ip_type_created
  ON public.verification_codes(request_ip, type, created_at DESC);

-- Trusted-device login bypass is removed in favor of mandatory Supabase TOTP MFA.
DROP TABLE IF EXISTS public.trusted_devices;

-- Fridge callback nonces bind provider callbacks to queued records.
ALTER TABLE public.fridge_scans
  ADD COLUMN IF NOT EXISTS callback_nonce text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fridge_scans_callback_nonce
  ON public.fridge_scans(callback_nonce)
  WHERE callback_nonce IS NOT NULL;

-- Social upload reservations make public storage paths accountable.
CREATE TABLE IF NOT EXISTS public.social_upload_reservations (
  upload_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  asset_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  consumed_post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  CONSTRAINT social_upload_reservations_status_check
    CHECK (status IN ('reserved', 'consumed', 'expired'))
);

ALTER TABLE public.social_upload_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own social upload reservations" ON public.social_upload_reservations;
CREATE POLICY "Users can view own social upload reservations"
  ON public.social_upload_reservations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND auth.jwt()->>'aal' = 'aal2');

DROP POLICY IF EXISTS "Service role manages social upload reservations" ON public.social_upload_reservations;
CREATE POLICY "Service role manages social upload reservations"
  ON public.social_upload_reservations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_social_upload_reservations_user_created
  ON public.social_upload_reservations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_upload_reservations_expiry
  ON public.social_upload_reservations(status, expires_at);

DROP POLICY IF EXISTS "Users can upload own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload reserved social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update reserved social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete reserved social post assets" ON storage.objects;

CREATE POLICY "Users can upload reserved social post assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'social-posts'
  AND auth.jwt()->>'aal' = 'aal2'
  AND EXISTS (
    SELECT 1
    FROM public.social_upload_reservations AS reservation
    WHERE reservation.user_id = auth.uid()
      AND reservation.asset_path = name
      AND reservation.status = 'reserved'
      AND reservation.expires_at > now()
  )
);

CREATE POLICY "Users can update reserved social post assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND auth.jwt()->>'aal' = 'aal2'
  AND EXISTS (
    SELECT 1
    FROM public.social_upload_reservations AS reservation
    WHERE reservation.user_id = auth.uid()
      AND reservation.asset_path = name
      AND reservation.status = 'reserved'
      AND reservation.expires_at > now()
  )
)
WITH CHECK (
  bucket_id = 'social-posts'
  AND auth.jwt()->>'aal' = 'aal2'
  AND EXISTS (
    SELECT 1
    FROM public.social_upload_reservations AS reservation
    WHERE reservation.user_id = auth.uid()
      AND reservation.asset_path = name
      AND reservation.status = 'reserved'
      AND reservation.expires_at > now()
  )
);

CREATE POLICY "Users can delete reserved social post assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND auth.jwt()->>'aal' = 'aal2'
  AND EXISTS (
    SELECT 1
    FROM public.social_upload_reservations AS reservation
    WHERE reservation.user_id = auth.uid()
      AND reservation.asset_path = name
      AND reservation.status = 'reserved'
      AND reservation.expires_at > now()
  )
);

CREATE POLICY "Authenticated users can list social post assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'social-posts' AND auth.jwt()->>'aal' = 'aal2');

-- Replace broad profile reads with own-profile AAL2 and minimal RPCs.
DROP POLICY IF EXISTS "Users can view profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Public profiles viewable by authenticated users" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own complete profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile except tier" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own safe profile fields" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

CREATE POLICY "Users can view own MFA verified profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id AND auth.jwt()->>'aal' = 'aal2');

CREATE POLICY "Users can insert own profile before MFA"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own MFA verified profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND auth.jwt()->>'aal' = 'aal2')
  WITH CHECK (auth.uid() = id AND auth.jwt()->>'aal' = 'aal2');

CREATE OR REPLACE FUNCTION public.get_auth_gate_profile()
RETURNS TABLE (
  id uuid,
  email text,
  username text,
  avatar_url text,
  email_verified boolean,
  has_seen_tutorial boolean,
  account_created_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    user_profiles.id,
    user_profiles.email,
    user_profiles.username,
    user_profiles.avatar_url,
    COALESCE(user_profiles.email_verified, false),
    COALESCE(user_profiles.has_seen_tutorial, false),
    user_profiles.account_created_at,
    user_profiles.created_at,
    user_profiles.updated_at
  FROM public.user_profiles
  WHERE user_profiles.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_gate_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_gate_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profiles(p_user_ids uuid[])
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    user_profiles.id,
    user_profiles.username,
    user_profiles.avatar_url
  FROM public.user_profiles
  WHERE auth.jwt()->>'aal' = 'aal2'
    AND user_profiles.id = ANY(p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO authenticated;

-- Dynamically require AAL2 on direct authenticated policies for sensitive tables.
DO $$
DECLARE
  policy_record record;
  next_using text;
  next_check text;
  target_tables text[] := ARRAY[
    'scans',
    'health_scores',
    'purchases',
    'notifications',
    'fridge_scans',
    'coach_entries',
    'oauth_connections',
    'social_posts',
    'social_comments',
    'social_post_reactions',
    'social_comment_likes'
  ];
BEGIN
  FOR policy_record IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(target_tables)
      AND (
        roles IS NULL
        OR roles && ARRAY['authenticated', 'public']::name[]
      )
  LOOP
    next_using := CASE
      WHEN policy_record.qual IS NULL THEN NULL
      WHEN policy_record.qual LIKE '%auth.jwt()->>''aal'' = ''aal2''%' THEN policy_record.qual
      ELSE format('((%s) AND (auth.jwt()->>''aal'' = ''aal2''))', policy_record.qual)
    END;

    next_check := CASE
      WHEN policy_record.with_check IS NULL THEN NULL
      WHEN policy_record.with_check LIKE '%auth.jwt()->>''aal'' = ''aal2''%' THEN policy_record.with_check
      ELSE format('((%s) AND (auth.jwt()->>''aal'' = ''aal2''))', policy_record.with_check)
    END;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I%s%s',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      CASE WHEN next_using IS NULL THEN '' ELSE format(' USING (%s)', next_using) END,
      CASE WHEN next_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', next_check) END
    );
  END LOOP;
END $$;

DO $$
DECLARE
  policy_record record;
  next_using text;
  next_check text;
BEGIN
  FOR policy_record IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') LIKE '%scan-images%'
        OR COALESCE(with_check, '') LIKE '%scan-images%'
      )
      AND (
        roles IS NULL
        OR roles && ARRAY['authenticated', 'public']::name[]
      )
  LOOP
    next_using := CASE
      WHEN policy_record.qual IS NULL THEN NULL
      WHEN policy_record.qual LIKE '%auth.jwt()->>''aal'' = ''aal2''%' THEN policy_record.qual
      ELSE format('((%s) AND (auth.jwt()->>''aal'' = ''aal2''))', policy_record.qual)
    END;

    next_check := CASE
      WHEN policy_record.with_check IS NULL THEN NULL
      WHEN policy_record.with_check LIKE '%auth.jwt()->>''aal'' = ''aal2''%' THEN policy_record.with_check
      ELSE format('((%s) AND (auth.jwt()->>''aal'' = ''aal2''))', policy_record.with_check)
    END;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I%s%s',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename,
      CASE WHEN next_using IS NULL THEN '' ELSE format(' USING (%s)', next_using) END,
      CASE WHEN next_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', next_check) END
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_scan_quota(
  p_user_id uuid,
  p_scan_type text,
  p_check_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile record;
  v_account_tier text;
  v_limit_count integer;
  v_scan_usage jsonb;
  v_welcome_credits jsonb;
  v_existing_record jsonb;
  v_valid_timestamps jsonb;
  v_next_timestamps jsonb;
  v_current_count integer;
  v_welcome_credit_count integer := 0;
  v_now timestamptz := now();
  v_now_iso text := to_jsonb(now()) #>> '{}';
  v_oldest text;
  v_scan_id uuid;
  v_used_welcome_credit boolean := false;
BEGIN
  IF p_scan_type NOT IN ('body', 'health', 'nutrition', 'super') THEN
    RAISE EXCEPTION 'invalid scan type';
  END IF;

  SELECT account_tier, scan_usage, welcome_credits
  INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  v_account_tier := CASE
    WHEN v_profile.account_tier IN ('premium', 'admin') THEN v_profile.account_tier
    ELSE 'free'
  END;

  v_limit_count := CASE
    WHEN v_account_tier = 'admin' THEN 20
    WHEN v_account_tier = 'premium' AND p_scan_type = 'super' THEN 1
    WHEN v_account_tier = 'premium' THEN 3
    WHEN p_scan_type = 'super' THEN 0
    ELSE 1
  END;

  v_scan_usage := COALESCE(v_profile.scan_usage, '{}'::jsonb);
  v_welcome_credits := COALESCE(v_profile.welcome_credits, '{}'::jsonb);
  v_existing_record := COALESCE(v_scan_usage -> p_scan_type, '{}'::jsonb);

  SELECT COALESCE(jsonb_agg(timestamp_value), '[]'::jsonb)
  INTO v_valid_timestamps
  FROM jsonb_array_elements_text(COALESCE(v_existing_record -> 'scan_timestamps', '[]'::jsonb)) AS timestamps(timestamp_value)
  WHERE timestamp_value::timestamptz > (v_now - interval '24 hours');

  v_current_count := COALESCE(jsonb_array_length(v_valid_timestamps), 0);

  IF p_scan_type <> 'super' THEN
    v_welcome_credit_count := COALESCE((v_welcome_credits ->> p_scan_type)::integer, 0);
  END IF;

  IF p_scan_type = 'super' AND v_account_tier = 'free' THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Le Super Scan est reserve aux membres Premium',
      'message_key', 'scan_limits.msg_premium_only',
      'current_count', 0,
      'limit', 0,
      'remaining', 0,
      'welcome_credits', 0
    );
  END IF;

  IF p_check_only THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'message', CASE WHEN v_welcome_credit_count > 0 THEN 'Credit de bienvenue disponible' ELSE 'Scan disponible' END,
      'current_count', v_current_count,
      'limit', v_limit_count,
      'remaining', GREATEST(0, v_limit_count - v_current_count),
      'welcome_credits', v_welcome_credit_count
    );
  END IF;

  IF p_scan_type <> 'super' AND v_welcome_credit_count > 0 THEN
    v_used_welcome_credit := true;
    v_welcome_credits := v_welcome_credits || jsonb_build_object(p_scan_type, v_welcome_credit_count - 1);
  ELSIF v_current_count >= v_limit_count THEN
    SELECT value INTO v_oldest
    FROM jsonb_array_elements_text(v_valid_timestamps) AS values(value)
    ORDER BY value::timestamptz ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Limite quotidienne atteinte',
      'next_available_date', (extract(epoch FROM (v_oldest::timestamptz + interval '24 hours')) * 1000)::bigint,
      'current_count', v_current_count,
      'limit', v_limit_count,
      'remaining', 0,
      'welcome_credits', v_welcome_credit_count
    );
  END IF;

  v_next_timestamps := v_valid_timestamps || jsonb_build_array(v_now_iso);
  v_scan_usage := jsonb_set(
    v_scan_usage,
    ARRAY[p_scan_type],
    jsonb_build_object(
      'last_scan_date', v_now_iso,
      'scan_timestamps', v_next_timestamps
    ),
    true
  );

  UPDATE public.user_profiles
  SET
    scan_usage = v_scan_usage,
    welcome_credits = v_welcome_credits,
    updated_at = v_now
  WHERE id = p_user_id;

  INSERT INTO public.scans(user_id, scan_type, created_at, used_welcome_credit)
  VALUES (p_user_id, p_scan_type, v_now, v_used_welcome_credit)
  RETURNING id INTO v_scan_id;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'message', CASE WHEN v_used_welcome_credit THEN 'Scan autorise (credit de bienvenue utilise)' ELSE 'Scan autorise' END,
    'used_welcome_credit', v_used_welcome_credit,
    'remaining_welcome_credits', CASE WHEN p_scan_type = 'super' THEN 0 ELSE COALESCE((v_welcome_credits ->> p_scan_type)::integer, 0) END,
    'welcome_credits', CASE WHEN p_scan_type = 'super' THEN 0 ELSE COALESCE((v_welcome_credits ->> p_scan_type)::integer, 0) END,
    'current_count', COALESCE(jsonb_array_length(v_next_timestamps), 0),
    'limit', v_limit_count,
    'remaining', GREATEST(0, v_limit_count - COALESCE(jsonb_array_length(v_next_timestamps), 0)),
    'scan_id', v_scan_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_fridge_scan_quota(
  p_user_id uuid,
  p_check_only boolean,
  p_source text DEFAULT NULL,
  p_selected_mode text DEFAULT NULL,
  p_locale text DEFAULT NULL,
  p_client_metadata jsonb DEFAULT NULL,
  p_callback_nonce text DEFAULT NULL,
  p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_account_tier text;
  v_current_count integer;
  v_limit integer := 3;
  v_oldest timestamptz;
  v_fridge_scan_id uuid;
  v_now timestamptz := now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':fridge_scan'));

  SELECT account_tier
  INTO v_account_tier
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  v_account_tier := CASE
    WHEN v_account_tier IN ('premium', 'admin') THEN v_account_tier
    ELSE 'free'
  END;

  SELECT COUNT(*), MIN(created_at)
  INTO v_current_count, v_oldest
  FROM public.fridge_scans
  WHERE user_id = p_user_id
    AND created_at >= v_now - interval '24 hours';

  IF v_account_tier = 'free' THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Fridge scan is a premium feature',
      'message_key', 'fridge_scan.premium_required_message',
      'code', 'fridge_scan_premium_required',
      'request_id', p_request_id,
      'remaining', 0,
      'current_count', v_current_count,
      'limit', v_limit,
      'is_premium_required', true
    );
  END IF;

  IF v_account_tier <> 'admin' AND v_current_count >= v_limit THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Fridge scan daily limit reached',
      'message_key', 'scan_limits.msg_daily_reached_3_with_time',
      'code', 'fridge_scan_limit_reached',
      'request_id', p_request_id,
      'remaining', 0,
      'next_available_date', (extract(epoch FROM (v_oldest + interval '24 hours')) * 1000)::bigint,
      'current_count', v_current_count,
      'limit', v_limit,
      'is_premium_required', false
    );
  END IF;

  IF p_check_only THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'message', 'Fridge scan available',
      'message_key', 'fridge_scan.available_message',
      'request_id', p_request_id,
      'remaining', CASE WHEN v_account_tier = 'admin' THEN v_limit ELSE GREATEST(0, v_limit - v_current_count) END,
      'current_count', v_current_count,
      'limit', v_limit,
      'is_premium_required', false,
      'quota_bypassed', v_account_tier = 'admin'
    );
  END IF;

  IF p_source NOT IN ('camera', 'gallery')
    OR p_selected_mode NOT IN ('diet', 'muscle_gain', 'gourmand')
    OR p_callback_nonce IS NULL
  THEN
    RAISE EXCEPTION 'invalid fridge scan reservation input';
  END IF;

  INSERT INTO public.fridge_scans(
    user_id,
    status,
    callback_nonce,
    source,
    selected_mode,
    locale,
    client_metadata,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    'queued',
    p_callback_nonce,
    p_source,
    p_selected_mode,
    COALESCE(NULLIF(p_locale, ''), 'fr'),
    COALESCE(p_client_metadata, '{}'::jsonb),
    v_now,
    v_now
  )
  RETURNING id INTO v_fridge_scan_id;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'message', 'Fridge scan queued',
    'message_key', 'fridge_scan.submission_queued_message',
    'request_id', p_request_id,
    'remaining', CASE WHEN v_account_tier = 'admin' THEN v_limit ELSE GREATEST(0, v_limit - (v_current_count + 1)) END,
    'current_count', v_current_count + 1,
    'limit', v_limit,
    'is_premium_required', false,
    'quota_bypassed', v_account_tier = 'admin',
    'fridge_scan_id', v_fridge_scan_id,
    'callback_nonce', p_callback_nonce,
    'status', 'queued',
    'selected_mode', p_selected_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_fridge_scan_quota(uuid, boolean, text, text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_fridge_scan_quota(uuid, boolean, text, text, text, jsonb, text, text) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
