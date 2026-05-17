-- Social feed Phase C
-- Adds three engagement signals on top of Phase B (v5):
--   C1. Dwell time: total_dwell_ms / dwell_samples aggregated server-side.
--   C2. Saves / bookmarks: social_post_saves table + denormalized save_count.
--   C3. Nuanced reactions: extend reaction_type CHECK to allow laugh/wow/sad,
--       and track per-reaction distribution in social_posts.reaction_distribution (jsonb).
--
-- The scoring function v6 = v5 baseline + dwell_signal + save_signal +
-- nuanced_reaction_boost. The RPC get_social_feed_page keeps its 5-arg
-- signature, adds one new returned column (viewer_has_saved).
--
-- Compatibility:
--   - v5 function is left in place for rollback.
--   - reaction_type extension is purely additive: rows with 'like'/'dislike'
--     remain valid, and effective_like_count keeps treating 'laugh'/'wow' as
--     positive (via the existing generated column, untouched).
--   - dwell_time aggregation is wired into record_social_post_impressions in a
--     follow-up patch migration; the trigger is not used to keep impressions
--     idempotent on retry.

-- ---------------------------------------------------------------------------
-- 1. Schema additions on social_posts
-- ---------------------------------------------------------------------------

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS total_dwell_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dwell_samples integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reaction_distribution jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_total_dwell_ms_nonneg'
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_total_dwell_ms_nonneg CHECK (total_dwell_ms >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_dwell_samples_nonneg'
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_dwell_samples_nonneg CHECK (dwell_samples >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_save_count_nonneg'
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_save_count_nonneg CHECK (save_count >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Extend reaction_type CHECK to allow nuanced reactions (C3)
-- ---------------------------------------------------------------------------

ALTER TABLE public.social_post_likes
  DROP CONSTRAINT IF EXISTS social_post_likes_reaction_type_check;
ALTER TABLE public.social_post_likes
  ADD CONSTRAINT social_post_likes_reaction_type_check
  CHECK (reaction_type IN ('like', 'dislike', 'laugh', 'wow', 'sad'));

-- ---------------------------------------------------------------------------
-- 3. Saves table (C2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_post_saves (
  viewer_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_saves_viewer_created_at
  ON public.social_post_saves (viewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_saves_post
  ON public.social_post_saves (post_id);

ALTER TABLE public.social_post_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "viewer reads own saves" ON public.social_post_saves;
CREATE POLICY "viewer reads own saves"
  ON public.social_post_saves FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

DROP POLICY IF EXISTS "viewer inserts own saves" ON public.social_post_saves;
CREATE POLICY "viewer inserts own saves"
  ON public.social_post_saves FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

DROP POLICY IF EXISTS "viewer deletes own saves" ON public.social_post_saves;
CREATE POLICY "viewer deletes own saves"
  ON public.social_post_saves FOR DELETE TO authenticated
  USING (viewer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

-- Save counter on social_posts (C2)
CREATE OR REPLACE FUNCTION public.handle_social_post_save_counter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts
      SET save_count = save_count + 1
      WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts
      SET save_count = GREATEST(save_count - 1, 0)
      WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_social_post_saves_counter ON public.social_post_saves;
CREATE TRIGGER tg_social_post_saves_counter
  AFTER INSERT OR DELETE ON public.social_post_saves
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_post_save_counter();

-- Reaction distribution maintainer (C3)
CREATE OR REPLACE FUNCTION public.handle_social_post_reaction_distribution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  post_id_target uuid := COALESCE(NEW.post_id, OLD.post_id);
  old_key text := NULL;
  new_key text := NULL;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_key := OLD.reaction_type;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_key := NEW.reaction_type;
  END IF;

  IF old_key IS NOT NULL AND (TG_OP = 'DELETE' OR old_key IS DISTINCT FROM new_key) THEN
    UPDATE public.social_posts
      SET reaction_distribution = jsonb_set(
        reaction_distribution,
        ARRAY[old_key],
        to_jsonb(GREATEST(COALESCE((reaction_distribution->>old_key)::int, 0) - 1, 0))
      )
      WHERE id = post_id_target;
  END IF;
  IF new_key IS NOT NULL AND (TG_OP = 'INSERT' OR old_key IS DISTINCT FROM new_key) THEN
    UPDATE public.social_posts
      SET reaction_distribution = jsonb_set(
        reaction_distribution,
        ARRAY[new_key],
        to_jsonb(COALESCE((reaction_distribution->>new_key)::int, 0) + 1),
        true
      )
      WHERE id = post_id_target;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_social_post_likes_reaction_distribution ON public.social_post_likes;
CREATE TRIGGER tg_social_post_likes_reaction_distribution
  AFTER INSERT OR UPDATE OR DELETE ON public.social_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_social_post_reaction_distribution();

-- ---------------------------------------------------------------------------
-- 5. Scoring v6 — v5 baseline + dwell + save + nuanced reaction boost
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_social_post_rank_v6(
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
  p_moderation_provider text,
  p_unique_view_count integer,
  p_total_dwell_ms bigint,
  p_dwell_samples integer,
  p_save_count integer,
  p_reaction_distribution jsonb
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
  unique_view_weight constant numeric := 0.5;
  dwell_weight constant numeric := 0.05;
  save_weight constant numeric := 5.0;
  nuanced_reaction_boost_cap constant numeric := 1.0;
  fresh_boost_recent constant numeric := 8.0;
  fresh_boost_warm constant numeric := 4.0;
  fresh_boost_cutoff_hours constant numeric := 24.0;
  recent_post_cutoff_hours constant numeric := 72.0;
  new_author_post_limit constant integer := 3;
  new_author_recent_boost constant numeric := 6.0;
  rejection_penalty_weight constant numeric := 3.0;
  rejection_penalty_cap constant numeric := 18.0;
  auto_hide_provider constant text := 'threshold_auto_hide';
  auto_hide_rejection_factor constant numeric := 0.5;
  language_match_boost constant numeric := 7.0;
  country_match_boost constant numeric := 3.5;

  age_hours numeric := GREATEST(
    EXTRACT(EPOCH FROM (now()::timestamptz - p_created_at)) / 3600.0,
    0
  );
  avg_dwell_ms numeric;
  laugh_wow_count numeric;
  total_reactions numeric;
  freshness_decay numeric;
  engagement numeric;
  impression_signal numeric;
  unique_view_signal numeric;
  dwell_signal numeric;
  save_signal numeric;
  nuanced_reaction_boost numeric;
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

  unique_view_signal := LN(1 + GREATEST(COALESCE(p_unique_view_count, 0), 0))
    * unique_view_weight;

  -- Dwell time: ln-scaled average per sample, in seconds.
  IF COALESCE(p_dwell_samples, 0) > 0 THEN
    avg_dwell_ms := GREATEST(p_total_dwell_ms, 0)::numeric / p_dwell_samples;
    dwell_signal := LN(1 + avg_dwell_ms / 1000.0) * dwell_weight;
  ELSE
    dwell_signal := 0.0;
  END IF;

  save_signal := LN(1 + GREATEST(COALESCE(p_save_count, 0), 0)) * save_weight;

  -- Nuanced reactions: laugh + wow are signals of emotional engagement
  -- beyond a flat like. Bounded so they cannot dominate the score.
  IF p_reaction_distribution IS NULL THEN
    nuanced_reaction_boost := 0.0;
  ELSE
    laugh_wow_count :=
      COALESCE((p_reaction_distribution->>'laugh')::numeric, 0)
      + COALESCE((p_reaction_distribution->>'wow')::numeric, 0);
    total_reactions :=
      COALESCE((p_reaction_distribution->>'like')::numeric, 0)
      + COALESCE((p_reaction_distribution->>'dislike')::numeric, 0)
      + COALESCE((p_reaction_distribution->>'laugh')::numeric, 0)
      + COALESCE((p_reaction_distribution->>'wow')::numeric, 0)
      + COALESCE((p_reaction_distribution->>'sad')::numeric, 0);
    IF total_reactions > 0 THEN
      nuanced_reaction_boost := LEAST(
        nuanced_reaction_boost_cap,
        (laugh_wow_count / total_reactions) * nuanced_reaction_boost_cap
      );
    ELSE
      nuanced_reaction_boost := 0.0;
    END IF;
  END IF;

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
    + unique_view_signal
    + dwell_signal
    + save_signal
    + nuanced_reaction_boost
    + fresh_boost
    + new_author_boost
    - rejection_penalty
    + language_boost
    + country_boost;
END;
$$;

COMMENT ON FUNCTION public.calculate_social_post_rank_v6(
  timestamptz, integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, integer, bigint, integer, integer, jsonb
) IS 'Social ranking v6 = v5 baseline + dwell_signal (0.05 ln) + save_signal (5.0 ln) + nuanced_reaction_boost (cap 1.0).';

-- ---------------------------------------------------------------------------
-- 6. RPC get_social_feed_page — keeps 5-arg signature, adds viewer_has_saved.
-- ---------------------------------------------------------------------------

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
  viewer_hidden_authors AS (
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
      COALESCE(author_sequences.author_post_sequence, 2147483647) AS author_post_sequence,
      (
        public.calculate_social_post_rank_v6(
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
          post.moderation_provider,
          post.unique_view_count,
          post.total_dwell_ms,
          post.dwell_samples,
          post.save_count,
          post.reaction_distribution
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
    LEFT JOIN author_post_sequences AS author_sequences
      ON author_sequences.id = post.id
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
      ranked_public_posts.unique_view_count,
      ranked_public_posts.comment_count,
      ranked_public_posts.save_count,
      ranked_public_posts.reaction_distribution,
      ranked_public_posts.viewer_reaction,
      ranked_public_posts.viewer_reaction = 'like' AS viewer_has_liked,
      ranked_public_posts.viewer_follows_author,
      ranked_public_posts.viewer_has_saved,
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
