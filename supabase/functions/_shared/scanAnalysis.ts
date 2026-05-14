import { Phase2HttpError } from './phase2Errors.ts';
import { isRecord } from './phase2Utils.ts';
import {
  getProviderScanType,
  type AppScanType,
  type ProviderScanType,
} from '../../../shared/scanContract.ts';
export {
  normalizeScanAnalysisLanguage,
  resolveScanAnalysisLanguageContract,
} from '../../../shared/scanContract.ts';

type SupportedScanType = AppScanType;
type SupportedProviderScanType = ProviderScanType | 'fat_distribution_scan_v2';
const SUPER_SCAN_CONTAINER_FIELDS = ['result', 'data', 'entry'] as const;
const LEGACY_SUPER_SCAN_TYPE = 'super_health_v2' as const;
const FAT_DISTRIBUTION_SCAN_TYPE = 'fat_distribution_scan_v2' as const;
const ACCEPTED_SUPER_PROVIDER_SCAN_TYPES = [
  LEGACY_SUPER_SCAN_TYPE,
  FAT_DISTRIBUTION_SCAN_TYPE,
] as const;
const SUPER_SCAN_CANONICAL_SUMMARY_FIELDS = [
  'analysis_summary',
  'summary_fallback_text',
] as const;
const SUPER_SCAN_TEXT_FIELDS = [
  'analysis',
  'analysis_text',
  'summary',
  'diagnosis',
  'explanation',
  'message',
  'content',
  'output',
  'response',
  'raw_response',
  'ai_text',
  'scan_text',
  'recommendation',
] as const;
const SUPER_SCAN_STATUS_FIELDS = ['status', 'label', 'severity'] as const;
const SUPER_SCAN_DISCLAIMER_FIELDS = [
  'disclaimer_text',
  'disclaimer_fallback_text',
  'disclaimer',
  'medical_disclaimer',
  'notice',
] as const;
const SUPER_SCAN_SCORE_FIELDS = [
  'global_risk_score',
  'globalRiskScore',
  'risk_score',
  'riskScore',
  'score',
] as const;
const SUPER_SCAN_URGENCY_FIELDS = ['urgency_flag', 'urgencyFlag'] as const;
const FAT_DISTRIBUTION_MARKER_NUMBER_FIELDS = [
  'global_body_fat_estimate_percent',
  'global_facial_fat_estimate_percent',
  'global_water_retention_estimate_percent',
] as const;
const FAT_DISTRIBUTION_MARKER_STRING_FIELDS = [
  'dominant_storage_pattern',
] as const;
const FAT_DISTRIBUTION_TOP_LEVEL_STRING_FIELDS = [
  'analysis_summary',
  'dominant_storage_pattern',
  'disclaimer_text',
] as const;
const FAT_DISTRIBUTION_AREA_STRING_FIELDS = [
  'area_name',
  'dominant_type',
  'explanation',
  'actionable_advice',
] as const;
const FAT_DISTRIBUTION_AREA_NUMBER_FIELDS = [
  'subcutaneous_fat_percent',
  'water_retention_percent',
  'definition_percent',
  'confidence',
] as const;
const STANDARD_ANALYSIS_META_LIMITATION_FLAGS = [
  'blur',
  'low_light',
  'partial_subject',
  'occlusion',
  'portion_uncertain',
] as const;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

// S-05 — bornes appliquées au contenu textuel libre venant du provider IA
// (champs non-enum côté `fat_distribution_scan_v2`). Le LLM est une source
// untrusted ; ces limites protègent contre un payload hostile (DoS storage
// JSONB Postgres) et contre les caractères de contrôle injectés dans les
// chaînes (rendu HTML/PDF côté export).
const SCAN_TEXT_MAX_SUMMARY = 4_000;
const SCAN_TEXT_MAX_PARAGRAPH = 2_000;
const SCAN_TEXT_MAX_LABEL = 200;
const SCAN_FAT_AREAS_MAX = 20;
const SCAN_FAT_PRIORITY_ZONES_MAX = 20;
const CONTROL_CHARS_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function sanitizeBoundedText(value: unknown, maxLength: number) {
  const stringValue = readString(value);
  if (!stringValue) {
    return null;
  }

  return stringValue.replace(CONTROL_CHARS_PATTERN, '').slice(0, maxLength);
}

function sanitizeBoundedTextArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .slice(0, maxItems)
    .map((item) => sanitizeBoundedText(item, maxLength))
    .filter((item): item is string => item !== null);
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsedNumber = Number(value);
    return Number.isFinite(parsedNumber) ? parsedNumber : null;
  }

  return null;
}

function collectScanPayloadCandidates(payload: Record<string, unknown>) {
  const queue: Record<string, unknown>[] = [payload];
  const visited = new Set<Record<string, unknown>>();
  const candidates: Record<string, unknown>[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    candidates.push(current);

    for (const field of SUPER_SCAN_CONTAINER_FIELDS) {
      const nestedValue = current[field];
      if (isRecord(nestedValue)) {
        queue.push(nestedValue);
      }
    }
  }

  return candidates;
}

function readScanPayloadCandidate(payload: Record<string, unknown>) {
  const candidates = collectScanPayloadCandidates(payload);
  return (
    candidates.find((candidate) => readString(candidate.scan_type) !== null) ??
    candidates[0] ??
    payload
  );
}

function readProviderFailureMessage(payload: Record<string, unknown>) {
  const topLevelMessage = readString(payload.error) ?? readString(payload.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  const nestedData = isRecord(payload.data) ? payload.data : null;
  if (nestedData && readString(nestedData.scan_type) === 'error') {
    return readString(nestedData.message);
  }

  return null;
}

function normalizeSchemaVersion(value: unknown, fallbackVersion = 3) {
  return typeof value === 'number' && (value === 2 || value === 3 || value === 4)
    ? value
    : fallbackVersion;
}

function isAcceptedSuperProviderScanType(
  value: unknown,
): value is (typeof ACCEPTED_SUPER_PROVIDER_SCAN_TYPES)[number] {
  return (
    typeof value === 'string' &&
    ACCEPTED_SUPER_PROVIDER_SCAN_TYPES.includes(
      value as (typeof ACCEPTED_SUPER_PROVIDER_SCAN_TYPES)[number]
    )
  );
}

function findArrayFieldValue(
  candidates: Record<string, unknown>[],
  field: string,
) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate[field])) {
      return candidate[field];
    }
  }

  return null;
}

function isStandardProviderScanType(
  value: unknown,
): value is Exclude<SupportedProviderScanType, 'fat_distribution_scan_v2'> {
  return value === 'face' || value === 'body' || value === 'nutrition';
}

function readBoundedNumber(
  value: unknown,
  min: number,
  max: number,
) {
  const parsed = readNumber(value);
  if (parsed === null) {
    return null;
  }

  return Math.min(Math.max(parsed, min), max);
}

function sanitizeStandardAnalysisMeta(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const limitationFlagsSource = Array.isArray(value.limitation_flags)
    ? value.limitation_flags
    : Array.isArray(value.limitationFlags)
      ? value.limitationFlags
      : [];
  const limitationFlags = Array.from(
    new Set(
      limitationFlagsSource
        .map((item) => readString(item))
        .filter(
          (
            item,
          ): item is (typeof STANDARD_ANALYSIS_META_LIMITATION_FLAGS)[number] =>
            !!item &&
            STANDARD_ANALYSIS_META_LIMITATION_FLAGS.includes(
              item as (typeof STANDARD_ANALYSIS_META_LIMITATION_FLAGS)[number],
            ),
        ),
    ),
  );

  const analysisMeta = {
    confidence_score: readBoundedNumber(
      value.confidence_score ?? value.confidenceScore,
      0,
      100,
    ),
    image_quality_score: readBoundedNumber(
      value.image_quality_score ?? value.imageQualityScore,
      0,
      100,
    ),
    metric_coverage_score: readBoundedNumber(
      value.metric_coverage_score ?? value.metricCoverageScore,
      0,
      100,
    ),
    limitation_flags: limitationFlags,
  };

  return analysisMeta.confidence_score !== null ||
    analysisMeta.image_quality_score !== null ||
    analysisMeta.metric_coverage_score !== null ||
    analysisMeta.limitation_flags.length > 0
    ? analysisMeta
    : null;
}

const EXTENDED_MEAL_TYPE_KEYS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
  'other',
] as const;

const EXTENDED_PORTION_SIZE_KEYS = [
  'small',
  'medium',
  'large',
  'oversized',
] as const;

const EXTENDED_CUISINE_TYPE_KEYS = [
  'mediterranean',
  'asian',
  'western',
  'middle_eastern',
  'latin',
  'african',
  'mixed',
  'other',
] as const;

