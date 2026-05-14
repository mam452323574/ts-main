import {
  AnalysisResult,
  DetectedCondition,
  FatDistributionAreaAnalysis,
  FatDistributionPriorityZone,
  FatDistributionScanResult,
  LegacyDetectedCondition,
  ScanAnalysisLimitationFlag,
  ScanAnalysisMeta,
  ScanBodyResult,
  ScanCatalogKey,
  ScanFaceResult,
  ScanNutritionResult,
  ScanType,
  ScanVitaminKey,
  StoredAnalysisResult,
  SuperAnalysisType,
  SuperScanCatalogKey,
  SuperScanResult,
} from '@/types';
import {
  BODY_TYPE_CONTRACT,
  FACE_SHAPE_CONTRACT,
  GLYCEMIC_INDEX_CONTRACT,
  INGREDIENT_QUALITY_CONTRACT,
  MUSCLE_MASS_CONTRACT,
  NUTRITION_VITAMIN_CONTRACT,
  SEVERITY_CONTRACT,
  SUPER_ADVICE_CONTRACT,
  SUPER_CATEGORY_CONTRACT,
  SUPER_CONDITION_CONTRACT,
  SUPER_DISCLAIMER_CONTRACT,
  SUPER_EXPLANATION_CONTRACT,
  SUPER_SUMMARY_CONTRACT,
  VERDICT_CONTRACT,
  normalizeContractToken,
  resolveContractKey,
} from '@/constants/resultCatalogContract';
import { resolveLocalizedText } from '@/utils/analysisTextLocalization';

type NormalizeAnalysisOptions = {
  expectedScanType?: ScanType | null;
};

type NormalizedStoredAnalysisResult =
  | AnalysisResult
  | SuperScanResult
  | FatDistributionScanResult;

type ScanValueCategory =
  | 'face_shape'
  | 'body_type'
  | 'muscle_mass'
  | 'ingredient_quality'
  | 'glycemic_index'
  | 'severity';

export const SUPER_ANALYSIS_SCAN_TYPES: readonly SuperAnalysisType[] = [
  'super_health_v2',
  'fat_distribution_scan_v2',
];

const EXPECTED_ANALYSIS_TYPES: Partial<
  Record<ScanType, readonly StoredAnalysisResult['scan_type'][]>
