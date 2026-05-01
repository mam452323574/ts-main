DROP FUNCTION IF EXISTS public.get_social_post_detail(uuid);

CREATE FUNCTION public.get_social_post_detail(
  p_post_id uuid
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
    post.comment_count,
    COALESCE(reaction_state.reaction_type, 'neutral') AS viewer_reaction,
    COALESCE(reaction_state.reaction_type, 'neutral') = 'like' AS viewer_has_liked,
    post.moderation_state,
    post.moderation_status,
    post.moderation_reason,
    post.moderation_provider,
    post.rejection_count,
    post.last_rejected_at,
    post.deleted_at
  FROM public.social_posts AS post
  LEFT JOIN public.social_post_likes AS reaction_state
    ON reaction_state.post_id = post.id
   AND reaction_state.user_id = auth.uid()
  WHERE post.id = p_post_id
    AND post.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_post_detail(uuid)
TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
