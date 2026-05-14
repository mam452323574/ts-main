/**
 * Premium Fields Configuration
 * Defines which result fields are teased but locked for free users.
 */

export type PremiumGatedScanType = 'body' | 'face' | 'nutrition';

export const PREMIUM_LOCKED_FIELDS: Record<PremiumGatedScanType, string[]> = {
  body: [
    'strength_index',
    'metabolic_age',
    'body_fat_percentage',
    'posture_score',
    'body_symmetry',
    'muscle_definition_score',
    'midsection_definition_score',
    'shoulder_alignment_score',
    'recovery_readiness_score',
    'upper_body_definition_score',
    'lower_body_definition_score',
    'arm_definition_score',
    'v_taper_score',
    'body_tension_indicator_score',
  ],
  face: [
    'fatigue_level',
    'photogenic_score',
    'skin_quality_score',
    'energy_score',
    'collagen_level',
    'skin_clarity_score',
    'skin_evenness_score',
    'under_eye_shadow_score',
    'under_eye_volume_score',
    'eye_openness_score',
    'complexion_redness_score',
    'pore_visibility_score',
    'skin_radiance_score',
    'lip_dryness_score',
    'forehead_smoothness_score',
    't_zone_oiliness_score',
    'perceived_stress_level',
    'perceived_sleep_quality',
  ],
  nutrition: [
    'protein_grams',
    'carbs_grams',
    'fat_grams',
    'satiety_index',
    'glycemic_index_label',
    'glycemic_index_key',
    'main_vitamins',
    'main_vitamin_keys',
    'micronutrients',
    'nutrition_points',
    'recommendations',
    'dietary_details',
    'plate_analysis',
    'estimated_composition',
    'fiber_grams_estimate',
    'sugar_grams_estimate',
    'processing_level_score',
    'hydration_contribution_score',
    'sodium_level_score',
    'meal_balance_score',
    'inflammation_index_score',
    'color_diversity_score',
    'vegetable_portion_ratio',
    'protein_visibility_score',
    'whole_grain_indicator_score',
    'meal_freshness_score',
  ],
};

export const PREMIUM_LOCKED_SUPER_SCAN_FIELDS = [
  'condition_probability',
  'condition_explanation',
  'condition_advice',
  'fat_distribution_primary_metrics',
  'fat_distribution_priority_zones',
  'fat_distribution_area_details',
] as const;

export const PREMIUM_LOCKED_FRIDGE_SECTIONS = [
  'why',
  'ingredients',
  'nutrition',
  'preparation',
  'advice',
  'additions',
  'substitutions',
  'caution',
] as const;

/**
 * Check if a specific field should be locked for the current user.
 */
export const isFieldLocked = (
  scanType: PremiumGatedScanType,
  fieldKey: string,
  isPremium: boolean,
): boolean => {
  if (isPremium) {
    return false;
  }

  return PREMIUM_LOCKED_FIELDS[scanType]?.includes(fieldKey) ?? false;
};
