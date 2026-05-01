import {
  AnalysisResult,
  ShareStoryMetric,
  ShareStoryPayload,
  ShareableAnalysisResult,
  SocialCategory,
  SuperScanResult,
} from '@/types';

import {
  getAnalysisResultScanType,
  tryNormalizeAnalysisResult,
} from '@/utils/analysisNormalization';
import {
  formatAge,
  formatCalories as formatCaloriesValue,
} from '@/utils/scanFormatters';
import { localizeQualitativeLevel } from '@/utils/resultLocalization';
import {
  normalizeAppGeneratedImageUri,
  normalizeTrustedImageUri,
} from '@/utils/urlSecurity';

type Translator = (scope: string, options?: Record<string, unknown>) => string;

interface BuildShareStoryPayloadOptions {
  analysisData: ShareableAnalysisResult;
  imageUri?: string | null;
  avatarUrl?: string | null;
  t: Translator;
  locale?: string | null;
}

const FOOTER_BRAND = 'HEALTH SCAN';
const EMPTY_FOOTER_CTA = '';
const SHARE_STORY_VARIANTS = ['face', 'body', 'nutrition', 'super'] as const;
const SHARE_STORY_STATUS_TONES = ['neutral', 'warning'] as const;
const SHARE_STORY_VALUE_VARIANTS = ['numeric', 'fraction', 'text'] as const;

export interface ShareStoryRouteParams {
  [key: string]: string | undefined;
  analysisData: string;
  imageUri: string;
  scanId: string;
}

