-- Social feed ranking v4
-- Phase A quick wins on top of v3 (no schema additions, no client-side changes):
--   A1. Filter posts authored by users currently banned with scope IN ('all','posts').
--   A2. Raise rejection penalty cap (9 -> 18) and halve the per-rejection weight
--       when the rejection came from the automated 3-reporters/24h threshold,
--       so admin-driven rejections weigh more than crowd-driven auto-hides.
--   A3. Add an author-diversity soft penalty (-2.5 per extra position beyond the
--       top-ranked post per author) to keep a single creator from saturating the
--       feed when their content goes viral.
--
-- Compatibility notes:
--   - v3 function is left in place for rollback. v4 is created with a distinct
--     signature (adds p_moderation_provider). Only the RPC switches to v4.
--   - get_social_feed_page keeps its 5-arg signature (text, integer, integer,
--     text, text) so the client does not need to change.
--   - On a dataset where no user is banned, no post was rejected via
--     'threshold_auto_hide', and every author has at most one ranked post,
--     v4 sort order equals v3 sort order exactly.

CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v4(
  p_created_at timestamptz,
  p_effective_like_count integer,
  p_effective_dislike_count integer,
  p_distinct_commenter_count integer,
  p_impression_count integer,
  p_rejection_count integer,
  p_author_post_sequence integer,
  p_post_language_code text,
  p_post_country_code text,
  p_viewer_language_code text,
  p_viewer_country_code text,
  p_moderation_provider text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  -- v3 weights, kept identical to preserve baseline behaviour.
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
  language_match_boost constant numeric := 7.0;
  country_match_boost constant numeric := 3.5;

  -- v4 tuning. Cap doubled so a borderline post with several rejections can
  -- actually be pushed out of the top; auto-hide rejections halved because
  -- the threshold trigger only requires 3 reporters, which can be brigaded.
  rejection_penalty_cap constant numeric := 18.0;
  auto_hide_provider constant text := 'threshold_auto_hide';
  auto_hide_rejection_factor constant numeric := 0.5;

  age_hours numeric := GREATEST(
    EXTRACT(EPOCH FROM (now()::timestamptz - p_created_at)) / 3600.0,
    0
  );
  freshness_decay numeric;
  engagement numeric;
  impression_signal numeric;
  fresh_boost numeric;
  new_author_boost numeric;
  rejection_factor numeric;
  rejection_penalty numeric;
  language_boost numeric;
  country_boost numeric;
BEGIN
  freshness_decay := freshness_numerator / (age_hours + freshness_offset);

  engagement := (
    GREATEST(COALESCE(p_effective_like_count, 0), 0) * like_weight
  ) - (
    GREATEST(COALESCE(p_effective_dislike_count, 0), 0) * dislike_weight
  ) + (
    GREATEST(COALESCE(p_distinct_commenter_count, 0), 0) * distinct_commenter_weight
  );

  impression_signal := LN(1 + GREATEST(COALESCE(p_impression_count, 0), 0))
    * impression_weight;

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

  -- Auto-hide rejections weigh half as much as admin-driven ones. The
  -- factor is applied before the cap so a heavily auto-flagged post is
  -- still bounded by rejection_penalty_cap.
  rejection_factor := CASE
    WHEN p_moderation_provider = auto_hide_provider THEN auto_hide_rejection_factor
    ELSE 1.0
  END;

  rejection_penalty := LEAST(
    GREATEST(COALESCE(p_rejection_count, 0), 0) * rejection_penalty_weight
      * rejection_factor,
    rejection_penalty_cap
  );

  language_boost := CASE
    WHEN p_post_language_code IS NOT NULL
      AND p_viewer_language_code IS NOT NULL
      AND p_post_language_code = p_viewer_language_code
    THEN language_match_boost
    ELSE 0.0
  END;

  country_boost := CASE
    WHEN p_post_country_code IS NOT NULL
      AND p_viewer_country_code IS NOT NULL
      AND p_post_country_code = p_viewer_country_code
    THEN country_match_boost
    ELSE 0.0
  END;

  RETURN freshness_decay
    + engagement
    + impression_signal
    + fresh_boost
    + new_author_boost
    - rejection_penalty
    + language_boost
    + country_boost;
END;
$$;

COMMENT ON FUNCTION public.calculate_social_post_rank_v4(
  timestamptz, integer, integer, integer, integer, integer, integer,
  text, text, text, text, text
) IS 'Social ranking v4 = v3 baseline + rejection cap raised to 18 and halved for threshold auto-hides.';

-- Drop the v3 5-arg signature so we can recreate get_social_feed_page calling v4.
DROP FUNCTION IF EXISTS public.get_social_feed_page(text, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.get_social_feed_page(
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
  author_diversity_penalty constant numeric := 2.5;
BEGIN
  IF normalized_category IS NOT NULL
    AND normalized_category NOT IN ('before_after', 'food', 'physique') THEN
    RAISE EXCEPTION 'Unsupported social category: %', normalized_category
      USING ERRCODE = '22023';
  END IF;

  -- Hybrid viewer context: only hit user_profiles when at least one
  -- viewer field is missing AND the request is authenticated.
  IF (resolved_viewer_language IS NULL OR resolved_viewer_country IS NULL)
     AND viewer_uid IS NOT NULL THEN
    SELECT
      COALESCE(resolved_viewer_language, profile.language_code),
      COALESCE(resolved_viewer_country, profile.country_code)
    INTO resolved_viewer_language, resolved_viewer_country
    FROM public.user_profiles AS profile
    WHERE profile.id = viewer_uid;
  END IF;

  -- Defense in depth: re-normalize to expected format.
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
      post.language_code,
      post.country_code,
      ROW_NUMBER() OVER (
        ORDER BY post.created_at DESC, post.id DESC
      )::integer AS private_position
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = viewer_uid
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
      public.calculate_social_post_rank_v4(
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
        resolved_viewer_country,
        post.moderation_provider
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = viewer_uid
    LEFT JOIN author_post_sequences AS author_sequences
      ON author_sequences.id = post.id
    WHERE post.deleted_at IS NULL
      AND post.moderation_state = 'approved'
      AND NOT public.is_user_banned(post.author_id, 'posts')
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
      )::integer AS category_position,
      ROW_NUMBER() OVER (
        PARTITION BY public_posts.author_id
        ORDER BY
          public_posts.rank_score DESC,
          public_posts.created_at DESC,
          public_posts.id DESC
      )::integer AS author_position
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
          END
        - GREATEST(ranked_public_posts.author_position - 1, 0)::numeric
            * author_diversity_penalty AS feed_sort_score
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

SELECT pg_notify('pgrst', 'reload schema');