const EXTENDED_MEAT_TYPE_KEYS = [
  'red_meat',
  'poultry',
  'fish',
  'seafood',
  'plant_protein',
  'dairy',
  'none',
] as const;

const EXTENDED_COOKING_METHOD_KEYS = [
  'fried',
  'baked',
  'grilled',
  'raw',
  'steamed',
  'boiled',
  'sauteed',
  'other',
] as const;

const PERSONA_SEX_KEYS = [
  'male_presenting',
  'female_presenting',
  'neutral_or_unclear',
] as const;

const PERSONA_AGE_RANGE_KEYS = [
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_64',
  '65_plus',
] as const;

const PERSONA_HEIGHT_RANGE_KEYS = [
  'under_150cm',
  '150_160cm',
  '160_170cm',
  '170_180cm',
  '180_190cm',
  '190_plus',
] as const;

const PERSONA_WEIGHT_RANGE_KEYS = [
  'under_50kg',
  '50_60kg',
  '60_70kg',
  '70_80kg',
  '80_90kg',
  '90_100kg',
  '100_plus',
] as const;

const PERSONA_BODY_FRAME_KEYS = ['small', 'medium', 'large'] as const;

const PERSONA_FITNESS_LEVEL_KEYS = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'athletic',
] as const;

const PERSONA_DIETARY_PATTERN_KEYS = [
  'omnivore',
  'vegetarian_compatible',
  'vegan_compatible',
  'pescetarian_compatible',
  'keto_compatible',
  'mediterranean_compatible',
  'unclear',
] as const;

const PERSONA_ALLERGEN_VISIBILITY_KEYS = [
  'gluten_likely',
  'dairy_likely',
  'nuts_likely',
  'shellfish_likely',
  'eggs_likely',
  'soy_likely',
  'seafood_likely',
] as const;

function sanitizeExtendedEnumArray<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number][] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: T[number][] = [];
  for (const item of value) {
    const normalized = sanitizeExtendedEnumKey(item, allowed);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function sanitizeExtendedEnumKey<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  const text = readString(value);
  if (!text) return null;
  const lowered = text.toLowerCase();
  return (allowed as readonly string[]).includes(lowered)
    ? (lowered as T[number])
    : null;
}