function tx(t: Translator, key: string, options?: Record<string, unknown>) {
  return String(t(key, options));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function formatScoreValue(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatOutOfHundred(value: number) {
  return `${Math.max(0, Math.round(value))}`;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.round(value))}%`;
}

function formatSatiety(value: number) {
  return `${Math.max(0, Math.round(value))}/10`;
}

function resolveHeroImageUri(imageUri?: string | null, avatarUrl?: string | null) {
  return normalizeAppGeneratedImageUri(imageUri) ?? normalizeTrustedImageUri(avatarUrl);
}

function createMetric(
  label: string,
  value: string,
  options: {
    valueVariant: ShareStoryMetric['valueVariant'];
    labelMaxLines?: number;
    valueMaxLines?: number;
  },
): ShareStoryMetric {
  return {
    label,
    value,
    valueVariant: options.valueVariant,
    labelMaxLines: options.labelMaxLines ?? 2,
    valueMaxLines:
      options.valueMaxLines ?? (options.valueVariant === 'text' ? 2 : 1),
  };
}

function normalizeShareStoryErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '';
  }

  return error.message.trim().toLowerCase();
}

export function resolveShareStoryExportErrorMessage(
  error: unknown,
  t: Translator,
) {
  const normalizedMessage = normalizeShareStoryErrorMessage(error);
  if (
    normalizedMessage.includes('cancel') ||
    normalizedMessage.includes('dismiss')
  ) {
    return null;
  }

  if (
    normalizedMessage.includes('permission') ||
    normalizedMessage.includes('denied') ||
    normalizedMessage.includes('forbidden') ||
    normalizedMessage.includes('not allowed')
  ) {
    return tx(t, 'share_story.error.permission_message');
  }

  if (
    normalizedMessage.includes('capture') ||
    normalizedMessage.includes('snapshot') ||
    normalizedMessage.includes('view-shot') ||
    normalizedMessage.includes('tmpfile') ||
    normalizedMessage.includes('write') ||
    normalizedMessage.includes('save') ||
    normalizedMessage.includes('export')
  ) {
    return tx(t, 'share_story.error.capture_message');
  }

  return tx(t, 'share_story.error.message');
}

function parseShareStoryMetric(value: unknown): ShareStoryMetric | null {
  if (!isRecord(value)) {
    return null;
  }

  const valueVariant = value.valueVariant;
  const labelMaxLines = value.labelMaxLines;
  const valueMaxLines = value.valueMaxLines;

  if (
    typeof value.label !== 'string' ||
    typeof value.value !== 'string' ||
    !SHARE_STORY_VALUE_VARIANTS.includes(
      valueVariant as ShareStoryMetric['valueVariant'],
    ) ||
    !isPositiveInteger(labelMaxLines) ||
    !isPositiveInteger(valueMaxLines)
  ) {
    return null;
  }

  return {
    label: value.label,
    value: value.value,
    valueVariant: valueVariant as ShareStoryMetric['valueVariant'],
    labelMaxLines,
    valueMaxLines,
  };
}

export function parseShareStoryPayload(value: unknown): ShareStoryPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const variant = value.variant;
  const score = value.score;

  if (
    !SHARE_STORY_VARIANTS.includes(variant as ShareStoryPayload['variant']) ||
    typeof value.variantLabel !== 'string' ||
    !isFiniteNumber(score) ||
    typeof value.scoreLabel !== 'string' ||
    !Array.isArray(value.metrics) ||
    typeof value.accentColor !== 'string' ||
    typeof value.footerBrand !== 'string' ||
    typeof value.footerCta !== 'string'
  ) {
    return null;
  }

  const metrics = value.metrics
    .map((metric) => parseShareStoryMetric(metric))
    .filter((metric): metric is ShareStoryMetric => metric !== null);

  if (metrics.length !== value.metrics.length) {
    return null;
  }

  const statusTone = readOptionalString(value.statusTone);
  if (
    statusTone !== null &&
    !SHARE_STORY_STATUS_TONES.includes(
      statusTone as NonNullable<ShareStoryPayload['statusTone']>,
    )
  ) {
    return null;
  }

  return {
    variant: variant as ShareStoryPayload['variant'],
    variantLabel: value.variantLabel,
    score,
    scoreLabel: value.scoreLabel,
    heroImageUri: normalizeTrustedImageUri(readOptionalString(value.heroImageUri)),
    metrics,
    accentColor: value.accentColor,
    accentColorSecondary: readOptionalString(value.accentColorSecondary) ?? undefined,
    headline: readOptionalString(value.headline) ?? undefined,
    footerBrand: value.footerBrand,
    footerCta: value.footerCta,
    statusBadgeLabel: readOptionalString(value.statusBadgeLabel) ?? undefined,
    statusTone: (statusTone ?? undefined) as ShareStoryPayload['statusTone'] | undefined,
  };
}

export function parseShareableAnalysisData(
  value: string | string[] | undefined,
): ShareableAnalysisResult | null {
  if (!value) {
    return null;
  }

  const serialized = Array.isArray(value) ? value[0] : value;
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized);
    if (getAnalysisResultScanType(parsed) === 'fat_distribution_scan_v2') {
      return null;
    }

    return tryNormalizeAnalysisResult(parsed) as ShareableAnalysisResult | null;
  } catch {
    return null;
  }
}

export function buildShareStoryRouteParams(options: {
  analysisData: ShareableAnalysisResult;
  imageUri?: string | null;
  scanId?: string | null;
}): ShareStoryRouteParams {
  return {
    analysisData: JSON.stringify(options.analysisData),
    imageUri: normalizeAppGeneratedImageUri(options.imageUri) ?? '',
    scanId: options.scanId?.trim() ?? '',
  };
}

export function resolveDefaultSocialCategoryForSharePayload(
  payload?: ShareStoryPayload | null,
): SocialCategory {
  if (payload?.variant === 'nutrition') {
    return 'food';
  }

  return 'physique';
}

function buildFacePayload(
  analysisData: AnalysisResult,
  heroImageUri: string | null,
  t: Translator,
  locale?: string | null,
): ShareStoryPayload {
  const faceData = analysisData as Extract<AnalysisResult, { scan_type: 'face' }>;

  return {
    variant: 'face',
    variantLabel: tx(t, 'share_story.variant.face'),
    score: formatScoreValue(faceData.face_score),
    scoreLabel: tx(t, 'share_story.score.global'),
    heroImageUri,
    metrics: [
      createMetric(
        tx(t, 'share_story.metrics.perceived_age'),
        formatAge(faceData.perceived_age, {
          locale,
          suffix: tx(t, 'common.years_short'),
        }),
        { valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.symmetry'),
        formatPercent(faceData.symmetry_percentage),
        { valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.energy'),
        formatOutOfHundred(100 - faceData.fatigue_level),
        { valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ),
    ],
    accentColor: '#0A84FF',
    footerBrand: FOOTER_BRAND,
    footerCta: EMPTY_FOOTER_CTA,
  };
}

function buildBodyPayload(
  analysisData: AnalysisResult,
  heroImageUri: string | null,
  t: Translator,
  locale?: string | null,
): ShareStoryPayload {
  const bodyData = analysisData as Extract<AnalysisResult, { scan_type: 'body' }>;

  return {
    variant: 'body',
    variantLabel: tx(t, 'share_story.variant.body'),
    score: formatScoreValue(bodyData.body_score),
    scoreLabel: tx(t, 'share_story.score.global'),
    heroImageUri,
    metrics: [
      createMetric(
        tx(t, 'share_story.metrics.metabolic_age'),
        formatAge(bodyData.metabolic_age, {
          locale,
          suffix: tx(t, 'common.years_short'),
        }),
        { valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.symmetry'),
        formatOutOfHundred(bodyData.body_symmetry),
        { valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.strength'),
        formatOutOfHundred(bodyData.strength_index),
        { valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ),
    ],
    accentColor: '#63E6BE',
    footerBrand: FOOTER_BRAND,
    footerCta: EMPTY_FOOTER_CTA,
  };
}

function buildNutritionPayload(
  analysisData: AnalysisResult,
  heroImageUri: string | null,
  t: Translator,
  locale?: string | null,
): ShareStoryPayload {
  const nutritionData = analysisData as Extract<
    AnalysisResult,
    { scan_type: 'nutrition' }
  >;

  return {
    variant: 'nutrition',
    variantLabel: tx(t, 'share_story.variant.nutrition'),
    score: formatScoreValue(nutritionData.plate_health_score),
    scoreLabel: tx(t, 'share_story.score.global'),
    heroImageUri,
    metrics: [
      createMetric(
        tx(t, 'share_story.metrics.calories'),
        formatCaloriesValue(nutritionData.calories_estimate, { locale }),
        { valueVariant: 'numeric', labelMaxLines: 1, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.satiety'),
        formatSatiety(nutritionData.satiety_index),
        { valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.quality'),
        localizeQualitativeLevel(
          'ingredient_quality',
          nutritionData.ingredient_quality_key,
          t,
          '-',
        ),
        { valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
      ),
    ],
    accentColor: '#5FD3BC',
    accentColorSecondary: '#0F766E',
    footerBrand: FOOTER_BRAND,
    footerCta: EMPTY_FOOTER_CTA,
  };
}

function buildSuperPayload(
  analysisData: SuperScanResult,
  heroImageUri: string | null,
  t: Translator,
): ShareStoryPayload {
  return {
    variant: 'super',
    variantLabel: tx(t, 'share_story.variant.super'),
    score: formatScoreValue(analysisData.global_risk_score),
    scoreLabel: tx(t, 'share_story.score.risk'),
    heroImageUri,
    metrics: [
      createMetric(
        tx(t, 'share_story.metrics.risk'),
        `${formatScoreValue(analysisData.global_risk_score)}/100`,
        { valueVariant: 'fraction', labelMaxLines: 1, valueMaxLines: 1 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.urgency'),
        analysisData.urgency_flag
          ? tx(t, 'share_story.urgency.high')
          : tx(t, 'share_story.urgency.normal'),
        { valueVariant: 'text', labelMaxLines: 1, valueMaxLines: 2 },
      ),
      createMetric(
        tx(t, 'share_story.metrics.conditions'),
        `${analysisData.detected_conditions.length}`,
        { valueVariant: 'numeric', labelMaxLines: 2, valueMaxLines: 1 },
      ),
    ],
    accentColor: '#1F4E79',
    accentColorSecondary: '#5B8DEF',
    footerBrand: FOOTER_BRAND,
    footerCta: EMPTY_FOOTER_CTA,
    statusBadgeLabel: analysisData.urgency_flag
      ? tx(t, 'share_story.badge.attention')
      : tx(t, 'share_story.badge.report'),
    statusTone: analysisData.urgency_flag ? 'warning' : 'neutral',
  };
}

export function buildShareStoryPayload({
  analysisData,
  imageUri,
  avatarUrl,
  t,
  locale,
}: BuildShareStoryPayloadOptions): ShareStoryPayload | null {
  if (getAnalysisResultScanType(analysisData) === 'fat_distribution_scan_v2') {
    return null;
  }

  const heroImageUri = resolveHeroImageUri(imageUri, avatarUrl);

  switch (analysisData.scan_type) {
    case 'face':
      return buildFacePayload(analysisData, heroImageUri, t, locale);
    case 'body':
      return buildBodyPayload(analysisData, heroImageUri, t, locale);
    case 'nutrition':
      return buildNutritionPayload(analysisData, heroImageUri, t, locale);
    case 'super_health_v2':
      return buildSuperPayload(analysisData, heroImageUri, t);
    default:
      return buildSuperPayload(analysisData as SuperScanResult, heroImageUri, t);
  }
}
