-- Social Phase 2 hardening
-- - explicit moderation actions and audit trail
-- - reaction integrity with likes/dislikes
-- - impression tracking for ranking and abuse detection
-- - stricter feed/comment visibility and ranking

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS dislike_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impression_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_moderation_state_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged', 'hidden', 'removed')
  );

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_dislike_count_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_dislike_count_check CHECK (dislike_count >= 0);

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_impression_count_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_impression_count_check CHECK (impression_count >= 0);

ALTER TABLE public.social_comments
  DROP CONSTRAINT IF EXISTS social_comments_moderation_state_check;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged', 'hidden', 'removed')
  );

ALTER TABLE public.social_reports
  ADD COLUMN IF NOT EXISTS target_author_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS target_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS resolution_note text;

ALTER TABLE public.social_reports
  DROP CONSTRAINT IF EXISTS social_reports_moderation_state_check;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_moderation_state_check CHECK (
    moderation_state IN ('pending', 'approved', 'rejected', 'flagged', 'hidden', 'removed')
  );

ALTER TABLE public.social_reports
  DROP CONSTRAINT IF EXISTS social_reports_reason_code_check;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_reason_code_check CHECK (
    reason_code IN (
      'harassment',
      'hate_speech',
      'sexual_content',
      'graphic_gore',
      'spam_repeat',
      'self_harm',
      'illegal_activity',
      'misinformation',
      'other'
    )
  );

ALTER TABLE public.social_reports
  DROP CONSTRAINT IF EXISTS social_reports_resolution_action_check;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_resolution_action_check CHECK (
    resolution_action IS NULL
    OR resolution_action IN ('approve', 'flag', 'hide', 'remove', 'restore', 'reject', 'dismiss_reports')
  );

ALTER TABLE public.social_reports
  DROP CONSTRAINT IF EXISTS social_reports_resolution_note_length_check;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_resolution_note_length_check CHECK (
    resolution_note IS NULL OR char_length(resolution_note) <= 500
  );

ALTER TABLE public.social_post_likes
  ADD COLUMN IF NOT EXISTS reaction_type text NOT NULL DEFAULT 'like';

ALTER TABLE public.social_post_likes
  DROP CONSTRAINT IF EXISTS social_post_likes_reaction_type_check;

ALTER TABLE public.social_post_likes
  ADD CONSTRAINT social_post_likes_reaction_type_check CHECK (
    reaction_type IN ('like', 'dislike')
  );

CREATE TABLE IF NOT EXISTS public.social_post_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  source text NOT NULL,
  impression_window timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_impressions_source_check CHECK (
    source IN ('feed', 'detail', 'comments')
  ),
  CONSTRAINT social_post_impressions_window_hour_check CHECK (
    impression_window = date_trunc('hour', impression_window)
  ),
  CONSTRAINT social_post_impressions_unique_window UNIQUE (
    post_id,
    viewer_id,
    source,
    impression_window
  )
);

CREATE TABLE IF NOT EXISTS public.social_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  target_comment_id uuid REFERENCES public.social_comments(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_moderation_state text,
  next_moderation_state text,
  reason_code text,
  note text,
  linked_report_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_moderation_events_target_type_check CHECK (
    target_type IN ('post', 'comment')
  ),
  CONSTRAINT social_moderation_events_single_target_check CHECK (
    (target_type = 'post' AND target_post_id IS NOT NULL AND target_comment_id IS NULL)
    OR
    (target_type = 'comment' AND target_post_id IS NULL AND target_comment_id IS NOT NULL)
  ),
  CONSTRAINT social_moderation_events_action_check CHECK (
    action IN ('approve', 'flag', 'hide', 'remove', 'restore', 'reject', 'dismiss_reports')
  ),
  CONSTRAINT social_moderation_events_previous_state_check CHECK (
    previous_moderation_state IS NULL
    OR previous_moderation_state IN ('pending', 'approved', 'rejected', 'flagged', 'hidden', 'removed')
  ),
  CONSTRAINT social_moderation_events_next_state_check CHECK (
    next_moderation_state IS NULL
    OR next_moderation_state IN ('pending', 'approved', 'rejected', 'flagged', 'hidden', 'removed')
  ),
  CONSTRAINT social_moderation_events_reason_length_check CHECK (
    reason_code IS NULL OR char_length(reason_code) <= 100
  ),
  CONSTRAINT social_moderation_events_note_length_check CHECK (
    note IS NULL OR char_length(note) <= 500
  )
);

