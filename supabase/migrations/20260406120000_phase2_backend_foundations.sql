-- Phase 2 backend foundations
-- - canonical feature flags table with app_config compatibility view
-- - social/coaching/growth schema
-- - secure RLS defaults
-- - public social-posts storage bucket
-- - SQL helpers for flags, rate limits, cooldowns, and coach cache keys

CREATE OR REPLACE FUNCTION public.phase2_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  scope text PRIMARY KEY,
  social_enabled boolean NOT NULL DEFAULT false,
  coach_enabled boolean NOT NULL DEFAULT false,
  entry_offer_enabled boolean NOT NULL DEFAULT false,
  social_comments_enabled boolean NOT NULL DEFAULT false,
  moderation_enabled boolean NOT NULL DEFAULT false,
  entry_offer_offering_id text,
  rollout_percentage integer,
  post_rate_limit_per_day integer NOT NULL DEFAULT 3,
  comment_rate_limit_per_hour integer NOT NULL DEFAULT 10,
  report_rate_limit_per_day integer NOT NULL DEFAULT 10,
  repeated_rejection_threshold integer NOT NULL DEFAULT 3,
  rejected_content_cooldown_hours integer NOT NULL DEFAULT 24,
  coach_cache_ttl_minutes integer NOT NULL DEFAULT 720,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_feature_flags_scope_check CHECK (length(btrim(scope)) > 0),
  CONSTRAINT app_feature_flags_rollout_percentage_check CHECK (
    rollout_percentage IS NULL OR (rollout_percentage >= 0 AND rollout_percentage <= 100)
  ),
  CONSTRAINT app_feature_flags_post_rate_limit_check CHECK (post_rate_limit_per_day >= 0),
  CONSTRAINT app_feature_flags_comment_rate_limit_check CHECK (comment_rate_limit_per_hour >= 0),
  CONSTRAINT app_feature_flags_report_rate_limit_check CHECK (report_rate_limit_per_day >= 0),
  CONSTRAINT app_feature_flags_repeated_rejection_threshold_check CHECK (repeated_rejection_threshold >= 0),
  CONSTRAINT app_feature_flags_rejected_content_cooldown_hours_check CHECK (rejected_content_cooldown_hours >= 0),
  CONSTRAINT app_feature_flags_coach_cache_ttl_minutes_check CHECK (coach_cache_ttl_minutes >= 0)
);

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view app feature flags" ON public.app_feature_flags;
CREATE POLICY "Authenticated users can view app feature flags"
  ON public.app_feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS phase2_set_app_feature_flags_updated_at ON public.app_feature_flags;
CREATE TRIGGER phase2_set_app_feature_flags_updated_at
  BEFORE UPDATE ON public.app_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

INSERT INTO public.app_feature_flags (
  scope,
  social_enabled,
  coach_enabled,
  entry_offer_enabled,
  social_comments_enabled,
  moderation_enabled,
  entry_offer_offering_id,
  rollout_percentage,
  post_rate_limit_per_day,
  comment_rate_limit_per_hour,
  report_rate_limit_per_day,
  repeated_rejection_threshold,
  rejected_content_cooldown_hours,
  coach_cache_ttl_minutes
)
VALUES (
  'mobile',
  false,
  false,
  false,
  false,
  false,
  NULL,
  NULL,
  3,
  10,
  10,
  3,
  24,
  720
)
ON CONFLICT (scope) DO UPDATE SET
  social_enabled = EXCLUDED.social_enabled,
  coach_enabled = EXCLUDED.coach_enabled,
  entry_offer_enabled = EXCLUDED.entry_offer_enabled,
  social_comments_enabled = EXCLUDED.social_comments_enabled,
  moderation_enabled = EXCLUDED.moderation_enabled,
  entry_offer_offering_id = EXCLUDED.entry_offer_offering_id,
  rollout_percentage = EXCLUDED.rollout_percentage,
  post_rate_limit_per_day = EXCLUDED.post_rate_limit_per_day,
  comment_rate_limit_per_hour = EXCLUDED.comment_rate_limit_per_hour,
  report_rate_limit_per_day = EXCLUDED.report_rate_limit_per_day,
  repeated_rejection_threshold = EXCLUDED.repeated_rejection_threshold,
  rejected_content_cooldown_hours = EXCLUDED.rejected_content_cooldown_hours,
  coach_cache_ttl_minutes = EXCLUDED.coach_cache_ttl_minutes,
  updated_at = now();

