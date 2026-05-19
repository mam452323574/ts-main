-- Coach conversation quota and lifecycle RPCs.
--
-- The conversation quota is intentionally isolated from the preset quota in
-- coach_usage_events: a dedicated table coach_conversation_message_events
-- counts each accepted user message. This guarantees that the existing
-- presets quota (1/24h free, 8/24h premium) and the new conversation quota
-- (40/24h premium, 4 lifetime free) cannot pollute each other.
--
-- Quota limits:
--   * premium: 40 user messages per rolling 24h window (per_conversation 20).
--   * free:    1 conversation in a lifetime, 4 user messages inside it.
--   * admin:   unlimited.
--
-- All mutating RPCs are SECURITY DEFINER + service_role-only. The two read
-- helpers used by the client (get_coach_conversations_page and
-- get_coach_conversation_messages_page) are SECURITY INVOKER so RLS applies
-- naturally to authenticated callers.

CREATE TABLE IF NOT EXISTS public.coach_conversation_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL
    REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.coach_conversation_messages(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'accepted',
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT coach_conversation_message_events_status_check CHECK (
    status IN ('accepted', 'refunded')
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_conversation_message_events_user_requested
  ON public.coach_conversation_message_events(user_id, requested_at ASC)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_coach_conversation_message_events_conversation
  ON public.coach_conversation_message_events(conversation_id, requested_at ASC)
  WHERE status = 'accepted';

ALTER TABLE public.coach_conversation_message_events ENABLE ROW LEVEL SECURITY;

-- No policies: service_role only.

CREATE TABLE IF NOT EXISTS public.coach_conversation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_conversation_attempts_user_attempted_at
  ON public.coach_conversation_attempts(user_id, attempted_at DESC);

ALTER TABLE public.coach_conversation_attempts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- record_coach_conversation_attempt: per-user rate limiting for send/start.
-- Defaults (8/min, 80/h, 200/day) are higher than the presets equivalent
-- because legitimate chat traffic can have bursts within a 20-message window.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_coach_conversation_attempt(
  p_user_id uuid,
  p_per_minute integer DEFAULT 8,
  p_per_hour integer DEFAULT 80,
  p_per_day integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_minute_count integer;
  v_hour_count integer;
  v_day_count integer;
  v_window_exceeded text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF COALESCE(p_per_minute, 0) < 1
     OR COALESCE(p_per_hour, 0) < 1
     OR COALESCE(p_per_day, 0) < 1 THEN
    RAISE EXCEPTION 'rate limit windows must be positive integers';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 minute'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 hour'),
    COUNT(*) FILTER (WHERE attempted_at > v_now - interval '1 day')
  INTO v_minute_count, v_hour_count, v_day_count
  FROM public.coach_conversation_attempts
  WHERE user_id = p_user_id
    AND attempted_at > v_now - interval '1 day';

  IF v_minute_count >= p_per_minute THEN
    v_window_exceeded := 'minute';
  ELSIF v_hour_count >= p_per_hour THEN
    v_window_exceeded := 'hour';
  ELSIF v_day_count >= p_per_day THEN
    v_window_exceeded := 'day';
  END IF;

  IF v_window_exceeded IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'window_exceeded', v_window_exceeded,
      'attempts_minute', v_minute_count,
      'attempts_hour', v_hour_count,
      'attempts_day', v_day_count
    );
  END IF;

  INSERT INTO public.coach_conversation_attempts(user_id, attempted_at)
  VALUES (p_user_id, v_now);

  DELETE FROM public.coach_conversation_attempts
  WHERE user_id = p_user_id
    AND attempted_at < v_now - interval '25 hours';

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts_minute', v_minute_count + 1,
    'attempts_hour', v_hour_count + 1,
    'attempts_day', v_day_count + 1
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- build_coach_conversation_quota_status_json
-- Returns a JSON blob describing the user's current state:
--   * tier
--   * free_used (boolean) + free_remaining_messages (0..4) + free_conversation_id
--   * premium_today_used, premium_today_limit (40 default), next_recharge_at
--   * per_conversation_limit (20 default)
--   * unlimited (admin)
-- ---------------------------------------------------------------------------

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
  v_per_conversation_limit integer := 20;
  v_free_message_limit integer := 4;
  v_premium_used integer := 0;
  v_premium_available integer;
  v_oldest_requested_at timestamptz;
  v_next_recharge_at timestamptz;
  v_free_state record;
  v_free_remaining integer;
  v_free_used boolean := false;
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
      'window_seconds', 86400,
      'premium_today_used', 0,
      'premium_today_limit', NULL,
      'premium_today_available', NULL,
      'next_recharge_at', NULL,
      'per_conversation_limit', v_per_conversation_limit,
      'free_used', false,
      'free_message_limit', NULL,
      'free_remaining_messages', NULL,
      'free_conversation_id', NULL,
      'as_of', to_jsonb(p_now) #>> '{}'
    );
  END IF;

  -- Free state lookup (returns NULL row if not present).
  SELECT consumed, conversation_id, user_message_count
  INTO v_free_state
  FROM public.coach_free_conversation_state
  WHERE user_id = p_user_id;

  IF FOUND THEN
    v_free_used := COALESCE(v_free_state.consumed, false)
                   OR COALESCE(v_free_state.user_message_count, 0) >= v_free_message_limit;
    v_free_remaining := GREATEST(0, v_free_message_limit
                                    - COALESCE(v_free_state.user_message_count, 0));
    v_free_conversation_id := v_free_state.conversation_id;
  ELSE
    v_free_remaining := v_free_message_limit;
  END IF;

  IF v_account_tier = 'premium' THEN
    SELECT COUNT(*)::integer, MIN(requested_at)
    INTO v_premium_used, v_oldest_requested_at
    FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND status = 'accepted'
      AND requested_at > (p_now - interval '24 hours');

    v_premium_available := GREATEST(0, v_premium_limit - COALESCE(v_premium_used, 0));
    v_next_recharge_at := CASE
      WHEN COALESCE(v_premium_used, 0) > 0 AND v_oldest_requested_at IS NOT NULL
        THEN v_oldest_requested_at + interval '24 hours'
      ELSE NULL
    END;
  END IF;

  RETURN jsonb_build_object(
    'account_tier', v_account_tier,
    'tier', v_account_tier,
    'unlimited', false,
    'window_seconds', 86400,
    'premium_today_used', COALESCE(v_premium_used, 0),
    'premium_today_limit', CASE WHEN v_account_tier = 'premium' THEN v_premium_limit ELSE NULL END,
    'premium_today_available', CASE WHEN v_account_tier = 'premium' THEN v_premium_available ELSE NULL END,
    'next_recharge_at', CASE
      WHEN v_next_recharge_at IS NULL THEN NULL
      ELSE to_jsonb(v_next_recharge_at) #>> '{}'
    END,
    'per_conversation_limit', v_per_conversation_limit,
    'free_used', CASE WHEN v_account_tier = 'free' THEN v_free_used ELSE false END,
    'free_message_limit', CASE WHEN v_account_tier = 'free' THEN v_free_message_limit ELSE NULL END,
    'free_remaining_messages', CASE WHEN v_account_tier = 'free' THEN v_free_remaining ELSE NULL END,
    'free_conversation_id', CASE WHEN v_account_tier = 'free' THEN v_free_conversation_id ELSE NULL END,
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

-- ---------------------------------------------------------------------------
-- start_coach_conversation: idempotent creation of a new chat thread.
-- The Edge Function must have already enforced rate limit + tier checks.
-- This RPC owns: free state initialisation, persona insert, lifecycle row.
-- ---------------------------------------------------------------------------

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
  v_free_state record;
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
    SELECT consumed, conversation_id, user_message_count
    INTO v_free_state
    FROM public.coach_free_conversation_state
    WHERE user_id = p_user_id;

    IF FOUND THEN
      IF COALESCE(v_free_state.consumed, false)
         OR COALESCE(v_free_state.user_message_count, 0) >= 4 THEN
        RETURN jsonb_build_object(
          'success', true,
          'allowed', false,
          'code', 'coach_free_conversation_already_used',
          'conversation_id', NULL,
          'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
        );
      END IF;

      -- Free user has an existing not-yet-consumed conversation: surface it
      -- instead of creating a second one. The Edge Function decides whether to
      -- resume (UI) or to return success with this id.
      IF v_free_state.conversation_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'allowed', true,
          'code', 'coach_free_conversation_resumed',
          'conversation_id', v_free_state.conversation_id,
          'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
        );
      END IF;
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
      user_message_count
    )
    VALUES (
      p_user_id,
      v_conversation_id,
      v_now,
      false,
      0
    )
    ON CONFLICT (user_id) DO UPDATE
    SET conversation_id = EXCLUDED.conversation_id,
        started_at = COALESCE(public.coach_free_conversation_state.started_at, EXCLUDED.started_at),
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

