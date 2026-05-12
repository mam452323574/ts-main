ALTER TABLE public.scan_metrics
  -- FACE persona inference
  ADD COLUMN IF NOT EXISTS face_perceived_sex_key text,
  ADD COLUMN IF NOT EXISTS face_perceived_age_range_key text,
  ADD COLUMN IF NOT EXISTS face_perceived_stress_level integer,
  ADD COLUMN IF NOT EXISTS face_perceived_sleep_quality integer,
  ADD COLUMN IF NOT EXISTS face_cycle_phase_hint_key text,
  -- BODY persona inference
  ADD COLUMN IF NOT EXISTS body_perceived_sex_key text,
  ADD COLUMN IF NOT EXISTS body_perceived_age_range_key text,
  ADD COLUMN IF NOT EXISTS body_estimated_height_range_key text,
  ADD COLUMN IF NOT EXISTS body_estimated_weight_range_key text,
  ADD COLUMN IF NOT EXISTS body_frame_key text,
  ADD COLUMN IF NOT EXISTS body_perceived_fitness_level_key text,
  -- NUTRITION persona inference
  ADD COLUMN IF NOT EXISTS nutrition_meal_dietary_pattern_key text,
  ADD COLUMN IF NOT EXISTS nutrition_allergen_visibility_keys text[];

-- Backfill FACE persona fields
UPDATE public.scan_metrics AS metrics
SET
  face_perceived_sex_key = CASE
    WHEN metrics.face_perceived_sex_key IS NOT NULL THEN metrics.face_perceived_sex_key
    WHEN (scans.analysis_result ->> 'perceived_sex_key') IN ('male_presenting', 'female_presenting', 'neutral_or_unclear')
      THEN scans.analysis_result ->> 'perceived_sex_key'
    ELSE NULL
  END,
  face_perceived_age_range_key = CASE
    WHEN metrics.face_perceived_age_range_key IS NOT NULL THEN metrics.face_perceived_age_range_key
    WHEN (scans.analysis_result ->> 'perceived_age_range_key') IN ('under_18', '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus')
      THEN scans.analysis_result ->> 'perceived_age_range_key'
    ELSE NULL
  END,
  face_perceived_stress_level = CASE
    WHEN metrics.face_perceived_stress_level IS NOT NULL THEN metrics.face_perceived_stress_level
    WHEN (scans.analysis_result ->> 'perceived_stress_level') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'perceived_stress_level')::numeric)::integer
    ELSE NULL
  END,
  face_perceived_sleep_quality = CASE
    WHEN metrics.face_perceived_sleep_quality IS NOT NULL THEN metrics.face_perceived_sleep_quality
    WHEN (scans.analysis_result ->> 'perceived_sleep_quality') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'perceived_sleep_quality')::numeric)::integer
    ELSE NULL
  END,
  face_cycle_phase_hint_key = CASE
    WHEN metrics.face_cycle_phase_hint_key IS NOT NULL THEN metrics.face_cycle_phase_hint_key
    WHEN (scans.analysis_result ->> 'cycle_phase_hint_key') IN ('neutral', 'premenstrual_hint', 'menstrual_hint')
      THEN scans.analysis_result ->> 'cycle_phase_hint_key'
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'face'
  AND scans.analysis_result IS NOT NULL;

-- Backfill BODY persona fields
UPDATE public.scan_metrics AS metrics
SET
  body_perceived_sex_key = CASE
    WHEN metrics.body_perceived_sex_key IS NOT NULL THEN metrics.body_perceived_sex_key
    WHEN (scans.analysis_result ->> 'perceived_sex_key') IN ('male_presenting', 'female_presenting', 'neutral_or_unclear')
      THEN scans.analysis_result ->> 'perceived_sex_key'
    ELSE NULL
  END,
  body_perceived_age_range_key = CASE
    WHEN metrics.body_perceived_age_range_key IS NOT NULL THEN metrics.body_perceived_age_range_key
    WHEN (scans.analysis_result ->> 'perceived_age_range_key') IN ('under_18', '18_24', '25_34', '35_44', '45_54', '55_64', '65_plus')
      THEN scans.analysis_result ->> 'perceived_age_range_key'
    ELSE NULL
  END,
  body_estimated_height_range_key = CASE
    WHEN metrics.body_estimated_height_range_key IS NOT NULL THEN metrics.body_estimated_height_range_key
    WHEN (scans.analysis_result ->> 'estimated_height_range_key') IN ('under_150cm', '150_160cm', '160_170cm', '170_180cm', '180_190cm', '190_plus')
      THEN scans.analysis_result ->> 'estimated_height_range_key'
    ELSE NULL
  END,
  body_estimated_weight_range_key = CASE
    WHEN metrics.body_estimated_weight_range_key IS NOT NULL THEN metrics.body_estimated_weight_range_key
    WHEN (scans.analysis_result ->> 'estimated_weight_range_key') IN ('under_50kg', '50_60kg', '60_70kg', '70_80kg', '80_90kg', '90_100kg', '100_plus')
      THEN scans.analysis_result ->> 'estimated_weight_range_key'
    ELSE NULL
  END,
  body_frame_key = CASE
    WHEN metrics.body_frame_key IS NOT NULL THEN metrics.body_frame_key
    WHEN (scans.analysis_result ->> 'body_frame_key') IN ('small', 'medium', 'large')
      THEN scans.analysis_result ->> 'body_frame_key'
    ELSE NULL
  END,
  body_perceived_fitness_level_key = CASE
    WHEN metrics.body_perceived_fitness_level_key IS NOT NULL THEN metrics.body_perceived_fitness_level_key
    WHEN (scans.analysis_result ->> 'perceived_fitness_level_key') IN ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'athletic')
      THEN scans.analysis_result ->> 'perceived_fitness_level_key'
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'body'
  AND scans.analysis_result IS NOT NULL;

-- Backfill NUTRITION persona fields
UPDATE public.scan_metrics AS metrics
SET
  nutrition_meal_dietary_pattern_key = CASE
    WHEN metrics.nutrition_meal_dietary_pattern_key IS NOT NULL THEN metrics.nutrition_meal_dietary_pattern_key
    WHEN (scans.analysis_result ->> 'meal_dietary_pattern_key') IN ('omnivore', 'vegetarian_compatible', 'vegan_compatible', 'pescetarian_compatible', 'keto_compatible', 'mediterranean_compatible', 'unclear')
      THEN scans.analysis_result ->> 'meal_dietary_pattern_key'
    ELSE NULL
  END,
  nutrition_allergen_visibility_keys = CASE
    WHEN metrics.nutrition_allergen_visibility_keys IS NOT NULL THEN metrics.nutrition_allergen_visibility_keys
    WHEN jsonb_typeof(scans.analysis_result -> 'allergen_visibility_keys') = 'array'
      THEN ARRAY(
        SELECT allergen_key
        FROM jsonb_array_elements_text(scans.analysis_result -> 'allergen_visibility_keys') AS allergen_key
        WHERE allergen_key IN ('gluten_likely', 'dairy_likely', 'nuts_likely', 'shellfish_likely', 'eggs_likely', 'soy_likely', 'seafood_likely')
      )
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'nutrition'
  AND scans.analysis_result IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
