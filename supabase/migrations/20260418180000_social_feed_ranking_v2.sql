-- Social feed ranking v2
-- - effective reactions include admin adjustments
-- - comments score on distinct approved commenters, not raw volume
-- - fresh posts and first posts from new authors get bounded boosts
-- - category diversity becomes a soft penalty instead of a hard round-robin

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS admin_like_adjustment integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_dislike_adjustment integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distinct_commenter_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_posts'
      AND column_name = 'effective_like_count'
  ) THEN
    ALTER TABLE public.social_posts
      ADD COLUMN effective_like_count integer
      GENERATED ALWAYS AS (
        GREATEST(0, like_count + admin_like_adjustment)
      ) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'social_posts'
      AND column_name = 'effective_dislike_count'
  ) THEN
    ALTER TABLE public.social_posts
      ADD COLUMN effective_dislike_count integer
      GENERATED ALWAYS AS (
        GREATEST(0, dislike_count + admin_dislike_adjustment)
      ) STORED;
  END IF;
END;
$$;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_distinct_commenter_count_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_distinct_commenter_count_check
  CHECK (distinct_commenter_count >= 0);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_author_approved
  ON public.social_comments(post_id, author_id)
  WHERE deleted_at IS NULL
    AND moderation_state = 'approved';

CREATE INDEX IF NOT EXISTS idx_social_posts_author_created_at_id_visible
  ON public.social_posts(author_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.refresh_social_post_comment_metrics(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.social_posts AS post
  SET
    comment_count = metrics.comment_count,
    distinct_commenter_count = metrics.distinct_commenter_count,
    updated_at = now()
  FROM (
    SELECT
      COUNT(*)::integer AS comment_count,
      COUNT(DISTINCT comment.author_id)::integer AS distinct_commenter_count
    FROM public.social_comments AS comment
    WHERE comment.post_id = p_post_id
      AND comment.deleted_at IS NULL
      AND comment.moderation_state = 'approved'
  ) AS metrics
  WHERE post.id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_social_post_comment_count(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.refresh_social_post_comment_metrics(p_post_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_comment_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_social_post_comment_metrics(OLD.post_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_social_post_comment_metrics(NEW.post_id);

  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.refresh_social_post_comment_metrics(OLD.post_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase2_social_comment_counter ON public.social_comments;
CREATE TRIGGER phase2_social_comment_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.social_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_comment_counter();

DROP FUNCTION IF EXISTS public.calculate_social_post_rank(timestamptz, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.calculate_social_post_rank(timestamptz, integer, integer, integer, integer, integer, integer);

CREATE FUNCTION public.calculate_social_post_rank(
  p_created_at timestamptz,
  p_effective_like_count integer,
  p_effective_dislike_count integer,
  p_distinct_commenter_count integer,
  p_impression_count integer,
  p_rejection_count integer,
  p_author_post_sequence integer
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  freshness_numerator constant numeric := 48.0;
  freshness_offset constant numeric := 2.0;
  like_weight constant numeric := 3.0;
  dislike_weight constant numeric := 4.0;
  distinct_commenter_weight constant numeric := 4.0;
  impression_weight constant numeric := 1.5;
  fresh_boost_recent constant numeric := 8.0;
  fresh_boost_warm constant numeric := 4.0;
  fresh_boost_cutoff_hours constant numeric := 24.0;
  recent_post_cutoff_hours constant numeric := 72.0;
  new_author_post_limit constant integer := 3;
  new_author_recent_boost constant numeric := 6.0;
  rejection_penalty_weight constant numeric := 3.0;
  rejection_penalty_cap constant numeric := 9.0;
  age_hours numeric := GREATEST(
    EXTRACT(EPOCH FROM (now()::timestamptz - p_created_at)) / 3600.0,
    0
  );
  freshness_decay numeric;
  engagement numeric;
  impression_signal numeric;
  fresh_boost numeric;
  new_author_boost numeric;
  rejection_penalty numeric;
BEGIN
  /*
   * rank_score = freshness decay
   *            + effective likes/dislikes + distinct approved commenters
   *            + weak impression signal
   *            + bounded fresh/noob boosts
   *            - bounded rejection penalty
   */
  freshness_decay := freshness_numerator / (age_hours + freshness_offset);

  engagement := (
    GREATEST(COALESCE(p_effective_like_count, 0), 0) * like_weight
  ) - (
    GREATEST(COALESCE(p_effective_dislike_count, 0), 0) * dislike_weight
  ) + (
    GREATEST(COALESCE(p_distinct_commenter_count, 0), 0) * distinct_commenter_weight
  );

  impression_signal := LN(1 + GREATEST(COALESCE(p_impression_count, 0), 0)) * impression_weight;

  fresh_boost := CASE
    WHEN age_hours < fresh_boost_cutoff_hours THEN fresh_boost_recent
    WHEN age_hours < recent_post_cutoff_hours THEN fresh_boost_warm
    ELSE 0.0
  END;

  new_author_boost := CASE
    WHEN COALESCE(p_author_post_sequence, 2147483647) <= new_author_post_limit
      AND age_hours < recent_post_cutoff_hours
      THEN new_author_recent_boost
    ELSE 0.0
  END;

  rejection_penalty := LEAST(
    GREATEST(COALESCE(p_rejection_count, 0), 0) * rejection_penalty_weight,
    rejection_penalty_cap
  );

  RETURN freshness_decay
    + engagement
    + impression_signal
    + fresh_boost
    + new_author_boost
    - rejection_penalty;
END;
$$;

COMMENT ON FUNCTION public.calculate_social_post_rank(
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) IS 'Simple social ranking: freshness + effective engagement + weak impressions + bounded boosts - bounded rejection penalty.';

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
  impression_count integer,
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
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      post.moderation_state,
      post.moderation_status,
      post.moderation_reason,
      post.moderation_provider,
      post.rejection_count,
      post.last_rejected_at,
      post.deleted_at,
      ROW_NUMBER() OVER (
        ORDER BY post.created_at DESC, post.id DESC
      )::integer AS private_position
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
      COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
      post.moderation_state,
      post.moderation_status,
      post.moderation_reason,
      post.moderation_provider,
      post.rejection_count,
      post.last_rejected_at,
      post.deleted_at,
      COALESCE(author_sequences.author_post_sequence, 2147483647) AS author_post_sequence,
      public.calculate_social_post_rank(
        post.created_at,
        post.effective_like_count,
        post.effective_dislike_count,
        post.distinct_commenter_count,
        post.impression_count,
        post.rejection_count,
        COALESCE(author_sequences.author_post_sequence, 2147483647)
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = auth.uid()
    LEFT JOIN author_post_sequences AS author_sequences
      ON author_sequences.id = post.id
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

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)
TO authenticated;

SELECT public.refresh_social_post_reaction_counts(post.id)
FROM public.social_posts AS post;

SELECT public.refresh_social_post_comment_metrics(post.id)
FROM public.social_posts AS post;

SELECT public.refresh_social_post_impression_count(post.id)
FROM public.social_posts AS post;
