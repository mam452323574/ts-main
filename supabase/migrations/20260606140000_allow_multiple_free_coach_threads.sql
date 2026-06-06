-- A free user can start distinct conversation topics. Message credits remain
-- enforced by reserve_coach_conversation_message_slot over accepted events.

CREATE OR REPLACE FUNCTION public.start_coach_conversation(
  p_user_id uuid,
  p_persona_key text,
  p_locale text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_account_tier text;
  v_conversation_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_persona_key NOT IN (
    'gentle_supportive',
    'strict_tough',
    'motivational_energetic',
    'patient_calm',
    'analytical_precise',
    'playful_light'
  ) THEN
    RAISE EXCEPTION 'invalid persona_key';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':coach_conv_start')::bigint);

  SELECT CASE
    WHEN account_tier IN ('premium', 'admin') THEN account_tier
    ELSE 'free'
  END
  INTO v_account_tier
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach profile not found';
  END IF;

  INSERT INTO public.coach_conversations(
    user_id,
    persona_key,
    locale,
    status,
    account_tier_at_start
  )
  VALUES (
    p_user_id,
    p_persona_key,
    p_locale,
    'active',
    v_account_tier
  )
  RETURNING id INTO v_conversation_id;

  IF v_account_tier = 'free' THEN
    INSERT INTO public.coach_free_conversation_state(
      user_id,
      conversation_id,
      started_at,
      consumed,
      consumed_at,
      user_message_count
    )
    VALUES (
      p_user_id,
      v_conversation_id,
      v_now,
      false,
      NULL,
      0
    )
    ON CONFLICT (user_id) DO UPDATE
    SET conversation_id = EXCLUDED.conversation_id,
        started_at = EXCLUDED.started_at,
        consumed = false,
        consumed_at = NULL,
        metadata = COALESCE(public.coach_free_conversation_state.metadata, '{}'::jsonb)
          || jsonb_build_object('lifetime_guard_disabled_at', v_now),
        updated_at = v_now;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'code', NULL,
    'conversation_id', v_conversation_id,
    'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_coach_conversation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_coach_conversation(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
