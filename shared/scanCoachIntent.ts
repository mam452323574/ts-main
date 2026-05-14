import { PREMIUM_LOCKED_FIELDS } from '@/constants/premiumFields';
import {
  LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
  type CoachGenerationPromptType,
} from '@/shared/coachPromptTypes';

export type ScanCoachIntentSeverity = 'low' | 'medium' | 'high';

export type ScanCoachIntent = {
  scan_id?: string;
  scan_type: string;
  has_actionable_issue: boolean;
  priority_metric: string | null;
  priority_label: string | null;
  severity: ScanCoachIntentSeverity | null;
  reason: string | null;
  user_facing_summary: string;
  prompt_type: typeof LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE;
  question_key: string | null;
  question_text: string;
  fallback_prompt_type: 'latest_scan';
  premium_required: boolean;
};

export type CoachScanIntentPayload = Pick<
  ScanCoachIntent,
  | 'has_actionable_issue'
  | 'priority_metric'
  | 'priority_label'
  | 'severity'
  | 'question_text'
  | 'user_facing_summary'
>;

type ScanCoachIntentOptions = {
  locale?: string | null;
  scanId?: string | null;
  scanType?: string | null;
};

type MetricScanType = 'face' | 'body' | 'nutrition';

type MetricDirection = 'higher_is_worse' | 'lower_is_worse';

type MetricDefinition = {
  key: string;
  scanType: MetricScanType;
  label: string;
  reason: string;
  summary: string;
  questionKey: string;
  questionText: string;
  direction: MetricDirection;
  priority: number;
  normalize: (value: number) => number | null;
  low: number;
  medium: number;
  high: number;
};

type MetricSignal = {
  definition: MetricDefinition;
  value: number;
  severity: ScanCoachIntentSeverity;
  severityRank: number;
  intensity: number;
};

const FALLBACK_PROMPT_TYPE = 'latest_scan' as const;
const POSITIVE_SUMMARY =
  'Tes résultats sont globalement stables. Ton coach peut t’aider à maintenir cette progression.';
const POSITIVE_QUESTION_KEY = 'maintain_results_from_scan';
const POSITIVE_QUESTION_TEXT =
  'Comment maintenir mes bons résultats après ce scan ?';
const SUPER_PRIORITY_METRIC = 'global_risk_score';
const SUPER_PRIORITY_LABEL = 'Vigilance globale';
const SUPER_PRIORITY_REASON =
  'Le super scan met en avant un niveau de vigilance à clarifier calmement.';
const SUPER_PRIORITY_SUMMARY =
  'Le super scan fait ressortir une priorité globale à transformer en action simple.';
const SUPER_PRIORITY_QUESTION_KEY = 'latest_scan__top_priority_today';
const SUPER_PRIORITY_QUESTION_TEXT =
  'Quelle priorité traiter en premier après ce super scan ?';

const SCAN_COACH_INTENT_KEYS = [
  'scan_id',
  'scan_type',
  'has_actionable_issue',
  'priority_metric',
  'priority_label',
  'severity',
  'reason',
  'user_facing_summary',
  'prompt_type',
  'question_key',
  'question_text',
  'fallback_prompt_type',
  'premium_required',
] as const;

const COACH_SCAN_INTENT_PAYLOAD_KEYS = [
  'has_actionable_issue',
  'priority_metric',
  'priority_label',
  'severity',
  'question_text',
  'user_facing_summary',
] as const;

const STRONG_QUALITY_FLAGS = new Set([
  'blur',
  'low_light',
  'partial_subject',
  'occlusion',
  'portion_uncertain',
  'poor_lighting',
  'low_quality',
  'image_blur',
  'image_too_dark',
  'subject_occluded',
]);

const normalizeScore = (value: number) =>
  value >= 0 && value <= 100 ? value : null;

const normalizeScoreMaybeTen = (value: number) => {
  if (value >= 0 && value <= 10) {
    return value * 10;
  }

  return normalizeScore(value);
};

const normalizeBodyFatPercentage = (value: number) =>
  value >= 3 && value <= 75 ? value : null;

const normalizeGrams = (value: number) =>
  value >= 0 && value <= 250 ? value : null;

