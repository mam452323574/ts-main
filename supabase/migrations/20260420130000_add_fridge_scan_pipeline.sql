CREATE TABLE IF NOT EXISTS public.fridge_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  source text NOT NULL,
  image_path text,
  locale text NOT NULL DEFAULT 'fr',
  client_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_payload jsonb,
  webhook_status integer,
  meal_result jsonb,
  error_code text,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fridge_scans_status_check CHECK (
    status IN ('queued', 'processed', 'failed')
  ),
  CONSTRAINT fridge_scans_source_check CHECK (
    source IN ('camera', 'gallery')
  ),
  CONSTRAINT fridge_scans_locale_not_empty CHECK (length(btrim(locale)) > 0)
);

ALTER TABLE public.fridge_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own fridge scans" ON public.fridge_scans;
CREATE POLICY "Users can view own fridge scans"
ON public.fridge_scans FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS phase2_set_fridge_scans_updated_at ON public.fridge_scans;
CREATE TRIGGER phase2_set_fridge_scans_updated_at
  BEFORE UPDATE ON public.fridge_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.phase2_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_fridge_scans_user_created_at
  ON public.fridge_scans(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fridge_scans_status_created_at
  ON public.fridge_scans(status, created_at DESC);

DROP POLICY IF EXISTS "Users can view own fridge scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own fridge scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own fridge scan images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own fridge scan images" ON storage.objects;

CREATE POLICY "Users can view own fridge scan images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'fridge-scans'
);

CREATE POLICY "Users can upload own fridge scan images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'fridge-scans'
);

CREATE POLICY "Users can update own fridge scan images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'fridge-scans'
)
WITH CHECK (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'fridge-scans'
);

CREATE POLICY "Users can delete own fridge scan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'scan-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'fridge-scans'
);

GRANT SELECT ON public.fridge_scans TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