> = {
  health: ['face'],
  body: ['body'],
  nutrition: ['nutrition'],
  super: SUPER_ANALYSIS_SCAN_TYPES,
};
const SUPER_SCAN_CONTAINER_FIELDS = ['result', 'data', 'entry'] as const;
const SUPER_SCAN_SUMMARY_FIELDS = [
  'analysis_summary_i18n',
  'summary_fallback_text',
  'analysis_summary',
] as const;
const SUPER_SCAN_ALT_TEXT_FIELDS = [
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
  'disclaimer_text_i18n',
  'disclaimer_fallback_text',
  'disclaimer_text',
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
const SUPER_SCAN_CONDITION_NAME_FIELDS = [
  'condition_fallback_text',
  'condition_name_i18n',
  'condition_name',
  'label',
  'name',
  'condition',
] as const;
const SUPER_SCAN_CATEGORY_FIELDS = [
  'category_fallback_text',
  'category_i18n',
  'category',
  'category_name',
  'group',
] as const;
const SUPER_SCAN_EXPLANATION_FIELDS = [
  'explanation_fallback_text',
  'explanation_i18n',
  'explanation',
  'message',
  'content',
  'details',
  'reason',
] as const;
const SUPER_SCAN_ADVICE_FIELDS = [
  'advice_fallback_text',
  'actionable_advice_i18n',
  'actionable_advice',
  'advice',
  'recommendation',
  'next_steps',
  'next_step',
] as const;
const FAT_DISTRIBUTION_BODY_FAT_FIELDS = [
  'global_body_fat_estimate_percent',
] as const;
const FAT_DISTRIBUTION_FACIAL_FAT_FIELDS = [
  'global_facial_fat_estimate_percent',
] as const;
const FAT_DISTRIBUTION_WATER_RETENTION_FIELDS = [
  'global_water_retention_estimate_percent',
] as const;
const FAT_DISTRIBUTION_SUMMARY_FIELDS = [
  'analysis_summary_i18n',
  'analysis_summary',
] as const;
const FAT_DISTRIBUTION_PATTERN_FIELDS = [
  'dominant_storage_pattern_i18n',
  'dominant_storage_pattern',
] as const;
const FAT_DISTRIBUTION_DISCLAIMER_FIELDS = [
  'disclaimer_text_i18n',
  'disclaimer_text',
] as const;
const NUTRITION_MICRONUTRIENT_TEXT_FIELDS = [
  'micronutrients_i18n',
  'micronutrients',
  'main_micronutrients_i18n',
  'main_micronutrients',
  'micronutrient_details_i18n',
  'micronutrient_details',
] as const;
const NUTRITION_POINTS_TEXT_FIELDS = [
  'nutrition_points_i18n',
  'nutrition_points',
  'nutritional_points_i18n',
  'nutritional_points',
  'nutrition_highlights_i18n',
  'nutrition_highlights',
] as const;
const NUTRITION_RECOMMENDATION_TEXT_FIELDS = [
  'recommendations_i18n',
  'recommendations',
  'nutrition_recommendations_i18n',
  'nutrition_recommendations',
  'dietary_recommendations_i18n',
  'dietary_recommendations',
  'actionable_advice_i18n',
  'actionable_advice',
] as const;
const NUTRITION_DIETARY_DETAILS_TEXT_FIELDS = [
  'dietary_details_i18n',
  'dietary_details',
  'food_details_i18n',
  'food_details',
  'meal_details_i18n',
  'meal_details',
] as const;
const NUTRITION_PLATE_ANALYSIS_TEXT_FIELDS = [
  'plate_analysis_i18n',
  'plate_analysis',
  'meal_analysis_i18n',
  'meal_analysis',
  'dish_analysis_i18n',
  'dish_analysis',
  'analysis_text_i18n',
  'analysis_text',
] as const;
const NUTRITION_ESTIMATED_COMPOSITION_TEXT_FIELDS = [
  'estimated_composition_i18n',
  'estimated_composition',
  'composition_estimated_i18n',
  'composition_estimated',
  'composition_details_i18n',
  'composition_details',
] as const;
const ANALYSIS_META_LIMITATION_FLAGS: readonly ScanAnalysisLimitationFlag[] = [
  'blur',
  'low_light',
  'partial_subject',
  'occlusion',
  'portion_uncertain',
];

export function isSuperAnalysisType(value: unknown): value is SuperAnalysisType {
  return (
    typeof value === 'string' &&
    SUPER_ANALYSIS_SCAN_TYPES.includes(value as SuperAnalysisType)
  );
}

export function isFatDistributionScanResult(
  value: unknown
): value is FatDistributionScanResult {
  return isPlainObject(value) && value.scan_type === 'fat_distribution_scan_v2';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getAnalysisResultScanType(value: unknown): string | null {
  if (typeof value === 'string') {
    try {
      return getAnalysisResultScanType(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (!isPlainObject(value)) {
    return null;
  }

  return readString(value.scan_type);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function readOptionalNumber(value: unknown) {
  if (value == null || value === '') {
    return null;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readOptionalBoundedNumber(
  value: unknown,
  min: number,
  max: number,
) {
  const parsed = readOptionalNumber(value);
  if (parsed === null) {
    return null;
  }

  return Math.min(Math.max(parsed, min), max);
}

function isAnalysisLimitationFlag(
  value: unknown,
): value is ScanAnalysisLimitationFlag {
  return (
    typeof value === 'string' &&
    ANALYSIS_META_LIMITATION_FLAGS.includes(
      value as ScanAnalysisLimitationFlag,
    )
  );
}

function normalizeAnalysisMeta(value: unknown): ScanAnalysisMeta | null {
  if (!isPlainObject(value)) {
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
        .filter((item): item is ScanAnalysisLimitationFlag =>
          isAnalysisLimitationFlag(item)
        )
    )
  );
  const analysisMeta = {
    confidence_score: readOptionalBoundedNumber(
      value.confidence_score ?? value.confidenceScore,
      0,
      100,
    ),
    image_quality_score: readOptionalBoundedNumber(
      value.image_quality_score ?? value.imageQualityScore,
      0,
      100,
    ),
    metric_coverage_score: readOptionalBoundedNumber(
      value.metric_coverage_score ?? value.metricCoverageScore,
      0,
      100,
    ),
    limitation_flags: limitationFlags,
  } satisfies ScanAnalysisMeta;

  return analysisMeta.confidence_score !== null ||
    analysisMeta.image_quality_score !== null ||
    analysisMeta.metric_coverage_score !== null ||
    analysisMeta.limitation_flags.length > 0
    ? analysisMeta
    : null;
}

function normalizeToken(value: string) {
  return normalizeContractToken(value);
}

function preserveFallbackText(value: string | null, normalizedKey: string | null) {
  if (!value) {
    return undefined;
  }

  if (normalizedKey && normalizeToken(value) === normalizeToken(normalizedKey)) {
    return undefined;
  }

  return value;
}

function resolveText(value: unknown) {
  const directString = readString(value);
  if (directString) {
    return directString;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const localized = resolveLocalizedText(value as never, { fallback: '' });
  return localized.trim().length > 0 ? localized.trim() : null;
}

function collectSuperScanCandidates(raw: Record<string, unknown>) {
  const queue: Record<string, unknown>[] = [raw];
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
      if (isPlainObject(nestedValue)) {
        queue.push(nestedValue);
      }
    }
  }

  return candidates;
}

function findFirstResolvedText(
  candidates: Record<string, unknown>[],
  fields: readonly string[]
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const resolvedText = resolveText(candidate[field]);
      if (resolvedText) {
        return resolvedText;
      }
    }
  }

  return null;
}

function buildOptionalTextField<
  Key extends keyof Pick<
    ScanNutritionResult,
    | 'verdict_fallback_text'
    | 'glycemic_index_fallback_text'
    | 'ingredient_quality_fallback_text'
    | 'main_vitamins_fallback_text'
    | 'micronutrients'
    | 'nutrition_points'
    | 'recommendations'
    | 'dietary_details'
    | 'plate_analysis'
    | 'estimated_composition'
  >,
>(key: Key, value: string | null) {
  return value ? ({ [key]: value } as Pick<ScanNutritionResult, Key>) : {};
}

function readLongVitaminFallbackText(
  value: unknown,
  hasRecognizedCanonicalKeys = false,
) {
  const text = resolveText(value);
  if (!text) {
    return null;
  }

  return text;
}

function findFirstExplicitKey(
  candidates: Record<string, unknown>[],
  fields: readonly string[]
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const explicitKey = readExplicitKey(candidate[field]);
      if (explicitKey) {
        return explicitKey;
      }
    }
  }

  return null;
}

function findFirstNumericValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[]
) {
  for (const candidate of candidates) {
    for (const field of fields) {
      const rawValue = candidate[field];
      if (rawValue == null || rawValue === '') {
        continue;
      }

      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (Number.isFinite(numericValue)) {
        return numericValue;
      }
    }
  }

  return null;
}

function findFirstBooleanValue(
  candidates: Record<string, unknown>[],
  fields: readonly string[]
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

function findFirstArrayField(
  candidates: Record<string, unknown>[],
  field: string
) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate[field])) {
      return candidate[field] as unknown[];
    }
  }

  return null;
}

