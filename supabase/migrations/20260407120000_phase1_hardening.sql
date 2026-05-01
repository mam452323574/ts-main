-- Phase 1 hardening
-- - canonical username + profile normalization
-- - protected user_profiles grants
-- - stable scan image path support
-- - stricter storage path policies
-- - RevenueCat webhook idempotency log

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN email_verified boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'has_seen_tutorial'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN has_seen_tutorial boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'welcome_credits'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN welcome_credits jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'image_path'
  ) THEN
    ALTER TABLE public.scans
      ADD COLUMN image_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scans' AND column_name = 'used_welcome_credit'
  ) THEN
    ALTER TABLE public.scans
      ADD COLUMN used_welcome_credit boolean NOT NULL DEFAULT false;
  END IF;
END $$;

ALTER TABLE public.user_profiles
  ALTER COLUMN email_verified SET DEFAULT false;

ALTER TABLE public.user_profiles
  ALTER COLUMN has_seen_tutorial SET DEFAULT false;

ALTER TABLE public.user_profiles
  ALTER COLUMN notification_settings SET DEFAULT
    '{"reminders": true, "achievements": true, "newContent": true}'::jsonb;

ALTER TABLE public.user_profiles
  ALTER COLUMN scan_usage SET DEFAULT
    '{
      "health": {"last_scan_date": null, "scan_timestamps": []},
      "body": {"last_scan_date": null, "scan_timestamps": []},
      "nutrition": {"last_scan_date": null, "scan_timestamps": []},
      "super": {"last_scan_date": null, "scan_timestamps": []}
    }'::jsonb;

ALTER TABLE public.user_profiles
  ALTER COLUMN welcome_credits SET DEFAULT
    '{"health": 1, "body": 1, "nutrition": 1}'::jsonb;

