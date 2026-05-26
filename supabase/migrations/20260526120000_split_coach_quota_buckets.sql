-- Split Coach quota into two independent buckets:
--   * general   — presets (Coach screen) and their cache hits
--   * scan_cta  — Coach requests originating from a scanner result CTA and
--                 their cache hits
--
-- Free: 1/24h per bucket. Premium: 8/24h per bucket. Admin: unlimited on both.
--
-- No new table is introduced and no historical data is backfilled. Existing
-- events with source IN ('coach_generation','coach_cache') continue to count
-- in the general bucket — that mapping is preserved verbatim by
-- public.coach_quota_bucket_for_source(text). New sources are added:
--   * coach_scan_cta_generation — fresh scanner-CTA generation
--   * coach_scan_cta_cache      — scanner-CTA cache hit
--
-- The atomic reservation contract (advisory lock + FOR UPDATE) is preserved,
-- as is the rolling 24h window. attach_coach_quota_event and
-- refund_coach_quota_event remain bucket-agnostic — they operate on a single
-- event row by id, so a refund automatically credits back the right bucket.
--
-- Backward compatibility:
--   * The CHECK constraint on coach_usage_events.source is widened (existing
--     rows stay valid).
--   * build_coach_quota_status_json keeps its previous top-level fields
--     (limit / used_count / available / next_recharge_at) mirroring the
--     `general` bucket, so unmigrated clients keep working.
--   * The new structured information is exposed under quota.buckets.{general,
--     scan_cta} with the same shape per bucket.

ALTER TABLE public.coach_usage_events
  DROP CONSTRAINT IF EXISTS coach_usage_events_source_check;

ALTER TABLE public.coach_usage_events
  ADD CONSTRAINT coach_usage_events_source_check CHECK (
    source IN (
      'coach_generation',
      'coach_cache',
      'coach_scan_cta_generation',
      'coach_scan_cta_cache'
    )
  );

