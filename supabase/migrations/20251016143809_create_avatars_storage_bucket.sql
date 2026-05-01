/*
  # Avatars Storage Bucket Configuration

  ## Overview
  Creates and configures a storage bucket for user profile avatars with proper
  security policies and file size restrictions.

  ## Storage Bucket: avatars
  - **Public**: false (requires authentication to access)
  - **File size limit**: 5MB
  - **Allowed MIME types**: image/jpeg, image/jpg, image/png, image/webp
  - **File path structure**: {user_id}/{filename}

  ## Security Policies
  1. Users can upload only to their own user ID folder
  2. Users can update/delete only their own avatars
  3. All authenticated users can view avatars (for public profiles)
*/

-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone authenticated can view avatars" ON storage.objects;

-- Policy: Users can upload avatars only to their own folder
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own avatars
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own avatars
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: All authenticated users can view avatars (for public profiles)
CREATE POLICY "Anyone authenticated can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Helper function to get avatar public URL
CREATE OR REPLACE FUNCTION get_avatar_url(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_avatar_url text;
BEGIN
  SELECT avatar_url INTO v_avatar_url
  FROM user_profiles
  WHERE id = p_user_id;
  
  RETURN v_avatar_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to construct full storage URL
CREATE OR REPLACE FUNCTION construct_avatar_storage_url(
  p_user_id uuid,
  p_filename text
)
RETURNS text AS $$
BEGIN
  RETURN p_user_id::text || '/' || p_filename;
END;
$$ LANGUAGE plpgsql;