function normalizeFatDistributionArea(
  value: Record<string, unknown>
): FatDistributionAreaAnalysis {
  return {
    area_name:
      resolveText(value.area_name_i18n ?? value.area_name ?? value.label ?? value.name) ??
      '',
    subcutaneous_fat_percent: readNumber(value.subcutaneous_fat_percent),
    water_retention_percent: readNumber(value.water_retention_percent),
    definition_percent: readNumber(value.definition_percent),
    dominant_type:
      resolveText(
        value.dominant_type_i18n ??
          value.dominant_type ??
          value.type ??
          value.storage_type
      ) ?? '',
    confidence: readNumber(value.confidence),
    explanation:
      resolveText(value.explanation_i18n ?? value.explanation ?? value.message) ?? '',
    actionable_advice:
      resolveText(
        value.actionable_advice_i18n ??
          value.actionable_advice ??
          value.advice ??
          value.recommendation
      ) ?? '',
  };
}

function normalizeFatDistributionAreas(value: unknown): FatDistributionAreaAnalysis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) =>
    isPlainObject(item) ? [normalizeFatDistributionArea(item)] : []
  );
}

function normalizeFatDistributionPriorityZones(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const textValue = readString(item);
    if (textValue) {
      return [textValue];
    }

    if (!isPlainObject(item)) {
      return [];
    }

    const normalizedText = resolveText(
      item.area_name_i18n ??
        item.area_name ??
        item.label ??
        item.name ??
        item.value ??
        item.zone
    );
    return normalizedText ? [normalizedText] : [];
  });
}

function readExplicitKey(value: unknown) {
  const key = readString(value);
  return key ? normalizeToken(key) : null;
}

function normalizeAlias(category: ScanValueCategory, value: string | null): ScanCatalogKey {
  const contract =
    category === 'face_shape'
      ? FACE_SHAPE_CONTRACT
      : category === 'body_type'
        ? BODY_TYPE_CONTRACT
        : category === 'muscle_mass'
          ? MUSCLE_MASS_CONTRACT
          : category === 'ingredient_quality'
            ? INGREDIENT_QUALITY_CONTRACT
            : category === 'glycemic_index'
              ? GLYCEMIC_INDEX_CONTRACT
              : SEVERITY_CONTRACT;

  return resolveContractKey(contract, value) as ScanCatalogKey;
}

function normalizeIngredientQualityKey(value: string | null) {
  return resolveContractKey(INGREDIENT_QUALITY_CONTRACT, value) as ScanCatalogKey;
}

function normalizeGlycemicIndexKey(value: string | null) {
  return resolveContractKey(GLYCEMIC_INDEX_CONTRACT, value) as ScanCatalogKey;
}