function sanitizeExtendedFaceFields(candidate: Record<string, unknown>) {
  return {
    face_shape: sanitizeBoundedText(candidate.face_shape, SCAN_TEXT_MAX_LABEL),
    face_shape_key: sanitizeBoundedText(
      candidate.face_shape_key,
      SCAN_TEXT_MAX_LABEL,
    ),
    face_shape_fallback_text: sanitizeBoundedText(
      candidate.face_shape_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    skin_clarity_score: readBoundedNumber(candidate.skin_clarity_score, 0, 100),
    under_eye_shadow_score: readBoundedNumber(
      candidate.under_eye_shadow_score,
      0,
      100,
    ),
    under_eye_volume_score: readBoundedNumber(
      candidate.under_eye_volume_score,
      0,
      100,
    ),
    eye_openness_score: readBoundedNumber(candidate.eye_openness_score, 0, 100),
    complexion_redness_score: readBoundedNumber(
      candidate.complexion_redness_score,
      0,
      100,
    ),
    pore_visibility_score: readBoundedNumber(candidate.pore_visibility_score, 0, 100),
    skin_evenness_score: readBoundedNumber(candidate.skin_evenness_score, 0, 100),
    skin_radiance_score: readBoundedNumber(candidate.skin_radiance_score, 0, 100),
    lip_dryness_score: readBoundedNumber(candidate.lip_dryness_score, 0, 100),
    forehead_smoothness_score: readBoundedNumber(
      candidate.forehead_smoothness_score,
      0,
      100,
    ),
    t_zone_oiliness_score: readBoundedNumber(
      candidate.t_zone_oiliness_score,
      0,
      100,
    ),
    perceived_sex_key: sanitizeExtendedEnumKey(
      candidate.perceived_sex_key,
      PERSONA_SEX_KEYS,
    ),
    perceived_age_range_key: sanitizeExtendedEnumKey(
      candidate.perceived_age_range_key,
      PERSONA_AGE_RANGE_KEYS,
    ),
    perceived_stress_level: readBoundedNumber(
      candidate.perceived_stress_level,
      0,
      100,
    ),
    perceived_sleep_quality: readBoundedNumber(
      candidate.perceived_sleep_quality,
      0,
      100,
    ),
  };
}

function sanitizeExtendedBodyFields(candidate: Record<string, unknown>) {
  return {
    muscle_mass_label: sanitizeBoundedText(
      candidate.muscle_mass_label,
      SCAN_TEXT_MAX_LABEL,
    ),
    muscle_mass_key: sanitizeBoundedText(
      candidate.muscle_mass_key,
      SCAN_TEXT_MAX_LABEL,
    ),
    muscle_mass_fallback_text: sanitizeBoundedText(
      candidate.muscle_mass_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    body_type: sanitizeBoundedText(candidate.body_type, SCAN_TEXT_MAX_LABEL),
    body_type_key: sanitizeBoundedText(
      candidate.body_type_key,
      SCAN_TEXT_MAX_LABEL,
    ),
    body_type_fallback_text: sanitizeBoundedText(
      candidate.body_type_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    muscle_definition_score: readBoundedNumber(
      candidate.muscle_definition_score,
      0,
      100,
    ),
    midsection_definition_score: readBoundedNumber(
      candidate.midsection_definition_score,
      0,
      100,
    ),
    shoulder_alignment_score: readBoundedNumber(
      candidate.shoulder_alignment_score,
      0,
      100,
    ),
    recovery_readiness_score: readBoundedNumber(
      candidate.recovery_readiness_score,
      0,
      100,
    ),
    upper_body_definition_score: readBoundedNumber(
      candidate.upper_body_definition_score,
      0,
      100,
    ),
    lower_body_definition_score: readBoundedNumber(
      candidate.lower_body_definition_score,
      0,
      100,
    ),
    arm_definition_score: readBoundedNumber(
      candidate.arm_definition_score,
      0,
      100,
    ),
    v_taper_score: readBoundedNumber(candidate.v_taper_score, 0, 100),
    body_tension_indicator_score: readBoundedNumber(
      candidate.body_tension_indicator_score,
      0,
      100,
    ),
    perceived_sex_key: sanitizeExtendedEnumKey(
      candidate.perceived_sex_key,
      PERSONA_SEX_KEYS,
    ),
    perceived_age_range_key: sanitizeExtendedEnumKey(
      candidate.perceived_age_range_key,
      PERSONA_AGE_RANGE_KEYS,
    ),
    estimated_height_range_key: sanitizeExtendedEnumKey(
      candidate.estimated_height_range_key,
      PERSONA_HEIGHT_RANGE_KEYS,
    ),
    estimated_weight_range_key: sanitizeExtendedEnumKey(
      candidate.estimated_weight_range_key,
      PERSONA_WEIGHT_RANGE_KEYS,
    ),
    body_frame_key: sanitizeExtendedEnumKey(
      candidate.body_frame_key,
      PERSONA_BODY_FRAME_KEYS,
    ),
    perceived_fitness_level_key: sanitizeExtendedEnumKey(
      candidate.perceived_fitness_level_key,
      PERSONA_FITNESS_LEVEL_KEYS,
    ),
  };
}

function sanitizeExtendedNutritionFields(candidate: Record<string, unknown>) {
  return {
    verdict_key: sanitizeBoundedText(candidate.verdict_key, SCAN_TEXT_MAX_LABEL),
    verdict_fallback_text: sanitizeBoundedText(
      candidate.verdict_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    glycemic_index_key: sanitizeBoundedText(
      candidate.glycemic_index_key,
      SCAN_TEXT_MAX_LABEL,
    ),
    glycemic_index_label: sanitizeBoundedText(
      candidate.glycemic_index_label,
      SCAN_TEXT_MAX_LABEL,
    ),
    glycemic_index_fallback_text: sanitizeBoundedText(
      candidate.glycemic_index_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    ingredient_quality_key: sanitizeBoundedText(
      candidate.ingredient_quality_key,
      SCAN_TEXT_MAX_LABEL,
    ),
    ingredient_quality: sanitizeBoundedText(
      candidate.ingredient_quality,
      SCAN_TEXT_MAX_LABEL,
    ),
    ingredient_quality_fallback_text: sanitizeBoundedText(
      candidate.ingredient_quality_fallback_text,
      SCAN_TEXT_MAX_LABEL,
    ),
    main_vitamin_keys: sanitizeBoundedTextArray(
      candidate.main_vitamin_keys,
      20,
      SCAN_TEXT_MAX_LABEL,
    ),
    main_vitamins: sanitizeBoundedText(
      candidate.main_vitamins,
      SCAN_TEXT_MAX_PARAGRAPH,
    ),
    main_vitamins_fallback_text: sanitizeBoundedText(
      candidate.main_vitamins_fallback_text,
      SCAN_TEXT_MAX_PARAGRAPH,
    ),
    short_verdict: sanitizeBoundedText(
      candidate.short_verdict,
      SCAN_TEXT_MAX_LABEL,
    ),
    fiber_grams_estimate: readBoundedNumber(
      candidate.fiber_grams_estimate,
      0,
      100,
    ),
    sugar_grams_estimate: readBoundedNumber(
      candidate.sugar_grams_estimate,
      0,
      300,
    ),
    processing_level_score: readBoundedNumber(
      candidate.processing_level_score,
      0,
      100,
    ),
    hydration_contribution_score: readBoundedNumber(
      candidate.hydration_contribution_score,
      0,
      10,
    ),
    sodium_level_score: readBoundedNumber(candidate.sodium_level_score, 0, 10),
    meal_balance_score: readBoundedNumber(candidate.meal_balance_score, 0, 100),
    inflammation_index_score: readBoundedNumber(
      candidate.inflammation_index_score,
      0,
      100,
    ),
    meal_type_key: sanitizeExtendedEnumKey(
      candidate.meal_type_key,
      EXTENDED_MEAL_TYPE_KEYS,
    ),
    portion_size_key: sanitizeExtendedEnumKey(
      candidate.portion_size_key,
      EXTENDED_PORTION_SIZE_KEYS,
    ),
    color_diversity_score: readBoundedNumber(
      candidate.color_diversity_score,
      0,
      10,
    ),
    vegetable_portion_ratio: readBoundedNumber(
      candidate.vegetable_portion_ratio,
      0,
      100,
    ),
    protein_visibility_score: readBoundedNumber(
      candidate.protein_visibility_score,
      0,
      100,
    ),
    whole_grain_indicator_score: readBoundedNumber(
      candidate.whole_grain_indicator_score,
      0,
      100,
    ),
    meal_freshness_score: readBoundedNumber(
      candidate.meal_freshness_score,
      0,
      100,
    ),
    cuisine_type_key: sanitizeExtendedEnumKey(
      candidate.cuisine_type_key,
      EXTENDED_CUISINE_TYPE_KEYS,
    ),
    meat_type_key: sanitizeExtendedEnumKey(
      candidate.meat_type_key,
      EXTENDED_MEAT_TYPE_KEYS,
    ),
    cooking_method_key: sanitizeExtendedEnumKey(
      candidate.cooking_method_key,
      EXTENDED_COOKING_METHOD_KEYS,
    ),
    meal_dietary_pattern_key: sanitizeExtendedEnumKey(
      candidate.meal_dietary_pattern_key,
      PERSONA_DIETARY_PATTERN_KEYS,
    ),
    allergen_visibility_keys: sanitizeExtendedEnumArray(
      candidate.allergen_visibility_keys,
      PERSONA_ALLERGEN_VISIBILITY_KEYS,
    ),
  };
}

function sanitizeExtendedScanFields(
  candidate: Record<string, unknown>,
  scanType: string,
) {
  if (scanType === 'face') return sanitizeExtendedFaceFields(candidate);
  if (scanType === 'body') return sanitizeExtendedBodyFields(candidate);
  if (scanType === 'nutrition') return sanitizeExtendedNutritionFields(candidate);
  return {};
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
}

function hasFatDistributionMarkers(candidate: Record<string, unknown>) {
  if (
    Array.isArray(candidate.areas_analysis) ||
    Array.isArray(candidate.priority_zones)
  ) {
    return true;
  }

  for (const field of FAT_DISTRIBUTION_MARKER_NUMBER_FIELDS) {
    if (readNumber(candidate[field]) !== null) {
      return true;
    }
  }

  for (const field of FAT_DISTRIBUTION_MARKER_STRING_FIELDS) {
    if (readString(candidate[field])) {
      return true;
    }
  }

  return false;
}

function prioritizeCandidate(
  candidate: Record<string, unknown>,
  candidates: Record<string, unknown>[],
) {
  return [
    candidate,
    ...candidates.filter((entry) => entry !== candidate),
  ];
}

function findFatDistributionScanCandidate(candidates: Record<string, unknown>[]) {
  return (
    candidates.find(
      (candidate) =>
        readString(candidate.scan_type) === FAT_DISTRIBUTION_SCAN_TYPE
    ) ??
    candidates.find((candidate) => hasFatDistributionMarkers(candidate)) ??
    null
  );
}

function readLooseTextValue(value: unknown, depth = 0): string | null {
  if (depth > 3) {
    return null;
  }

  const directString = readString(value);
  if (directString) {
    return directString;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const collectedText = value
      .map((item) => readLooseTextValue(item, depth + 1))
      .filter((item): item is string => !!item);

    return collectedText.length > 0 ? collectedText.join('\n\n') : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of [
    'text',
    'content',
    'message',
    'analysis',
    'summary',
    'output',
    'response',
    'result',
    'value',
    'diagnosis',
    'explanation',
  ]) {
    const nestedText = readLooseTextValue(value[key], depth + 1);
    if (nestedText) {
      return nestedText;
    }
  }

  return null;
}

function readLooseRawText(rawText: string | null | undefined) {
  const trimmedText = readString(rawText);
  if (!trimmedText) {
    return null;
  }

  if (
    (trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
    (trimmedText.startsWith('[') && trimmedText.endsWith(']'))
  ) {
    return null;
  }

  if (trimmedText.startsWith('"') && trimmedText.endsWith('"')) {
    try {
      const parsedString = JSON.parse(trimmedText);
      return readString(parsedString) ?? trimmedText;
    } catch {
      return trimmedText;
    }
  }

  return trimmedText;
}

function findTextFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const resolvedText = readLooseTextValue(candidate[field]);
      if (resolvedText) {
        return {
          text: resolvedText,
          source: field,
        };
      }
    }
  }

  return null;
}

function findStringFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const resolvedText = readString(candidate[field]);
      if (resolvedText) {
        return {
          text: resolvedText,
          source: field,
        };
      }
    }
  }

  return null;
}

function findNumberFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const numericValue = readNumber(candidate[field]);
      if (numericValue !== null) {
        return numericValue;
      }
    }
  }

  return null;
}

function findBooleanFieldValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[],
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const booleanValue = readBoolean(candidate[field]);
      if (booleanValue !== null) {
        return booleanValue;
      }
    }
  }

  return null;
}

function findDetectedConditions(candidates: Record<string, unknown>[]) {
  for (const candidate of candidates) {
    if (!Array.isArray(candidate.detected_conditions)) {
      continue;
    }

    return candidate.detected_conditions.filter(isRecord);
  }

  return [] as Record<string, unknown>[];
}

function normalizeFatDistributionArea(area: Record<string, unknown>) {
  const normalizedArea: Record<string, unknown> = {
    ...area,
  };

  // S-05 — bornes selon la sémantique du champ : `area_name` et
  // `dominant_type` sont des labels courts ; `explanation` et
  // `actionable_advice` peuvent être des paragraphes.
  const areaFieldLimits: Record<string, number> = {
    area_name: SCAN_TEXT_MAX_LABEL,
    dominant_type: SCAN_TEXT_MAX_LABEL,
    explanation: SCAN_TEXT_MAX_PARAGRAPH,
    actionable_advice: SCAN_TEXT_MAX_PARAGRAPH,
  };

  for (const field of FAT_DISTRIBUTION_AREA_STRING_FIELDS) {
    const normalizedValue = sanitizeBoundedText(
      area[field],
      areaFieldLimits[field] ?? SCAN_TEXT_MAX_LABEL,
    );
    if (normalizedValue) {
      normalizedArea[field] = normalizedValue;
    } else {
      delete normalizedArea[field];
    }
  }

  for (const field of FAT_DISTRIBUTION_AREA_NUMBER_FIELDS) {
    normalizedArea[field] = readNumber(area[field]);
  }

  return normalizedArea;
}

