-- Social comments pagination (cursor-based, newest-first).
--
-- Context:
--   The legacy public.get_social_comments_for_post(uuid) RPC returns the full
--   thread in a single call (ORDER BY created_at ASC, no LIMIT). That is not
--   scalable for long threads and forces the mobile app to hold the whole
--   thread in memory.
--
--   This migration introduces a paginated RPC that returns the most recent
--   approved comments first (plus the viewer's own pending/rejected comments
--   per the original visibility rule), ordered by (created_at DESC, id DESC).
--   The client pages backwards in time by sending the (created_at, id) tuple
--   of the last row of the previous page as the next cursor.
--
--   The legacy function is kept intact for backwards compatibility with
--   callers and tests that still depend on it.

-- Secondary index tuned for the new ORDER BY (created_at DESC, id DESC).
-- Useful to keep the cursor stable when multiple comments share a timestamp.
CREATE INDEX IF NOT EXISTS idx_social_comments_post_created_at_id_desc
  ON public.social_comments (post_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

DROP FUNCTION IF EXISTS public.get_social_comments_page(uuid, timestamptz, uuid, integer);

CREATE FUNCTION public.get_social_comments_page(
  p_post_id uuid,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_page_size integer DEFAULT 10
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
  effective_page_size integer;
BEGIN
  -- Clamp the page size. We allow 1..50, default to 10 when NULL is provided.
  effective_page_size := GREATEST(1, LEAST(COALESCE(p_page_size, 10), 50));

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
    AND (
      p_cursor_created_at IS NULL
      OR p_cursor_id IS NULL
      OR (comment.created_at, comment.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY comment.created_at DESC, comment.id DESC
  LIMIT effective_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.get_social_comments_page(uuid, timestamptz, uuid, integer)
TO authenticated;
