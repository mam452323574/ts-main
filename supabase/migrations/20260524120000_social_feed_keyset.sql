-- Social feed Phase D2 — keyset pagination (zero-downtime overload)
--
-- Adds a second overload of get_social_feed_page whose 3rd argument is `p_cursor text`
-- instead of `p_offset integer`. PostgreSQL distinguishes the two via parameter types
-- (and PostgREST routes by parameter NAME), so both signatures cohabit:
--
--   Old client                                         New client
--   ┌─────────────────────────────────────────────┐  ┌────────────────────────────────────────────┐
--   │ get_social_feed_page(text, integer,         │  │ get_social_feed_page(text, integer,        │
--   │   integer, text, text)                      │  │   text, text, text)                        │
--   │   → returns the offset-based feed (v7)      │  │   → returns the keyset feed (v7)           │
--   │   → existing migration, unchanged           │  │   → adds `next_cursor` column              │
--   └─────────────────────────────────────────────┘  └────────────────────────────────────────────┘
--
-- The keyset variant is monotonic-decreasing in feed_sort_score within a short
-- window. Because feed_sort_score includes freshness_decay (which drifts over
-- time), the keyset can miss a few posts whose score recrosses the cursor
-- between two pages — a strict improvement over OFFSET, which produces visible
-- duplications and gaps under the same conditions.