-- ---------------------------------------------------------------------------
-- reserve_coach_conversation_message_slot
-- Atomically check quotas (free lifetime, premium daily, per-conversation)
-- and insert an accepted event row. Returns allowed=false with a code so the
-- Edge Function can map it to a 4xx response.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_coach_conversation_message_slot(
  p_user_id uuid,
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_account_tier text;
  v_conversation record;
  v_free_state record;
  v_now timestamptz := now();
  v_per_conversation_limit integer := 20;
  v_premium_limit integer := 40;
  v_free_message_limit integer := 4;
  v_premium_used integer := 0;
  v_user_message_count integer := 0;
  v_event_id uuid;
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

  -- Tier-specific limits.
  IF v_account_tier = 'free' THEN
    SELECT consumed, conversation_id, user_message_count
    INTO v_free_state
    FROM public.coach_free_conversation_state
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.coach_free_conversation_state(
        user_id,
        conversation_id,
        started_at,
        consumed,
        user_message_count
      )
      VALUES (
        p_user_id,
        p_conversation_id,
        v_now,
        false,
        0
      );
      v_free_state.consumed := false;
      v_free_state.conversation_id := p_conversation_id;
      v_free_state.user_message_count := 0;
    END IF;

    IF COALESCE(v_free_state.consumed, false) THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_free_conversation_already_used',
        'usage_event_id', NULL,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;

    IF v_free_state.conversation_id IS NOT NULL
       AND v_free_state.conversation_id <> p_conversation_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_free_conversation_already_used',
        'usage_event_id', NULL,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;

    IF COALESCE(v_free_state.user_message_count, 0) >= v_free_message_limit THEN
      RETURN jsonb_build_object(
        'success', true,
        'allowed', false,
        'code', 'coach_free_conversation_message_limit_reached',
        'usage_event_id', NULL,
        'quota', public.build_coach_conversation_quota_status_json(p_user_id, v_now)
      );
    END IF;
  ELSIF v_account_tier = 'premium' THEN
    DELETE FROM public.coach_conversation_message_events
    WHERE user_id = p_user_id
      AND requested_at < (v_now - interval '25 hours');

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
  -- admin: no daily cap, fall through.

  INSERT INTO public.coach_conversation_message_events(
    user_id,
    conversation_id,
    requested_at,
    status
  )
  VALUES (
    p_user_id,
    p_conversation_id,
    v_now,
    'accepted'
  )
  RETURNING id INTO v_event_id;

  -- Counter bump. The Edge Function will INSERT the actual user message
  -- right after and call attach_coach_conversation_quota_event to link them.
  UPDATE public.coach_conversations
  SET user_message_count = COALESCE(user_message_count, 0) + 1,
      message_count = COALESCE(message_count, 0) + 1,
      last_user_message_at = v_now,
      updated_at = v_now
  WHERE id = p_conversation_id;

  IF v_account_tier = 'free' THEN
    UPDATE public.coach_free_conversation_state
    SET user_message_count = COALESCE(user_message_count, 0) + 1,
        consumed = CASE
          WHEN COALESCE(user_message_count, 0) + 1 >= v_free_message_limit THEN true
          ELSE consumed
        END,
        consumed_at = CASE
          WHEN COALESCE(user_message_count, 0) + 1 >= v_free_message_limit
            AND consumed_at IS NULL
            THEN v_now
          ELSE consumed_at
        END,
        updated_at = v_now
    WHERE user_id = p_user_id;
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

-- ---------------------------------------------------------------------------
-- attach_coach_conversation_quota_event
-- Links a usage event to the freshly inserted user message id so error refund
-- can still target the right message id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.attach_coach_conversation_quota_event(
  p_usage_event_id uuid,
  p_user_id uuid,
  p_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.coach_conversation_message_events
  SET message_id = p_message_id
  WHERE id = p_usage_event_id
    AND user_id = p_user_id
    AND status = 'accepted';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'attached', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- refund_coach_conversation_quota_event
-- Marks the event as refunded and rolls back counters on the conversation
-- (and on the free-state, if applicable). Used when the upstream LLM call
-- fails with a recoverable error (network/5xx).
-- ---------------------------------------------------------------------------

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
  WHERE id = p_usage_event_id;

  GET DIAGNOSTICS v_refunded = ROW_COUNT;

  IF v_refunded > 0 THEN
    UPDATE public.coach_conversations
    SET user_message_count = GREATEST(COALESCE(user_message_count, 0) - 1, 0),
        message_count = GREATEST(COALESCE(message_count, 0) - 1, 0),
        updated_at = v_now
    WHERE id = v_event.conversation_id;

    UPDATE public.coach_free_conversation_state
    SET user_message_count = GREATEST(COALESCE(user_message_count, 0) - 1, 0),
        consumed = CASE
          WHEN GREATEST(COALESCE(user_message_count, 0) - 1, 0) < 4 THEN false
          ELSE consumed
        END,
        consumed_at = CASE
          WHEN GREATEST(COALESCE(user_message_count, 0) - 1, 0) < 4 THEN NULL
          ELSE consumed_at
        END,
        updated_at = v_now
    WHERE user_id = p_user_id
      AND conversation_id = v_event.conversation_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refunded > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- end_coach_conversation: soft-ends a conversation owned by the caller.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.end_coach_conversation(
  p_conversation_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'user_ended'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  IF p_reason NOT IN ('user_ended', 'quota_reached', 'admin', 'timeout') THEN
    RAISE EXCEPTION 'invalid coach conversation end reason';
  END IF;

  UPDATE public.coach_conversations
  SET status = 'ended',
      ended_at = v_now,
      ended_reason = p_reason,
      updated_at = v_now
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND status NOT IN ('ended', 'archived');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- archive_coach_conversation: hides a conversation from the default list.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_coach_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now timestamptz := now();
  v_updated integer := 0;
BEGIN
  UPDATE public.coach_conversations
  SET status = 'archived',
      archived_at = v_now,
      updated_at = v_now
  WHERE id = p_conversation_id
    AND user_id = p_user_id
    AND status <> 'archived';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_coach_conversations_page: keyset-paginated list for authenticated user.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_coach_conversations_page(
  p_limit integer DEFAULT 20,
  p_cursor_updated_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  title text,
  persona_key text,
  locale text,
  status text,
  message_count integer,
  user_message_count integer,
  account_tier_at_start text,
  last_user_message_at timestamptz,
  last_assistant_message_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  archived_at timestamptz,
  metadata jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    conv.id,
    conv.user_id,
    conv.created_at,
    conv.updated_at,
    conv.title,
    conv.persona_key,
    conv.locale,
    conv.status,
    conv.message_count,
    conv.user_message_count,
    conv.account_tier_at_start,
    conv.last_user_message_at,
    conv.last_assistant_message_at,
    conv.ended_at,
    conv.ended_reason,
    conv.archived_at,
    conv.metadata
  FROM public.coach_conversations AS conv
  WHERE conv.user_id = auth.uid()
    AND (p_include_archived OR conv.status <> 'archived')
    AND (
      p_cursor_updated_at IS NULL
      OR conv.updated_at < p_cursor_updated_at
      OR (
        conv.updated_at = p_cursor_updated_at
        AND conv.id < p_cursor_id
      )
    )
  ORDER BY conv.updated_at DESC, conv.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
$$;

-- ---------------------------------------------------------------------------
-- get_coach_conversation_messages_page: keyset pagination ascending so the
-- client can render chat order naturally.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_coach_conversation_messages_page(
  p_conversation_id uuid,
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  user_id uuid,
  role text,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  model text,
  provider text,
  prompt_tokens integer,
  completion_tokens integer,
  generation_ms integer,
  status text,
  error_code text,
  metadata jsonb
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT
    msg.id,
    msg.conversation_id,
    msg.user_id,
    msg.role,
    msg.content,
    msg.created_at,
    msg.updated_at,
    msg.model,
    msg.provider,
    msg.prompt_tokens,
    msg.completion_tokens,
    msg.generation_ms,
    msg.status,
    msg.error_code,
    msg.metadata
  FROM public.coach_conversation_messages AS msg
  WHERE msg.user_id = auth.uid()
    AND msg.conversation_id = p_conversation_id
    AND (
      p_cursor_created_at IS NULL
      OR msg.created_at > p_cursor_created_at
      OR (
        msg.created_at = p_cursor_created_at
        AND msg.id > p_cursor_id
      )
    )
  ORDER BY msg.created_at ASC, msg.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 201);
$$;

REVOKE ALL ON TABLE public.coach_conversation_message_events FROM PUBLIC;
REVOKE ALL ON TABLE public.coach_conversation_attempts FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_coach_conversation_attempt(uuid, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_coach_conversation_quota_status_json(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_conversation_quota_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_coach_conversation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_coach_conversation_message_slot(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_coach_conversation_quota_event(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_coach_conversation_quota_event(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_coach_conversation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_coach_conversation(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_coach_conversation_attempt(uuid, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_conversation_quota_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_coach_conversation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_coach_conversation_message_slot(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_coach_conversation_quota_event(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coach_conversation_quota_event(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_coach_conversation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_coach_conversation(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_coach_conversations_page(integer, timestamptz, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_conversation_messages_page(uuid, integer, timestamptz, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