function resolveFatDistributionScanPayload(
  payload: Record<string, unknown> | null,
) {
  if (!payload) {
    return null;
  }

  const candidates = collectScanPayloadCandidates(payload);
  const selectedCandidate = findFatDistributionScanCandidate(candidates);
  if (!selectedCandidate) {
    return null;
  }

  const prioritizedCandidates = prioritizeCandidate(selectedCandidate, candidates);
  const normalizedPayload: Record<string, unknown> = {
    ...selectedCandidate,
    scan_type: FAT_DISTRIBUTION_SCAN_TYPE,
    schema_version: 3,
    global_body_fat_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_body_fat_estimate_percent',
      ]),
    global_facial_fat_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_facial_fat_estimate_percent',
      ]),
    global_water_retention_estimate_percent:
      findNumberFieldValue(prioritizedCandidates, [
        'global_water_retention_estimate_percent',
      ]),
    // S-05 — borne le nombre d'`areas_analysis` à 20 ; chaque area est
    // sanitisée par normalizeFatDistributionArea (champs textuels bornés).
    areas_analysis: (
      findArrayFieldValue(prioritizedCandidates, 'areas_analysis') ?? []
    )
      .slice(0, SCAN_FAT_AREAS_MAX)
      .filter(isRecord)
      .map((area) => normalizeFatDistributionArea(area)),
    // S-05 — borne le nombre de `priority_zones` à 20 et la longueur de
    // chaque label à SCAN_TEXT_MAX_LABEL.
    priority_zones: sanitizeBoundedTextArray(
      findArrayFieldValue(prioritizedCandidates, 'priority_zones'),
      SCAN_FAT_PRIORITY_ZONES_MAX,
      SCAN_TEXT_MAX_LABEL,
    ),
  };

  // S-05 — bornes sur les champs textuels libres top-level :
  // analysis_summary peut être long (paragraphe explicatif), les autres
  // sont des labels ou un disclaimer borné.
  const topLevelFieldLimits: Record<string, number> = {
    analysis_summary: SCAN_TEXT_MAX_SUMMARY,
    dominant_storage_pattern: SCAN_TEXT_MAX_LABEL,
    disclaimer_text: SCAN_TEXT_MAX_PARAGRAPH,
  };

  for (const field of FAT_DISTRIBUTION_TOP_LEVEL_STRING_FIELDS) {
    const normalizedValue = findStringFieldValue(prioritizedCandidates, [field]);
    const boundedValue = sanitizeBoundedText(
      normalizedValue?.text,
      topLevelFieldLimits[field] ?? SCAN_TEXT_MAX_PARAGRAPH,
    );
    if (boundedValue) {
      normalizedPayload[field] = boundedValue;
    } else {
      delete normalizedPayload[field];
    }
  }

  return normalizedPayload;
}