CREATE OR REPLACE FUNCTION public.phase1_merge_scan_usage_defaults(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'health',
    COALESCE(
      p_value -> 'health',
      jsonb_build_object('last_scan_date', NULL, 'scan_timestamps', '[]'::jsonb)
    ),
    'body',
    COALESCE(
      p_value -> 'body',
      jsonb_build_object('last_scan_date', NULL, 'scan_timestamps', '[]'::jsonb)
    ),
    'nutrition',
    COALESCE(
      p_value -> 'nutrition',
      jsonb_build_object('last_scan_date', NULL, 'scan_timestamps', '[]'::jsonb)
    ),
    'super',
    COALESCE(
      p_value -> 'super',
      jsonb_build_object('last_scan_date', NULL, 'scan_timestamps', '[]'::jsonb)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.phase1_normalize_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  auth_email text;
  auth_email_confirmed_at timestamptz;
BEGIN
  SELECT
    users.email,
    users.email_confirmed_at
  INTO auth_email, auth_email_confirmed_at
  FROM auth.users AS users
  WHERE users.id = NEW.id;

  NEW.email := COALESCE(
    NULLIF(lower(btrim(COALESCE(NEW.email, ''))), ''),
    auth_email
  );

  IF NEW.username IS NOT NULL THEN
    NEW.username := NULLIF(lower(btrim(NEW.username)), '');
  END IF;

  IF NEW.avatar_url IS NOT NULL THEN
    NEW.avatar_url := NULLIF(btrim(NEW.avatar_url), '');
  END IF;

  IF NEW.push_token IS NOT NULL THEN
    NEW.push_token := NULLIF(btrim(NEW.push_token), '');
  END IF;

  NEW.email_verified := COALESCE(
    NEW.email_verified,
    auth_email_confirmed_at IS NOT NULL
  );
  NEW.has_seen_tutorial := COALESCE(NEW.has_seen_tutorial, false);
  NEW.notification_settings := COALESCE(
    NEW.notification_settings,
    '{"reminders": true, "achievements": true, "newContent": true}'::jsonb
  );
  NEW.scan_usage := public.phase1_merge_scan_usage_defaults(
    COALESCE(NEW.scan_usage, '{}'::jsonb)
  );
  NEW.welcome_credits := COALESCE(
    NEW.welcome_credits,
    '{"health": 1, "body": 1, "nutrition": 1}'::jsonb
  );
  NEW.account_created_at := COALESCE(NEW.account_created_at, now());
  NEW.subscription_status := COALESCE(
    NULLIF(btrim(COALESCE(NEW.subscription_status, '')), ''),
    'inactive'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase1_normalize_user_profile ON public.user_profiles;
CREATE TRIGGER phase1_normalize_user_profile
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.phase1_normalize_user_profile();

UPDATE public.user_profiles AS profiles
SET
  email = COALESCE(
    NULLIF(lower(btrim(COALESCE(profiles.email, ''))), ''),
    auth_users.email
  ),
  username = CASE
    WHEN profiles.username IS NULL THEN NULL
    ELSE NULLIF(lower(btrim(profiles.username)), '')
  END,
  avatar_url = NULLIF(btrim(COALESCE(profiles.avatar_url, '')), ''),
  email_verified = COALESCE(profiles.email_verified, auth_users.email_confirmed_at IS NOT NULL),
  has_seen_tutorial = COALESCE(profiles.has_seen_tutorial, false),
  notification_settings = COALESCE(
    profiles.notification_settings,
    '{"reminders": true, "achievements": true, "newContent": true}'::jsonb
  ),
  scan_usage = public.phase1_merge_scan_usage_defaults(
    COALESCE(profiles.scan_usage, '{}'::jsonb)
  ),
  welcome_credits = COALESCE(
    profiles.welcome_credits,
    '{"health": 1, "body": 1, "nutrition": 1}'::jsonb
  ),
  account_created_at = COALESCE(profiles.account_created_at, now()),
  subscription_status = COALESCE(
    NULLIF(btrim(COALESCE(profiles.subscription_status, '')), ''),
    'inactive'
  )
FROM auth.users AS auth_users
WHERE auth_users.id = profiles.id;

WITH normalized_usernames AS (
  SELECT
    id,
    username,
    row_number() OVER (
      PARTITION BY lower(username)
      ORDER BY created_at ASC, id ASC
    ) AS duplicate_rank
  FROM public.user_profiles
  WHERE username IS NOT NULL
)
UPDATE public.user_profiles AS profiles
SET username = NULL
FROM normalized_usernames AS normalized
WHERE normalized.id = profiles.id
  AND (
    normalized.duplicate_rank > 1
    OR normalized.username !~ '^[a-z0-9_-]{3,20}$'
  );

DROP INDEX IF EXISTS public.idx_user_profiles_username_unique;
DROP INDEX IF EXISTS public.idx_user_profiles_username_ci_unique;
CREATE UNIQUE INDEX idx_user_profiles_username_ci_unique
  ON public.user_profiles (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_username_canonical_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_username_canonical_check
  CHECK (
    username IS NULL
    OR (
      username = lower(username)
      AND username ~ '^[a-z0-9_-]{3,20}$'
    )
  );

ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_image_path_stable_check;

ALTER TABLE public.scans
  ADD CONSTRAINT scans_image_path_stable_check
  CHECK (
    image_path IS NULL
    OR (
      position('://' in image_path) = 0
      AND left(image_path, 1) <> '/'
      AND position('?' in image_path) = 0
      AND position('#' in image_path) = 0
    )
  );

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_content_text_length_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_content_text_length_check
  CHECK (
    content_text IS NULL OR char_length(content_text) <= 500
  );

ALTER TABLE public.social_comments
  DROP CONSTRAINT IF EXISTS social_comments_content_text_length_check;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_content_text_length_check
  CHECK (
    char_length(content_text) <= 280
  );

ALTER TABLE public.social_reports
  DROP CONSTRAINT IF EXISTS social_reports_details_length_check;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_details_length_check
  CHECK (
    details IS NULL OR char_length(details) <= 500
  );

CREATE TABLE IF NOT EXISTS public.revenuecat_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  app_user_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_state text NOT NULL DEFAULT 'pending',
  last_error text,
  synced_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT revenuecat_webhook_events_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_app_user_id
  ON public.revenuecat_webhook_events (app_user_id, received_at DESC);

ALTER TABLE public.revenuecat_webhook_events
  ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'pending';

ALTER TABLE public.revenuecat_webhook_events
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.revenuecat_webhook_events
  ADD COLUMN IF NOT EXISTS synced_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scan-images',
  'scan-images',
  false,
  10485760,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-posts',
  'social-posts',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone authenticated can view avatars" ON storage.objects;

CREATE POLICY "Anyone authenticated can view avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own canonical avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND name IN (
    auth.uid()::text || '/avatar.jpg',
    auth.uid()::text || '/avatar.png',
    auth.uid()::text || '/avatar.webp'
  )
);

CREATE POLICY "Users can update own canonical avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND name IN (
    auth.uid()::text || '/avatar.jpg',
    auth.uid()::text || '/avatar.png',
    auth.uid()::text || '/avatar.webp'
  )
);

CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own social post assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can list social post assets" ON storage.objects;

CREATE POLICY "Authenticated users can list social post assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'social-posts');

CREATE POLICY "Users can upload reserved social post assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'posts'
);

CREATE POLICY "Users can update reserved social post assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'posts'
);

CREATE POLICY "Users can delete own social post assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'social-posts'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own scan images" ON storage.objects;

CREATE POLICY "Users can view own scan images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can upload own scan images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can update own scan images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'scans'
)
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'scans'
);

CREATE POLICY "Users can delete own scan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'scans'
);

REVOKE INSERT, UPDATE ON public.user_profiles FROM authenticated;

GRANT INSERT (
  id,
  email,
  username,
  avatar_url,
  notification_settings,
  push_token,
  has_seen_tutorial
) ON public.user_profiles TO authenticated;

GRANT UPDATE (
  username,
  avatar_url,
  notification_settings,
  push_token,
  has_seen_tutorial
) ON public.user_profiles TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
