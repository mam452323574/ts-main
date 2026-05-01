-- Phase 3 / 4
-- - social MVP categories and ranked feed RPC
-- - server-side moderation hardening and report-threshold auto-hide
-- - admin moderation/reporting views for Supabase Studio

ALTER TABLE public.social_posts
ADD COLUMN IF NOT EXISTS category text;

UPDATE public.social_posts
SET category = CASE
  WHEN lower(COALESCE(share_payload_snapshot ->> 'variant', '')) = 'nutrition' THEN 'food'
  ELSE 'physique'
END
WHERE category IS NULL;

ALTER TABLE public.social_posts
ALTER COLUMN category SET DEFAULT 'physique';

ALTER TABLE public.social_posts
ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.social_posts
DROP CONSTRAINT IF EXISTS social_posts_category_check;

ALTER TABLE public.social_posts
ADD CONSTRAINT social_posts_category_check
CHECK (category IN ('before_after', 'food', 'physique'));

ALTER TABLE public.social_posts
DROP CONSTRAINT IF EXISTS social_posts_content_length_check;

ALTER TABLE public.social_posts
ADD CONSTRAINT social_posts_content_length_check
CHECK (content_text IS NULL OR char_length(content_text) <= 500);

ALTER TABLE public.social_comments
DROP CONSTRAINT IF EXISTS social_comments_content_length_check;

ALTER TABLE public.social_comments
ADD CONSTRAINT social_comments_content_length_check
CHECK (char_length(content_text) <= 280);

