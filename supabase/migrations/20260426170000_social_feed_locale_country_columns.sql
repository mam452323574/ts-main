-- Adds language_code (ISO 639-1 lowercase) and country_code (ISO 3166-1
-- alpha-2 uppercase) on social_posts and user_profiles. Both nullable;
-- legacy rows stay valid and the v3 ranking falls back to a neutral
-- boost when either side is unknown. No index is created: these columns
-- only feed the ORDER BY (additive boosts), never a WHERE filter, so an
-- index would not be used by the planner.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS language_code text NULL,
  ADD COLUMN IF NOT EXISTS country_code text NULL;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS language_code text NULL,
  ADD COLUMN IF NOT EXISTS country_code text NULL;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_language_code_format_check,
  DROP CONSTRAINT IF EXISTS social_posts_country_code_format_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_language_code_format_check
    CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2}$'),
  ADD CONSTRAINT social_posts_country_code_format_check
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_language_code_format_check,
  DROP CONSTRAINT IF EXISTS user_profiles_country_code_format_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_language_code_format_check
    CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2}$'),
  ADD CONSTRAINT user_profiles_country_code_format_check
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

-- Re-grant INSERT and UPDATE on user_profiles with the new columns. The
-- existing grants in 20260407120000_phase1_hardening.sql list explicit
-- columns, so authenticated users would be denied without this re-grant.
GRANT INSERT (
  id,
  email,
  username,
  avatar_url,
  notification_settings,
  push_token,
  has_seen_tutorial,
  language_code,
  country_code
) ON public.user_profiles TO authenticated;

GRANT UPDATE (
  username,
  avatar_url,
  notification_settings,
  push_token,
  has_seen_tutorial,
  language_code,
  country_code
) ON public.user_profiles TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
