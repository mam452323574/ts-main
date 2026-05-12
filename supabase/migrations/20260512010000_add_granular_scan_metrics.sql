ALTER TABLE public.scan_metrics
  ADD COLUMN IF NOT EXISTS face_pore_visibility_score integer,
  ADD COLUMN IF NOT EXISTS face_skin_evenness_score integer,
  ADD COLUMN IF NOT EXISTS face_skin_radiance_score integer,
  ADD COLUMN IF NOT EXISTS face_lip_dryness_score integer,
  ADD COLUMN IF NOT EXISTS face_forehead_smoothness_score integer,
  ADD COLUMN IF NOT EXISTS face_t_zone_oiliness_score integer,
  ADD COLUMN IF NOT EXISTS body_upper_body_definition_score integer,
  ADD COLUMN IF NOT EXISTS body_lower_body_definition_score integer,
  ADD COLUMN IF NOT EXISTS body_arm_definition_score integer,
  ADD COLUMN IF NOT EXISTS body_v_taper_score integer,
  ADD COLUMN IF NOT EXISTS body_tension_indicator_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_color_diversity_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_vegetable_portion_ratio integer,
  ADD COLUMN IF NOT EXISTS nutrition_protein_visibility_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_whole_grain_indicator_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_meal_freshness_score integer,
  ADD COLUMN IF NOT EXISTS nutrition_cuisine_type_key text,
  ADD COLUMN IF NOT EXISTS nutrition_meat_type_key text,
  ADD COLUMN IF NOT EXISTS nutrition_cooking_method_key text;

