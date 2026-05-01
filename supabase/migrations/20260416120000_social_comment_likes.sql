ALTER TABLE public.social_comments
  ADD COLUMN IF NOT EXISTS like_count integer;

UPDATE public.social_comments
SET like_count = COALESCE(like_count, 0)
WHERE like_count IS NULL;

ALTER TABLE public.social_comments
  ALTER COLUMN like_count SET DEFAULT 0;

ALTER TABLE public.social_comments
  ALTER COLUMN like_count SET NOT NULL;

ALTER TABLE public.social_comments
  DROP CONSTRAINT IF EXISTS social_comments_like_count_check;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_like_count_check CHECK (like_count >= 0);

CREATE TABLE IF NOT EXISTS public.social_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.social_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_comment_likes_comment_user_unique UNIQUE (comment_id, user_id)
);

ALTER TABLE public.social_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view own social comment likes"
  ON public.social_comment_likes;

CREATE POLICY "Authenticated users can view own social comment likes"
  ON public.social_comment_likes
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT ON public.social_comment_likes TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_comment_likes FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_comment_created_at
  ON public.social_comment_likes(comment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_user_created_at
  ON public.social_comment_likes(user_id, created_at DESC);

DROP TRIGGER IF EXISTS phase2_set_social_comment_likes_updated_at
  ON public.social_comment_likes;

CREATE TRIGGER phase2_set_social_comment_likes_updated_at
  BEFORE UPDATE ON public.social_comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_social_comment_like_count(
  p_comment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_comment_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.social_comments
  SET
    like_count = (
      SELECT COUNT(*)::integer
      FROM public.social_comment_likes
      WHERE comment_id = p_comment_id
    ),
    updated_at = now()
  WHERE id = p_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_social_comment_like_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_social_comment_like_count(OLD.comment_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.comment_id IS DISTINCT FROM NEW.comment_id THEN
    PERFORM public.refresh_social_comment_like_count(OLD.comment_id);
  END IF;

  PERFORM public.refresh_social_comment_like_count(NEW.comment_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase2_social_comment_like_counter
  ON public.social_comment_likes;

CREATE TRIGGER phase2_social_comment_like_counter
  AFTER INSERT OR UPDATE OR DELETE ON public.social_comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_social_comment_like_counter();

SELECT public.refresh_social_comment_like_count(id)
FROM public.social_comments;

DROP FUNCTION IF EXISTS public.get_social_comments_for_post(uuid);

CREATE FUNCTION public.get_social_comments_for_post(
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
  like_count integer,
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
    comment.like_count,
    EXISTS (
      SELECT 1
      FROM public.social_comment_likes AS like_state
      WHERE like_state.comment_id = comment.id
        AND like_state.user_id = auth.uid()
    ) AS viewer_has_liked,
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

DROP FUNCTION IF EXISTS public.set_social_comment_like(uuid, uuid, boolean);

CREATE FUNCTION public.set_social_comment_like(
  p_comment_id uuid,
  p_user_id uuid,
  p_liked boolean
)
RETURNS TABLE (
  comment_id uuid,
  viewer_has_liked boolean,
  like_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_comment public.social_comments%ROWTYPE;
  target_post public.social_posts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_liked IS NULL THEN
    RAISE EXCEPTION 'liked must be provided'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO target_comment
  FROM public.social_comments
  WHERE public.social_comments.id = p_comment_id
  LIMIT 1;

  IF target_comment.id IS NULL OR target_comment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social comment not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO target_post
  FROM public.social_posts
  WHERE public.social_posts.id = target_comment.post_id
  LIMIT 1;

  IF target_post.id IS NULL OR target_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF target_post.moderation_state <> 'approved'
    AND NOT (
      target_post.moderation_state = 'pending'
      AND target_post.author_id = p_user_id
    ) THEN
    RAISE EXCEPTION 'Comment likes are only allowed when the parent post is interactive'
      USING ERRCODE = 'P0001';
  END IF;

  IF target_comment.moderation_state <> 'approved'
    AND NOT (
      target_comment.moderation_state = 'pending'
      AND target_comment.author_id = p_user_id
    ) THEN
    RAISE EXCEPTION 'Comment likes are only allowed on approved comments or your own pending comments'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_liked THEN
    INSERT INTO public.social_comment_likes (
      comment_id,
      user_id
    )
    VALUES (
      p_comment_id,
      p_user_id
    )
    ON CONFLICT (comment_id, user_id) DO UPDATE
    SET updated_at = now();
  ELSE
    DELETE FROM public.social_comment_likes
    WHERE public.social_comment_likes.comment_id = p_comment_id
      AND public.social_comment_likes.user_id = p_user_id;
  END IF;

  SELECT *
  INTO target_comment
  FROM public.social_comments
  WHERE public.social_comments.id = p_comment_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_comment.id,
    EXISTS (
      SELECT 1
      FROM public.social_comment_likes AS like_state
      WHERE like_state.comment_id = p_comment_id
        AND like_state.user_id = p_user_id
    ) AS viewer_has_liked,
    COALESCE(target_comment.like_count, 0) AS like_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) TO service_role;

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
  rollups.reason_codes,
  rollups.last_reported_at
FROM public.social_comments AS comment
LEFT JOIN rollups
  ON rollups.target_type = 'comment'
 AND rollups.target_id = comment.id
WHERE comment.deleted_at IS NULL;

SELECT pg_notify('pgrst', 'reload schema');
