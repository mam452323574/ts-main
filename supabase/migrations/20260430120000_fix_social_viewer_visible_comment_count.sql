-- Add a stable viewer-aware display counter for social comments.
--
-- social_posts.comment_count remains approved-only and is still maintained by
-- the existing triggers. The RPC field below adds only the authenticated
-- viewer's own pending, non-deleted comments for display purposes.

CREATE INDEX IF NOT EXISTS idx_social_comments_viewer_visible_pending
  ON public.social_comments (post_id, author_id, moderation_state)
  WHERE deleted_at IS NULL;

DROP FUNCTION IF EXISTS public.get_social_feed_page(
  text, integer, integer, text, text
);

CREATE FUNCTION public.get_social_feed_page(
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_viewer_language_code text DEFAULT NULL,
  p_viewer_country_code text DEFAULT NULL
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
  impression_count integer,
  comment_count integer,
  viewer_visible_comment_count integer,
  viewer_reaction text,
  viewer_has_liked boolean,
  moderation_state text,
  moderation_status text,
  moderation_reason text,
  moderation_provider text,
  rejection_count integer,
  last_rejected_at timestamptz,
  deleted_at timestamptz,
  language_code text,
  country_code text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  normalized_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  normalized_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
  resolved_viewer_language text := NULLIF(btrim(COALESCE(p_viewer_language_code, '')), '');
  resolved_viewer_country text := NULLIF(btrim(COALESCE(p_viewer_country_code, '')), '');
  viewer_uid uuid := auth.uid();
BEGIN
  IF normalized_category IS NOT NULL
    AND normalized_category NOT IN ('before_after', 'food', 'physique') THEN
    RAISE EXCEPTION 'Unsupported social category: %', normalized_category
      USING ERRCODE = '22023';
  END IF;

  IF (resolved_viewer_language IS NULL OR resolved_viewer_country IS NULL)
     AND viewer_uid IS NOT NULL THEN
    SELECT
      COALESCE(resolved_viewer_language, profile.language_code),
      COALESCE(resolved_viewer_country, profile.country_code)
    INTO resolved_viewer_language, resolved_viewer_country
    FROM public.user_profiles AS profile
    WHERE profile.id = viewer_uid;
  END IF;

  IF resolved_viewer_language IS NOT NULL THEN
    resolved_viewer_language := lower(resolved_viewer_language);
    IF resolved_viewer_language !~ '^[a-z]{2}$' THEN
      resolved_viewer_language := NULL;
    END IF;
  END IF;
  IF resolved_viewer_country IS NOT NULL THEN
    resolved_viewer_country := upper(resolved_viewer_country);
    IF resolved_viewer_country !~ '^[A-Z]{2}$' THEN
      resolved_viewer_country := NULL;
    END IF;
  END IF;

  RETURN QUERY
  WITH author_post_sequences AS (
    SELECT
      post.id,
      ROW_NUMBER() OVER (
        PARTITION BY post.author_id
        ORDER BY post.created_at ASC, post.id ASC
      )::integer AS author_post_sequence
    FROM public.social_posts AS post
    WHERE post.deleted_at IS NULL
  ),
  own_pending_comment_counts AS (
    SELECT
      comment.post_id,
      COUNT(*)::integer AS own_pending_count
    FROM public.social_comments AS comment
    WHERE comment.deleted_at IS NULL
      AND comment.author_id = viewer_uid
      AND comment.moderation_state = 'pending'
    GROUP BY comment.post_id
  ),
  viewer_private_posts AS (
    SELECT
      post.id,
      post.author_id,
      post.author_username,
      post.author_avatar_url,
      post.category,
      post.content_text,
      post.scan_id,
      post.share_payload_snapshot,
      post.asset_path,
      post.asset_url,
      post.image_url,
      post.created_at,
      post.effective_like_count AS like_count,
      post.effective_dislike_count AS dislike_count,
      post.impression_count,
      post.comment_count,
      (
        COALESCE(post.comment_count, 0) +
        COALESCE(own_pending_comment_counts.own_pending_count, 0)
      )::integer AS viewer_visible_comment_count,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      post.moderation_state,
      post.moderation_status,
      post.moderation_reason,
      post.moderation_provider,
      post.rejection_count,
      post.last_rejected_at,
      post.deleted_at,
      post.language_code,
      post.country_code,
      ROW_NUMBER() OVER (
        ORDER BY post.created_at DESC, post.id DESC
      )::integer AS private_position
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = viewer_uid
    LEFT JOIN own_pending_comment_counts
      ON own_pending_comment_counts.post_id = post.id
    WHERE post.deleted_at IS NULL
      AND post.author_id = viewer_uid
      AND post.moderation_state <> 'approved'
      AND (
        normalized_category IS NULL
        OR post.category = normalized_category
      )
  ),
  public_posts AS (
    SELECT
      post.id,
      post.author_id,
      post.author_username,
      post.author_avatar_url,
      post.category,
      post.content_text,
      post.scan_id,
      post.share_payload_snapshot,
      post.asset_path,
      post.asset_url,
      post.image_url,
      post.created_at,
      post.effective_like_count AS like_count,
      post.effective_dislike_count AS dislike_count,
      post.impression_count,
      post.comment_count,
      (
        COALESCE(post.comment_count, 0) +
        COALESCE(own_pending_comment_counts.own_pending_count, 0)
      )::integer AS viewer_visible_comment_count,
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      post.moderation_state,
      post.moderation_status,
      post.moderation_reason,
      post.moderation_provider,
      post.rejection_count,
      post.last_rejected_at,
      post.deleted_at,
      post.language_code,
      post.country_code,
      COALESCE(author_sequences.author_post_sequence, 2147483647) AS author_post_sequence,
      public.calculate_social_post_rank_v3(
        post.created_at,
        post.effective_like_count,
        post.effective_dislike_count,
        post.distinct_commenter_count,
        post.impression_count,
        post.rejection_count,
        COALESCE(author_sequences.author_post_sequence, 2147483647),
        post.language_code,
        post.country_code,
        resolved_viewer_language,
        resolved_viewer_country
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = viewer_uid
    LEFT JOIN author_post_sequences AS author_sequences
      ON author_sequences.id = post.id
    LEFT JOIN own_pending_comment_counts
      ON own_pending_comment_counts.post_id = post.id
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
          public_posts.created_at DESC,
          public_posts.id DESC
      )::integer AS category_position
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
      viewer_private_posts.impression_count,
      viewer_private_posts.comment_count,
      viewer_private_posts.viewer_visible_comment_count,
      viewer_private_posts.viewer_reaction,
      viewer_private_posts.viewer_reaction = 'like' AS viewer_has_liked,
      viewer_private_posts.moderation_state,
      viewer_private_posts.moderation_status,
      viewer_private_posts.moderation_reason,
      viewer_private_posts.moderation_provider,
      viewer_private_posts.rejection_count,
      viewer_private_posts.last_rejected_at,
      viewer_private_posts.deleted_at,
      viewer_private_posts.language_code,
      viewer_private_posts.country_code,
      0 AS sort_group,
      viewer_private_posts.private_position,
      0::numeric AS rank_score,
      0::numeric AS feed_sort_score
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
      ranked_public_posts.impression_count,
      ranked_public_posts.comment_count,
      ranked_public_posts.viewer_visible_comment_count,
      ranked_public_posts.viewer_reaction,
      ranked_public_posts.viewer_reaction = 'like' AS viewer_has_liked,
      ranked_public_posts.moderation_state,
      ranked_public_posts.moderation_status,
      ranked_public_posts.moderation_reason,
      ranked_public_posts.moderation_provider,
      ranked_public_posts.rejection_count,
      ranked_public_posts.last_rejected_at,
      ranked_public_posts.deleted_at,
      ranked_public_posts.language_code,
      ranked_public_posts.country_code,
      1 AS sort_group,
      NULL::integer AS private_position,
      ranked_public_posts.rank_score,
      ranked_public_posts.rank_score
        - CASE
            WHEN normalized_category IS NULL THEN
              GREATEST(ranked_public_posts.category_position - 1, 0)::numeric * 1.5
            ELSE 0::numeric
          END AS feed_sort_score
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
    combined_feed.impression_count,
    combined_feed.comment_count,
    combined_feed.viewer_visible_comment_count,
    combined_feed.viewer_reaction,
    combined_feed.viewer_has_liked,
    combined_feed.moderation_state,
    combined_feed.moderation_status,
    combined_feed.moderation_reason,
    combined_feed.moderation_provider,
    combined_feed.rejection_count,
    combined_feed.last_rejected_at,
    combined_feed.deleted_at,
    combined_feed.language_code,
    combined_feed.country_code
  FROM combined_feed
  ORDER BY
    combined_feed.sort_group ASC,
    CASE
      WHEN combined_feed.sort_group = 0 THEN combined_feed.private_position
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN combined_feed.sort_group = 1 THEN combined_feed.feed_sort_score
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN combined_feed.sort_group = 1 THEN combined_feed.rank_score
      ELSE NULL
    END DESC NULLS LAST,
    combined_feed.created_at DESC,
    combined_feed.id DESC
  OFFSET normalized_offset
  LIMIT normalized_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(
  text, integer, integer, text, text
) TO authenticated;

DROP FUNCTION IF EXISTS public.get_social_post_detail(uuid);

CREATE FUNCTION public.get_social_post_detail(
  p_post_id uuid
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
  viewer_visible_comment_count integer,
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
  target_post public.social_posts%ROWTYPE;
  viewer_uid uuid := auth.uid();
BEGIN
  SELECT *
  INTO target_post
  FROM public.social_posts
  WHERE public.social_posts.id = p_post_id
  LIMIT 1;

  IF target_post.id IS NULL
    OR target_post.deleted_at IS NOT NULL
    OR (
      target_post.moderation_state <> 'approved'
      AND target_post.author_id <> viewer_uid
    ) THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    post.id,
    post.author_id,
    post.author_username,
    post.author_avatar_url,
    post.category,
    post.content_text,
    post.scan_id,
    post.share_payload_snapshot,
    post.asset_path,
    post.asset_url,
    post.image_url,
    post.created_at,
    post.effective_like_count AS like_count,
    post.effective_dislike_count AS dislike_count,
    post.comment_count,
    (
      COALESCE(post.comment_count, 0) +
      COALESCE(own_pending_counts.own_pending_count, 0)
    )::integer AS viewer_visible_comment_count,
    COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
    COALESCE(reaction_state.reaction_type, 'neutral') = 'like' AS viewer_has_liked,
    post.moderation_state,
    post.moderation_status,
    post.moderation_reason,
    post.moderation_provider,
    post.rejection_count,
    post.last_rejected_at,
    post.deleted_at
  FROM public.social_posts AS post
  LEFT JOIN public.social_post_likes AS reaction_state
    ON reaction_state.post_id = post.id
   AND reaction_state.user_id = viewer_uid
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS own_pending_count
    FROM public.social_comments AS comment
    WHERE comment.post_id = post.id
      AND comment.deleted_at IS NULL
      AND comment.author_id = viewer_uid
      AND comment.moderation_state = 'pending'
  ) AS own_pending_counts ON TRUE
  WHERE post.id = p_post_id
    AND post.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_post_detail(uuid)
TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
