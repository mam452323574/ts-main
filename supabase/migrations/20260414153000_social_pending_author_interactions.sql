-- Allow authors to interact with their own pending posts without exposing them publicly.

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

  SELECT *
  INTO target_post
  FROM public.social_posts
  WHERE public.social_posts.id = p_post_id
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
  INTO target_post
  FROM public.social_posts
  WHERE public.social_posts.id = p_post_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    target_post.id,
    normalized_reaction,
    COALESCE(target_post.like_count, 0),
    COALESCE(target_post.dislike_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_social_post_reaction(uuid, uuid, text) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
