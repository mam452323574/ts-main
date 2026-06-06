-- Replace the free Coach conversation lifetime gate with four independently
-- recharging message credits in a rolling 72 hour server-side window.
--
-- Existing accepted events remain migration data: recent legacy free events
-- count until their individual expiry. The old free-state row is retained
-- only as a pointer to an active conversation and never gates quota again.

ALTER TABLE public.coach_conversation_message_events
  ADD COLUMN IF NOT EXISTS client_request_id text;

ALTER TABLE public.coach_conversation_message_events
  DROP CONSTRAINT IF EXISTS coach_conversation_message_events_client_request_id_check;

ALTER TABLE public.coach_conversation_message_events
  ADD CONSTRAINT coach_conversation_message_events_client_request_id_check CHECK (
    client_request_id IS NULL
    OR (
      char_length(client_request_id) BETWEEN 1 AND 80
      AND client_request_id ~ '^[A-Za-z0-9_:.-]+$'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS coach_conversation_message_events_client_request_id_unique
  ON public.coach_conversation_message_events(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coach_conversation_message_events_free_window
  ON public.coach_conversation_message_events(user_id, requested_at ASC)
  WHERE status = 'accepted';

-- Remove the historical permanent denial. All quota decisions below use
-- accepted/refunded events; the state row only lets a free user resume chat.
UPDATE public.coach_free_conversation_state
SET consumed = false,
    consumed_at = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('lifetime_guard_disabled_at', now()),
    updated_at = now()
WHERE consumed = true
   OR consumed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.build_coach_conversation_quota_status_json(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_account_tier text;
  v_premium_limit integer := 40;
  v_premium_window_seconds integer := 86400;
  v_per_conversation_limit integer := 20;
  v_free_message_limit integer := 4;
  v_free_window_seconds integer := 259200;
  v_premium_used integer := 0;
  v_premium_available integer;
  v_premium_oldest_requested_at timestamptz;
  v_premium_next_recharge_at timestamptz;
  v_free_used_count integer := 0;
  v_free_remaining integer;
  v_free_oldest_requested_at timestamptz;
  v_free_next_recharge_at timestamptz;
  v_free_conversation_id uuid;
BEGIN
  SELECT CASE
    WHEN account_tier IN ('premium', 'admin') THEN account_tier
    ELSE 'free'
  END
  INTO v_account_tier
  FROM public.user_profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach profile not found';
  END IF;

  IF v_account_tier = 'admin' THEN
    RETURN jsonb_build_object(
      'account_tier', v_account_tier,
      'tier', v_account_tier,
      'unlimited', true,
      'window_seconds', v_premium_window_seconds,
      'premium_today_used', 0,
      'premium_today_limit', NULL,
      'premium_today_available', NULL,
      'next_recharge_at', NULL,
      'per_conversation_limit', v_per_conversation_limit,
      'free_used', false,
      'free_message_limit', NULL,
      'free_used_count', NULL,
      'free_remaining_messages', NULL,
      'free_next_recharge_at', NULL,
      'free_window_seconds', NULL,
      'free_conversation_id', NULL,
      'quota_exceeded', false,
      'as_of', to_jsonb(p_now) #>> '{}'
    );
  END IF;

  IF v_account_tier = 'free' THEN
    SELECT COUNT(*)::integer, MIN(requested_at)
    INTO v_free_used_count, v_free_oldest_requested_at
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND status = 'accepted'
      AND requested_at > (p_now - interval '72 hours')
      AND COALESCE(metadata->>'quota_tier', 'free') = 'free';

    v_free_remaining := GREATEST(0, v_free_message_limit - COALESCE(v_free_used_count, 0));
    v_free_next_recharge_at := CASE
      WHEN COALESCE(v_free_used_count, 0) > 0 AND v_free_oldest_requested_at IS NOT NULL
        THEN v_free_oldest_requested_at + interval '72 hours'
      ELSE NULL
    END;

    SELECT state.conversation_id
    INTO v_free_conversation_id
    FROM public.coach_free_conversation_state AS state
    JOIN public.coach_conversations AS conversation
      ON conversation.id = state.conversation_id
     AND conversation.user_id = state.user_id
     AND conversation.status = 'active'
    WHERE state.user_id = p_user_id;
  ELSE
    SELECT COUNT(*)::integer, MIN(requested_at)
    INTO v_premium_used, v_premium_oldest_requested_at
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND status = 'accepted'
      AND requested_at > (p_now - interval '24 hours');

    v_premium_available := GREATEST(0, v_premium_limit - COALESCE(v_premium_used, 0));
    v_premium_next_recharge_at := CASE
      WHEN COALESCE(v_premium_used, 0) > 0 AND v_premium_oldest_requested_at IS NOT NULL
        THEN v_premium_oldest_requested_at + interval '24 hours'
      ELSE NULL
    END;
  END IF;

  RETURN jsonb_build_object(
    'account_tier', v_account_tier,
    'tier', v_account_tier,
    'unlimited', false,
    'window_seconds', CASE
      WHEN v_account_tier = 'free' THEN v_free_window_seconds
      ELSE v_premium_window_seconds
    END,
    'premium_today_used', COALESCE(v_premium_used, 0),
    'premium_today_limit', CASE WHEN v_account_tier = 'premium' THEN v_premium_limit ELSE NULL END,
    'premium_today_available', CASE WHEN v_account_tier = 'premium' THEN v_premium_available ELSE NULL END,
    'next_recharge_at', CASE
      WHEN v_account_tier = 'free' AND v_free_next_recharge_at IS NOT NULL
        THEN to_jsonb(v_free_next_recharge_at) #>> '{}'
      WHEN v_account_tier = 'premium' AND v_premium_next_recharge_at IS NOT NULL
        THEN to_jsonb(v_premium_next_recharge_at) #>> '{}'
      ELSE NULL
    END,
    'per_conversation_limit', v_per_conversation_limit,
    -- Compatibility: free_used now means every currently active free slot is used.
    'free_used', CASE
      WHEN v_account_tier = 'free' THEN COALESCE(v_free_used_count, 0) >= v_free_message_limit
      ELSE false
    END,
    'free_message_limit', CASE WHEN v_account_tier = 'free' THEN v_free_message_limit ELSE NULL END,
    'free_used_count', CASE WHEN v_account_tier = 'free' THEN COALESCE(v_free_used_count, 0) ELSE NULL END,
    'free_remaining_messages', CASE WHEN v_account_tier = 'free' THEN v_free_remaining ELSE NULL END,
    'free_next_recharge_at', CASE
      WHEN v_account_tier = 'free' AND v_free_next_recharge_at IS NOT NULL
        THEN to_jsonb(v_free_next_recharge_at) #>> '{}'
      ELSE NULL
    END,
    'free_window_seconds', CASE WHEN v_account_tier = 'free' THEN v_free_window_seconds ELSE NULL END,
    'free_conversation_id', CASE WHEN v_account_tier = 'free' THEN v_free_conversation_id ELSE NULL END,
    'quota_exceeded', CASE
      WHEN v_account_tier = 'free' THEN COALESCE(v_free_used_count, 0) >= v_free_message_limit
      WHEN v_account_tier = 'premium' THEN COALESCE(v_premium_available, 0) <= 0
      ELSE false
    END,
    'as_of', to_jsonb(p_now) #>> '{}'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coach_conversation_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.build_coach_conversation_quota_status_json(p_user_id, now());
END;
$$;

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

  IF v_account_tier = 'free' THEN
    SELECT conversation.id
    INTO v_conversation_id
    FROM public.coach_free_conversation_state AS state
    JOIN public.coach_conversations AS conversation
      ON conversation.id = state.conversation_id
     AND conversation.user_id = state.user_id
     AND conversation.status = 'active'
    WHERE state.user_id = p_user_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', true,
        'code', 'coach_free_conversation_resumed',
        'conversation_id', v_conversation_id,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;
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
        user_message_count = 0,
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

-- Retire the lifetime implementation before publishing the optional
-- idempotency argument. Two-argument calls resolve through the default.
DROP FUNCTION IF EXISTS public.reserve_coach_conversation_message_slot(uuid, uuid);

CREATE FUNCTION public.reserve_coach_conversation_message_slot(
  p_user_id uuid,
  p_conversation_id uuid,
  p_client_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_account_tier text;
  v_conversation record;
  v_now timestamptz := now();
  v_per_conversation_limit integer := 20;
  v_premium_limit integer := 40;
  v_free_message_limit integer := 4;
  v_premium_used integer := 0;
  v_free_used_count integer := 0;
  v_user_message_count integer := 0;
  v_event_id uuid;
  v_existing_event_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id and p_conversation_id are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':coach_conv_quota')::bigint);

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

  SELECT id, user_id, status, user_message_count
  INTO v_conversation
  FROM public.coach_conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND OR v_conversation.user_id <> p_user_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'code', 'coach_conversation_not_found',
      'usage_event_id', NULL,
      'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
    );
  END IF;

  IF v_conversation.status IN ('ended', 'archived') THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'code', 'coach_conversation_ended',
      'usage_event_id', NULL,
      'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
    );
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id
    INTO v_existing_event_id
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND client_request_id = p_client_request_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_conversation_request_in_progress',
        'usage_event_id', v_existing_event_id,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;
  END IF;

  v_user_message_count := COALESCE(v_conversation.user_message_count, 0);

  IF v_user_message_count >= v_per_conversation_limit THEN
    UPDATE public.coach_conversations
    SET status = 'quota_reached',
        ended_at = COALESCE(ended_at, v_now),
        ended_reason = COALESCE(ended_reason, 'quota_reached')
    WHERE id = p_conversation_id;

    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'code', 'coach_conversation_message_limit_reached',
      'usage_event_id', NULL,
      'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
    );
  END IF;

  IF v_account_tier = 'free' THEN
    SELECT COUNT(*)::integer
    INTO v_free_used_count
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND status = 'accepted'
      AND requested_at > (v_now - interval '72 hours')
      AND COALESCE(metadata->>'quota_tier', 'free') = 'free';

    IF COALESCE(v_free_used_count, 0) >= v_free_message_limit THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_free_conversation_message_limit_reached',
        'usage_event_id', NULL,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;
  ELSIF v_account_tier = 'premium' THEN
    SELECT COUNT(*)::integer
    INTO v_premium_used
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND status = 'accepted'
      AND requested_at > (v_now - interval '24 hours');

    IF COALESCE(v_premium_used, 0) >= v_premium_limit THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_conversation_quota_exhausted',
        'usage_event_id', NULL,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;
  END IF;

  INSERT INTO public.coach_conversation_message_events(
    user_id,
    conversation_id,
    client_request_id,
    requested_at,
    status,
    metadata
  )
  VALUES (
    p_user_id,
    p_conversation_id,
    p_client_request_id,
    v_now,
    'accepted',
    jsonb_build_object(
      'quota_tier', v_account_tier,
      'quota_window_seconds', CASE
        WHEN v_account_tier = 'free' THEN 259200
        WHEN v_account_tier = 'premium' THEN 86400
        ELSE NULL
      END
    )
  )
  RETURNING id INTO v_event_id;

  UPDATE public.coach_conversations
  SET user_message_count = COALESCE(user_message_count, 0) + 1,
      message_count = COALESCE(message_count, 0) + 1,
      last_user_message_at = v_now,
      updated_at = v_now
  WHERE id = p_conversation_id;

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
      p_conversation_id,
      v_now,
      false,
      NULL,
      0
    )
    ON CONFLICT (user_id) DO UPDATE
    SET conversation_id = EXCLUDED.conversation_id,
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
    'usage_event_id', v_event_id,
    'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_coach_conversation_quota_event(
  p_usage_event_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'technical_failure'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_event record;
  v_refunded integer := 0;
  v_now timestamptz := now();
