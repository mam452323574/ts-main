-- Fix ambiguous PL/pgSQL output variables colliding with ON CONFLICT column names
-- in social reaction RPCs that RETURN TABLE(post_id/comment_id, ...).

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
  target_post public.social_posts%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction NOT IN ('like', 'dislike', 'neutral') THEN
    RAISE EXCEPTION 'Unsupported reaction: %', normalized_reaction
      USING ERRCODE = '22023';
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  IF target_post.id IS NULL OR target_post.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Social post not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    target_post.moderation_state = 'approved'
    OR (
      target_post.moderation_state = 'pending'
      AND target_post.author_id = p_user_id
    )
  ) THEN
    RAISE EXCEPTION 'Social post reactions are only allowed on approved posts or your own pending posts'
      USING ERRCODE = 'P0001';
  END IF;

  IF normalized_reaction = 'neutral' THEN
    DELETE FROM public.social_post_likes AS post_like
    WHERE post_like.post_id = p_post_id
      AND post_like.user_id = p_user_id;
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
    ON CONFLICT ON CONSTRAINT social_post_likes_post_user_unique DO UPDATE
    SET
      reaction_type = EXCLUDED.reaction_type,
      updated_at = now();
  END IF;

  SELECT social_post.*
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = p_post_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_post.id AS post_id,
    normalized_reaction AS viewer_reaction,
    COALESCE(target_post.like_count, 0) AS like_count,
    COALESCE(target_post.dislike_count, 0) AS dislike_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) TO service_role;

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
  INTO target_post
  FROM public.social_posts AS social_post
  WHERE social_post.id = target_comment.post_id
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
      FROM public.social_comment_likes AS like_state
      WHERE like_state.comment_id = target_comment.id
        AND like_state.user_id = p_user_id
    ) AS viewer_has_liked,
    COALESCE(target_comment.like_count, 0) AS like_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_comment_like(uuid, uuid, boolean) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
