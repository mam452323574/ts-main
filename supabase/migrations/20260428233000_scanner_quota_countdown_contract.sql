-- Extend scanner quota responses with an explicit countdown contract.
-- Backend remains the quota source of truth; the client only displays these timestamps.

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
  v_next_count integer;
  v_remaining integer;
  v_welcome_credit_count integer := 0;
  v_now timestamptz := now();
  v_now_iso text := to_jsonb(now()) #>> '{}';
  v_server_now_ms bigint;
  v_oldest text;
  v_next_recharge_at bigint;
  v_next_recharge_at_iso text;
  v_next_recharge_after_record bigint;
  v_next_recharge_after_record_iso text;
  v_scan_id uuid;
  v_used_welcome_credit boolean := false;
  v_has_quota_slot boolean := false;
  v_has_welcome_credit boolean := false;
  v_check_allowed boolean := false;
  v_limit_message_key text;
BEGIN
  IF p_scan_type NOT IN ('body', 'health', 'nutrition', 'super') THEN
    RAISE EXCEPTION 'invalid scan type';
  END IF;

  v_server_now_ms := (extract(epoch FROM v_now) * 1000)::bigint;

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

  SELECT COALESCE(jsonb_agg(timestamp_value ORDER BY timestamp_value::timestamptz ASC), '[]'::jsonb)
  INTO v_valid_timestamps
  FROM jsonb_array_elements_text(COALESCE(v_existing_record -> 'scan_timestamps', '[]'::jsonb)) AS timestamps(timestamp_value)
  WHERE timestamp_value::timestamptz > (v_now - interval '24 hours');

  v_current_count := COALESCE(jsonb_array_length(v_valid_timestamps), 0);
  v_remaining := GREATEST(0, v_limit_count - v_current_count);
  v_has_quota_slot := v_remaining > 0;

  IF v_current_count > 0 THEN
    SELECT timestamp_value
    INTO v_oldest
    FROM jsonb_array_elements_text(v_valid_timestamps) AS active_timestamps(timestamp_value)
    ORDER BY timestamp_value::timestamptz ASC
    LIMIT 1;

    v_next_recharge_at := (extract(epoch FROM (v_oldest::timestamptz + interval '24 hours')) * 1000)::bigint;
    v_next_recharge_at_iso := to_jsonb(v_oldest::timestamptz + interval '24 hours') #>> '{}';
  END IF;

  IF p_scan_type <> 'super' THEN
    v_welcome_credit_count := COALESCE((v_welcome_credits ->> p_scan_type)::integer, 0);
  END IF;

  v_has_welcome_credit := p_scan_type <> 'super' AND v_welcome_credit_count > 0;
  v_limit_message_key := CASE
    WHEN v_limit_count = 3 THEN 'scan_limits.msg_daily_reached_3_with_time'
    ELSE 'scan_limits.msg_daily_reached_1_with_time'
  END;

  IF p_scan_type = 'super' AND v_account_tier = 'free' THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Le Super Scan est reserve aux membres Premium',
      'message_key', 'scan_limits.msg_premium_only',
      'scanType', p_scan_type,
      'current_count', 0,
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'available', 0,
      'welcome_credits', 0,
      'server_now_ms', v_server_now_ms
    );
  END IF;

  IF p_check_only THEN
    v_check_allowed := v_has_quota_slot OR v_has_welcome_credit;

    IF NOT v_check_allowed THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'message', 'Limite quotidienne atteinte',
        'message_key', v_limit_message_key,
        'scanType', p_scan_type,
        'current_count', v_current_count,
        'used', v_current_count,
        'limit', v_limit_count,
        'remaining', 0,
        'available', 0,
        'welcome_credits', v_welcome_credit_count,
        'server_now_ms', v_server_now_ms
      )
      || CASE
        WHEN v_next_recharge_at IS NOT NULL THEN jsonb_build_object(
          'next_available_date', v_next_recharge_at,
          'next_recharge_at', v_next_recharge_at,
          'nextRechargeAt', v_next_recharge_at_iso
        )
        ELSE '{}'::jsonb
      END;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'message', CASE WHEN v_has_welcome_credit THEN 'Credit de bienvenue disponible' ELSE 'Scan disponible' END,
      'scanType', p_scan_type,
      'current_count', v_current_count,
      'used', v_current_count,
      'limit', v_limit_count,
      'remaining', v_remaining,
      'available', v_remaining,
      'welcome_credits', v_welcome_credit_count,
      'server_now_ms', v_server_now_ms
    )
    || CASE
      WHEN v_next_recharge_at IS NOT NULL THEN jsonb_build_object(
        'next_recharge_at', v_next_recharge_at,
        'nextRechargeAt', v_next_recharge_at_iso
      )
      ELSE '{}'::jsonb
    END;
  END IF;

  IF v_has_welcome_credit THEN
    v_used_welcome_credit := true;
    v_welcome_credits := v_welcome_credits || jsonb_build_object(p_scan_type, v_welcome_credit_count - 1);
  ELSIF NOT v_has_quota_slot THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'message', 'Limite quotidienne atteinte',
      'message_key', v_limit_message_key,
      'scanType', p_scan_type,
      'current_count', v_current_count,
      'used', v_current_count,
      'limit', v_limit_count,
      'remaining', 0,
      'available', 0,
      'welcome_credits', v_welcome_credit_count,
      'server_now_ms', v_server_now_ms
    )
    || CASE
      WHEN v_next_recharge_at IS NOT NULL THEN jsonb_build_object(
        'next_available_date', v_next_recharge_at,
        'next_recharge_at', v_next_recharge_at,
        'nextRechargeAt', v_next_recharge_at_iso
      )
      ELSE '{}'::jsonb
    END;
  END IF;

  v_next_timestamps := v_valid_timestamps || jsonb_build_array(v_now_iso);
  v_next_count := COALESCE(jsonb_array_length(v_next_timestamps), 0);

  SELECT timestamp_value
  INTO v_oldest
  FROM jsonb_array_elements_text(v_next_timestamps) AS next_active_timestamps(timestamp_value)
  ORDER BY timestamp_value::timestamptz ASC
  LIMIT 1;

  v_next_recharge_after_record := (extract(epoch FROM (v_oldest::timestamptz + interval '24 hours')) * 1000)::bigint;
  v_next_recharge_after_record_iso := to_jsonb(v_oldest::timestamptz + interval '24 hours') #>> '{}';

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
    'scanType', p_scan_type,
    'current_count', v_next_count,
    'used', v_next_count,
    'limit', v_limit_count,
    'remaining', GREATEST(0, v_limit_count - v_next_count),
    'available', GREATEST(0, v_limit_count - v_next_count),
    'scan_id', v_scan_id,
    'server_now_ms', v_server_now_ms,
    'next_recharge_at', v_next_recharge_after_record,
    'nextRechargeAt', v_next_recharge_after_record_iso
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_scan_quota(uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