BEGIN
  SELECT id, conversation_id, status
  INTO v_event
  FROM public.coach_conversation_message_events
  WHERE id = p_usage_event_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_event.status <> 'accepted' THEN
    RETURN jsonb_build_object(
      'success', true,
      'refunded', false
    );
  END IF;

  UPDATE public.coach_conversation_message_events
  SET status = 'refunded',
      refunded_at = v_now,
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('refund_reason', COALESCE(p_reason, 'technical_failure'))
  WHERE id = p_usage_event_id
    AND status = 'accepted';

  GET DIAGNOSTICS v_refunded = ROW_COUNT;

  IF v_refunded > 0 THEN
    UPDATE public.coach_conversations
    SET user_message_count = GREATEST(COALESCE(user_message_count, 0) - 1, 0),
        message_count = GREATEST(COALESCE(message_count, 0) - 1, 0),
        updated_at = v_now
    WHERE id = v_event.conversation_id;

    -- This state no longer tracks quota. Clear old blocking flags defensively.
    UPDATE public.coach_free_conversation_state
    SET consumed = false,
        consumed_at = NULL,
        updated_at = v_now
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refunded > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.build_coach_conversation_quota_status_json(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_conversation_quota_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_coach_conversation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_coach_conversation_message_slot(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_coach_conversation_quota_event(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_coach_conversation_quota_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_coach_conversation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_coach_conversation_message_slot(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coach_conversation_quota_event(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
