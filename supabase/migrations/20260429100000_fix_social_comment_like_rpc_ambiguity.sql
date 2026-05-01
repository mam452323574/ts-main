-- Fix social comment like RPC ambiguity introduced by unqualified conflict targets.
-- The RPC is invoked by Edge Functions with service_role and remains available to
-- authenticated free users through the existing social feature gates.

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
    COALESCE(target_comment.like_count, 0) AS like_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
