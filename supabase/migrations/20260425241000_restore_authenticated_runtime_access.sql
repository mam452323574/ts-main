-- Restore the authenticated runtime access expected by the mobile app after
-- the broad security hardening migrations.

GRANT EXECUTE ON FUNCTION public.calculate_social_post_rank(
  timestamptz,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_social_feed_page(text, integer, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_social_comments_for_post(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_social_comments_page(uuid, timestamptz, uuid, integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_social_post_detail(uuid)
TO authenticated;

GRANT SELECT ON public.social_posts TO authenticated;
GRANT SELECT ON public.social_post_likes TO authenticated;
GRANT SELECT ON public.social_comments TO authenticated;
GRANT SELECT ON public.social_comment_likes TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view social posts"
ON public.social_posts;
CREATE POLICY "Authenticated users can view social posts"
ON public.social_posts
FOR SELECT
TO authenticated
USING (
  author_id = (select auth.uid())
  OR (
    deleted_at IS NULL
    AND moderation_state = 'approved'
  )
);

DROP POLICY IF EXISTS "Authenticated users can view own social likes"
ON public.social_post_likes;
CREATE POLICY "Authenticated users can view own social likes"
ON public.social_post_likes
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view social comments"
ON public.social_comments;
CREATE POLICY "Authenticated users can view social comments"
ON public.social_comments
FOR SELECT
TO authenticated
USING (
  author_id = (select auth.uid())
  OR (
    deleted_at IS NULL
    AND moderation_state = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.social_posts AS post_visibility
      WHERE post_visibility.id = social_comments.post_id
        AND post_visibility.deleted_at IS NULL
        AND (
          post_visibility.moderation_state = 'approved'
          OR post_visibility.author_id = (select auth.uid())
        )
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view own social comment likes"
ON public.social_comment_likes;
CREATE POLICY "Authenticated users can view own social comment likes"
ON public.social_comment_likes
FOR SELECT
TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own scan images" ON storage.objects;

CREATE POLICY "Users can view own scan images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can upload own scan images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can update own scan images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
)
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can delete own scan images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
  AND (storage.foldername(name))[2] = 'scans'
);

NOTIFY pgrst, 'reload schema';