DROP VIEW IF EXISTS public.app_config;
CREATE VIEW public.app_config
WITH (security_invoker = true)
AS
SELECT
  scope AS key,
  jsonb_build_object(
    'social_enabled', social_enabled,
    'coach_enabled', coach_enabled,
    'entry_offer_enabled', entry_offer_enabled,
    'social_comments_enabled', social_comments_enabled,
    'entry_offer_offering_id', entry_offer_offering_id,
    'post_rate_limit_per_day', post_rate_limit_per_day,
    'comment_rate_limit_per_hour', comment_rate_limit_per_hour,
    'rollout_percentage', rollout_percentage,
    'moderation_enabled', moderation_enabled
  ) AS value
FROM public.app_feature_flags;

GRANT SELECT ON public.app_feature_flags TO authenticated;
GRANT SELECT ON public.app_config TO authenticated;

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  author_username text,
  author_avatar_url text,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  content_text text,
  share_payload_snapshot jsonb,
  asset_path text,
  asset_url text,
  image_url text GENERATED ALWAYS AS (asset_url) STORED,
  content_hash text,
  asset_hash text,
  moderation_state text NOT NULL DEFAULT 'pending',
  moderation_status text GENERATED ALWAYS AS (moderation_state) STORED,
  moderation_reason text,
  moderation_provider text,
  moderation_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  rejection_count integer NOT NULL DEFAULT 0,
  last_rejected_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_posts_payload_presence_check CHECK (
    nullif(btrim(content_text), '') IS NOT NULL
    OR nullif(btrim(asset_path), '') IS NOT NULL
    OR share_payload_snapshot IS NOT NULL
  ),
  CONSTRAINT social_posts_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged')
  ),
  CONSTRAINT social_posts_like_count_check CHECK (like_count >= 0),
  CONSTRAINT social_posts_comment_count_check CHECK (comment_count >= 0),
  CONSTRAINT social_posts_rejection_count_check CHECK (rejection_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.social_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_likes_post_user_unique UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  author_username text,
  author_avatar_url text,
  content_text text NOT NULL,
  content_hash text,
  moderation_state text NOT NULL DEFAULT 'pending',
  moderation_status text GENERATED ALWAYS AS (moderation_state) STORED,
  moderation_reason text,
  moderation_provider text,
  moderation_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_count integer NOT NULL DEFAULT 0,
  last_rejected_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_comments_content_text_check CHECK (nullif(btrim(content_text), '') IS NOT NULL),
  CONSTRAINT social_comments_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged')
  ),
  CONSTRAINT social_comments_rejection_count_check CHECK (rejection_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.social_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  target_comment_id uuid REFERENCES public.social_comments(id) ON DELETE CASCADE,
  reason_code text NOT NULL,
  details text,
  workflow_status text NOT NULL DEFAULT 'submitted',
  moderation_state text NOT NULL DEFAULT 'pending',
  moderation_reason text,
  moderation_provider text,
  moderation_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_reports_target_type_check CHECK (target_type IN ('post', 'comment')),
  CONSTRAINT social_reports_workflow_status_check CHECK (
    workflow_status IN ('submitted', 'reviewing', 'resolved', 'dismissed')
  ),
  CONSTRAINT social_reports_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged')
  ),
  CONSTRAINT social_reports_single_target_check CHECK (
    (target_type = 'post' AND target_post_id IS NOT NULL AND target_comment_id IS NULL)
    OR
    (target_type = 'comment' AND target_post_id IS NULL AND target_comment_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.coach_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title text,
  body text,
  cta_label text,
  cta_route text,
  source text,
  cache_key text NOT NULL,
  input_hash text NOT NULL,
  request_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  expires_at timestamptz,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_entries_status_check CHECK (status IN ('pending', 'ready', 'error')),
  CONSTRAINT coach_entries_user_cache_key_unique UNIQUE (user_id, cache_key)
);

CREATE TABLE IF NOT EXISTS public.user_growth_experiences (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  growth_state text NOT NULL DEFAULT 'baseline',
  entry_offer_eligible boolean NOT NULL DEFAULT false,
  entry_offer_shown_at timestamptz,
  entry_offer_dismissed_at timestamptz,
  entry_offer_claimed_at timestamptz,
  entry_offer_offering_id text,
  coach_seen_at timestamptz,
  coach_cooldown_until timestamptz,
  growth_state_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_growth_experiences_growth_state_check CHECK (
    growth_state IN (
      'baseline',
      'entry_offer_ready',
      'entry_offer_claimed',
      'entry_offer_dismissed',
      'coach_ready',
      'cooldown'
    )
  )
);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_growth_experiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view social posts" ON public.social_posts;
CREATE POLICY "Authenticated users can view social posts"
  ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (
    (author_id = (select auth.uid()))
    OR
    (deleted_at IS NULL AND moderation_state = 'approved')
  );

DROP POLICY IF EXISTS "Authenticated users can view own social likes" ON public.social_post_likes;
CREATE POLICY "Authenticated users can view own social likes"
  ON public.social_post_likes
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view social comments" ON public.social_comments;
CREATE POLICY "Authenticated users can view social comments"
  ON public.social_comments
  FOR SELECT
  TO authenticated
  USING (
    (author_id = (select auth.uid()))
    OR
    (
      deleted_at IS NULL
      AND moderation_state = 'approved'
      AND EXISTS (
        SELECT 1
        FROM public.social_posts post_visibility
        WHERE post_visibility.id = social_comments.post_id
          AND post_visibility.deleted_at IS NULL
          AND (
            post_visibility.moderation_state = 'approved'
            OR post_visibility.author_id = (select auth.uid())
          )
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view own social reports" ON public.social_reports;
CREATE POLICY "Authenticated users can view own social reports"
  ON public.social_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view own coach entries" ON public.coach_entries;
CREATE POLICY "Authenticated users can view own coach entries"
  ON public.coach_entries
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view own growth experience" ON public.user_growth_experiences;
CREATE POLICY "Authenticated users can view own growth experience"
  ON public.user_growth_experiences
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT ON public.social_posts TO authenticated;
GRANT SELECT ON public.social_post_likes TO authenticated;
GRANT SELECT ON public.social_comments TO authenticated;
GRANT SELECT ON public.social_reports TO authenticated;
GRANT SELECT ON public.coach_entries TO authenticated;
GRANT SELECT ON public.user_growth_experiences TO authenticated;

CREATE INDEX IF NOT EXISTS idx_social_posts_author_created_at
  ON public.social_posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_visible_feed
  ON public.social_posts(moderation_state, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_scan_id
  ON public.social_posts(scan_id)
  WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_content_hash
  ON public.social_posts(content_hash)
  WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_posts_asset_hash
  ON public.social_posts(asset_hash)
  WHERE asset_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_created_at
  ON public.social_post_likes(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_likes_user_created_at
  ON public.social_post_likes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_created_at
  ON public.social_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_social_comments_author_created_at
  ON public.social_comments(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_comments_visible
  ON public.social_comments(moderation_state, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_social_comments_content_hash
  ON public.social_comments(content_hash)
  WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_reports_reporter_created_at
  ON public.social_reports(reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_reports_target_post
  ON public.social_reports(target_post_id)
  WHERE target_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_reports_target_comment
  ON public.social_reports(target_comment_id)
  WHERE target_comment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reports_unique_post_report
  ON public.social_reports(reporter_id, target_post_id)
  WHERE target_post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reports_unique_comment_report
  ON public.social_reports(reporter_id, target_comment_id)
  WHERE target_comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coach_entries_user_created_at
  ON public.coach_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_entries_user_status_updated_at
  ON public.coach_entries(user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_entries_expires_at
  ON public.coach_entries(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_entries_input_hash
  ON public.coach_entries(input_hash);

CREATE INDEX IF NOT EXISTS idx_user_growth_experiences_growth_state
  ON public.user_growth_experiences(growth_state);
CREATE INDEX IF NOT EXISTS idx_user_growth_experiences_coach_cooldown
  ON public.user_growth_experiences(coach_cooldown_until)
  WHERE coach_cooldown_until IS NOT NULL;

DROP TRIGGER IF EXISTS phase2_set_social_posts_updated_at ON public.social_posts;
CREATE TRIGGER phase2_set_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

DROP TRIGGER IF EXISTS phase2_set_social_post_likes_updated_at ON public.social_post_likes;
CREATE TRIGGER phase2_set_social_post_likes_updated_at
  BEFORE UPDATE ON public.social_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

DROP TRIGGER IF EXISTS phase2_set_social_comments_updated_at ON public.social_comments;
CREATE TRIGGER phase2_set_social_comments_updated_at
  BEFORE UPDATE ON public.social_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

DROP TRIGGER IF EXISTS phase2_set_social_reports_updated_at ON public.social_reports;
CREATE TRIGGER phase2_set_social_reports_updated_at
  BEFORE UPDATE ON public.social_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

DROP TRIGGER IF EXISTS phase2_set_coach_entries_updated_at ON public.coach_entries;
CREATE TRIGGER phase2_set_coach_entries_updated_at
  BEFORE UPDATE ON public.coach_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

DROP TRIGGER IF EXISTS phase2_set_user_growth_experiences_updated_at ON public.user_growth_experiences;
CREATE TRIGGER phase2_set_user_growth_experiences_updated_at
  BEFORE UPDATE ON public.user_growth_experiences
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_social_post_like_count(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.social_posts
  SET
    like_count = (
      SELECT COUNT(*)
      FROM public.social_post_likes
      WHERE post_id = p_post_id
    ),
    updated_at = now()
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_social_post_comment_count(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.social_posts
  SET
    comment_count = (
      SELECT COUNT(*)
      FROM public.social_comments
      WHERE post_id = p_post_id
        AND deleted_at IS NULL
        AND moderation_state = 'approved'
    ),
    updated_at = now()
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_post_like_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_social_post_like_count(OLD.post_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_social_post_like_count(NEW.post_id);

  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.refresh_social_post_like_count(OLD.post_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_comment_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_social_post_comment_count(OLD.post_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_social_post_comment_count(NEW.post_id);

  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.refresh_social_post_comment_count(OLD.post_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase2_social_post_like_counter ON public.social_post_likes;
CREATE TRIGGER phase2_social_post_like_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.social_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_post_like_counter();

DROP TRIGGER IF EXISTS phase2_social_comment_counter ON public.social_comments;
CREATE TRIGGER phase2_social_comment_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.social_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_comment_counter();

CREATE OR REPLACE FUNCTION public.get_phase2_feature_flags(p_scope text DEFAULT 'mobile')
RETURNS TABLE (
  scope text,
  social_enabled boolean,
  coach_enabled boolean,
  entry_offer_enabled boolean,
  social_comments_enabled boolean,
  moderation_enabled boolean,
  entry_offer_offering_id text,
  rollout_percentage integer,
  post_rate_limit_per_day integer,
  comment_rate_limit_per_hour integer,
  report_rate_limit_per_day integer,
  repeated_rejection_threshold integer,
  rejected_content_cooldown_hours integer,
  coach_cache_ttl_minutes integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    feature_flags.scope,
    feature_flags.social_enabled,
    feature_flags.coach_enabled,
    feature_flags.entry_offer_enabled,
    feature_flags.social_comments_enabled,
    feature_flags.moderation_enabled,
    feature_flags.entry_offer_offering_id,
    feature_flags.rollout_percentage,
    feature_flags.post_rate_limit_per_day,
    feature_flags.comment_rate_limit_per_hour,
    feature_flags.report_rate_limit_per_day,
    feature_flags.repeated_rejection_threshold,
    feature_flags.rejected_content_cooldown_hours,
    feature_flags.coach_cache_ttl_minutes
  FROM public.app_feature_flags AS feature_flags
  WHERE feature_flags.scope = COALESCE(NULLIF(btrim(p_scope), ''), 'mobile')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_social_rate_limit(
  p_action text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  allowed boolean,
  limit_count integer,
  window_seconds integer,
  recent_count bigint,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  feature_flags public.app_feature_flags%ROWTYPE;
  oldest_event timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO feature_flags
  FROM public.app_feature_flags
  WHERE scope = 'mobile'
  LIMIT 1;

  IF p_action = 'post' THEN
    limit_count := COALESCE(feature_flags.post_rate_limit_per_day, 3);
    window_seconds := 86400;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_posts
    WHERE author_id = p_user_id
      AND created_at >= (now() - interval '1 day');
  ELSIF p_action = 'comment' THEN
    limit_count := COALESCE(feature_flags.comment_rate_limit_per_hour, 10);
    window_seconds := 3600;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_comments
    WHERE author_id = p_user_id
      AND created_at >= (now() - interval '1 hour');
  ELSIF p_action = 'report' THEN
    limit_count := COALESCE(feature_flags.report_rate_limit_per_day, 10);
    window_seconds := 86400;

    SELECT COUNT(*), MIN(created_at)
    INTO recent_count, oldest_event
    FROM public.social_reports
    WHERE reporter_id = p_user_id
      AND created_at >= (now() - interval '1 day');
  ELSE
    RAISE EXCEPTION 'Unsupported social rate limit action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  recent_count := COALESCE(recent_count, 0);
  allowed := recent_count < limit_count;

  IF allowed THEN
    retry_after_seconds := 0;
  ELSIF oldest_event IS NULL THEN
    retry_after_seconds := window_seconds;
  ELSIF p_action = 'comment' THEN
    retry_after_seconds := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((oldest_event + interval '1 hour') - now())))::integer
    );
  ELSE
    retry_after_seconds := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM ((oldest_event + interval '1 day') - now())))::integer
    );
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_rejection_cooldown(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  active boolean,
  cooldown_until timestamptz,
  recent_rejection_count integer,
  rejection_threshold integer,
  cooldown_hours integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  feature_flags public.app_feature_flags%ROWTYPE;
  latest_rejection timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO feature_flags
  FROM public.app_feature_flags
  WHERE scope = 'mobile'
  LIMIT 1;

  rejection_threshold := COALESCE(feature_flags.repeated_rejection_threshold, 3);
  cooldown_hours := COALESCE(feature_flags.rejected_content_cooldown_hours, 24);

  WITH rejection_events AS (
    SELECT last_rejected_at AS rejected_at
    FROM public.social_posts
    WHERE author_id = p_user_id
      AND last_rejected_at IS NOT NULL
    UNION ALL
    SELECT last_rejected_at AS rejected_at
    FROM public.social_comments
    WHERE author_id = p_user_id
      AND last_rejected_at IS NOT NULL
  )
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE rejected_at >= (now() - interval '7 days')), 0)::integer,
    MAX(rejected_at)
  INTO recent_rejection_count, latest_rejection
  FROM rejection_events;

  recent_rejection_count := COALESCE(recent_rejection_count, 0);
  cooldown_until := CASE
    WHEN latest_rejection IS NULL THEN NULL
    ELSE latest_rejection + make_interval(hours => cooldown_hours)
  END;

  active := (
    recent_rejection_count >= rejection_threshold
    AND cooldown_until IS NOT NULL
    AND cooldown_until > now()
  );

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_coach_cache_key(
  p_user_id uuid,
  p_input_hash text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(p_user_id::text, 'anonymous') || ':' || COALESCE(NULLIF(btrim(p_input_hash), ''), 'missing');
$$;

GRANT EXECUTE ON FUNCTION public.get_phase2_feature_flags(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_social_rate_limit(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_rejection_cooldown(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_coach_cache_key(uuid, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-posts',
  'social-posts',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list social post assets" ON storage.objects;

CREATE POLICY "Users can upload own social post assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can update own social post assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can delete own social post assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Authenticated users can list social post assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'social-posts');

SELECT pg_notify('pgrst', 'reload schema');
