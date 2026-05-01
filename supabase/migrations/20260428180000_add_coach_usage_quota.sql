-- Coach product quota: rolling 24h slots per accepted Coach request.
-- Source of truth is coach_usage_events, not the client and not midnight resets.

CREATE TABLE IF NOT EXISTS public.coach_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  coach_entry_id uuid REFERENCES public.coach_entries(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'coach_generation',
  status text NOT NULL DEFAULT 'accepted',
  request_id text,
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_usage_events_source_check CHECK (
    source IN ('coach_generation', 'coach_cache')
  ),
  CONSTRAINT coach_usage_events_status_check CHECK (
    status IN ('accepted', 'refunded')
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_usage_events_user_requested_at_active
  ON public.coach_usage_events(user_id, requested_at ASC)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_coach_usage_events_entry
  ON public.coach_usage_events(coach_entry_id)
  WHERE coach_entry_id IS NOT NULL;

ALTER TABLE public.coach_usage_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS phase2_set_coach_usage_events_updated_at
  ON public.coach_usage_events;
CREATE TRIGGER phase2_set_coach_usage_events_updated_at
  BEFORE UPDATE ON public.coach_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

CREATE OR REPLACE FUNCTION public.build_coach_quota_status_json(
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
  v_limit integer;
  v_used_count integer := 0;
  v_available integer;
  v_oldest_requested_at timestamptz;
  v_next_recharge_at timestamptz;
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
      'limit', NULL,
      'used_count', 0,
      'available', NULL,
      'next_recharge_at', NULL,
      'unlimited', true,
      'window_seconds', 86400,
      'as_of', to_jsonb(p_now) #>> '{}'
    );
  END IF;

  v_limit := CASE
    WHEN v_account_tier = 'premium' THEN 8
    ELSE 1
  END;

  SELECT COUNT(*)::integer, MIN(requested_at)
  INTO v_used_count, v_oldest_requested_at
  FROM public.coach_usage_events
  WHERE user_id = p_user_id
    AND status = 'accepted'
    AND requested_at > (p_now - interval '24 hours');

  v_available := GREATEST(0, v_limit - COALESCE(v_used_count, 0));
  v_next_recharge_at := CASE
    WHEN COALESCE(v_used_count, 0) > 0 AND v_oldest_requested_at IS NOT NULL
      THEN v_oldest_requested_at + interval '24 hours'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'account_tier', v_account_tier,
    'limit', v_limit,
    'used_count', COALESCE(v_used_count, 0),
    'available', v_available,
    'next_recharge_at', CASE
      WHEN v_next_recharge_at IS NULL THEN NULL
      ELSE to_jsonb(v_next_recharge_at) #>> '{}'
    END,
    'unlimited', false,
    'window_seconds', 86400,
    'as_of', to_jsonb(p_now) #>> '{}'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coach_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.build_coach_quota_status_json(p_user_id, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_coach_quota(
  p_user_id uuid,
  p_source text DEFAULT 'coach_generation',
  p_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile record;
  v_now timestamptz := now();
  v_status jsonb;
  v_usage_event_id uuid;
  v_limit integer;
  v_available integer;
BEGIN
  IF p_source NOT IN ('coach_generation', 'coach_cache') THEN
    RAISE EXCEPTION 'invalid coach quota source';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':coach_quota')::bigint);

  SELECT id, CASE
    WHEN account_tier IN ('premium', 'admin') THEN account_tier
    ELSE 'free'
  END AS account_tier
  INTO v_profile
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coach profile not found';
  END IF;

  DELETE FROM public.coach_usage_events
  WHERE user_id = p_user_id
    AND requested_at < (v_now - interval '25 hours');

  v_status := public.build_coach_quota_status_json(p_user_id, v_now);

  IF COALESCE((v_status ->> 'unlimited')::boolean, false) THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', true,
      'code', NULL,
      'usage_event_id', NULL,
      'quota', v_status
    );
  END IF;

  v_limit := COALESCE((v_status ->> 'limit')::integer, 0);
  v_available := COALESCE((v_status ->> 'available')::integer, 0);

  IF v_limit <= 0 OR v_available <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'allowed', false,
      'code', 'coach_quota_exhausted',
      'usage_event_id', NULL,
      'quota', v_status
    );
  END IF;

  INSERT INTO public.coach_usage_events(
    user_id,
    source,
    request_id,
    requested_at,
    status
  )
  VALUES (
    p_user_id,
    p_source,
    p_request_id,
    v_now,
    'accepted'
  )
  RETURNING id INTO v_usage_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'allowed', true,
    'code', NULL,
    'usage_event_id', v_usage_event_id,
    'quota', public.build_coach_quota_status_json(p_user_id, v_now)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_coach_quota_event(
  p_usage_event_id uuid,
  p_user_id uuid,
  p_coach_entry_id uuid,
  p_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  IF p_source IS NOT NULL AND p_source NOT IN ('coach_generation', 'coach_cache') THEN
    RAISE EXCEPTION 'invalid coach quota source';
  END IF;

  UPDATE public.coach_usage_events
  SET
    coach_entry_id = p_coach_entry_id,
    source = COALESCE(p_source, source)
  WHERE id = p_usage_event_id
    AND user_id = p_user_id
    AND status = 'accepted';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'attached', v_updated_count > 0,
    'quota', public.build_coach_quota_status_json(p_user_id, now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_coach_quota_event(
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
  v_refunded_count integer := 0;
BEGIN
  UPDATE public.coach_usage_events
  SET
    status = 'refunded',
    refunded_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object('refund_reason', COALESCE(p_reason, 'technical_failure'))
  WHERE id = p_usage_event_id
    AND user_id = p_user_id
    AND status = 'accepted';

  GET DIAGNOSTICS v_refunded_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'refunded', v_refunded_count > 0,
    'quota', public.build_coach_quota_status_json(p_user_id, now())
  );
END;
$$;

REVOKE ALL ON TABLE public.coach_usage_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_coach_quota_status_json(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_quota_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_coach_quota(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_coach_quota_event(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_coach_quota_event(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_coach_quota_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_coach_quota(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_coach_quota_event(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coach_quota_event(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