const normalizeVegetableRatio = (value: number) => {
  if (value >= 0 && value <= 1) {
    return value * 100;
  }

  return value >= 0 && value <= 100 ? value : null;
};

const METRICS: readonly MetricDefinition[] = [
  {
    key: 'hydration_level',
    scanType: 'face',
    label: 'Hydratation',
    reason: 'Le scan indique un niveau d’hydratation perfectible.',
    summary:
      'Ton hydratation semble être le point le plus intéressant à améliorer après ce scan.',
    questionKey: 'improve_hydration_from_scan',
    questionText:
      'Comment améliorer mon hydratation à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 1,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'fatigue_level',
    scanType: 'face',
    label: 'Fatigue visible',
    reason: 'Le scan met en avant des signes de fatigue à rééquilibrer.',
    summary:
      'La récupération semble être le point le plus utile à travailler après ce scan.',
    questionKey: 'improve_visible_fatigue_from_scan',
    questionText:
      'Comment améliorer ma récupération à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 2,
    normalize: normalizeScoreMaybeTen,
    low: 45,
    medium: 60,
    high: 80,
  },
  {
    key: 'skin_clarity_score',
    scanType: 'face',
    label: 'Clarté de peau',
    reason: 'Le scan suggère une clarté de peau perfectible.',
    summary:
      'La clarté de peau ressort comme un axe simple à soutenir après ce scan.',
    questionKey: 'improve_skin_clarity_from_scan',
    questionText:
      'Comment améliorer la clarté de ma peau à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 3,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'under_eye_shadow_score',
    scanType: 'face',
    label: 'Ombres sous les yeux',
    reason: 'Le scan relève des ombres sous les yeux à atténuer.',
    summary:
      'Le contour des yeux semble être un axe intéressant à soutenir après ce scan.',
    questionKey: 'improve_under_eye_shadow_from_scan',
    questionText:
      'Comment atténuer les ombres sous les yeux à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 4,
    normalize: normalizeScoreMaybeTen,
    low: 40,
    medium: 55,
    high: 75,
  },
  {
    key: 'complexion_redness_score',
    scanType: 'face',
    label: 'Rougeurs',
    reason: 'Le scan indique des rougeurs visibles à apaiser.',
    summary:
      'L’équilibre du teint semble être un axe utile à travailler après ce scan.',
    questionKey: 'improve_complexion_redness_from_scan',
    questionText:
      'Comment apaiser les rougeurs visibles à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 5,
    normalize: normalizeScoreMaybeTen,
    low: 40,
    medium: 55,
    high: 75,
  },
  {
    key: 'lip_dryness_score',
    scanType: 'face',
    label: 'Lèvres sèches',
    reason: 'Le scan relève une sécheresse des lèvres à améliorer.',
    summary:
      'Le confort des lèvres semble être un axe simple à soutenir après ce scan.',
    questionKey: 'improve_lip_dryness_from_scan',
    questionText:
      'Comment améliorer le confort de mes lèvres à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 6,
    normalize: normalizeScoreMaybeTen,
    low: 40,
    medium: 55,
    high: 75,
  },
  {
    key: 'perceived_stress_level',
    scanType: 'face',
    label: 'Stress perçu',
    reason: 'Le scan suggère un niveau de stress perçu à mieux réguler.',
    summary:
      'La régulation du stress semble être un axe intéressant après ce scan.',
    questionKey: 'improve_perceived_stress_from_scan',
    questionText:
      'Comment mieux réguler mon stress à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 7,
    normalize: normalizeScoreMaybeTen,
    low: 45,
    medium: 60,
    high: 80,
  },
  {
    key: 'perceived_sleep_quality',
    scanType: 'face',
    label: 'Sommeil perçu',
    reason: 'Le scan suggère une qualité de sommeil perfectible.',
    summary:
      'Le sommeil semble être un levier utile à soutenir après ce scan.',
    questionKey: 'improve_sleep_quality_from_scan',
    questionText:
      'Comment améliorer mon sommeil à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 8,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'posture_score',
    scanType: 'body',
    label: 'Posture',
    reason: 'Le scan indique une posture perfectible.',
    summary:
      'Ta posture semble être le point le plus intéressant à améliorer après ce scan.',
    questionKey: 'improve_posture_from_scan',
    questionText:
      'Comment améliorer ma posture à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 1,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 40,
  },
  {
    key: 'body_fat_percentage',
    scanType: 'body',
    label: 'Composition corporelle',
    reason: 'Le scan suggère une composition corporelle à optimiser.',
    summary:
      'La composition corporelle semble être un axe utile à travailler après ce scan.',
    questionKey: 'improve_body_composition_from_scan',
    questionText:
      'Comment améliorer ma composition corporelle à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 2,
    normalize: normalizeBodyFatPercentage,
    low: 20,
    medium: 25,
    high: 32,
  },
  {
    key: 'muscle_definition_score',
    scanType: 'body',
    label: 'Définition musculaire',
    reason: 'Le scan indique une définition musculaire perfectible.',
    summary:
      'La définition musculaire ressort comme un axe intéressant après ce scan.',
    questionKey: 'improve_muscle_definition_from_scan',
    questionText:
      'Comment améliorer ma définition musculaire à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 3,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'shoulder_alignment_score',
    scanType: 'body',
    label: 'Alignement des épaules',
    reason: 'Le scan suggère un alignement des épaules perfectible.',
    summary:
      'L’alignement des épaules semble être un axe utile à travailler après ce scan.',
    questionKey: 'improve_shoulder_alignment_from_scan',
    questionText:
      'Comment améliorer l’alignement de mes épaules à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 4,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'recovery_readiness_score',
    scanType: 'body',
    label: 'Récupération',
    reason: 'Le scan indique une récupération à mieux soutenir.',
    summary:
      'La récupération semble être le levier le plus utile après ce scan.',
    questionKey: 'improve_recovery_readiness_from_scan',
    questionText:
      'Comment mieux soutenir ma récupération à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 5,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'body_tension_indicator_score',
    scanType: 'body',
    label: 'Tension corporelle',
    reason: 'Le scan relève une tension corporelle à relâcher.',
    summary:
      'Le relâchement corporel semble être un axe intéressant après ce scan.',
    questionKey: 'improve_body_tension_from_scan',
    questionText:
      'Comment réduire ma tension corporelle à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 6,
    normalize: normalizeScoreMaybeTen,
    low: 40,
    medium: 55,
    high: 75,
  },
  {
    key: 'protein_grams',
    scanType: 'nutrition',
    label: 'Protéines',
    reason: 'Le scan suggère un apport en protéines à renforcer.',
    summary:
      'L’apport en protéines semble être le point le plus utile à améliorer après ce scan.',
    questionKey: 'improve_protein_from_scan',
    questionText:
      'Comment améliorer mon apport en protéines à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 1,
    normalize: normalizeGrams,
    low: 28,
    medium: 20,
    high: 10,
  },
  {
    key: 'fiber_grams_estimate',
    scanType: 'nutrition',
    label: 'Fibres',
    reason: 'Le scan suggère un apport en fibres à renforcer.',
    summary:
      'L’apport en fibres ressort comme un axe simple à soutenir après ce scan.',
    questionKey: 'improve_fiber_from_scan',
    questionText:
      'Comment augmenter mes fibres à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 2,
    normalize: normalizeGrams,
    low: 15,
    medium: 10,
    high: 5,
  },
  {
    key: 'sugar_grams_estimate',
    scanType: 'nutrition',
    label: 'Sucres',
    reason: 'Le scan indique une présence de sucres à mieux équilibrer.',
    summary:
      'L’équilibre des sucres semble être un axe utile après ce scan.',
    questionKey: 'improve_sugar_balance_from_scan',
    questionText:
      'Comment mieux équilibrer les sucres à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 3,
    normalize: normalizeGrams,
    low: 15,
    medium: 25,
    high: 45,
  },
  {
    key: 'processing_level_score',
    scanType: 'nutrition',
    label: 'Niveau de transformation',
    reason: 'Le scan suggère un niveau de transformation à réduire.',
    summary:
      'La qualité des ingrédients semble être un axe utile après ce scan.',
    questionKey: 'improve_processing_level_from_scan',
    questionText:
      'Comment réduire le niveau de transformation de mes repas à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 4,
    normalize: normalizeScoreMaybeTen,
    low: 35,
    medium: 50,
    high: 70,
  },
  {
    key: 'sodium_level_score',
    scanType: 'nutrition',
    label: 'Sodium',
    reason: 'Le scan suggère un niveau de sodium à mieux équilibrer.',
    summary:
      'L’équilibre du sodium semble être un axe intéressant après ce scan.',
    questionKey: 'improve_sodium_balance_from_scan',
    questionText:
      'Comment mieux équilibrer le sodium à partir de mon dernier scan ?',
    direction: 'higher_is_worse',
    priority: 5,
    normalize: normalizeScoreMaybeTen,
    low: 35,
    medium: 50,
    high: 70,
  },
  {
    key: 'meal_balance_score',
    scanType: 'nutrition',
    label: 'Équilibre du repas',
    reason: 'Le scan indique un équilibre de repas perfectible.',
    summary:
      'L’équilibre du repas semble être le point le plus intéressant à améliorer après ce scan.',
    questionKey: 'improve_meal_balance_from_scan',
    questionText:
      'Comment améliorer l’équilibre de mon repas à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 6,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
  {
    key: 'vegetable_portion_ratio',
    scanType: 'nutrition',
    label: 'Portion végétale',
    reason: 'Le scan suggère une portion végétale à renforcer.',
    summary:
      'La portion végétale semble être un axe simple à améliorer après ce scan.',
    questionKey: 'improve_vegetable_portion_from_scan',
    questionText:
      'Comment augmenter la portion végétale à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 7,
    normalize: normalizeVegetableRatio,
    low: 35,
    medium: 25,
    high: 10,
  },
  {
    key: 'protein_visibility_score',
    scanType: 'nutrition',
    label: 'Protéines visibles',
    reason: 'Le scan suggère une présence de protéines à rendre plus nette.',
    summary:
      'La présence de protéines visibles ressort comme un axe utile après ce scan.',
    questionKey: 'improve_visible_protein_from_scan',
    questionText:
      'Comment rendre mes protéines plus présentes dans mes repas à partir de mon dernier scan ?',
    direction: 'lower_is_worse',
    priority: 8,
    normalize: normalizeScoreMaybeTen,
    low: 65,
    medium: 55,
    high: 35,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown, maxLength = 120) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\r?\n+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return null;
  }

  return Array.from(normalized).slice(0, maxLength).join('');
}

function readNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getAnalysisRecord(value: unknown) {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed)) {
    return null;
  }

  const nested = parsed.analysis_result ?? parsed.analysisResult;
  if (isRecord(nested)) {
    return nested;
  }

  return parsed;
}

function findOwnValue(
  value: unknown,
  key: string,
  depth = 0,
): unknown | undefined {
  if (depth > 5 || value === null || typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findOwnValue(item, key, depth + 1);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, key)) {
    return record[key];
  }

  for (const item of Object.values(record)) {
    const found = findOwnValue(item, key, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function readMetricValue(payload: unknown, definition: MetricDefinition) {
  const rawValue = findOwnValue(payload, definition.key);
  const numeric = readNumber(rawValue);
  if (numeric === null || numeric === 0) {
    return null;
  }

  return definition.normalize(numeric);
}

function readReliabilityNumber(payload: unknown, key: string) {
  const rawValue = findOwnValue(payload, key);
  const numeric = readNumber(rawValue);
  return numeric !== null && numeric >= 0 && numeric <= 100 ? numeric : null;
}

function readLimitationFlags(payload: unknown) {
  const rawValue = findOwnValue(payload, 'limitation_flags');
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((flag) => readString(flag, 80))
    .filter((flag): flag is string => !!flag);
}

function hasReliableEnoughData(payload: unknown) {
  const confidenceScore = readReliabilityNumber(payload, 'confidence_score');
  const imageQualityScore = readReliabilityNumber(payload, 'image_quality_score');
  const metricCoverageScore = readReliabilityNumber(
    payload,
    'metric_coverage_score',
  );
  const limitationFlags = readLimitationFlags(payload);

  if (confidenceScore !== null && confidenceScore < 55) {
    return false;
  }

  if (imageQualityScore !== null && imageQualityScore < 45) {
    return false;
  }

  if (metricCoverageScore !== null && metricCoverageScore < 50) {
    return false;
  }

  return !(
    imageQualityScore !== null &&
    imageQualityScore < 65 &&
    limitationFlags.some((flag) => STRONG_QUALITY_FLAGS.has(flag))
  );
}

function normalizeScanType(value: unknown): string {
  const raw = readString(value, 80)?.toLowerCase();
  if (!raw) {
    return 'unknown';
  }

  if (raw === 'face' || raw === 'health' || raw === 'face_scan') {
    return 'face';
  }

  if (
    raw === 'body' ||
    raw === 'body_scan' ||
    raw === 'fat_distribution_scan_v2'
  ) {
    return 'body';
  }

  if (raw === 'nutrition' || raw === 'meal' || raw === 'food') {
    return 'nutrition';
  }

  if (raw === 'super' || raw === 'super_health_v2') {
    return 'super';
  }

  return raw;
}

function resolveScanType(payload: unknown, options: ScanCoachIntentOptions) {
  const root = isRecord(payload) ? payload : null;
  const nested = root
    ? root.analysis_result ?? root.analysisResult
    : null;

  return normalizeScanType(
    options.scanType ??
      root?.scan_type ??
      root?.type ??
      root?.normalized_scan_type ??
      (isRecord(nested) ? nested.scan_type ?? nested.type : null),
  );
}

function resolveScanId(payload: unknown, options: ScanCoachIntentOptions) {
  const root = isRecord(payload) ? payload : null;
  return readString(options.scanId ?? root?.id ?? root?.scan_id, 120);
}

function resolveSeverity(definition: MetricDefinition, value: number) {
  if (definition.direction === 'lower_is_worse') {
    if (value <= definition.high) return 'high';
    if (value <= definition.medium) return 'medium';
    if (value <= definition.low) return 'low';
    return null;
  }

  if (value >= definition.high) return 'high';
  if (value >= definition.medium) return 'medium';
  if (value >= definition.low) return 'low';
  return null;
}

function severityRank(severity: ScanCoachIntentSeverity) {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}

function resolveIntensity(definition: MetricDefinition, value: number) {
  return definition.direction === 'lower_is_worse' ? 100 - value : value;
}

function findSignals(payload: unknown, scanType: string): MetricSignal[] {
  if (
    scanType !== 'face' &&
    scanType !== 'body' &&
    scanType !== 'nutrition'
  ) {
    return [];
  }

  return METRICS.filter((definition) => definition.scanType === scanType)
    .map((definition) => {
      const value = readMetricValue(payload, definition);
      if (value === null) {
        return null;
      }

      const severity = resolveSeverity(definition, value);
      if (!severity) {
        return null;
      }

      return {
        definition,
        value,
        severity,
        severityRank: severityRank(severity),
        intensity: resolveIntensity(definition, value),
      };
    })
    .filter((signal): signal is MetricSignal => signal !== null)
    .sort((left, right) => {
      if (right.severityRank !== left.severityRank) {
        return right.severityRank - left.severityRank;
      }

      if (left.definition.priority !== right.definition.priority) {
        return left.definition.priority - right.definition.priority;
      }

      return right.intensity - left.intensity;
    });
}

function resolveSuperScanSeverity(options: {
  score: number | null;
  urgencyFlag: boolean;
}): ScanCoachIntentSeverity | null {
  if (options.urgencyFlag || (options.score !== null && options.score >= 70)) {
    return 'high';
  }

  if (options.score !== null && options.score >= 55) {
    return 'medium';
  }

  if (options.score !== null && options.score >= 40) {
    return 'low';
  }

  return null;
}

function resolveSuperScanSignal(payload: unknown) {
  const rawScore = readNumber(findOwnValue(payload, SUPER_PRIORITY_METRIC));
  const score = rawScore !== null ? normalizeScore(rawScore) : null;
  const urgencyValue = findOwnValue(payload, 'urgency_flag');
  const urgencyFlag =
    urgencyValue === true ||
    (typeof urgencyValue === 'string' &&
      urgencyValue.trim().toLowerCase() === 'true');
  const severity = resolveSuperScanSeverity({ score, urgencyFlag });

  if (!severity) {
    return null;
  }

  return {
    metric: SUPER_PRIORITY_METRIC,
    label: SUPER_PRIORITY_LABEL,
    severity,
    reason: SUPER_PRIORITY_REASON,
    summary: SUPER_PRIORITY_SUMMARY,
    questionKey: SUPER_PRIORITY_QUESTION_KEY,
    questionText: SUPER_PRIORITY_QUESTION_TEXT,
  };
}

function isPremiumMetric(scanType: string, metricKey: string | null) {
  if (
    !metricKey ||
    (scanType !== 'face' && scanType !== 'body' && scanType !== 'nutrition')
  ) {
    return false;
  }

  return PREMIUM_LOCKED_FIELDS?.[scanType]?.includes(metricKey) ?? false;
}

function buildFallback(scanId: string | null, scanType: string): ScanCoachIntent {
  return {
    ...(scanId ? { scan_id: scanId } : {}),
    scan_type: scanType,
    has_actionable_issue: false,
    priority_metric: null,
    priority_label: null,
    severity: null,
    reason: null,
    user_facing_summary: POSITIVE_SUMMARY,
    prompt_type: LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
    question_key: POSITIVE_QUESTION_KEY,
    question_text: POSITIVE_QUESTION_TEXT,
    fallback_prompt_type: FALLBACK_PROMPT_TYPE,
    premium_required: false,
  };
}

export function scanCoachIntent(
  analysisResult: unknown,
  options: ScanCoachIntentOptions = {},
): ScanCoachIntent {
  const payload = getAnalysisRecord(analysisResult);
  const scanType = resolveScanType(analysisResult, options);
  const scanId = resolveScanId(analysisResult, options);
  if (!payload || !hasReliableEnoughData(payload)) {
    return buildFallback(scanId, scanType);
  }

  if (scanType === 'super') {
    const superSignal = resolveSuperScanSignal(payload);

    if (!superSignal) {
      return buildFallback(scanId, scanType);
    }

    return {
      ...(scanId ? { scan_id: scanId } : {}),
      scan_type: scanType,
      has_actionable_issue: true,
      priority_metric: superSignal.metric,
      priority_label: superSignal.label,
      severity: superSignal.severity,
      reason: superSignal.reason,
      user_facing_summary: superSignal.summary,
      prompt_type: LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
      question_key: superSignal.questionKey,
      question_text: superSignal.questionText,
      fallback_prompt_type: FALLBACK_PROMPT_TYPE,
      premium_required: false,
    };
  }

  const [prioritySignal] = findSignals(payload, scanType);
  if (!prioritySignal) {
    return buildFallback(scanId, scanType);
  }

  const { definition, severity } = prioritySignal;

  return {
    ...(scanId ? { scan_id: scanId } : {}),
    scan_type: scanType,
    has_actionable_issue: true,
    priority_metric: definition.key,
    priority_label: definition.label,
    severity,
    reason: definition.reason,
    user_facing_summary: definition.summary,
    prompt_type: LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
    question_key: definition.questionKey,
    question_text: definition.questionText,
    fallback_prompt_type: FALLBACK_PROMPT_TYPE,
    premium_required: isPremiumMetric(scanType, definition.key),
  };
}

function sanitizeSeverity(value: unknown): ScanCoachIntentSeverity | null | false {
  if (value === null) {
    return null;
  }

  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : false;
}

function readNullableString(value: unknown, maxLength: number) {
  if (value === null) {
    return null;
  }

  return readString(value, maxLength);
}

export function sanitizeScanCoachIntent(value: unknown): ScanCoachIntent | null {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed) || typeof parsed.has_actionable_issue !== 'boolean') {
    return null;
  }

  const keys = Object.keys(parsed);
  const allowedKeys = SCAN_COACH_INTENT_KEYS as readonly string[];
  const requiredKeys = SCAN_COACH_INTENT_KEYS.filter((key) => key !== 'scan_id');
  if (
    keys.some((key) => !allowedKeys.includes(key)) ||
    requiredKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(parsed, key),
    )
  ) {
    return null;
  }

  if (parsed.prompt_type !== LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE) {
    return null;
  }

  if (parsed.fallback_prompt_type !== FALLBACK_PROMPT_TYPE) {
    return null;
  }

  if (typeof parsed.premium_required !== 'boolean') {
    return null;
  }

  const scanId =
    Object.prototype.hasOwnProperty.call(parsed, 'scan_id')
      ? readString(parsed.scan_id, 120)
      : null;
  const scanType = readString(parsed.scan_type, 80);
  const priorityMetric = readNullableString(parsed.priority_metric, 80);
  const priorityLabel = readNullableString(parsed.priority_label, 120);
  const severity = sanitizeSeverity(parsed.severity);
  const reason = readNullableString(parsed.reason, 320);
  const summary = readString(parsed.user_facing_summary, 500);
  const questionKey = readNullableString(parsed.question_key, 120);
  const questionText = readString(parsed.question_text, 280);

  if (
    (Object.prototype.hasOwnProperty.call(parsed, 'scan_id') && !scanId) ||
    !scanType ||
    (parsed.priority_metric !== null && !priorityMetric) ||
    (parsed.priority_label !== null && !priorityLabel) ||
    severity === false ||
    (parsed.reason !== null && !reason) ||
    !summary ||
    (parsed.question_key !== null && !questionKey) ||
    !questionText
  ) {
    return null;
  }

  return {
    ...(scanId ? { scan_id: scanId } : {}),
    scan_type: scanType,
    has_actionable_issue: parsed.has_actionable_issue,
    priority_metric: priorityMetric,
    priority_label: priorityLabel,
    severity,
    reason,
    user_facing_summary: summary,
    prompt_type: LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
    question_key: questionKey,
    question_text: questionText,
    fallback_prompt_type: FALLBACK_PROMPT_TYPE,
    premium_required: parsed.premium_required,
  };
}

