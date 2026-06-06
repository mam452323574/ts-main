// Defense-in-depth scan result tier-gating.
//
// Free accounts never receive the premium numeric scores in the immediate
// analyze-scan response. The full payload still lives in the database (so
// premium coach context, analytics, and history-on-upgrade keep working);
// only the response payload is filtered.
//
// IMPORTANT: keep the field lists below in sync with
// `constants/premiumFields.ts` (PREMIUM_LOCKED_FIELDS) in the app — a
// coherence test mirrors both lists.

export type ScanResultTier = 'free' | 'premium' | 'admin';

// NOTE — Rééquilibrage produit 2026-05-27 : six métriques sont désormais
// ouvertes en gratuit avec leur valeur chiffrée (au lieu d'un simple label
// qualitatif "Élevée/Modérée/Faible") :
//   face   : fatigue_level, skin_clarity_score, skin_evenness_score,
//            under_eye_shadow_score
//   body   : recovery_readiness_score
//   nutrition : meal_balance_score
// Ces champs ne sont plus stripés ici et ne figurent plus dans
// `PREMIUM_LOCKED_FIELDS` côté client (cf. `constants/premiumFields.ts`).
const PREMIUM_LOCKED_FIELDS_FACE: readonly string[] = [
  'photogenic_score',
  'skin_quality_score',
  'energy_score',
  'collagen_level',
  'under_eye_volume_score',
  'eye_openness_score',
  'complexion_redness_score',
  'pore_visibility_score',
  'lip_dryness_score',
  'forehead_smoothness_score',
  't_zone_oiliness_score',
  'perceived_stress_level',
  'perceived_sleep_quality',
];

const PREMIUM_LOCKED_FIELDS_BODY: readonly string[] = [
  'strength_index',
  'metabolic_age',
  'body_fat_percentage',
  'body_symmetry',
  'muscle_definition_score',
  'midsection_definition_score',
  'shoulder_alignment_score',
  'upper_body_definition_score',
  'lower_body_definition_score',
  'arm_definition_score',
  'v_taper_score',
  'body_tension_indicator_score',
];

const PREMIUM_LOCKED_FIELDS_NUTRITION: readonly string[] = [
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
  'inflammation_index_score',
  'color_diversity_score',
  'vegetable_portion_ratio',
  'protein_visibility_score',
  'whole_grain_indicator_score',
  'meal_freshness_score',
];

const PREMIUM_LOCKED_FIELDS_SUPER: readonly string[] = [
  'condition_probability',
  'condition_explanation',
  'condition_advice',
  'fat_distribution_primary_metrics',
  'fat_distribution_priority_zones',
  'fat_distribution_area_details',
];

export function isPremiumTier(
  tier: ScanResultTier | string | null | undefined,
): boolean {
  return tier === 'premium' || tier === 'admin';
}

export function resolveTierFromProfile(value: unknown): ScanResultTier {
  if (value === 'premium' || value === 'admin') {
    return value;
  }
  return 'free';
}

function getLockedFieldsForType(scanType: string | null | undefined): readonly string[] {
  if (scanType === 'face' || scanType === 'health') {
    return PREMIUM_LOCKED_FIELDS_FACE;
  }
  if (scanType === 'body') {
    return PREMIUM_LOCKED_FIELDS_BODY;
  }
  if (scanType === 'nutrition') {
    return PREMIUM_LOCKED_FIELDS_NUTRITION;
  }
  if (
    scanType === 'super' ||
    scanType === 'super_health_v2' ||
    scanType === 'fat_distribution_scan_v2'
  ) {
    return PREMIUM_LOCKED_FIELDS_SUPER;
  }
  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function omitFields<T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): T {
  let changed = false;
  const next: Record<string, unknown> = { ...record };
  for (const key of keys) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return (changed ? (next as T) : record);
}

/**
 * Strip premium-locked fields from a scan analysis result when the requested
 * tier is `free`. Premium and admin tiers receive the input unchanged.
 *
 * Returns the original value unchanged when:
 *   - tier is premium/admin
 *   - input is null/undefined/non-object
 *   - the resolved scan_type has no premium-locked fields registered
 */
export function sanitizeScanAnalysisResultForTier(
  analysisResult: unknown,
  tier: ScanResultTier | string | null | undefined,
  scanTypeHint?: string | null,
): unknown {
  if (isPremiumTier(tier)) {
    return analysisResult;
  }
  if (!isPlainObject(analysisResult)) {
    return analysisResult;
  }

  const resolvedScanType =
    (typeof scanTypeHint === 'string' && scanTypeHint.length > 0
      ? scanTypeHint
      : typeof analysisResult.scan_type === 'string'
        ? (analysisResult.scan_type as string)
        : null) ?? null;

  const locked = getLockedFieldsForType(resolvedScanType);
  if (locked.length === 0) {
    return analysisResult;
  }

  return omitFields(analysisResult, locked);
}

/**
 * Apply tier-gating to a Scan row (with `analysis_result`). When the tier is
 * `free`, the analysis_result is filtered to drop premium-locked fields.
 *
 * Returns a shallow-cloned scan only when the analysis_result was modified;
 * otherwise the original reference is returned untouched.
 */
export function sanitizeScanForTier<
  T extends { scan_type?: unknown; analysis_result?: unknown },
>(scan: T, tier: ScanResultTier | string | null | undefined): T {
  if (isPremiumTier(tier)) {
    return scan;
  }
  if (!scan || typeof scan !== 'object') {
    return scan;
  }

  const result = scan.analysis_result;
  if (!isPlainObject(result)) {
    return scan;
  }

  const scanTypeHint =
    typeof scan.scan_type === 'string' && scan.scan_type.length > 0
      ? (scan.scan_type as string)
      : null;
  const sanitized = sanitizeScanAnalysisResultForTier(result, tier, scanTypeHint);

  if (sanitized === result) {
    return scan;
  }

  return { ...scan, analysis_result: sanitized };
}

export const PREMIUM_LOCKED_FIELDS_BY_SCAN_TYPE = {
  face: PREMIUM_LOCKED_FIELDS_FACE,
  body: PREMIUM_LOCKED_FIELDS_BODY,
  nutrition: PREMIUM_LOCKED_FIELDS_NUTRITION,
  super: PREMIUM_LOCKED_FIELDS_SUPER,
} as const;
