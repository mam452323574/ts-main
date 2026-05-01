-- Raise Chef / Fridge Scan premium quota from 3 to 5 rolling-24h requests.
-- Free users remain locked behind Premium; admins keep the existing bypass.

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
  v_limit integer := 5;
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
      'message_key', 'fridge_scan.limit_reached_with_time',
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

NOTIFY pgrst, 'reload schema';