-- Maps a usage event source to its bucket key. IMMUTABLE so it is safe to use
-- in FILTER predicates without re-evaluating per row.
CREATE OR REPLACE FUNCTION public.coach_quota_bucket_for_source(p_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_source IN ('coach_scan_cta_generation', 'coach_scan_cta_cache')
      THEN 'scan_cta'
    ELSE 'general'
  END;
$$;

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
  v_limit_general integer;
  v_limit_scan_cta integer;
  v_used_general integer := 0;
  v_used_scan_cta integer := 0;
  v_oldest_general timestamptz;
  v_oldest_scan_cta timestamptz;
  v_next_general timestamptz;
  v_next_scan_cta timestamptz;
  v_bucket_general jsonb;
  v_bucket_scan_cta jsonb;
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
    v_bucket_general := jsonb_build_object(
      'limit', NULL,
      'used_count', 0,
      'available', NULL,
      'next_recharge_at', NULL,
      'window_seconds', 86400
    );
    v_bucket_scan_cta := v_bucket_general;
    RETURN jsonb_build_object(
      'account_tier', v_account_tier,
      'limit', NULL,
      'used_count', 0,
      'available', NULL,
      'next_recharge_at', NULL,
      'unlimited', true,
      'window_seconds', 86400,
      'as_of', to_jsonb(p_now) #>> '{}',
      'buckets', jsonb_build_object(
        'general', v_bucket_general,
        'scan_cta', v_bucket_scan_cta
      )
    );
  END IF;

  -- Per-tier limits. Free=1, premium=8 per bucket. Both buckets are sized
  -- identically by design so the UX is symmetric across flows.
  v_limit_general := CASE WHEN v_account_tier = 'premium' THEN 8 ELSE 1 END;
  v_limit_scan_cta := v_limit_general;

  -- Count accepted events per bucket within the rolling 24h window.
  -- coach_quota_bucket_for_source is IMMUTABLE so the planner can inline it.
  SELECT
    COALESCE(
      COUNT(*) FILTER (
        WHERE public.coach_quota_bucket_for_source(source) = 'general'
      ),
      0
    )::integer,
    COALESCE(
      COUNT(*) FILTER (
        WHERE public.coach_quota_bucket_for_source(source) = 'scan_cta'
      ),
      0
    )::integer,
    MIN(requested_at) FILTER (
      WHERE public.coach_quota_bucket_for_source(source) = 'general'
    ),
    MIN(requested_at) FILTER (
      WHERE public.coach_quota_bucket_for_source(source) = 'scan_cta'
    )
  INTO v_used_general, v_used_scan_cta, v_oldest_general, v_oldest_scan_cta
  FROM public.coach_usage_events
  WHERE user_id = p_user_id
    AND status = 'accepted'
    AND requested_at > (p_now - interval '24 hours');

  v_next_general := CASE
    WHEN v_used_general > 0 AND v_oldest_general IS NOT NULL
      THEN v_oldest_general + interval '24 hours'
    ELSE NULL
  END;

  v_next_scan_cta := CASE
    WHEN v_used_scan_cta > 0 AND v_oldest_scan_cta IS NOT NULL
      THEN v_oldest_scan_cta + interval '24 hours'
    ELSE NULL
  END;

  v_bucket_general := jsonb_build_object(
    'limit', v_limit_general,
    'used_count', v_used_general,
    'available', GREATEST(0, v_limit_general - v_used_general),
    'next_recharge_at', CASE
      WHEN v_next_general IS NULL THEN NULL
      ELSE to_jsonb(v_next_general) #>> '{}'
    END,
    'window_seconds', 86400
  );

  v_bucket_scan_cta := jsonb_build_object(
    'limit', v_limit_scan_cta,
    'used_count', v_used_scan_cta,
    'available', GREATEST(0, v_limit_scan_cta - v_used_scan_cta),
    'next_recharge_at', CASE
      WHEN v_next_scan_cta IS NULL THEN NULL
      ELSE to_jsonb(v_next_scan_cta) #>> '{}'
    END,
    'window_seconds', 86400
  );

  -- Top-level fields keep mirroring the `general` bucket so clients that
  -- predate this migration keep functioning. New code should read
  -- `buckets.{general,scan_cta}` directly.
  RETURN jsonb_build_object(
    'account_tier', v_account_tier,
    'limit', v_limit_general,
    'used_count', v_used_general,
    'available', GREATEST(0, v_limit_general - v_used_general),
    'next_recharge_at', CASE
      WHEN v_next_general IS NULL THEN NULL
      ELSE to_jsonb(v_next_general) #>> '{}'
    END,
    'unlimited', false,
    'window_seconds', 86400,
    'as_of', to_jsonb(p_now) #>> '{}',
    'buckets', jsonb_build_object(
      'general', v_bucket_general,
      'scan_cta', v_bucket_scan_cta
    )
  );
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
  v_bucket_key text;
  v_bucket_status jsonb;
  v_limit integer;
  v_available integer;
BEGIN
  IF p_source NOT IN (
    'coach_generation',
    'coach_cache',
    'coach_scan_cta_generation',
    'coach_scan_cta_cache'
  ) THEN
    RAISE EXCEPTION 'invalid coach quota source';
  END IF;

  -- Per-user advisory lock — prevents double-spend on rapid double-clicks
  -- across both buckets. Same key as before: bucket selection happens inside
  -- the critical section so concurrent calls into different buckets still
  -- serialize against each other, which is the safe thing to do.
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

  -- Hygiene: drop events older than 25h (1h slack vs the 24h window) so the
  -- table stays bounded without a separate cron job.
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

  v_bucket_key := public.coach_quota_bucket_for_source(p_source);
  v_bucket_status := v_status -> 'buckets' -> v_bucket_key;
  v_limit := COALESCE((v_bucket_status ->> 'limit')::integer, 0);
  v_available := COALESCE((v_bucket_status ->> 'available')::integer, 0);

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

-- attach_coach_quota_event must accept the new sources too. The function is
-- otherwise bucket-agnostic — it updates a single event row by id.
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
  IF p_source IS NOT NULL AND p_source NOT IN (
    'coach_generation',
    'coach_cache',
    'coach_scan_cta_generation',
    'coach_scan_cta_cache'
  ) THEN
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

-- refund_coach_quota_event remains unchanged in behaviour: it flips a single
-- event by id to status='refunded'. Because bucket membership is derived from
-- source — not stored — refunding restores the correct bucket automatically.
-- We redefine it here only so the function body lives next to the other quota
-- RPCs in this migration for readability and parity (no logic change).
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

REVOKE ALL ON FUNCTION public.coach_quota_bucket_for_source(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_coach_quota_status_json(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_coach_quota(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_coach_quota_event(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_coach_quota_event(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.coach_quota_bucket_for_source(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_coach_quota_status_json(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_coach_quota(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_coach_quota_event(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_coach_quota_event(uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