CREATE OR REPLACE FUNCTION public.get_social_feed_page(
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_cursor text DEFAULT NULL,
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
  unique_view_count integer,
  comment_count integer,
  save_count integer,
  reaction_distribution jsonb,
  viewer_reaction text,
  viewer_has_liked boolean,
  viewer_follows_author boolean,
  viewer_has_saved boolean,
  moderation_state text,
  moderation_status text,
  moderation_reason text,
  moderation_provider text,
  rejection_count integer,
  last_rejected_at timestamptz,
  deleted_at timestamptz,
  language_code text,
  country_code text,
  next_cursor text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  normalized_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  normalized_category text := NULLIF(btrim(COALESCE(p_category, '')), '');
  resolved_viewer_language text := NULLIF(btrim(COALESCE(p_viewer_language_code, '')), '');
  resolved_viewer_country text := NULLIF(btrim(COALESCE(p_viewer_country_code, '')), '');
  viewer_uid uuid := auth.uid();
  cursor_parts text[];
  cursor_rs numeric;
  cursor_id uuid;
  cursor_active boolean := false;
  author_diversity_penalty constant numeric := 2.5;
  follow_boost_weight constant numeric := 5.0;
  affinity_like_weight constant numeric := 0.5;
  affinity_comment_weight constant numeric := 0.3;
  affinity_view_weight constant numeric := 0.1;
  affinity_dislike_weight constant numeric := 0.5;
  affinity_positive_cap constant numeric := 3.0;
  affinity_negative_cap constant numeric := 2.0;
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

  -- Parse cursor "<rs>:<id>". Defensive on malformed input: treat as first page.
  IF p_cursor IS NOT NULL AND btrim(p_cursor) <> '' THEN
    cursor_parts := string_to_array(btrim(p_cursor), ':');
    IF array_length(cursor_parts, 1) = 2 THEN
      BEGIN
        cursor_rs := cursor_parts[1]::numeric;
        cursor_id := cursor_parts[2]::uuid;
        cursor_active := true;
      EXCEPTION WHEN OTHERS THEN
        cursor_active := false;
      END;
    END IF;
  END IF;

  RETURN QUERY
  WITH viewer_hidden_authors AS (
    SELECT hidden.author_id
    FROM public.social_user_hidden_authors AS hidden
    WHERE hidden.viewer_id = viewer_uid
  ),
  viewer_follows AS (
    SELECT follow.followee_id AS author_id
    FROM public.social_follows AS follow
    WHERE follow.follower_id = viewer_uid
  ),
  viewer_affinity AS (
    SELECT
      affinity.author_id,
      affinity.like_count,
      affinity.dislike_count,
      affinity.comment_count,
      affinity.unique_view_count
    FROM public.social_viewer_author_affinity AS affinity
    WHERE affinity.viewer_id = viewer_uid
  ),
  viewer_saves AS (
    SELECT saves.post_id
    FROM public.social_post_saves AS saves
    WHERE saves.viewer_id = viewer_uid
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
      post.unique_view_count,
      post.comment_count,
      post.save_count,
      post.reaction_distribution,
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
      AND NOT cursor_active  -- on a cursor page, no private posts (already past page 1)
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
      post.unique_view_count,
      post.comment_count,
      post.save_count,
      post.reaction_distribution,
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
      (viewer_follow.author_id IS NOT NULL) AS viewer_follows_author,
      (viewer_save.post_id IS NOT NULL) AS viewer_has_saved,
      COALESCE(post.author_post_sequence_snapshot, 2147483647) AS author_post_sequence,
      (
        public.calculate_social_post_rank_v7(
          post.created_at,
          post.effective_like_count,
          post.effective_dislike_count,
          post.distinct_commenter_count,
          post.impression_count,
          post.rejection_count,
          COALESCE(post.author_post_sequence_snapshot, 2147483647),
          post.language_code,
          post.country_code,
          resolved_viewer_language,
          resolved_viewer_country,
          post.moderation_provider,
          post.unique_view_count,
          post.total_dwell_ms,
          post.dwell_samples,
          post.save_count,
          post.reaction_distribution,
          post.last_engagement_at,
          (
            ('x' || substr(md5(post.id::text || COALESCE(viewer_uid::text, '')), 1, 8))::bit(32)::int::numeric
            / 1073741824.0 - 1.0
          )
        )
        + CASE
            WHEN viewer_follow.author_id IS NOT NULL THEN follow_boost_weight
            ELSE 0.0
          END
        + LEAST(
            affinity_positive_cap,
            (
              LN(1 + GREATEST(COALESCE(viewer_aff.like_count, 0), 0)) * affinity_like_weight
            ) + (
              LN(1 + GREATEST(COALESCE(viewer_aff.comment_count, 0), 0)) * affinity_comment_weight
            ) + (
              LN(1 + GREATEST(COALESCE(viewer_aff.unique_view_count, 0), 0)) * affinity_view_weight
            )
          )
        - LEAST(
            affinity_negative_cap,
            LN(1 + GREATEST(COALESCE(viewer_aff.dislike_count, 0), 0)) * affinity_dislike_weight
          )
      ) AS rank_score
    FROM public.social_posts AS post
    LEFT JOIN public.social_post_likes AS reaction_state
      ON reaction_state.post_id = post.id
     AND reaction_state.user_id = viewer_uid
    LEFT JOIN viewer_follows AS viewer_follow
      ON viewer_follow.author_id = post.author_id
    LEFT JOIN viewer_affinity AS viewer_aff
      ON viewer_aff.author_id = post.author_id
    LEFT JOIN viewer_saves AS viewer_save
      ON viewer_save.post_id = post.id
    WHERE post.deleted_at IS NULL
      AND post.moderation_state = 'approved'
      AND NOT public.is_user_banned(post.author_id, 'posts')
      AND NOT EXISTS (
        SELECT 1 FROM viewer_hidden_authors AS hidden
        WHERE hidden.author_id = post.author_id
      )
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
  scored_public AS (
    SELECT
      ranked_public_posts.*,
      ranked_public_posts.rank_score
        - CASE
            WHEN normalized_category IS NULL THEN
              GREATEST(ranked_public_posts.category_position - 1, 0)::numeric * 1.5
            ELSE 0::numeric
          END
        - GREATEST(ranked_public_posts.author_position - 1, 0)::numeric
            * author_diversity_penalty AS feed_sort_score
    FROM ranked_public_posts
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
      viewer_private_posts.unique_view_count,
      viewer_private_posts.comment_count,
      viewer_private_posts.save_count,
      viewer_private_posts.reaction_distribution,
      viewer_private_posts.viewer_reaction,
      viewer_private_posts.viewer_reaction = 'like' AS viewer_has_liked,
      false AS viewer_follows_author,
      false AS viewer_has_saved,
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
      scored_public.id,
      scored_public.author_id,
      scored_public.author_username,
      scored_public.author_avatar_url,
      scored_public.category,
      scored_public.content_text,
      scored_public.scan_id,
      scored_public.share_payload_snapshot,
      scored_public.asset_path,
      scored_public.asset_url,
      scored_public.image_url,
      scored_public.created_at,
      scored_public.like_count,
      scored_public.dislike_count,
      scored_public.impression_count,
      scored_public.unique_view_count,
      scored_public.comment_count,
      scored_public.save_count,
      scored_public.reaction_distribution,
      scored_public.viewer_reaction,
      scored_public.viewer_reaction = 'like' AS viewer_has_liked,
      scored_public.viewer_follows_author,
      scored_public.viewer_has_saved,
      scored_public.moderation_state,
      scored_public.moderation_status,
      scored_public.moderation_reason,
      scored_public.moderation_provider,
      scored_public.rejection_count,
      scored_public.last_rejected_at,
      scored_public.deleted_at,
      scored_public.language_code,
      scored_public.country_code,
      1 AS sort_group,
      NULL::integer AS private_position,
      scored_public.rank_score,
      scored_public.feed_sort_score
    FROM scored_public
    WHERE NOT cursor_active
       OR (scored_public.feed_sort_score, scored_public.id) < (cursor_rs, cursor_id)
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
    combined_feed.unique_view_count,
    combined_feed.comment_count,
    combined_feed.save_count,
    combined_feed.reaction_distribution,
    combined_feed.viewer_reaction,
    combined_feed.viewer_has_liked,
    combined_feed.viewer_follows_author,
    combined_feed.viewer_has_saved,
    combined_feed.moderation_state,
    combined_feed.moderation_status,
    combined_feed.moderation_reason,
    combined_feed.moderation_provider,
    combined_feed.rejection_count,
    combined_feed.last_rejected_at,
    combined_feed.deleted_at,
    combined_feed.language_code,
    combined_feed.country_code,
    -- next_cursor is the feed_sort_score:id of the LAST row (per ORDER BY) in the result.
    -- We compute it via LAST_VALUE over the same window the ORDER BY uses below.
    -- Only meaningful on sort_group = 1 rows; private posts get NULL.
    CASE
      WHEN combined_feed.sort_group = 1 THEN
        LAST_VALUE(
          CASE WHEN combined_feed.sort_group = 1
            THEN combined_feed.feed_sort_score::text || ':' || combined_feed.id::text
          END
        ) OVER (
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
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        )
      ELSE NULL
    END AS next_cursor
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
  LIMIT normalized_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(
  text, integer, text, text, text
) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