CREATE INDEX IF NOT EXISTS idx_social_posts_category_created_at
  ON public.social_posts(category, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_category_moderation_created_at
  ON public.social_posts(category, moderation_state, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_social_feed_page(
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  category text,
  content_text text,
  scan_id uuid,
  share_payload_snapshot jsonb,
  asset_path text,
  asset_url text,
  image_url text,
  created_at timestamptz,
  like_count integer,
  comment_count integer,
  viewer_has_liked boolean,
  moderation_state text,
  moderation_status text,
  moderation_reason text,
  moderation_provider text,
  rejection_count integer,
  last_rejected_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  normalized_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  normalized_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
BEGIN
  IF normalized_category IS NOT NULL
    AND normalized_category NOT IN ('before_after', 'food', 'physique') THEN
    RAISE EXCEPTION 'Unsupported social category: %', normalized_category
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH visible_posts AS (
    SELECT
      post.*,
      EXISTS (
        SELECT 1
        FROM public.social_post_likes AS like_state
        WHERE like_state.post_id = post.id
          AND like_state.user_id = auth.uid()
      ) AS viewer_has_liked,
      GREATEST(
        0::numeric,
        72::numeric - (
          EXTRACT(EPOCH FROM (now() - post.created_at)) / 3600.0
        )::numeric
      ) AS recency_score,
      ((post.like_count * 3) + (post.comment_count * 5))::numeric AS engagement_score,
      CASE
        WHEN post.author_id = auth.uid() AND post.moderation_state <> 'approved' THEN 0
        ELSE 1
      END AS self_review_rank
    FROM public.social_posts AS post
    WHERE post.deleted_at IS NULL
      AND (
        post.moderation_state = 'approved'
        OR post.author_id = auth.uid()
      )
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  ranked_posts AS (
    SELECT
      visible_posts.*,
      (visible_posts.recency_score + visible_posts.engagement_score) AS rank_score,
      ROW_NUMBER() OVER (
        PARTITION BY CASE
          WHEN normalized_category IS NULL THEN visible_posts.category
          ELSE 'filtered'
        END
        ORDER BY
          visible_posts.self_review_rank ASC,
          (visible_posts.recency_score + visible_posts.engagement_score) DESC,
          visible_posts.created_at DESC
      ) AS category_position
    FROM visible_posts
  )
  SELECT
    ranked_posts.id,
    ranked_posts.author_id,
    ranked_posts.author_username,
    ranked_posts.author_avatar_url,
    ranked_posts.category,
    ranked_posts.content_text,
    ranked_posts.scan_id,
    ranked_posts.share_payload_snapshot,
    ranked_posts.asset_path,
    ranked_posts.asset_url,
    ranked_posts.image_url,
    ranked_posts.created_at,
    ranked_posts.like_count,
    ranked_posts.comment_count,
    ranked_posts.viewer_has_liked,
    ranked_posts.moderation_state,
    ranked_posts.moderation_status,
    ranked_posts.moderation_reason,
    ranked_posts.moderation_provider,
    ranked_posts.rejection_count,
    ranked_posts.last_rejected_at,
    ranked_posts.deleted_at
  FROM ranked_posts
  ORDER BY
    ranked_posts.self_review_rank ASC,
    CASE
      WHEN normalized_category IS NULL THEN ranked_posts.category_position
      ELSE 0
    END ASC,
    ranked_posts.rank_score DESC,
    ranked_posts.created_at DESC
  OFFSET normalized_offset
  LIMIT normalized_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_social_report_thresholds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  unique_reporters_24h integer := 0;
  auto_hide_threshold constant integer := 3;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.target_type = 'post' AND NEW.target_post_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'post'
      AND target_post_id = NEW.target_post_id
      AND created_at >= (now() - interval '24 hours');

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_posts
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_post_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  ELSIF NEW.target_type = 'comment' AND NEW.target_comment_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT reporter_id)::integer
    INTO unique_reporters_24h
    FROM public.social_reports
    WHERE target_type = 'comment'
      AND target_comment_id = NEW.target_comment_id
      AND created_at >= (now() - interval '24 hours');

    IF unique_reporters_24h >= auto_hide_threshold THEN
      UPDATE public.social_comments
      SET
        moderation_state = 'flagged',
        moderation_reason = 'report_threshold',
        moderation_provider = COALESCE(NULLIF(moderation_provider, ''), 'report_threshold'),
        moderation_summary_json =
          COALESCE(moderation_summary_json, '{}'::jsonb) ||
          jsonb_build_object(
            'report_threshold_24h', unique_reporters_24h,
            'auto_hidden_at', now()
          )
      WHERE id = NEW.target_comment_id
        AND deleted_at IS NULL
        AND moderation_state IN ('approved', 'pending');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase3_social_report_thresholds
  ON public.social_reports;

CREATE TRIGGER phase3_social_report_thresholds
  AFTER INSERT OR UPDATE ON public.social_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_social_report_thresholds();

DROP VIEW IF EXISTS public.social_report_rollups;

CREATE VIEW public.social_report_rollups AS
WITH report_groups AS (
  SELECT
    target_type,
    COALESCE(target_post_id, target_comment_id) AS target_id,
    COUNT(*)::integer AS total_reports,
    COUNT(DISTINCT reporter_id)::integer AS unique_reporters,
    COUNT(*) FILTER (
      WHERE created_at >= (now() - interval '24 hours')
    )::integer AS total_reports_24h,
    COUNT(DISTINCT reporter_id) FILTER (
      WHERE created_at >= (now() - interval '24 hours')
    )::integer AS unique_reporters_24h,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT reason_code), NULL) AS reason_codes,
    MAX(created_at) AS last_reported_at
  FROM public.social_reports
  GROUP BY target_type, COALESCE(target_post_id, target_comment_id)
)
SELECT
  report_groups.target_type,
  report_groups.target_id,
  post_target.author_id AS owner_id,
  post_target.category,
  post_target.content_text,
  post_target.moderation_state,
  post_target.moderation_reason,
  report_groups.total_reports,
  report_groups.unique_reporters,
  report_groups.total_reports_24h,
  report_groups.unique_reporters_24h,
  report_groups.reason_codes,
  report_groups.last_reported_at
FROM report_groups
JOIN public.social_posts AS post_target
  ON report_groups.target_type = 'post'
 AND post_target.id = report_groups.target_id

UNION ALL

SELECT
  report_groups.target_type,
  report_groups.target_id,
  comment_target.author_id AS owner_id,
  NULL::text AS category,
  comment_target.content_text,
  comment_target.moderation_state,
  comment_target.moderation_reason,
  report_groups.total_reports,
  report_groups.unique_reporters,
  report_groups.total_reports_24h,
  report_groups.unique_reporters_24h,
  report_groups.reason_codes,
  report_groups.last_reported_at
FROM report_groups
JOIN public.social_comments AS comment_target
  ON report_groups.target_type = 'comment'
 AND comment_target.id = report_groups.target_id;

DROP VIEW IF EXISTS public.social_moderation_queue;

CREATE VIEW public.social_moderation_queue AS
WITH rollups AS (
  SELECT
    target_type,
    target_id,
    total_reports_24h,
    unique_reporters_24h,
    reason_codes,
    last_reported_at
  FROM public.social_report_rollups
)
SELECT
  'post'::text AS content_type,
  post.id AS content_id,
  post.author_id,
  post.author_username,
  post.category,
  post.content_text,
  post.asset_url,
  post.moderation_state,
  post.moderation_reason,
  post.moderation_provider,
  post.rejection_count,
  post.last_rejected_at,
  post.created_at,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  rollups.reason_codes,
  rollups.last_reported_at
FROM public.social_posts AS post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = post.id
WHERE post.deleted_at IS NULL

UNION ALL

SELECT
  'comment'::text AS content_type,
  comment.id AS content_id,
  comment.author_id,
  comment.author_username,
  NULL::text AS category,
  comment.content_text,
  NULL::text AS asset_url,
  comment.moderation_state,
  comment.moderation_reason,
  comment.moderation_provider,
  comment.rejection_count,
  comment.last_rejected_at,
  comment.created_at,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  rollups.reason_codes,
  rollups.last_reported_at
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
WHERE comment.deleted_at IS NULL;

SELECT pg_notify('pgrst', 'reload schema');