export function buildCoachScanIntentPayload(
  intent: ScanCoachIntent,
): CoachScanIntentPayload {
  return {
    has_actionable_issue: intent.has_actionable_issue,
    priority_metric: intent.priority_metric,
    priority_label: intent.priority_label,
    severity: intent.severity,
    question_text: intent.question_text,
    user_facing_summary: intent.user_facing_summary,
  };
}

export function normalizeCoachScanIntentPayload(
  value: unknown,
): CoachScanIntentPayload | null {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed) || typeof parsed.has_actionable_issue !== 'boolean') {
    return null;
  }

  const keys = Object.keys(parsed);
  const allowedKeys = new Set<string>([
    ...COACH_SCAN_INTENT_PAYLOAD_KEYS,
    ...SCAN_COACH_INTENT_KEYS,
  ]);
  if (keys.some((key) => !allowedKeys.has(key))) {
    return null;
  }

  const priorityMetric = readNullableString(parsed.priority_metric, 80);
  const priorityLabel = readNullableString(parsed.priority_label, 120);
  const severity = sanitizeSeverity(parsed.severity);
  const questionText = readString(parsed.question_text, 280);
  const summary = readString(parsed.user_facing_summary, 500);

  if (
    (parsed.priority_metric !== null && !priorityMetric) ||
    (parsed.priority_label !== null && !priorityLabel) ||
    severity === false ||
    !questionText ||
    !summary
  ) {
    return null;
  }

  return {
    has_actionable_issue: parsed.has_actionable_issue,
    priority_metric: priorityMetric,
    priority_label: priorityLabel,
    severity,
    question_text: questionText,
    user_facing_summary: summary,
  };
}

export function encodeScanCoachIntentParam(intent: ScanCoachIntent) {
  return encodeURIComponent(JSON.stringify(intent));
}

export function decodeScanCoachIntentParam(
  value: string | string[] | null | undefined,
) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return null;
  }

  try {
    return sanitizeScanCoachIntent(JSON.parse(decodeURIComponent(rawValue)));
  } catch {
    return null;
  }
}

export function resolvePromptTypeForScanCoachIntent(): CoachGenerationPromptType {
  return LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE;
}

export function buildCoachGenerationInputFromScanCoachIntent(
  intent: ScanCoachIntent,
  _options: { accountTier?: string | null } = {},
): {
  promptType: CoachGenerationPromptType;
  questionKey: null;
  questionText: string;
} {
  return {
    promptType: LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
    questionKey: null,
    questionText: intent.question_text,
  };
}
