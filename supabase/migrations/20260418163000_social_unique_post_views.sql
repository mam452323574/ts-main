-- Social unique post views
-- - tracks authenticated unique viewers separately from ranking impressions
-- - keeps the public feed contract free of impression_count
-- - exposes unique viewer counts only through the admin moderation path

CREATE TABLE IF NOT EXISTS public.social_post_views (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, viewer_id)
);

ALTER TABLE public.social_post_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_post_views FROM PUBLIC;
REVOKE ALL ON TABLE public.social_post_views FROM anon;
REVOKE ALL ON TABLE public.social_post_views FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_social_post_views_post_first_viewed_at
  ON public.social_post_views(post_id, first_viewed_at DESC);

CREATE OR REPLACE FUNCTION public.record_social_post_views(
  p_post_ids uuid[],
  p_viewer_id uuid
)
RETURNS TABLE (
  recorded_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH inserted_rows AS (
    INSERT INTO public.social_post_views (
      post_id,
      viewer_id
    )
    SELECT DISTINCT
      post_id,
      p_viewer_id
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) AS post_id
    WHERE post_id IS NOT NULL
    ON CONFLICT (post_id, viewer_id) DO NOTHING
    RETURNING post_id
  )
  SELECT COUNT(*)::integer
  FROM inserted_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.record_social_post_views(uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_social_post_views(uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_social_post_views(uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_social_post_views(uuid[], uuid) TO service_role;

DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer);

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
  dislike_count integer,
  comment_count integer,
  viewer_reaction text,
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
  WITH viewer_private_posts AS (
    SELECT
      post.*,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      ROW_NUMBER() OVER (
        ORDER BY post.created_at DESC
      ) AS private_position
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = auth.uid()
    WHERE post.deleted_at IS NULL
      AND post.author_id = auth.uid()
      AND post.moderation_state <> 'approved'
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  public_posts AS (
    SELECT
      post.*,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      public.calculate_social_post_rank(
        post.created_at,
        post.like_count,
        post.dislike_count,
        post.comment_count,
        post.impression_count
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = auth.uid()
    WHERE post.deleted_at IS NULL
      AND post.moderation_state = 'approved'
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  ranked_public_posts AS (
    SELECT
      public_posts.*,
      ROW_NUMBER() OVER (
        PARTITION BY CASE
          WHEN normalized_category IS NULL THEN public_posts.category
          ELSE 'filtered'
        END
        ORDER BY
          public_posts.rank_score DESC,
          public_posts.created_at DESC
      ) AS category_position
    FROM public_posts
  ),
  combined_feed AS (
    SELECT
      viewer_private_posts.id,
      viewer_private_posts.author_id,
      viewer_private_posts.author_username,
      viewer_private_posts.author_avatar_url,
      viewer_private_posts.category,
      viewer_private_posts.content_text,
      viewer_private_posts.scan_id,
      viewer_private_posts.share_payload_snapshot,
      viewer_private_posts.asset_path,
      viewer_private_posts.asset_url,
      viewer_private_posts.image_url,
      viewer_private_posts.created_at,
      viewer_private_posts.like_count,
      viewer_private_posts.dislike_count,
      viewer_private_posts.comment_count,
      viewer_private_posts.viewer_reaction,
      viewer_private_posts.viewer_reaction = 'like' AS viewer_has_liked,
      viewer_private_posts.moderation_state,
      viewer_private_posts.moderation_status,
      viewer_private_posts.moderation_reason,
      viewer_private_posts.moderation_provider,
      viewer_private_posts.rejection_count,
      viewer_private_posts.last_rejected_at,
      viewer_private_posts.deleted_at,
      0 AS sort_group,
      viewer_private_posts.private_position AS tranche_position,
      0::numeric AS rank_score
    FROM viewer_private_posts

    UNION ALL

    SELECT
      ranked_public_posts.id,
      ranked_public_posts.author_id,
      ranked_public_posts.author_username,
      ranked_public_posts.author_avatar_url,
      ranked_public_posts.category,
      ranked_public_posts.content_text,
      ranked_public_posts.scan_id,
      ranked_public_posts.share_payload_snapshot,
      ranked_public_posts.asset_path,
      ranked_public_posts.asset_url,
      ranked_public_posts.image_url,
      ranked_public_posts.created_at,
      ranked_public_posts.like_count,
      ranked_public_posts.dislike_count,
      ranked_public_posts.comment_count,
      ranked_public_posts.viewer_reaction,
      ranked_public_posts.viewer_reaction = 'like' AS viewer_has_liked,
      ranked_public_posts.moderation_state,
      ranked_public_posts.moderation_status,
      ranked_public_posts.moderation_reason,
      ranked_public_posts.moderation_provider,
      ranked_public_posts.rejection_count,
      ranked_public_posts.last_rejected_at,
      ranked_public_posts.deleted_at,
      1 AS sort_group,
      CASE
        WHEN normalized_category IS NULL THEN ranked_public_posts.category_position
        ELSE 0
      END AS tranche_position,
      ranked_public_posts.rank_score
    FROM ranked_public_posts
  )
  SELECT
    combined_feed.id,
    combined_feed.author_id,
    combined_feed.author_username,
    combined_feed.author_avatar_url,
    combined_feed.category,
    combined_feed.content_text,
    combined_feed.scan_id,
    combined_feed.share_payload_snapshot,
    combined_feed.asset_path,
    combined_feed.asset_url,
    combined_feed.image_url,
    combined_feed.created_at,
    combined_feed.like_count,
    combined_feed.dislike_count,
    combined_feed.comment_count,
    combined_feed.viewer_reaction,
    combined_feed.viewer_has_liked,
    combined_feed.moderation_state,
    combined_feed.moderation_status,
    combined_feed.moderation_reason,
    combined_feed.moderation_provider,
    combined_feed.rejection_count,
    combined_feed.last_rejected_at,
    combined_feed.deleted_at
  FROM combined_feed
  ORDER BY
    combined_feed.sort_group ASC,
    combined_feed.tranche_position ASC,
    combined_feed.rank_score DESC,
    combined_feed.created_at DESC
  OFFSET normalized_offset
  LIMIT normalized_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)
TO authenticated;

DROP VIEW IF EXISTS public.social_moderation_queue;

CREATE VIEW public.social_moderation_queue AS
WITH rollups AS (
  SELECT
    target_type,
    target_id,
    total_reports_24h,
    unique_reporters_24h,
    open_reports,
    reason_codes,
    last_reported_at
  FROM public.social_report_rollups
),
post_view_rollups AS (
  SELECT
    post_id,
    COUNT(*)::integer AS unique_viewer_count
  FROM public.social_post_views
  GROUP BY post_id
),
author_bans AS (
  SELECT
    user_id,
    jsonb_agg(
      jsonb_build_object(
        'scope', scope,
        'ends_at', ends_at,
        'reason', reason
      )
    ) AS active_bans
  FROM public.user_bans
  WHERE starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    AND revoked_at IS NULL
  GROUP BY user_id
)
SELECT
  'post'::text AS content_type,
  post.id AS content_id,
  post.author_id,
  post.author_username,
  post.category,
  post.content_text,
  post.asset_path,
  post.asset_url,
  post.moderation_state,
  post.moderation_reason,
  post.moderation_provider,
  post.like_count,
  post.dislike_count,
  post.impression_count,
  post.comment_count,
  post.rejection_count,
  post.last_rejected_at,
  post.created_at,
  post.moderation_queued_at,
  post.moderation_claimed_at,
  post.moderation_completed_at,
  post.moderation_attempt_count,
  post.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  COALESCE(post_view_rollups.unique_viewer_count, 0) AS unique_viewer_count,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_posts AS post
LEFT JOIN rollups
  ON rollups.target_type = 'post'
 AND rollups.target_id = post.id
LEFT JOIN post_view_rollups
  ON post_view_rollups.post_id = post.id
LEFT JOIN author_bans
  ON author_bans.user_id = post.author_id
WHERE post.deleted_at IS NULL

UNION ALL

SELECT
  'comment'::text AS content_type,
  comment.id AS content_id,
  comment.author_id,
  comment.author_username,
  NULL::text AS category,
  comment.content_text,
  NULL::text AS asset_path,
  NULL::text AS asset_url,
  comment.moderation_state,
  comment.moderation_reason,
  comment.moderation_provider,
  comment.like_count,
  0::integer AS dislike_count,
  0::integer AS impression_count,
  0::integer AS comment_count,
  comment.rejection_count,
  comment.last_rejected_at,
  comment.created_at,
  comment.moderation_queued_at,
  comment.moderation_claimed_at,
  comment.moderation_completed_at,
  comment.moderation_attempt_count,
  comment.moderation_last_error,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  0::integer AS unique_viewer_count,
  rollups.reason_codes,
  rollups.last_reported_at,
  COALESCE(author_bans.active_bans, '[]'::jsonb) AS author_active_bans
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
LEFT JOIN author_bans
  ON author_bans.user_id = comment.author_id
WHERE comment.deleted_at IS NULL;

SELECT pg_notify('pgrst', 'reload schema');
