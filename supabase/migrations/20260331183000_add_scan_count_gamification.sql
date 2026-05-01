-- Add persistent scan counter and backend-driven gamification payload

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_profiles'
      AND column_name = 'scan_count'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN scan_count integer DEFAULT 0;
  END IF;
END $$;

ALTER TABLE public.user_profiles
  ALTER COLUMN scan_count SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS tg
    JOIN pg_class AS tbl
      ON tbl.oid = tg.tgrelid
    JOIN pg_namespace AS ns
      ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'user_profiles'
      AND tg.tgname = 'trigger_enforce_email_verified_before_username'
      AND NOT tg.tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE public.user_profiles DISABLE TRIGGER trigger_enforce_email_verified_before_username';
  END IF;
END $$;

UPDATE public.user_profiles
SET scan_count = 0
WHERE scan_count IS NULL;

WITH scan_totals AS (
  SELECT user_id, COUNT(*)::integer AS total_scans
  FROM public.scans
  GROUP BY user_id
)
UPDATE public.user_profiles AS up
SET scan_count = COALESCE(scan_totals.total_scans, 0)
FROM scan_totals
WHERE up.id = scan_totals.user_id;

UPDATE public.user_profiles
SET scan_count = 0
WHERE id NOT IN (
  SELECT DISTINCT user_id
  FROM public.scans
);

ALTER TABLE public.user_profiles
  ALTER COLUMN scan_count SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger AS tg
    JOIN pg_class AS tbl
      ON tbl.oid = tg.tgrelid
    JOIN pg_namespace AS ns
      ON ns.oid = tbl.relnamespace
    WHERE ns.nspname = 'public'
      AND tbl.relname = 'user_profiles'
      AND tg.tgname = 'trigger_enforce_email_verified_before_username'
      AND NOT tg.tgisinternal
  ) THEN
    EXECUTE 'ALTER TABLE public.user_profiles ENABLE TRIGGER trigger_enforce_email_verified_before_username';
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gamification-assets',
  'gamification-assets',
  true,
  10485760,
  ARRAY['image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png', 'image/gif', 'image/webp'];

DROP POLICY IF EXISTS "Anyone can view gamification assets" ON storage.objects;

CREATE POLICY "Anyone can view gamification assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'gamification-assets');

CREATE OR REPLACE FUNCTION public.increment_user_scan_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.user_profiles
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_user_scan_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.user_profiles
  SET scan_count = GREATEST(COALESCE(scan_count, 0) - 1, 0)
  WHERE id = OLD.user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_user_scan_count ON public.scans;
CREATE TRIGGER trigger_increment_user_scan_count
  AFTER INSERT ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_user_scan_count();

DROP TRIGGER IF EXISTS trigger_decrement_user_scan_count ON public.scans;
CREATE TRIGGER trigger_decrement_user_scan_count
  AFTER DELETE ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_user_scan_count();

CREATE OR REPLACE FUNCTION public.construct_gamification_asset_url(p_filename text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_filename IS NULL OR p_filename = '' THEN
    RETURN NULL;
  END IF;

  RETURN format(
    '%s/storage/v1/object/public/gamification-assets/%s',
    current_setting('app.settings.supabase_url', true),
    p_filename
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_gamification_state()
RETURNS TABLE (
  scan_count integer,
  mascot_stage integer,
  mascot_filename text,
  mascot_image_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH current_profile AS (
    SELECT COALESCE(
      (
        SELECT up.scan_count
        FROM public.user_profiles AS up
        WHERE up.id = auth.uid()
      ),
      0
    )::integer AS scan_count
  ),
  resolved_state AS (
    SELECT
      scan_count,
      CASE
        WHEN scan_count <= 0 THEN 0
        WHEN scan_count BETWEEN 1 AND 2 THEN 1
        WHEN scan_count BETWEEN 3 AND 4 THEN 2
        WHEN scan_count BETWEEN 5 AND 9 THEN 3
        WHEN scan_count BETWEEN 10 AND 19 THEN 4
        WHEN scan_count BETWEEN 20 AND 29 THEN 5
        WHEN scan_count BETWEEN 30 AND 49 THEN 6
        WHEN scan_count BETWEEN 50 AND 99 THEN 7
        WHEN scan_count BETWEEN 100 AND 149 THEN 8
        WHEN scan_count BETWEEN 150 AND 199 THEN 9
        ELSE 10
      END AS mascot_stage,
      CASE
        WHEN scan_count <= 0 THEN 'image_vide.png'
        WHEN scan_count BETWEEN 1 AND 2 THEN 'stade_1.gif'
        WHEN scan_count BETWEEN 3 AND 4 THEN 'stade_2.gif'
        WHEN scan_count BETWEEN 5 AND 9 THEN 'stade_3.gif'
        WHEN scan_count BETWEEN 10 AND 19 THEN 'stade_4.gif'
        WHEN scan_count BETWEEN 20 AND 29 THEN 'stade_5.gif'
        WHEN scan_count BETWEEN 30 AND 49 THEN 'stade_6.gif'
        WHEN scan_count BETWEEN 50 AND 99 THEN 'stade_7.gif'
        WHEN scan_count BETWEEN 100 AND 149 THEN 'stade_8.gif'
        WHEN scan_count BETWEEN 150 AND 199 THEN 'stade_9.gif'
        ELSE 'stade_10.gif'
      END AS mascot_filename
    FROM current_profile
  )
  SELECT
    scan_count,
    mascot_stage,
    mascot_filename,
    public.construct_gamification_asset_url(mascot_filename) AS mascot_image_url
  FROM resolved_state;
$$;

GRANT EXECUTE ON FUNCTION public.construct_gamification_asset_url(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_gamification_state() TO authenticated;
