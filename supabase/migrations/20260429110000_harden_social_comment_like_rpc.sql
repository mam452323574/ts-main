-- Harden the social comment-like write path used by the Edge Function.
-- This keeps direct table writes closed to clients and ensures authenticated
-- accounts can like comments through the service-role RPC path.

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
  updated_at timestamptz NOT NULL DEFAULT now()
);

WITH ranked_comment_likes AS (
  SELECT
    comment_like.id,
    row_number() OVER (
      PARTITION BY comment_like.comment_id, comment_like.user_id
      ORDER BY comment_like.created_at ASC, comment_like.id ASC
    ) AS duplicate_rank
  FROM public.social_comment_likes AS comment_like
)
DELETE FROM public.social_comment_likes AS comment_like
USING ranked_comment_likes
WHERE comment_like.id = ranked_comment_likes.id
  AND ranked_comment_likes.duplicate_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS table_constraint
    WHERE table_constraint.conrelid = 'public.social_comment_likes'::regclass
      AND table_constraint.conname = 'social_comment_likes_comment_user_unique'
  ) THEN
    ALTER TABLE public.social_comment_likes
      ADD CONSTRAINT social_comment_likes_comment_user_unique
      UNIQUE (comment_id, user_id);
  END IF;
END;
$$;

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
REVOKE INSERT, UPDATE, DELETE ON public.social_comment_likes FROM anon;

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_comment_created_at
  ON public.social_comment_likes(comment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_comment_likes_user_created_at
  ON public.social_comment_likes(user_id, created_at DESC);

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

  UPDATE public.social_comments AS social_comment
  SET
    like_count = (
      SELECT COUNT(*)::integer
      FROM public.social_comment_likes AS comment_like
      WHERE comment_like.comment_id = p_comment_id
    ),
    updated_at = now()
  WHERE social_comment.id = p_comment_id;
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

SELECT public.refresh_social_comment_like_count(social_comment.id)
FROM public.social_comments AS social_comment;

CREATE OR REPLACE FUNCTION public.set_social_comment_like(
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
  parent_post public.social_posts%ROWTYPE;
  invoker_uid uuid := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF invoker_uid IS NOT NULL AND invoker_uid <> p_user_id THEN
    RAISE EXCEPTION 'p_user_id must match auth.uid()'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_liked IS NULL THEN
    RAISE EXCEPTION 'liked must be provided'
      USING ERRCODE = '22023';
  END IF;

  SELECT social_comment.*
  INTO target_comment
  FROM public.social_comments AS social_comment
  WHERE social_comment.id = p_comment_id
  LIMIT 1;

  IF target_comment.id IS NULL OR target_comment.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social comment not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT social_post.*
  INTO parent_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = target_comment.post_id
  LIMIT 1;

  IF parent_post.id IS NULL OR parent_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    parent_post.moderation_state = 'approved'
    OR (
      parent_post.moderation_state = 'pending'
      AND parent_post.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social comment likes are only allowed on approved posts or your own pending posts'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    target_comment.moderation_state = 'approved'
    OR (
      target_comment.moderation_state = 'pending'
      AND target_comment.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social comment likes are only allowed on approved comments or your own pending comments'
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
    ON CONFLICT ON CONSTRAINT social_comment_likes_comment_user_unique DO UPDATE
    SET updated_at = now();
  ELSE
    DELETE FROM public.social_comment_likes AS comment_like
    WHERE comment_like.comment_id = p_comment_id
      AND comment_like.user_id = p_user_id;
  END IF;

  SELECT social_comment.*
  INTO target_comment
  FROM public.social_comments AS social_comment
  WHERE social_comment.id = p_comment_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_comment.id AS comment_id,
    EXISTS (
      SELECT 1
      FROM public.social_comment_likes AS comment_like
      WHERE comment_like.comment_id = target_comment.id
        AND comment_like.user_id = p_user_id
    ) AS viewer_has_liked,
    GREATEST(COALESCE(target_comment.like_count, 0), 0) AS like_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