function normalizeVitaminKey(value: string | null) {
  if (!value) {
    return null;
  }

  return resolveContractKey(NUTRITION_VITAMIN_CONTRACT, value) as ScanVitaminKey;
}

function normalizeVerdictKey(value: string | null) {
  return resolveContractKey(VERDICT_CONTRACT, value) as ScanCatalogKey;
}

function normalizeVitaminKeys(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => {
            const explicitKey = readExplicitKey(item);
            if (explicitKey) {
              return normalizeVitaminKey(explicitKey);
            }

            return normalizeVitaminKey(readString(item));
          })
          .filter((item): item is ScanVitaminKey => !!item)
      )
    );
  }

  const text = resolveText(value);
  if (!text) {
    return [] as ScanVitaminKey[];
  }

  return Array.from(
    new Set(
      text
        .split(/[,;/&+]+|\bet\b|\band\b/gi)
        .map((item) => normalizeVitaminKey(item))
        .filter((item): item is ScanVitaminKey => !!item)
    )
  );
}

function normalizeSummaryKey(value: string | null) {
  return resolveContractKey(SUPER_SUMMARY_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeDisclaimerKey(value: string | null) {
  return resolveContractKey(SUPER_DISCLAIMER_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeSuperCategoryKey(value: string | null) {
  return resolveContractKey(SUPER_CATEGORY_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeSuperConditionKey(value: string | null) {
  return resolveContractKey(SUPER_CONDITION_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeSuperExplanationKey(value: string | null) {
  return resolveContractKey(SUPER_EXPLANATION_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeSuperAdviceKey(value: string | null) {
  return resolveContractKey(SUPER_ADVICE_CONTRACT, value) as SuperScanCatalogKey;
}

function normalizeSeverityKey(value: unknown) {
  const explicitKey = readExplicitKey(value);
  if (explicitKey) {
    return resolveContractKey(SEVERITY_CONTRACT, explicitKey) as DetectedCondition['severity_key'];
  }

  return resolveContractKey(
    SEVERITY_CONTRACT,
    resolveText(value)
  ) as DetectedCondition['severity_key'];
}

function normalizeFaceResult(raw: Record<string, unknown>): ScanFaceResult {
  const explicitKey =
    readExplicitKey(raw.face_shape_key) ?? readExplicitKey(raw.face_shape_code);
  const faceShapeText = resolveText(
    raw.face_shape_fallback_text ?? raw.face_shape_i18n ?? raw.face_shape
  );
  const metrics = isPlainObject(raw.metrics) ? raw.metrics : null;
  const faceShapeKey = normalizeAlias('face_shape', explicitKey ?? faceShapeText);

  return {
    schema_version: 4,
    scan_type: 'face',
    analysis_meta: normalizeAnalysisMeta(raw.analysis_meta ?? raw.analysisMeta),
    face_score: readNumber(raw.face_score),
    perceived_age: readNumber(raw.perceived_age),
    skin_quality_score: readNumber(raw.skin_quality_score),
    symmetry_percentage: readNumber(raw.symmetry_percentage),
    fatigue_level: readNumber(raw.fatigue_level),
    glow_index: readOptionalNumber(
      raw.glow_index ??
        raw.glowScore ??
        raw.glow_score ??
        raw.glow ??
        metrics?.glow ??
        metrics?.glowScore
    ),
    energy_score: readOptionalNumber(raw.energy_score),
    face_shape_key: faceShapeKey,
    ...(faceShapeText ? { face_shape_fallback_text: faceShapeText } : {}),
    collagen_level: readNumber(raw.collagen_level),
    hydration_level: readNumber(raw.hydration_level),
    photogenic_score: readNumber(raw.photogenic_score),
    skin_clarity_score: readOptionalBoundedNumber(
      raw.skin_clarity_score ?? metrics?.skin_clarity_score,
      0,
      100,
    ),
    under_eye_shadow_score: readOptionalBoundedNumber(
      raw.under_eye_shadow_score ?? metrics?.under_eye_shadow_score,
      0,
      100,
    ),
    under_eye_volume_score: readOptionalBoundedNumber(
      raw.under_eye_volume_score ?? metrics?.under_eye_volume_score,
      0,
      100,
    ),
    eye_openness_score: readOptionalBoundedNumber(
      raw.eye_openness_score ?? metrics?.eye_openness_score,
      0,
      100,
    ),
    complexion_redness_score: readOptionalBoundedNumber(
      raw.complexion_redness_score ?? metrics?.complexion_redness_score,
      0,
      100,
    ),
    pore_visibility_score: readOptionalBoundedNumber(
      raw.pore_visibility_score ?? metrics?.pore_visibility_score,
      0,
      100,
    ),
    skin_evenness_score: readOptionalBoundedNumber(
      raw.skin_evenness_score ?? metrics?.skin_evenness_score,
      0,
      100,
    ),
    skin_radiance_score: readOptionalBoundedNumber(
      raw.skin_radiance_score ?? metrics?.skin_radiance_score,
      0,
      100,
    ),
    lip_dryness_score: readOptionalBoundedNumber(
      raw.lip_dryness_score ?? metrics?.lip_dryness_score,
      0,
      100,
    ),
    forehead_smoothness_score: readOptionalBoundedNumber(
      raw.forehead_smoothness_score ?? metrics?.forehead_smoothness_score,
      0,
      100,
    ),
    t_zone_oiliness_score: readOptionalBoundedNumber(
      raw.t_zone_oiliness_score ?? metrics?.t_zone_oiliness_score,
      0,
      100,
    ),
    perceived_stress_level: readOptionalBoundedNumber(
      raw.perceived_stress_level ?? metrics?.perceived_stress_level,
      0,
      100,
    ),
    perceived_sleep_quality: readOptionalBoundedNumber(
      raw.perceived_sleep_quality ?? metrics?.perceived_sleep_quality,
      0,
      100,
    ),
  };
}

function normalizeBodyResult(raw: Record<string, unknown>): ScanBodyResult {
  const explicitBodyTypeKey =
    readExplicitKey(raw.body_type_key) ?? readExplicitKey(raw.body_type_code);
  const explicitMuscleMassKey =
    readExplicitKey(raw.muscle_mass_key) ?? readExplicitKey(raw.muscle_mass_code);
  const bodyTypeText = resolveText(
    raw.body_type_fallback_text ?? raw.body_type_i18n ?? raw.body_type
  );
  const muscleMassText = resolveText(
    raw.muscle_mass_fallback_text ?? raw.muscle_mass_label_i18n ?? raw.muscle_mass_label
  );
  const muscleMassKey = normalizeAlias('muscle_mass', explicitMuscleMassKey ?? muscleMassText);
  const bodyTypeKey = normalizeAlias('body_type', explicitBodyTypeKey ?? bodyTypeText);

  return {
    schema_version: 4,
    scan_type: 'body',
    analysis_meta: normalizeAnalysisMeta(raw.analysis_meta ?? raw.analysisMeta),
    body_score: readNumber(raw.body_score),
    body_fat_percentage: readNumber(raw.body_fat_percentage),
    muscle_mass_key: muscleMassKey,
    ...(muscleMassText ? { muscle_mass_fallback_text: muscleMassText } : {}),
    body_type_key: bodyTypeKey,
    ...(bodyTypeText ? { body_type_fallback_text: bodyTypeText } : {}),
    posture_score: readNumber(raw.posture_score),
    waist_estimation_cm: readNumber(raw.waist_estimation_cm),
    strength_index: readNumber(raw.strength_index),
    body_symmetry: readNumber(raw.body_symmetry),
    bmi_estimate: readNumber(raw.bmi_estimate),
    metabolic_age: readNumber(raw.metabolic_age),
  };
}

function normalizeNutritionResult(raw: Record<string, unknown>): ScanNutritionResult {
  const explicitVerdictKey = readExplicitKey(raw.verdict_key);
  const explicitGlycemicKey =
    readExplicitKey(raw.glycemic_index_key) ?? readExplicitKey(raw.glycemic_index_code);
  const explicitIngredientQualityKey =
    readExplicitKey(raw.ingredient_quality_key) ?? readExplicitKey(raw.ingredient_quality_code);
  const verdictText = resolveText(
    raw.verdict_fallback_text ?? raw.short_verdict_i18n ?? raw.short_verdict
  );
  const glycemicText = resolveText(
    raw.glycemic_index_fallback_text ??
      raw.glycemic_index_label_i18n ??
      raw.glycemic_index_label
  );
  const ingredientQualityText = resolveText(
    raw.ingredient_quality_fallback_text ??
      raw.ingredient_quality_i18n ??
      raw.ingredient_quality
  );
  const mainVitaminsValue =
    raw.main_vitamin_keys ??
    raw.main_vitamins_fallback_text ??
    raw.main_vitamins_i18n ??
    raw.main_vitamins;
  const mainVitaminKeys = normalizeVitaminKeys(mainVitaminsValue);
  const recognizedVitaminKeys = mainVitaminKeys.some((item) => item !== 'unknown');
  const candidates = [raw];
  const verdictKey = normalizeVerdictKey(explicitVerdictKey ?? verdictText);
  const glycemicIndexKey = normalizeGlycemicIndexKey(explicitGlycemicKey ?? glycemicText);
  const ingredientQualityKey = normalizeIngredientQualityKey(
    explicitIngredientQualityKey ?? ingredientQualityText
  );

  return {
    schema_version: 4,
    scan_type: 'nutrition',
    analysis_meta: normalizeAnalysisMeta(raw.analysis_meta ?? raw.analysisMeta),
    plate_health_score: readNumber(raw.plate_health_score),
    calories_estimate: readNumber(raw.calories_estimate),
    protein_grams: readNumber(raw.protein_grams),
    carbs_grams: readNumber(raw.carbs_grams),
    fat_grams: readNumber(raw.fat_grams),
    verdict_key: verdictKey,
    ...buildOptionalTextField('verdict_fallback_text', verdictText),
    glycemic_index_key: glycemicIndexKey,
    ...buildOptionalTextField('glycemic_index_fallback_text', glycemicText),
    satiety_index: readNumber(raw.satiety_index),
    ingredient_quality_key: ingredientQualityKey,
    ...buildOptionalTextField(
      'ingredient_quality_fallback_text',
      ingredientQualityText
    ),
    main_vitamin_keys: mainVitaminKeys,
    ...buildOptionalTextField(
      'main_vitamins_fallback_text',
      readLongVitaminFallbackText(
        raw.main_vitamins_fallback_text ??
          raw.main_vitamins_i18n ??
          raw.main_vitamins,
        recognizedVitaminKeys
      )
    ),
    ...buildOptionalTextField(
      'micronutrients',
      findFirstResolvedText(candidates, NUTRITION_MICRONUTRIENT_TEXT_FIELDS)
    ),
    ...buildOptionalTextField(
      'nutrition_points',
      findFirstResolvedText(candidates, NUTRITION_POINTS_TEXT_FIELDS)
    ),
    ...buildOptionalTextField(
      'recommendations',
      findFirstResolvedText(candidates, NUTRITION_RECOMMENDATION_TEXT_FIELDS)
    ),
    ...buildOptionalTextField(
      'dietary_details',
      findFirstResolvedText(candidates, NUTRITION_DIETARY_DETAILS_TEXT_FIELDS)
    ),
    ...buildOptionalTextField(
      'plate_analysis',
      findFirstResolvedText(candidates, NUTRITION_PLATE_ANALYSIS_TEXT_FIELDS)
    ),
    ...buildOptionalTextField(
      'estimated_composition',
      findFirstResolvedText(candidates, NUTRITION_ESTIMATED_COMPOSITION_TEXT_FIELDS)
    ),
  };
}

function normalizeDetectedCondition(raw: LegacyDetectedCondition | DetectedCondition): DetectedCondition {
  const rawRecord = raw as unknown as Record<string, unknown>;

  if ('severity_key' in raw && 'condition_key' in raw) {
    const normalizedConditionKey = normalizeSuperConditionKey(readString(raw.condition_key));
    const normalizedCategoryKey = normalizeSuperCategoryKey(readString(raw.category_key));
    const normalizedExplanationKey = normalizeSuperExplanationKey(readString(raw.explanation_key));
    const normalizedAdviceKey = normalizeSuperAdviceKey(readString(raw.advice_key));
    const conditionFallbackText = findFirstResolvedText(
      [rawRecord],
      SUPER_SCAN_CONDITION_NAME_FIELDS
    );
    const categoryFallbackText = findFirstResolvedText(
      [rawRecord],
      SUPER_SCAN_CATEGORY_FIELDS
    );
    const explanationFallbackText = findFirstResolvedText(
      [rawRecord],
      SUPER_SCAN_EXPLANATION_FIELDS
    );
    const adviceFallbackText = findFirstResolvedText(
      [rawRecord],
      SUPER_SCAN_ADVICE_FIELDS
    );

    return {
      condition_key: normalizedConditionKey,
      ...(preserveFallbackText(conditionFallbackText, normalizedConditionKey)
        ? {
            condition_fallback_text: preserveFallbackText(
              conditionFallbackText,
              normalizedConditionKey
            ),
          }
        : {}),
      category_key: normalizedCategoryKey,
      ...(preserveFallbackText(categoryFallbackText, normalizedCategoryKey)
        ? {
            category_fallback_text: preserveFallbackText(
              categoryFallbackText,
              normalizedCategoryKey
            ),
          }
        : {}),
      probability: readNumber(raw.probability),
      severity_key: normalizeSeverityKey(raw.severity_key),
      explanation_key: normalizedExplanationKey,
      ...(preserveFallbackText(explanationFallbackText, normalizedExplanationKey)
        ? {
            explanation_fallback_text: preserveFallbackText(
              explanationFallbackText,
              normalizedExplanationKey
            ),
          }
        : {}),
      advice_key: normalizedAdviceKey,
      ...(preserveFallbackText(adviceFallbackText, normalizedAdviceKey)
        ? {
            advice_fallback_text: preserveFallbackText(
              adviceFallbackText,
              normalizedAdviceKey
            ),
          }
        : {}),
    };
  }

  const legacyCondition = raw as LegacyDetectedCondition;
  const explicitConditionKey =
    readExplicitKey(rawRecord.condition_key) ?? readExplicitKey(legacyCondition.condition_code);
  const explicitCategoryKey =
    readExplicitKey(rawRecord.category_key) ?? readExplicitKey(legacyCondition.category_code);
  const explicitExplanationKey = readExplicitKey(rawRecord.explanation_key);
  const explicitAdviceKey = readExplicitKey(rawRecord.advice_key);
  const conditionText = findFirstResolvedText(
    [rawRecord],
    SUPER_SCAN_CONDITION_NAME_FIELDS
  );
  const categoryText = findFirstResolvedText(
    [rawRecord],
    SUPER_SCAN_CATEGORY_FIELDS
  );
  const explanationText = findFirstResolvedText(
    [rawRecord],
    SUPER_SCAN_EXPLANATION_FIELDS
  );
  const adviceText = findFirstResolvedText(
    [rawRecord],
    SUPER_SCAN_ADVICE_FIELDS
  );
  const normalizedConditionKey = normalizeSuperConditionKey(explicitConditionKey ?? conditionText);
  const normalizedCategoryKey = normalizeSuperCategoryKey(explicitCategoryKey ?? categoryText);
  const normalizedExplanationKey = normalizeSuperExplanationKey(
    explicitExplanationKey ?? explanationText
  );
  const normalizedAdviceKey = normalizeSuperAdviceKey(explicitAdviceKey ?? adviceText);

  return {
    condition_key: normalizedConditionKey,
    ...(preserveFallbackText(conditionText, normalizedConditionKey)
      ? {
          condition_fallback_text: preserveFallbackText(
            conditionText,
            normalizedConditionKey
          ),
        }
      : {}),
    category_key: normalizedCategoryKey,
    ...(preserveFallbackText(categoryText, normalizedCategoryKey)
      ? {
          category_fallback_text: preserveFallbackText(
            categoryText,
            normalizedCategoryKey
          ),
        }
      : {}),
    probability: readNumber(rawRecord.probability),
    severity_key: normalizeSeverityKey(legacyCondition.severity),
    explanation_key: normalizedExplanationKey,
    ...(preserveFallbackText(explanationText, normalizedExplanationKey)
      ? {
          explanation_fallback_text: preserveFallbackText(
            explanationText,
            normalizedExplanationKey
          ),
        }
      : {}),
    advice_key: normalizedAdviceKey,
    ...(preserveFallbackText(adviceText, normalizedAdviceKey)
      ? {
          advice_fallback_text: preserveFallbackText(
            adviceText,
            normalizedAdviceKey
          ),
        }
      : {}),
  };
}

function normalizeSuperScanResult(raw: Record<string, unknown>): SuperScanResult {
  const candidates = collectSuperScanCandidates(raw);
  const explicitSummaryKey = findFirstExplicitKey(candidates, ['summary_key']);
  const explicitDisclaimerKey = findFirstExplicitKey(candidates, ['disclaimer_key']);
  const summaryText =
    findFirstResolvedText(candidates, SUPER_SCAN_SUMMARY_FIELDS) ??
    findFirstResolvedText(candidates, SUPER_SCAN_ALT_TEXT_FIELDS) ??
    findFirstResolvedText(candidates, SUPER_SCAN_STATUS_FIELDS);
  const disclaimerText = findFirstResolvedText(
    candidates,
    SUPER_SCAN_DISCLAIMER_FIELDS
  );
  const rawDetectedConditions = findFirstArrayField(candidates, 'detected_conditions');
  const detectedConditions = Array.isArray(rawDetectedConditions)
    ? rawDetectedConditions
        .filter(isPlainObject)
        .map((condition) =>
          normalizeDetectedCondition(condition as unknown as LegacyDetectedCondition)
        )
    : [];
  const normalizedSummaryKey = normalizeSummaryKey(explicitSummaryKey ?? summaryText);
  const normalizedDisclaimerKey = normalizeDisclaimerKey(
    explicitDisclaimerKey ?? disclaimerText
  );

  return {
    schema_version: 3,
    scan_type: 'super_health_v2',
    global_risk_score:
      findFirstNumericValue(candidates, SUPER_SCAN_SCORE_FIELDS) ??
      readNumber(raw.global_risk_score),
    urgency_flag:
      findFirstBooleanValue(candidates, SUPER_SCAN_URGENCY_FIELDS) ??
      Boolean(raw.urgency_flag),
    summary_key: normalizedSummaryKey,
    ...(preserveFallbackText(summaryText, normalizedSummaryKey)
      ? {
          summary_fallback_text: preserveFallbackText(
            summaryText,
            normalizedSummaryKey
          ),
        }
      : {}),
    detected_conditions: detectedConditions,
    disclaimer_key: normalizedDisclaimerKey,
    ...(preserveFallbackText(disclaimerText, normalizedDisclaimerKey)
      ? {
          disclaimer_fallback_text: preserveFallbackText(
            disclaimerText,
            normalizedDisclaimerKey
          ),
        }
      : {}),
  };
}

function normalizeFatDistributionScanResult(
  raw: Record<string, unknown>
): FatDistributionScanResult {
  const candidates = collectSuperScanCandidates(raw);

  return {
    schema_version: 3,
    scan_type: 'fat_distribution_scan_v2',
    global_body_fat_estimate_percent: findFirstNumericValue(
      candidates,
      FAT_DISTRIBUTION_BODY_FAT_FIELDS
    ),
    global_facial_fat_estimate_percent: findFirstNumericValue(
      candidates,
      FAT_DISTRIBUTION_FACIAL_FAT_FIELDS
    ),
    global_water_retention_estimate_percent: findFirstNumericValue(
      candidates,
      FAT_DISTRIBUTION_WATER_RETENTION_FIELDS
    ) ?? 0,
    analysis_summary: findFirstResolvedText(
      candidates,
      FAT_DISTRIBUTION_SUMMARY_FIELDS
    ) ?? '',
    dominant_storage_pattern: findFirstResolvedText(
      candidates,
      FAT_DISTRIBUTION_PATTERN_FIELDS
    ) ?? '',
    areas_analysis: normalizeFatDistributionAreas(
      findFirstArrayField(candidates, 'areas_analysis')
    ),
    priority_zones: normalizeFatDistributionPriorityZones(
      findFirstArrayField(candidates, 'priority_zones')
    ),
    disclaimer_text: findFirstResolvedText(
      candidates,
      FAT_DISTRIBUTION_DISCLAIMER_FIELDS
    ) ?? '',
  } as FatDistributionScanResult;
}

function assertExpectedScanType(
  analysisResult: NormalizedStoredAnalysisResult,
  expectedScanType?: ScanType | null
) {
  if (!expectedScanType) {
    return;
  }

  const expectedAnalysisTypes = EXPECTED_ANALYSIS_TYPES[expectedScanType];
  if (
    expectedAnalysisTypes &&
    !expectedAnalysisTypes.includes(analysisResult.scan_type)
  ) {
    throw new Error(
      `Normalized analysis type mismatch: expected ${expectedAnalysisTypes.join(', ')}, received ${analysisResult.scan_type}`
    );
  }
}

export function isNormalizedAnalysisResult(
  value: unknown
): value is NormalizedStoredAnalysisResult {
  if (!isPlainObject(value)) {
    return false;
  }

  const scanType = readString(value.scan_type);
  if (!scanType) {
    return false;
  }

  if (
    scanType !== 'fat_distribution_scan_v2' &&
    ![2, 3, 4].includes(Number(value.schema_version))
  ) {
    return false;
  }

  switch (scanType) {
    case 'face':
      return !!readString(value.face_shape_key);
    case 'body':
      return !!readString(value.body_type_key) && !!readString(value.muscle_mass_key);
    case 'nutrition':
      return !!readString(value.verdict_key) && !!readString(value.glycemic_index_key);
    case 'super_health_v2':
      return !!readString(value.summary_key) && !!readString(value.disclaimer_key);
    case 'fat_distribution_scan_v2':
      return (
        Array.isArray(value.areas_analysis) &&
        Array.isArray(value.priority_zones)
      );
    default:
      return false;
  }
}

export function normalizeAnalysisResult(
  raw: StoredAnalysisResult,
  options: NormalizeAnalysisOptions = {}
): NormalizedStoredAnalysisResult {
  if (!isPlainObject(raw)) {
    throw new Error('Analysis payload must be an object');
  }

  let normalizedResult: NormalizedStoredAnalysisResult;
  switch (raw.scan_type) {
    case 'face':
      normalizedResult = normalizeFaceResult(raw);
      break;
    case 'body':
      normalizedResult = normalizeBodyResult(raw);
      break;
    case 'nutrition':
      normalizedResult = normalizeNutritionResult(raw);
      break;
    case 'super_health_v2':
      normalizedResult = normalizeSuperScanResult(raw);
      break;
    case 'fat_distribution_scan_v2':
      normalizedResult = normalizeFatDistributionScanResult(raw);
      break;
    default:
      throw new Error(
        `Unsupported analysis scan type: ${String((raw as Record<string, unknown>).scan_type)}`
      );
  }

  assertExpectedScanType(normalizedResult, options.expectedScanType);
  return normalizedResult;
}

export function tryNormalizeAnalysisResult(
  raw: unknown,
  options: NormalizeAnalysisOptions = {}
) {
  try {
    return normalizeAnalysisResult(raw as StoredAnalysisResult, options);
  } catch {
    return null;
  }
}
