ALTER TABLE public.scan_metrics
  ADD COLUMN IF NOT EXISTS face_hydration_level integer,
  ADD COLUMN IF NOT EXISTS face_collagen_level integer,
  ADD COLUMN IF NOT EXISTS body_posture_score integer,
  ADD COLUMN IF NOT EXISTS body_symmetry_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_carbs_grams integer,
  ADD COLUMN IF NOT EXISTS nutrition_fat_grams integer;

UPDATE public.scan_metrics AS metrics
SET
  face_hydration_level = CASE
    WHEN metrics.face_hydration_level IS NOT NULL THEN metrics.face_hydration_level
    WHEN (scans.analysis_result ->> 'hydration_level') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'hydration_level')::numeric)::integer
    ELSE NULL
  END,
  face_collagen_level = CASE
    WHEN metrics.face_collagen_level IS NOT NULL THEN metrics.face_collagen_level
    WHEN (scans.analysis_result ->> 'collagen_level') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'collagen_level')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'face'
  AND scans.analysis_result IS NOT NULL;

UPDATE public.scan_metrics AS metrics
SET
  body_posture_score = CASE
    WHEN metrics.body_posture_score IS NOT NULL THEN metrics.body_posture_score
    WHEN (scans.analysis_result ->> 'posture_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'posture_score')::numeric)::integer
    ELSE NULL
  END,
  body_symmetry_score = CASE
    WHEN metrics.body_symmetry_score IS NOT NULL THEN metrics.body_symmetry_score
    WHEN (scans.analysis_result ->> 'body_symmetry') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'body_symmetry')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'body'
  AND scans.analysis_result IS NOT NULL;

UPDATE public.scan_metrics AS metrics
SET
  nutrition_carbs_grams = CASE
    WHEN metrics.nutrition_carbs_grams IS NOT NULL THEN metrics.nutrition_carbs_grams
    WHEN (scans.analysis_result ->> 'carbs_grams') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'carbs_grams')::numeric)::integer
    ELSE NULL
  END,
  nutrition_fat_grams = CASE
    WHEN metrics.nutrition_fat_grams IS NOT NULL THEN metrics.nutrition_fat_grams
    WHEN (scans.analysis_result ->> 'fat_grams') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'fat_grams')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'nutrition'
  AND scans.analysis_result IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