-- Backfill FACE granular metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  face_pore_visibility_score = CASE
    WHEN metrics.face_pore_visibility_score IS NOT NULL THEN metrics.face_pore_visibility_score
    WHEN (scans.analysis_result ->> 'pore_visibility_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'pore_visibility_score')::numeric)::integer
    ELSE NULL
  END,
  face_skin_evenness_score = CASE
    WHEN metrics.face_skin_evenness_score IS NOT NULL THEN metrics.face_skin_evenness_score
    WHEN (scans.analysis_result ->> 'skin_evenness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'skin_evenness_score')::numeric)::integer
    ELSE NULL
  END,
  face_skin_radiance_score = CASE
    WHEN metrics.face_skin_radiance_score IS NOT NULL THEN metrics.face_skin_radiance_score
    WHEN (scans.analysis_result ->> 'skin_radiance_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'skin_radiance_score')::numeric)::integer
    ELSE NULL
  END,
  face_lip_dryness_score = CASE
    WHEN metrics.face_lip_dryness_score IS NOT NULL THEN metrics.face_lip_dryness_score
    WHEN (scans.analysis_result ->> 'lip_dryness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'lip_dryness_score')::numeric)::integer
    ELSE NULL
  END,
  face_forehead_smoothness_score = CASE
    WHEN metrics.face_forehead_smoothness_score IS NOT NULL THEN metrics.face_forehead_smoothness_score
    WHEN (scans.analysis_result ->> 'forehead_smoothness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'forehead_smoothness_score')::numeric)::integer
    ELSE NULL
  END,
  face_t_zone_oiliness_score = CASE
    WHEN metrics.face_t_zone_oiliness_score IS NOT NULL THEN metrics.face_t_zone_oiliness_score
    WHEN (scans.analysis_result ->> 't_zone_oiliness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 't_zone_oiliness_score')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'face'
  AND scans.analysis_result IS NOT NULL;

-- Backfill BODY granular metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  body_upper_body_definition_score = CASE
    WHEN metrics.body_upper_body_definition_score IS NOT NULL THEN metrics.body_upper_body_definition_score
    WHEN (scans.analysis_result ->> 'upper_body_definition_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'upper_body_definition_score')::numeric)::integer
    ELSE NULL
  END,
  body_lower_body_definition_score = CASE
    WHEN metrics.body_lower_body_definition_score IS NOT NULL THEN metrics.body_lower_body_definition_score
    WHEN (scans.analysis_result ->> 'lower_body_definition_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'lower_body_definition_score')::numeric)::integer
    ELSE NULL
  END,
  body_arm_definition_score = CASE
    WHEN metrics.body_arm_definition_score IS NOT NULL THEN metrics.body_arm_definition_score
    WHEN (scans.analysis_result ->> 'arm_definition_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'arm_definition_score')::numeric)::integer
    ELSE NULL
  END,
  body_v_taper_score = CASE
    WHEN metrics.body_v_taper_score IS NOT NULL THEN metrics.body_v_taper_score
    WHEN (scans.analysis_result ->> 'v_taper_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'v_taper_score')::numeric)::integer
    ELSE NULL
  END,
  body_tension_indicator_score = CASE
    WHEN metrics.body_tension_indicator_score IS NOT NULL THEN metrics.body_tension_indicator_score
    WHEN (scans.analysis_result ->> 'body_tension_indicator_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'body_tension_indicator_score')::numeric)::integer
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'body'
  AND scans.analysis_result IS NOT NULL;

-- Backfill NUTRITION granular metrics from analysis_result JSON
UPDATE public.scan_metrics AS metrics
SET
  nutrition_color_diversity_score = CASE
    WHEN metrics.nutrition_color_diversity_score IS NOT NULL THEN metrics.nutrition_color_diversity_score
    WHEN (scans.analysis_result ->> 'color_diversity_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'color_diversity_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_vegetable_portion_ratio = CASE
    WHEN metrics.nutrition_vegetable_portion_ratio IS NOT NULL THEN metrics.nutrition_vegetable_portion_ratio
    WHEN (scans.analysis_result ->> 'vegetable_portion_ratio') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'vegetable_portion_ratio')::numeric)::integer
    ELSE NULL
  END,
  nutrition_protein_visibility_score = CASE
    WHEN metrics.nutrition_protein_visibility_score IS NOT NULL THEN metrics.nutrition_protein_visibility_score
    WHEN (scans.analysis_result ->> 'protein_visibility_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'protein_visibility_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_whole_grain_indicator_score = CASE
    WHEN metrics.nutrition_whole_grain_indicator_score IS NOT NULL THEN metrics.nutrition_whole_grain_indicator_score
    WHEN (scans.analysis_result ->> 'whole_grain_indicator_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'whole_grain_indicator_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_meal_freshness_score = CASE
    WHEN metrics.nutrition_meal_freshness_score IS NOT NULL THEN metrics.nutrition_meal_freshness_score
    WHEN (scans.analysis_result ->> 'meal_freshness_score') ~ '^-?\d+(\.\d+)?$'
      THEN round((scans.analysis_result ->> 'meal_freshness_score')::numeric)::integer
    ELSE NULL
  END,
  nutrition_cuisine_type_key = CASE
    WHEN metrics.nutrition_cuisine_type_key IS NOT NULL THEN metrics.nutrition_cuisine_type_key
    WHEN (scans.analysis_result ->> 'cuisine_type_key') IN ('mediterranean', 'asian', 'western', 'middle_eastern', 'latin', 'african', 'mixed', 'other')
      THEN scans.analysis_result ->> 'cuisine_type_key'
    ELSE NULL
  END,
  nutrition_meat_type_key = CASE
    WHEN metrics.nutrition_meat_type_key IS NOT NULL THEN metrics.nutrition_meat_type_key
    WHEN (scans.analysis_result ->> 'meat_type_key') IN ('red_meat', 'poultry', 'fish', 'seafood', 'plant_protein', 'dairy', 'none')
      THEN scans.analysis_result ->> 'meat_type_key'
    ELSE NULL
  END,
  nutrition_cooking_method_key = CASE
    WHEN metrics.nutrition_cooking_method_key IS NOT NULL THEN metrics.nutrition_cooking_method_key
    WHEN (scans.analysis_result ->> 'cooking_method_key') IN ('fried', 'baked', 'grilled', 'raw', 'steamed', 'boiled', 'sauteed', 'other')
      THEN scans.analysis_result ->> 'cooking_method_key'
    ELSE NULL
  END
FROM public.scans
WHERE scans.id = metrics.scan_id
  AND metrics.scan_type = 'nutrition'
  AND scans.analysis_result IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