ALTER TABLE public.social_post_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_moderation_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_social_reports_target_author_created_at
  ON public.social_reports(target_author_id, created_at DESC)
  WHERE target_author_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_reports_reviewed_by_created_at
  ON public.social_reports(reviewed_by, reviewed_at DESC)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_reaction_type
  ON public.social_post_likes(post_id, reaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_post_impressions_post_created_at
  ON public.social_post_impressions(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_post_impressions_viewer_window
  ON public.social_post_impressions(viewer_id, impression_window DESC);

CREATE INDEX IF NOT EXISTS idx_social_moderation_events_target_created_at
  ON public.social_moderation_events(target_type, COALESCE(target_post_id, target_comment_id), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_moderation_events_actor_created_at
  ON public.social_moderation_events(actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.refresh_social_post_reaction_counts(p_post_id uuid)
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
        AND reaction_type = 'like'
    ),
    dislike_count = (
      SELECT COUNT(*)
      FROM public.social_post_likes
      WHERE post_id = p_post_id
        AND reaction_type = 'dislike'
    ),
    updated_at = now()
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_social_post_impression_count(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.social_posts
  SET
    impression_count = (
      SELECT COUNT(*)
      FROM public.social_post_impressions
      WHERE post_id = p_post_id
    ),
    updated_at = now()
  WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_post_like_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_social_post_reaction_counts(OLD.post_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_social_post_reaction_counts(NEW.post_id);

  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM public.refresh_social_post_reaction_counts(OLD.post_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_content_rejection_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.moderation_state = 'rejected' THEN
      NEW.rejection_count := COALESCE(NEW.rejection_count, 0) + 1;
      NEW.last_rejected_at := COALESCE(NEW.last_rejected_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.moderation_state = 'rejected'
    AND COALESCE(OLD.moderation_state, '') <> 'rejected' THEN
    NEW.rejection_count := COALESCE(OLD.rejection_count, 0) + 1;
    NEW.last_rejected_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase2_social_post_rejection_tracking ON public.social_posts;
CREATE TRIGGER phase2_social_post_rejection_tracking
  BEFORE INSERT OR UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_content_rejection_transition();

DROP TRIGGER IF EXISTS phase2_social_comment_rejection_tracking ON public.social_comments;
CREATE TRIGGER phase2_social_comment_rejection_tracking
  BEFORE INSERT OR UPDATE ON public.social_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_content_rejection_transition();

CREATE OR REPLACE FUNCTION public.calculate_social_post_rank(
  p_created_at timestamptz,
  p_like_count integer,
  p_dislike_count integer,
  p_comment_count integer,
  p_impression_count integer
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    (
      48.0 / (
        GREATEST(EXTRACT(EPOCH FROM (now()::timestamptz - p_created_at)) / 3600.0, 0) + 2.0
      )
    )
    + ((COALESCE(p_like_count, 0) * 3.0) - (COALESCE(p_dislike_count, 0) * 4.0) + (COALESCE(p_comment_count, 0) * 5.0))
    + (LN(1 + GREATEST(COALESCE(p_impression_count, 0), 0)) * 2.0);
$$;

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
    combined_feed.tranche_position ASC,
    combined_feed.rank_score DESC,
    combined_feed.created_at DESC
  OFFSET normalized_offset
  LIMIT normalized_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_comments_for_post(
  p_post_id uuid
)
RETURNS TABLE (
  id uuid,
  post_id uuid,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  content_text text,
  created_at timestamptz,
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
      AND target_post.author_id <> auth.uid()
    ) THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    comment.id,
    comment.post_id,
    comment.author_id,
    comment.author_username,
    comment.author_avatar_url,
    comment.content_text,
    comment.created_at,
    comment.moderation_state,
    comment.moderation_status,
    comment.moderation_reason,
    comment.moderation_provider,
    comment.rejection_count,
    comment.last_rejected_at,
    comment.deleted_at
  FROM public.social_comments AS comment
  WHERE comment.post_id = p_post_id
    AND comment.deleted_at IS NULL
    AND (
      comment.moderation_state = 'approved'
      OR comment.author_id = auth.uid()
    )
  ORDER BY comment.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_comments_for_post(uuid)
TO authenticated;

CREATE OR REPLACE FUNCTION public.set_social_post_reaction(
  p_post_id uuid,
  p_user_id uuid,
  p_reaction text
)
RETURNS TABLE (
  post_id uuid,
  viewer_reaction text,
  like_count integer,
  dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_reaction text := COALESCE(NULLIF(btrim(COALESCE(p_reaction, '')), ''), 'neutral');
  refreshed_post public.social_posts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction NOT IN ('like', 'dislike', 'neutral') THEN
    RAISE EXCEPTION 'Unsupported reaction: %', normalized_reaction
      USING ERRCODE = '22023';
  END IF;

  IF normalized_reaction = 'neutral' THEN
    DELETE FROM public.social_post_likes
    WHERE public.social_post_likes.post_id = p_post_id
      AND public.social_post_likes.user_id = p_user_id;
  ELSE
    INSERT INTO public.social_post_likes (
      post_id,
      user_id,
      reaction_type
    )
    VALUES (
      p_post_id,
      p_user_id,
      normalized_reaction
    )
    ON CONFLICT (post_id, user_id) DO UPDATE
    SET
      reaction_type = EXCLUDED.reaction_type,
      updated_at = now();
  END IF;

  SELECT *
  INTO refreshed_post
  FROM public.social_posts
  WHERE public.social_posts.id = p_post_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    refreshed_post.id,
    normalized_reaction,
    COALESCE(refreshed_post.like_count, 0),
    COALESCE(refreshed_post.dislike_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_impressions(
  p_post_ids uuid[],
  p_viewer_id uuid,
  p_source text DEFAULT 'feed'
)
RETURNS TABLE (
  recorded_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_source text := COALESCE(NULLIF(btrim(COALESCE(p_source, '')), ''), 'feed');
BEGIN
  IF p_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_source NOT IN ('feed', 'detail', 'comments') THEN
    RAISE EXCEPTION 'Unsupported impression source: %', normalized_source
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH inserted_rows AS (
    INSERT INTO public.social_post_impressions (
      post_id,
      viewer_id,
      source,
      impression_window
    )
    SELECT DISTINCT
      post_id,
      p_viewer_id,
      normalized_source,
      date_trunc('hour', now())
    FROM unnest(COALESCE(p_post_ids, '{}'::uuid[])) AS post_id
    WHERE post_id IS NOT NULL
    ON CONFLICT (post_id, viewer_id, source, impression_window) DO NOTHING
    RETURNING post_id
  ),
  refreshed AS (
    SELECT public.refresh_social_post_impression_count(inserted_rows.post_id)
    FROM inserted_rows
    GROUP BY inserted_rows.post_id
  )
  SELECT COUNT(*)::integer
  FROM inserted_rows;
END;
$$;

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

DROP VIEW IF EXISTS public.social_report_rollups;

CREATE VIEW public.social_report_rollups AS
WITH report_groups AS (
  SELECT
    target_type,
    COALESCE(target_post_id, target_comment_id) AS target_id,
    MAX(target_author_id::text)::uuid AS target_author_id,
    COUNT(*)::integer AS total_reports,
    COUNT(DISTINCT reporter_id)::integer AS unique_reporters,
    COUNT(*) FILTER (
      WHERE created_at >= (now() - interval '24 hours')
    )::integer AS total_reports_24h,
    COUNT(DISTINCT reporter_id) FILTER (
      WHERE created_at >= (now() - interval '24 hours')
    )::integer AS unique_reporters_24h,
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT reason_code), NULL) AS reason_codes,
    MAX(created_at) AS last_reported_at,
    COUNT(*) FILTER (
      WHERE workflow_status IN ('submitted', 'reviewing')
    )::integer AS open_reports
  FROM public.social_reports
  GROUP BY target_type, COALESCE(target_post_id, target_comment_id)
)
SELECT
  report_groups.target_type,
  report_groups.target_id,
  report_groups.target_author_id AS owner_id,
  post_target.category,
  post_target.content_text,
  post_target.moderation_state,
  post_target.moderation_reason,
  post_target.dislike_count,
  post_target.impression_count,
  report_groups.total_reports,
  report_groups.unique_reporters,
  report_groups.total_reports_24h,
  report_groups.unique_reporters_24h,
  report_groups.open_reports,
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
  report_groups.target_author_id AS owner_id,
  NULL::text AS category,
  comment_target.content_text,
  comment_target.moderation_state,
  comment_target.moderation_reason,
  0::integer AS dislike_count,
  0::integer AS impression_count,
  report_groups.total_reports,
  report_groups.unique_reporters,
  report_groups.total_reports_24h,
  report_groups.unique_reporters_24h,
  report_groups.open_reports,
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
    open_reports,
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
  post.like_count,
  post.dislike_count,
  post.impression_count,
  post.comment_count,
  post.rejection_count,
  post.last_rejected_at,
  post.created_at,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
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
  0::integer AS like_count,
  0::integer AS dislike_count,
  0::integer AS impression_count,
  0::integer AS comment_count,
  comment.rejection_count,
  comment.last_rejected_at,
  comment.created_at,
  COALESCE(rollups.total_reports_24h, 0) AS total_reports_24h,
  COALESCE(rollups.unique_reporters_24h, 0) AS unique_reporters_24h,
  COALESCE(rollups.open_reports, 0) AS open_reports,
  rollups.reason_codes,
  rollups.last_reported_at
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
WHERE comment.deleted_at IS NULL;

SELECT public.refresh_social_post_reaction_counts(id)
FROM public.social_posts;

SELECT public.refresh_social_post_impression_count(id)
FROM public.social_posts;

SELECT pg_notify('pgrst', 'reload schema');
