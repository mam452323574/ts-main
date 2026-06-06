-- PROMPT 3 — Per-persona conversation state in the Coach quota status.
--
-- Adds two JSONB maps to the quota payload so the coach hero card can resume
-- the most recent visible conversation for the currently selected persona,
-- and surface accurate "Voir les N conversations" counters:
--
--   last_conversation_by_persona:
--     { [persona_key]: { id, updated_at, last_user_message_at } | null }
--
--   conversation_count_by_persona:
--     { [persona_key]: integer }   -- excludes hidden_at IS NOT NULL
--
-- Both maps are populated for every tier (admin included). Soft-deleted rows
-- (hidden_at IS NOT NULL) are excluded — they must never resurface as the
-- "latest" entry the user lands on after deleting their last conversation.
--
-- The existing index `idx_coach_conversations_user_visible_updated_at`
-- (created in 20260527120000) already covers the DISTINCT ON keyset.

BEGIN;

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
  v_persona_last jsonb;
  v_persona_counts jsonb;
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

  -- Per-persona snapshot: for each persona the user has a visible
  -- conversation with, return the freshest one (DISTINCT ON), ordered by the
  -- same activity timestamp used everywhere else (last_user_message_at, with
  -- updated_at as fallback for rooms that have no user message yet — eg.
  -- conversations that only contain the assistant welcome message).
  SELECT COALESCE(
    jsonb_object_agg(
      persona_key,
      jsonb_build_object(
        'id', id,
        'updated_at', to_jsonb(updated_at) #>> '{}',
        'last_user_message_at', CASE
          WHEN last_user_message_at IS NULL THEN NULL
          ELSE to_jsonb(last_user_message_at) #>> '{}'
        END
      )
    ),
    '{}'::jsonb
  )
  INTO v_persona_last
  FROM (
    SELECT DISTINCT ON (conv.persona_key)
      conv.persona_key,
      conv.id,
      conv.updated_at,
      conv.last_user_message_at
    FROM public.coach_conversations AS conv
    WHERE conv.user_id = p_user_id
      AND conv.hidden_at IS NULL
    ORDER BY
      conv.persona_key,
      COALESCE(conv.last_user_message_at, conv.updated_at) DESC,
      conv.id DESC
  ) AS per_persona_last;

  SELECT COALESCE(
    jsonb_object_agg(persona_key, conv_count),
    '{}'::jsonb
  )
  INTO v_persona_counts
  FROM (
    SELECT conv.persona_key, COUNT(*)::integer AS conv_count
    FROM public.coach_conversations AS conv
    WHERE conv.user_id = p_user_id
      AND conv.hidden_at IS NULL
    GROUP BY conv.persona_key
  ) AS per_persona_count;

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
      'as_of', to_jsonb(p_now) #>> '{}',
      'last_conversation_by_persona', COALESCE(v_persona_last, '{}'::jsonb),
      'conversation_count_by_persona', COALESCE(v_persona_counts, '{}'::jsonb)
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
    'as_of', to_jsonb(p_now) #>> '{}',
    'last_conversation_by_persona', COALESCE(v_persona_last, '{}'::jsonb),
    'conversation_count_by_persona', COALESCE(v_persona_counts, '{}'::jsonb)
  );
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