function resolveLooseLegacySuperScanPayload(
  payload: Record<string, unknown> | null,
  rawText?: string | null,
) {
  const candidates = payload ? collectScanPayloadCandidates(payload) : [];
  const resolvedSummaryKey = findTextFieldValue(candidates, ['summary_key']);
  const resolvedDisclaimerKey = findTextFieldValue(candidates, ['disclaimer_key']);
  const resolvedSummary =
    findTextFieldValue(candidates, SUPER_SCAN_CANONICAL_SUMMARY_FIELDS) ??
    findTextFieldValue(candidates, SUPER_SCAN_TEXT_FIELDS) ??
    (() => {
      const fallbackRawText = readLooseRawText(rawText);
      return fallbackRawText
        ? {
            text: fallbackRawText,
            source: 'raw_text',
          }
        : null;
    })() ??
    findTextFieldValue(candidates, SUPER_SCAN_STATUS_FIELDS);

  if (!resolvedSummary && !resolvedSummaryKey) {
    return null;
  }

  const resolvedDisclaimer = findTextFieldValue(candidates, SUPER_SCAN_DISCLAIMER_FIELDS);
  const schemaVersion = normalizeSchemaVersion(
    findNumberFieldValue(candidates, ['schema_version'])
  );
  // S-05 — bornes longueurs sur les champs textuels libres avant stockage.
  const boundedSummary = sanitizeBoundedText(
    resolvedSummary?.text,
    SCAN_TEXT_MAX_SUMMARY,
  );
  const boundedDisclaimer = sanitizeBoundedText(
    resolvedDisclaimer?.text,
    SCAN_TEXT_MAX_PARAGRAPH,
  );
  const boundedSummaryKey = sanitizeBoundedText(
    resolvedSummaryKey?.text,
    SCAN_TEXT_MAX_LABEL,
  );
  const boundedDisclaimerKey = sanitizeBoundedText(
    resolvedDisclaimerKey?.text,
    SCAN_TEXT_MAX_LABEL,
  );

  const resolvedPayload = {
    scan_type: LEGACY_SUPER_SCAN_TYPE,
    schema_version: schemaVersion,
    global_risk_score:
      findNumberFieldValue(candidates, SUPER_SCAN_SCORE_FIELDS) ?? 0,
    urgency_flag:
      findBooleanFieldValue(candidates, SUPER_SCAN_URGENCY_FIELDS) ?? false,
    ...(boundedSummary ? { analysis_summary: boundedSummary } : {}),
    detected_conditions: findDetectedConditions(candidates),
    ...(boundedDisclaimer ? { disclaimer_text: boundedDisclaimer } : {}),
    ...(boundedSummaryKey ? { summary_key: boundedSummaryKey } : {}),
    ...(boundedDisclaimerKey ? { disclaimer_key: boundedDisclaimerKey } : {}),
  };

  return resolvedPayload;
}

