ALTER TABLE public.scan_metrics
  ADD COLUMN IF NOT EXISTS face_skin_clarity_score integer,
  ADD COLUMN IF NOT EXISTS face_under_eye_shadow_score integer,
  ADD COLUMN IF NOT EXISTS face_under_eye_volume_score integer,
  ADD COLUMN IF NOT EXISTS face_eye_openness_score integer,
  ADD COLUMN IF NOT EXISTS face_complexion_redness_score integer,
  ADD COLUMN IF NOT EXISTS body_muscle_definition_score integer,
  ADD COLUMN IF NOT EXISTS body_midsection_definition_score integer,
  ADD COLUMN IF NOT EXISTS body_shoulder_alignment_score integer,
  ADD COLUMN IF NOT EXISTS body_recovery_readiness_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_fiber_grams_estimate integer,
  ADD COLUMN IF NOT EXISTS nutrition_sugar_grams_estimate integer,
  ADD COLUMN IF NOT EXISTS nutrition_processing_level_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_hydration_contribution_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_sodium_level_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_meal_balance_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_inflammation_index_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_meal_type_key text,
  ADD COLUMN IF NOT EXISTS nutrition_portion_size_key text;

-- Backfill FACE extended metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  face_skin_clarity_score = CASE
    WHEN metrics.face_skin_clarity_score IS NOT NULL THEN metrics.face_skin_clarity_score
    WHEN (scans.analysis_result ->> 'skin_clarity_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'skin_clarity_score')::numeric)::integer
    ELSE NULL
  END,
  face_under_eye_shadow_score = CASE
    WHEN metrics.face_under_eye_shadow_score IS NOT NULL THEN metrics.face_under_eye_shadow_score
    WHEN (scans.analysis_result ->> 'under_eye_shadow_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'under_eye_shadow_score')::numeric)::integer
    ELSE NULL
  END,
  face_under_eye_volume_score = CASE
    WHEN metrics.face_under_eye_volume_score IS NOT NULL THEN metrics.face_under_eye_volume_score
    WHEN (scans.analysis_result ->> 'under_eye_volume_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'under_eye_volume_score')::numeric)::integer
    ELSE NULL
  END,
  face_eye_openness_score = CASE
    WHEN metrics.face_eye_openness_score IS NOT NULL THEN metrics.face_eye_openness_score
    WHEN (scans.analysis_result ->> 'eye_openness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'eye_openness_score')::numeric)::integer
    ELSE NULL
  END,
  face_complexion_redness_score = CASE
    WHEN metrics.face_complexion_redness_score IS NOT NULL THEN metrics.face_complexion_redness_score
    WHEN (scans.analysis_result ->> 'complexion_redness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'complexion_redness_score')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'face'
  AND scans.analysis_result IS NOT NULL;

-- Backfill BODY extended metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  body_muscle_definition_score = CASE
    WHEN metrics.body_muscle_definition_score IS NOT NULL THEN metrics.body_muscle_definition_score
    WHEN (scans.analysis_result ->> 'muscle_definition_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'muscle_definition_score')::numeric)::integer
    ELSE NULL
  END,
  body_midsection_definition_score = CASE
    WHEN metrics.body_midsection_definition_score IS NOT NULL THEN metrics.body_midsection_definition_score
    WHEN (scans.analysis_result ->> 'midsection_definition_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'midsection_definition_score')::numeric)::integer
    ELSE NULL
  END,
  body_shoulder_alignment_score = CASE
    WHEN metrics.body_shoulder_alignment_score IS NOT NULL THEN metrics.body_shoulder_alignment_score
    WHEN (scans.analysis_result ->> 'shoulder_alignment_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'shoulder_alignment_score')::numeric)::integer
    ELSE NULL
  END,
  body_recovery_readiness_score = CASE
    WHEN metrics.body_recovery_readiness_score IS NOT NULL THEN metrics.body_recovery_readiness_score
    WHEN (scans.analysis_result ->> 'recovery_readiness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'recovery_readiness_score')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'body'
  AND scans.analysis_result IS NOT NULL;

-- Backfill NUTRITION extended metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  nutrition_fiber_grams_estimate = CASE
    WHEN metrics.nutrition_fiber_grams_estimate IS NOT NULL THEN metrics.nutrition_fiber_grams_estimate
    WHEN (scans.analysis_result ->> 'fiber_grams_estimate') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'fiber_grams_estimate')::numeric)::integer
    ELSE NULL
  END,
  nutrition_sugar_grams_estimate = CASE
    WHEN metrics.nutrition_sugar_grams_estimate IS NOT NULL THEN metrics.nutrition_sugar_grams_estimate
    WHEN (scans.analysis_result ->> 'sugar_grams_estimate') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'sugar_grams_estimate')::numeric)::integer
    ELSE NULL
  END,
  nutrition_processing_level_score = CASE
    WHEN metrics.nutrition_processing_level_score IS NOT NULL THEN metrics.nutrition_processing_level_score
    WHEN (scans.analysis_result ->> 'processing_level_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'processing_level_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_hydration_contribution_score = CASE
    WHEN metrics.nutrition_hydration_contribution_score IS NOT NULL THEN metrics.nutrition_hydration_contribution_score
    WHEN (scans.analysis_result ->> 'hydration_contribution_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'hydration_contribution_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_sodium_level_score = CASE
    WHEN metrics.nutrition_sodium_level_score IS NOT NULL THEN metrics.nutrition_sodium_level_score
    WHEN (scans.analysis_result ->> 'sodium_level_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'sodium_level_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_meal_balance_score = CASE
    WHEN metrics.nutrition_meal_balance_score IS NOT NULL THEN metrics.nutrition_meal_balance_score
    WHEN (scans.analysis_result ->> 'meal_balance_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'meal_balance_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_inflammation_index_score = CASE
    WHEN metrics.nutrition_inflammation_index_score IS NOT NULL THEN metrics.nutrition_inflammation_index_score
    WHEN (scans.analysis_result ->> 'inflammation_index_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'inflammation_index_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_meal_type_key = CASE
    WHEN metrics.nutrition_meal_type_key IS NOT NULL THEN metrics.nutrition_meal_type_key
    WHEN (scans.analysis_result ->> 'meal_type_key') IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'other')
      THEN scans.analysis_result ->> 'meal_type_key'
    ELSE NULL
  END,
  nutrition_portion_size_key = CASE
    WHEN metrics.nutrition_portion_size_key IS NOT NULL THEN metrics.nutrition_portion_size_key
    WHEN (scans.analysis_result ->> 'portion_size_key') IN ('small', 'medium', 'large', 'oversized')
      THEN scans.analysis_result ->> 'portion_size_key'
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'nutrition'
  AND scans.analysis_result IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