function resolveLooseSuperScanPayload(
  payload: Record<string, unknown> | null,
  rawText?: string | null,
) {
  return (
    resolveFatDistributionScanPayload(payload) ??
    resolveLooseLegacySuperScanPayload(payload, rawText)
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

export function resolveNormalizedScanAnalysisPayload(
  payload: Record<string, unknown> | null,
  scanType: SupportedScanType,
  rawText?: string | null,
) {
  if (!payload) {
    if (scanType === 'super') {
      const looseSuperScanPayload = resolveLooseSuperScanPayload(null, rawText);
      if (looseSuperScanPayload) {
        return {
          ...looseSuperScanPayload,
          schema_version: 3,
        };
      }
    }

    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis provider returned an empty payload',
    );
  }

  const success = readBoolean(payload.success);
  if (success === false) {
    throw new Phase2HttpError(
      502,
      'analysis_failed',
      readProviderFailureMessage(payload) ??
        'Scan analysis provider reported a failure',
    );
  }

  const candidate = readScanPayloadCandidate(payload);
  if (!isRecord(candidate)) {
    if (scanType === 'super') {
      const looseSuperScanPayload = resolveLooseSuperScanPayload(payload, rawText);
      if (looseSuperScanPayload) {
        return {
          ...looseSuperScanPayload,
          schema_version: 3,
        };
      }
    }

    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis provider returned an invalid payload',
    );
  }

  const analysisType = readString(candidate.scan_type);
  const expectedType = getProviderScanType(scanType);
  if (scanType === 'super') {
    if (analysisType && !isAcceptedSuperProviderScanType(analysisType)) {
      throw new Phase2HttpError(
        422,
        'analysis_type_mismatch',
        `Expected ${LEGACY_SUPER_SCAN_TYPE} or ${FAT_DISTRIBUTION_SCAN_TYPE} analysis for ${scanType}, received ${analysisType}`,
        {
          expected_type: expectedType,
          actual_type: analysisType,
          accepted_types: [...ACCEPTED_SUPER_PROVIDER_SCAN_TYPES],
        },
      );
    }

    const resolvedSuperScanPayload = resolveLooseSuperScanPayload(payload, rawText);
    if (resolvedSuperScanPayload) {
      return resolvedSuperScanPayload;
    }
  } else if (analysisType && analysisType !== expectedType) {
    throw new Phase2HttpError(
      422,
      'analysis_type_mismatch',
      `Expected ${expectedType} analysis for ${scanType}, received ${analysisType}`,
      {
        expected_type: expectedType,
        actual_type: analysisType,
      },
    );
  }

  if (!analysisType) {
    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Scan analysis payload is missing scan_type',
    );
  }

  if (isStandardProviderScanType(analysisType)) {
    return {
      ...candidate,
      ...sanitizeExtendedScanFields(candidate, analysisType),
      schema_version: 4,
      analysis_meta: sanitizeStandardAnalysisMeta(
        candidate.analysis_meta ?? candidate.analysisMeta,
      ),
    };
  }

  return {
    ...candidate,
    schema_version: normalizeSchemaVersion(candidate.schema_version, 3),
  };
}

export function isStoredScanAnalysisComplete(scanRow: {
  analysis_result?: unknown;
  analyzed_at?: string | null;
} | null | undefined) {
  return Boolean(scanRow?.analysis_result && scanRow?.analyzed_at);
}

export function isProviderScanType(
  value: unknown,
): value is SupportedProviderScanType {
  return (
    typeof value === 'string' &&
    [
      'face',
      'body',
      'nutrition',
      LEGACY_SUPER_SCAN_TYPE,
      FAT_DISTRIBUTION_SCAN_TYPE,
    ].includes(value)
  );
}
