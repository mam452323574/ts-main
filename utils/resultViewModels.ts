import { isFieldLocked } from '@/constants/premiumFields';
import {
  AnalysisResult,
  DetectedCondition,
  FatDistributionScanResult,
  PremiumPotentialHistoryPoint,
  ScanFaceResult,
  SuperScanResult,
} from '@/types';
import {
  formatAge,
  formatBMI,
  formatCalories,
  formatCm,
  formatGrams,
  parseSafeNumber,
  formatPercentage,
  formatPlainNumber,
  formatScore10,
  formatScore100,
  safeGaugeScore,
} from '@/utils/scanFormatters';
import {
  localizeDisplayNutritionVitaminKeys,
  localizeDisplayQualitativeLevel,
  localizeDisplayVerdict,
  localizeSuperScanDisclaimerKey,
  localizeSuperScanSummaryKey,
} from '@/utils/resultLocalization';
import {
  isFatDistributionScanResult,
} from '@/utils/analysisNormalization';
import {
  buildLoadingTrajectoryPlaceholder,
  buildLockedTrajectoryTeaser,
  buildThirtyDayProjection,
} from '@/utils/resultProjection';
import type {
  ResultIconToken,
  ResultMetricIconToken,
  ResultScanIconToken,
} from '@/utils/resultIconCatalog';
import { PremiumRenderState } from '@/utils/subscription';
import {
  resolveResultItemThemeSpec,
  type ResultItemThemeSpec,
} from '@/utils/resultVisualTheme';

type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

export type ResultValueVariant = 'numeric' | 'fraction' | 'text';

export interface ResultQuickStatViewModel {
  id: string;
  icon: ResultIconToken;
  label: string;
  value: string;
  valueVariant: ResultValueVariant;
  theme: ResultItemThemeSpec;
  labelMaxLines?: number;
  valueMaxLines?: number;
  span?: 'half' | 'full';
}

export interface ResultMetricViewModel {
  id: string;
  icon: ResultIconToken;
  title: string;
  value: string;
  valueVariant: ResultValueVariant;
  theme: ResultItemThemeSpec;
  titleMaxLines?: number;
  valueMaxLines?: number;
  premiumRenderState?: PremiumRenderState;
}

export interface ResultLongTextSectionViewModel {
  id: string;
  icon: ResultIconToken;
  title: string;
  body?: string;
  tags?: string[];
  theme: ResultItemThemeSpec;
  premiumRenderState?: PremiumRenderState;
  collapsedMaxLines?: number;
}

export interface ResultMacroViewModel {
  title: string;
  items: {
    id: string;
    icon: ResultIconToken;
    label: string;
    value: string;
    valueVariant: ResultValueVariant;
    theme: ResultItemThemeSpec;
    premiumRenderState?: PremiumRenderState;
  }[];
}

export interface ResultTrajectoryCheckpointViewModel {
  id: string;
  label: string;
  value: string;
  isHighlighted?: boolean;
}

export interface ResultTrajectoryPointViewModel {
  id: string;
  day: number;
  date: string;
  chartValue: number;
  displayValue: number;
}

export interface ResultTrajectoryViewModel {
  shouldRender: boolean;
  premiumRenderState: PremiumRenderState;
  hookLabel: string;
  title: string;
  badgeLabel: string;
  headline: string;
  subtitle: string;
  ctaLabel?: string;
  footnote?: string;
  points: ResultTrajectoryPointViewModel[];
  series: number[];
  checkpoints: ResultTrajectoryCheckpointViewModel[];
}

export interface ScanResultViewModel {
  scanType: ResultScanIconToken;
  typeLabel: string;
  scoreLabel: string;
  score: number;
  analysisQualityLabel?: string | null;
  quickStats: ResultQuickStatViewModel[];
  metrics: ResultMetricViewModel[];
  premiumMetrics: ResultMetricViewModel[];
  macros?: ResultMacroViewModel;
  nutritionLongSections?: ResultLongTextSectionViewModel[];
}

export interface LegacySuperScanResultViewModel {
  kind: 'legacy';
  globalRiskScore: number;
  analysisSummary: string;
  analysisSummarySource: 'summary_fallback_text' | 'summary_key';
  disclaimerText: string;
  disclaimerSource: 'disclaimer_fallback_text' | 'disclaimer_key';
  conditions: DetectedCondition[];
}

export interface FatDistributionPrimaryMetricViewModel {
  id: 'body_fat' | 'facial_fat' | 'water_retention';
  label: string;
  value: string;
  premiumRenderState?: PremiumRenderState;
}

export interface FatDistributionAreaViewModel {
  id: string;
  areaName: string;
  dominantType: string;
  subcutaneousFatPercent: string;
  waterRetentionPercent: string;
  definitionPercent: string;
  confidencePercent: string;
  explanation: string;
  actionableAdvice: string;
}

export interface FatDistributionSuperScanResultViewModel {
  kind: 'fat_distribution';
  analysisSummary: string;
  primaryMetrics: FatDistributionPrimaryMetricViewModel[];
  dominantStoragePattern: string;
  priorityZones: string[];
  areas: FatDistributionAreaViewModel[];
  disclaimerText: string;
}

export type SuperScanResultViewModel = LegacySuperScanResultViewModel;

function createHiddenTrajectoryViewModel(
  premiumRenderState: PremiumRenderState,
): ResultTrajectoryViewModel {
  return {
    shouldRender: false,
    premiumRenderState,
    hookLabel: '',
    title: '',
    badgeLabel: '',
    headline: '',
    subtitle: '',
    points: [],
    series: [],
    checkpoints: [],
  };
}

function readPreferredText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type MetricViewModelOverrides = {
  id?: string;
  titleMaxLines?: number;
  valueMaxLines?: number;
  premiumRenderState?: PremiumRenderState;
  semanticValueKey?: string | null;
  themeOverrides?: Partial<ResultItemThemeSpec>;
};

function metric(
  scanType: ResultScanIconToken,
  id: ResultMetricIconToken,
  title: string,
  value: string,
  valueVariant: ResultValueVariant,
  overrides: MetricViewModelOverrides = {},
): ResultMetricViewModel {
  const { semanticValueKey, themeOverrides } = overrides;

  return {
    id: overrides.id ?? id,
    icon: id,
    title,
    value,
    valueVariant,
    theme: resolveResultItemThemeSpec({
      scanType,
      metricId: id,
      semanticValueKey,
      overrides: themeOverrides,
    }),
    titleMaxLines: overrides.titleMaxLines ?? 1,
    valueMaxLines: overrides.valueMaxLines ?? (valueVariant === 'text' ? 3 : 1),
    premiumRenderState: overrides.premiumRenderState,
  };
}

function longTextSection(options: {
  scanType: ResultScanIconToken;
  id: string;
  icon: ResultIconToken;
  themeMetricId: ResultMetricIconToken;
  title: string;
  body?: string | null;
  tags?: string[];
  premiumRenderState?: PremiumRenderState;
  collapsedMaxLines?: number;
  themeOverrides?: Partial<ResultItemThemeSpec>;
}): ResultLongTextSectionViewModel | null {
  const body = readPreferredText(options.body);
  const tags = options.tags?.filter((tag) => tag.trim().length > 0) ?? [];

  if (
    !body &&
    tags.length === 0 &&
    options.premiumRenderState !== 'locked' &&
    options.premiumRenderState !== 'loading'
  ) {
    return null;
  }

  return {
    id: options.id,
    icon: options.icon,
    title: options.title,
    ...(body ? { body } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    theme: resolveResultItemThemeSpec({
      scanType: options.scanType,
      metricId: options.themeMetricId,
      overrides: options.themeOverrides,
    }),
    premiumRenderState: options.premiumRenderState,
    collapsedMaxLines: options.collapsedMaxLines,
  };
}

function optionalScore100Metric(
  scanType: ResultScanIconToken,
  id: ResultMetricIconToken,
  title: string,
  rawValue: unknown,
  formatOptions: { locale?: string | null; t: TranslateFn },
  overrides: MetricViewModelOverrides = {},
) {
  const numericValue = parseSafeNumber(rawValue);

  if (numericValue === null) {
    return null;
  }

  return metric(
    scanType,
    id,
    title,
    formatScore100(numericValue, formatOptions),
    'fraction',
    overrides,
  );
}

function resolvePremiumMetricRenderState(options: {
  premiumRenderState: PremiumRenderState;
  scanType: 'face' | 'body' | 'nutrition';
  fieldKey: string;
}): PremiumRenderState {
  if (options.premiumRenderState !== 'locked') {
    return options.premiumRenderState;
  }

  return isFieldLocked(options.scanType, options.fieldKey, false)
    ? 'locked'
    : 'unlocked';
}

function resolveAnalysisQualityLabel(options: {
  analysisData: AnalysisResult;
  t: TranslateFn;
}) {
  const analysisMeta = options.analysisData.analysis_meta;

  if (!analysisMeta) {
    return null;
  }

  if (
    analysisMeta.metric_coverage_score !== null &&
    analysisMeta.metric_coverage_score < 70
  ) {
    return options.t('common.results.analysis_quality.partial');
  }

  if (
    analysisMeta.image_quality_score !== null &&
    analysisMeta.image_quality_score < 55
  ) {
    return options.t('common.results.analysis_quality.limited');
  }

  if (
    analysisMeta.confidence_score !== null &&
    analysisMeta.confidence_score < 60
  ) {
    return options.t('common.results.analysis_quality.review');
  }

  if (analysisMeta.limitation_flags.includes('portion_uncertain')) {
    return options.t('common.results.analysis_quality.partial');
  }

  if (
    analysisMeta.limitation_flags.includes('blur') ||
    analysisMeta.limitation_flags.includes('low_light') ||
    analysisMeta.limitation_flags.includes('partial_subject') ||
    analysisMeta.limitation_flags.includes('occlusion')
  ) {
    return options.t('common.results.analysis_quality.limited');
  }

  return null;
}

function resolvePremiumMetricValue(options: {
  premiumRenderState: PremiumRenderState;
  unlockedValue: string;
  t: TranslateFn;
}) {
  switch (options.premiumRenderState) {
    case 'unlocked':
      return options.unlockedValue;
    case 'loading':
      return options.t('metric_card.loading_value');
    case 'locked':
    default:
      return options.t('metric_card.blurred_text');
  }
}

function premiumMetric(options: {
  scanType: ResultScanIconToken;
  id?: string;
  icon: ResultMetricIconToken;
  title: string;
  fieldKey: string;
  unlockedValue: string;
  valueVariant: ResultValueVariant;
  premiumRenderState: PremiumRenderState;
  t: TranslateFn;
  overrides?: Omit<MetricViewModelOverrides, 'id' | 'premiumRenderState'>;
}) {
  const nextPremiumRenderState = resolvePremiumMetricRenderState({
    premiumRenderState: options.premiumRenderState,
    scanType: options.scanType,
    fieldKey: options.fieldKey,
  });

  return metric(
    options.scanType,
    options.icon,
    options.title,
    resolvePremiumMetricValue({
      premiumRenderState: nextPremiumRenderState,
      unlockedValue: options.unlockedValue,
      t: options.t,
    }),
    options.valueVariant,
    {
      ...options.overrides,
      ...(options.id ? { id: options.id } : {}),
      premiumRenderState: nextPremiumRenderState,
    },
  );
}

function optionalPremiumScore100Metric(options: {
  scanType: ResultScanIconToken;
  id?: string;
  icon: ResultMetricIconToken;
  title: string;
  fieldKey: string;
  rawValue: unknown;
  formatOptions: { locale?: string | null; t: TranslateFn };
  premiumRenderState: PremiumRenderState;
  overrides?: Omit<MetricViewModelOverrides, 'id' | 'premiumRenderState'>;
}) {
  const numericValue = parseSafeNumber(options.rawValue);

  if (numericValue === null) {
    return null;
  }

  return premiumMetric({
    scanType: options.scanType,
    id: options.id,
    icon: options.icon,
    title: options.title,
    fieldKey: options.fieldKey,
    unlockedValue: formatScore100(numericValue, options.formatOptions),
    valueVariant: 'fraction',
    premiumRenderState: options.premiumRenderState,
    t: options.formatOptions.t,
    overrides: options.overrides,
  });
}

function optionalPremiumScore10Metric(options: {
  scanType: ResultScanIconToken;
  id?: string;
  icon: ResultMetricIconToken;
  title: string;
  fieldKey: string;
  rawValue: unknown;
  formatOptions: { locale?: string | null; t: TranslateFn };
  premiumRenderState: PremiumRenderState;
  overrides?: Omit<MetricViewModelOverrides, 'id' | 'premiumRenderState'>;
}) {
  const numericValue = parseSafeNumber(options.rawValue);

  if (numericValue === null) {
    return null;
  }

  return premiumMetric({
    scanType: options.scanType,
    id: options.id,
    icon: options.icon,
    title: options.title,
    fieldKey: options.fieldKey,
    unlockedValue: formatScore10(numericValue, options.formatOptions),
    valueVariant: 'fraction',
    premiumRenderState: options.premiumRenderState,
    t: options.formatOptions.t,
    overrides: options.overrides,
  });
}

function optionalPremiumNumericMetric(options: {
  scanType: ResultScanIconToken;
  id?: string;
  icon: ResultMetricIconToken;
  title: string;
  fieldKey: string;
  rawValue: unknown;
  premiumRenderState: PremiumRenderState;
  t: TranslateFn;
  formatValue: (numericValue: number) => string;
  valueVariant?: ResultValueVariant;
  overrides?: Omit<MetricViewModelOverrides, 'id' | 'premiumRenderState'>;
}) {
  const numericValue = parseSafeNumber(options.rawValue);

  if (numericValue === null) {
    return null;
  }

  return premiumMetric({
    scanType: options.scanType,
    id: options.id,
    icon: options.icon,
    title: options.title,
    fieldKey: options.fieldKey,
    unlockedValue: options.formatValue(numericValue),
    valueVariant: options.valueVariant ?? 'numeric',
    premiumRenderState: options.premiumRenderState,
    t: options.t,
    overrides: options.overrides,
  });
}

type QuickStatViewModelOverrides = {
  labelMaxLines?: number;
  valueMaxLines?: number;
  span?: 'half' | 'full';
  semanticValueKey?: string | null;
  themeOverrides?: Partial<ResultItemThemeSpec>;
};

function quickStat(
  scanType: ResultScanIconToken,
  id: ResultMetricIconToken,
  label: string,
  value: string,
  valueVariant: ResultValueVariant,
  overrides: QuickStatViewModelOverrides = {},
): ResultQuickStatViewModel {
  const { semanticValueKey, themeOverrides } = overrides;

  return {
    id,
    icon: id,
    label,
    value,
    valueVariant,
    theme: resolveResultItemThemeSpec({
      scanType,
      metricId: id,
      semanticValueKey,
      overrides: themeOverrides,
    }),
    labelMaxLines: overrides.labelMaxLines ?? 2,
    valueMaxLines: overrides.valueMaxLines ?? (valueVariant === 'text' ? 3 : 1),
    span: overrides.span ?? 'half',
  };
}

type MacroItemViewModel = ResultMacroViewModel['items'][number];

type MacroItemOverrides = {
  semanticValueKey?: string | null;
  themeOverrides?: Partial<ResultItemThemeSpec>;
  premiumRenderState?: PremiumRenderState;
};

function macroItem(
  scanType: ResultScanIconToken,
  id: ResultMetricIconToken,
  label: string,
  value: string,
  valueVariant: ResultValueVariant,
  overrides: MacroItemOverrides = {},
): MacroItemViewModel {
  const { semanticValueKey, themeOverrides } = overrides;

  return {
    id,
    icon: id,
    label,
    value,
    valueVariant,
    theme: resolveResultItemThemeSpec({
      scanType,
      metricId: id,
      semanticValueKey,
      overrides: themeOverrides,
    }),
    premiumRenderState: overrides.premiumRenderState,
  };
}

function localizeVitaminTags(
  values: string[],
  t: TranslateFn,
  locale?: string | null,
) {
  return values
    .map((value) =>
      localizeDisplayNutritionVitaminKeys([value], null, t, {
        locale,
        emptyFallback: '',
      })
    )
    .filter((value) => value.trim().length > 0);
}

function isSameAsTagList(value: string | null, tags: string[], locale?: string | null) {
  if (!value || tags.length === 0) {
    return false;
  }

  const commaList = tags.join(', ');
  const localizedList =
    typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function'
      ? new Intl.ListFormat(locale ?? 'en', {
          style: 'short',
          type: 'conjunction',
        }).format(tags)
      : commaList;

  return value === commaList || value === localizedList;
}

function resolveTrajectoryBaseScore(
  analysisData: AnalysisResult | SuperScanResult,
) {
  switch (analysisData.scan_type) {
    case 'face':
      return safeGaugeScore(analysisData.face_score);
    case 'body':
      return safeGaugeScore(analysisData.body_score);
    case 'super_health_v2':
      return safeGaugeScore(analysisData.global_risk_score);
    case 'nutrition':
    default:
      return safeGaugeScore(analysisData.plate_health_score);
  }
}

function resolveTrajectoryScoreLabel(
  analysisData: AnalysisResult | SuperScanResult,
  t: TranslateFn,
) {
  switch (analysisData.scan_type) {
    case 'face':
      return t('scan.face.score_label');
    case 'body':
      return t('scan.body.score_label');
    case 'super_health_v2':
      return t('scan.super.score_label');
    case 'nutrition':
    default:
      return t('scan.nutrition.score_label');
  }
}

export function buildScanResultViewModel(options: {
  analysisData: AnalysisResult;
  t: TranslateFn;
  locale?: string | null;
  premiumRenderState: PremiumRenderState;
  resolveFaceGlowScore: (data: ScanFaceResult) => number | null | undefined;
}) {
  const {
    analysisData,
    t,
    locale,
    premiumRenderState,
    resolveFaceGlowScore,
  } = options;
  const formatOptions = { locale, t };

  switch (analysisData.scan_type) {
    case 'face':
      {
        const quickStats = [
          quickStat(
            'face',
            'perceived_age',
            t('common.metrics.perceived_age'),
            formatAge(analysisData.perceived_age, formatOptions),
            'numeric',
          ),
          quickStat(
            'face',
            'face_shape',
            t('common.metrics.face_shape'),
            localizeDisplayQualitativeLevel(
              'face_shape',
              analysisData.face_shape_key,
              analysisData.face_shape_fallback_text,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.face_shape_key,
            },
          ),
        ];
        const extendedFaceMetrics = [
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'skin_clarity',
            title: t('common.metrics.skin_clarity'),
            fieldKey: 'skin_clarity_score',
            rawValue: analysisData.skin_clarity_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'skin_evenness',
            title: t('common.metrics.skin_evenness'),
            fieldKey: 'skin_evenness_score',
            rawValue: analysisData.skin_evenness_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'under_eye_shadow',
            title: t('common.metrics.under_eye_shadow'),
            fieldKey: 'under_eye_shadow_score',
            rawValue: analysisData.under_eye_shadow_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'pore_visibility',
            title: t('common.metrics.pore_visibility'),
            fieldKey: 'pore_visibility_score',
            rawValue: analysisData.pore_visibility_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'complexion_redness',
            title: t('common.metrics.complexion_redness'),
            fieldKey: 'complexion_redness_score',
            rawValue: analysisData.complexion_redness_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'face',
            icon: 'sleep_quality',
            title: t('common.metrics.sleep_quality'),
            fieldKey: 'perceived_sleep_quality',
            rawValue: analysisData.perceived_sleep_quality,
            formatOptions,
            premiumRenderState,
          }),
        ].filter((item): item is ResultMetricViewModel => item !== null);
        const metrics = [
          metric(
            'face',
            'symmetry',
            t('common.metrics.symmetry'),
            formatPercentage(analysisData.symmetry_percentage, formatOptions),
            'numeric',
          ),
          premiumMetric({
            scanType: 'face',
            icon: 'fatigue',
            title: t('common.metrics.fatigue'),
            fieldKey: 'fatigue_level',
            unlockedValue: formatScore100(analysisData.fatigue_level, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          metric(
            'face',
            'hydration',
            t('common.metrics.hydration'),
            formatScore100(analysisData.hydration_level, formatOptions),
            'fraction',
          ),
          premiumMetric({
            scanType: 'face',
            icon: 'photogenic',
            title: t('common.metrics.photogenic'),
            fieldKey: 'photogenic_score',
            unlockedValue: formatScore10(analysisData.photogenic_score, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          ...extendedFaceMetrics,
        ];
        const premiumMetrics = [
          premiumMetric({
            scanType: 'face',
            icon: 'skin_quality',
            title: t('common.metrics.skin_quality'),
            fieldKey: 'skin_quality_score',
            unlockedValue: formatScore100(analysisData.skin_quality_score, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          premiumMetric({
            scanType: 'face',
            icon: 'glow',
            title: t('common.metrics.glow'),
            fieldKey: 'energy_score',
            unlockedValue: formatScore10(resolveFaceGlowScore(analysisData), formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          premiumMetric({
            scanType: 'face',
            icon: 'collagen',
            title: t('common.metrics.collagen'),
            fieldKey: 'collagen_level',
            unlockedValue: formatScore100(analysisData.collagen_level, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
        ];

        return {
        scanType: 'face',
        typeLabel: t('scan.face.type_label'),
        scoreLabel: t('scan.face.score_label'),
        score: safeGaugeScore(analysisData.face_score),
        analysisQualityLabel: resolveAnalysisQualityLabel({ analysisData, t }),
        quickStats,
        metrics,
        premiumMetrics,
      } satisfies ScanResultViewModel;
      }

    case 'body':
      {
        const quickStats = [
          quickStat(
            'body',
            'body_type',
            t('common.metrics.body_type'),
            localizeDisplayQualitativeLevel(
              'body_type',
              analysisData.body_type_key,
              analysisData.body_type_fallback_text,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.body_type_key,
            },
          ),
          quickStat(
            'body',
            'muscle_mass',
            t('common.metrics.muscle_mass'),
            localizeDisplayQualitativeLevel(
              'muscle_mass',
              analysisData.muscle_mass_key,
              analysisData.muscle_mass_fallback_text,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.muscle_mass_key,
            },
          ),
        ];
        const metrics = [
          metric(
            'body',
            'waist',
            t('common.metrics.waist'),
            formatCm(analysisData.waist_estimation_cm, formatOptions),
            'text',
          ),
          premiumMetric({
            scanType: 'body',
            icon: 'strength',
            title: t('common.metrics.strength'),
            fieldKey: 'strength_index',
            unlockedValue: formatScore100(analysisData.strength_index, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          metric(
            'body',
            'bmi',
            t('common.metrics.bmi'),
            formatBMI(analysisData.bmi_estimate, formatOptions),
            'numeric',
          ),
          premiumMetric({
            scanType: 'body',
            icon: 'metabolic_age',
            title: t('common.metrics.metabolic_age'),
            fieldKey: 'metabolic_age',
            unlockedValue: formatAge(analysisData.metabolic_age, formatOptions),
            valueVariant: 'text',
            premiumRenderState,
            t,
          }),
        ];
        const premiumMetrics = [
          premiumMetric({
            scanType: 'body',
            icon: 'body_fat',
            title: t('common.metrics.body_fat'),
            fieldKey: 'body_fat_percentage',
            unlockedValue: formatPercentage(analysisData.body_fat_percentage, formatOptions),
            valueVariant: 'numeric',
            premiumRenderState,
            t,
          }),
          premiumMetric({
            scanType: 'body',
            icon: 'posture',
            title: t('common.metrics.posture'),
            fieldKey: 'posture_score',
            unlockedValue: formatScore10(analysisData.posture_score, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          premiumMetric({
            scanType: 'body',
            icon: 'body_symmetry',
            title: t('common.metrics.symmetry'),
            fieldKey: 'body_symmetry',
            unlockedValue: formatScore100(analysisData.body_symmetry, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          optionalPremiumScore100Metric({
            scanType: 'body',
            id: 'muscle_definition',
            icon: 'strength',
            title: t('common.metrics.definition'),
            fieldKey: 'muscle_definition_score',
            rawValue: analysisData.muscle_definition_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'body',
            id: 'midsection_definition',
            icon: 'body_fat',
            title: t('common.metrics.definition'),
            fieldKey: 'midsection_definition_score',
            rawValue: analysisData.midsection_definition_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'body',
            id: 'shoulder_alignment',
            icon: 'posture',
            title: t('common.metrics.posture'),
            fieldKey: 'shoulder_alignment_score',
            rawValue: analysisData.shoulder_alignment_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'body',
            id: 'recovery_readiness',
            icon: 'fatigue',
            title: t('common.metrics.sleep_quality'),
            fieldKey: 'recovery_readiness_score',
            rawValue: analysisData.recovery_readiness_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'body',
            id: 'body_tension',
            icon: 'fatigue',
            title: t('common.metrics.fatigue'),
            fieldKey: 'body_tension_indicator_score',
            rawValue: analysisData.body_tension_indicator_score,
            formatOptions,
            premiumRenderState,
          }),
        ].filter((item): item is ResultMetricViewModel => item !== null);

        return {
        scanType: 'body',
        typeLabel: t('scan.body.type_label'),
        scoreLabel: t('scan.body.score_label'),
        score: safeGaugeScore(analysisData.body_score),
        analysisQualityLabel: resolveAnalysisQualityLabel({ analysisData, t }),
        quickStats,
        metrics,
        premiumMetrics,
      } satisfies ScanResultViewModel;
      }

    case 'nutrition':
    default:
      {
        const proteinPremiumRenderState = resolvePremiumMetricRenderState({
          premiumRenderState,
          scanType: 'nutrition',
          fieldKey: 'protein_grams',
        });
        const carbsPremiumRenderState = resolvePremiumMetricRenderState({
          premiumRenderState,
          scanType: 'nutrition',
          fieldKey: 'carbs_grams',
        });
        const fatsPremiumRenderState = resolvePremiumMetricRenderState({
          premiumRenderState,
          scanType: 'nutrition',
          fieldKey: 'fat_grams',
        });
        const quickStats = [
          quickStat(
            'nutrition',
            'calories',
            t('common.metrics.calories'),
            formatCalories(analysisData.calories_estimate, formatOptions),
            'numeric',
          ),
          quickStat(
            'nutrition',
            'verdict',
            t('common.metrics.verdict'),
            localizeDisplayVerdict(
              analysisData.verdict_key,
              analysisData.verdict_fallback_text,
              t,
              '-',
            ),
            'text',
            {
              span: 'full',
              valueMaxLines: 3,
              semanticValueKey: analysisData.verdict_key,
            },
          ),
        ];
        const metrics = [
          premiumMetric({
            scanType: 'nutrition',
            icon: 'satiety',
            title: t('common.metrics.satiety'),
            fieldKey: 'satiety_index',
            unlockedValue: formatScore10(analysisData.satiety_index, formatOptions),
            valueVariant: 'fraction',
            premiumRenderState,
            t,
          }),
          metric(
            'nutrition',
            'ingredients',
            t('common.metrics.ingredient_quality'),
            localizeDisplayQualitativeLevel(
              'ingredient_quality',
              analysisData.ingredient_quality_key,
              analysisData.ingredient_quality_fallback_text,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.ingredient_quality_key,
            },
          ),
        ];
        const premiumMetrics = [
          premiumMetric({
            scanType: 'nutrition',
            icon: 'glycemic',
            title: t('common.metrics.glycemic_index'),
            fieldKey: 'glycemic_index_label',
            unlockedValue: localizeDisplayQualitativeLevel(
              'glycemic_index',
              analysisData.glycemic_index_key,
              analysisData.glycemic_index_fallback_text,
              t,
              '-',
            ),
            valueVariant: 'text',
            premiumRenderState,
            t,
            overrides: {
              valueMaxLines: 2,
              semanticValueKey: analysisData.glycemic_index_key,
            },
          }),
          optionalPremiumNumericMetric({
            scanType: 'nutrition',
            id: 'fiber',
            icon: 'ingredients',
            title: t('common.metrics.fiber'),
            fieldKey: 'fiber_grams_estimate',
            rawValue: analysisData.fiber_grams_estimate,
            premiumRenderState,
            t,
            formatValue: (value) => formatGrams(value, formatOptions),
            valueVariant: 'text',
          }),
          optionalPremiumNumericMetric({
            scanType: 'nutrition',
            id: 'sugar',
            icon: 'carbs',
            title: t('common.metrics.sugar'),
            fieldKey: 'sugar_grams_estimate',
            rawValue: analysisData.sugar_grams_estimate,
            premiumRenderState,
            t,
            formatValue: (value) => formatGrams(value, formatOptions),
            valueVariant: 'text',
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'processing_level',
            icon: 'ingredients',
            title: t('common.metrics.processing_level'),
            fieldKey: 'processing_level_score',
            rawValue: analysisData.processing_level_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'sodium_level',
            icon: 'glycemic',
            title: t('common.metrics.sodium_level'),
            fieldKey: 'sodium_level_score',
            rawValue: analysisData.sodium_level_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'meal_balance',
            icon: 'verdict',
            title: t('common.metrics.meal_balance'),
            fieldKey: 'meal_balance_score',
            rawValue: analysisData.meal_balance_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'inflammation_index',
            icon: 'glycemic',
            title: t('common.metrics.inflammation_index'),
            fieldKey: 'inflammation_index_score',
            rawValue: analysisData.inflammation_index_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'color_diversity',
            icon: 'vitamins',
            title: t('common.metrics.color_diversity'),
            fieldKey: 'color_diversity_score',
            rawValue: analysisData.color_diversity_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumNumericMetric({
            scanType: 'nutrition',
            id: 'vegetable_ratio',
            icon: 'ingredients',
            title: t('common.metrics.vegetable_ratio'),
            fieldKey: 'vegetable_portion_ratio',
            rawValue: analysisData.vegetable_portion_ratio,
            premiumRenderState,
            t,
            formatValue: (value) => formatPercentage(value, formatOptions),
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'protein_visibility',
            icon: 'proteins',
            title: t('common.metrics.protein_visibility'),
            fieldKey: 'protein_visibility_score',
            rawValue: analysisData.protein_visibility_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'whole_grain',
            icon: 'carbs',
            title: t('common.metrics.whole_grain'),
            fieldKey: 'whole_grain_indicator_score',
            rawValue: analysisData.whole_grain_indicator_score,
            formatOptions,
            premiumRenderState,
          }),
          optionalPremiumScore100Metric({
            scanType: 'nutrition',
            id: 'meal_freshness',
            icon: 'ingredients',
            title: t('common.metrics.meal_freshness'),
            fieldKey: 'meal_freshness_score',
            rawValue: analysisData.meal_freshness_score,
            formatOptions,
            premiumRenderState,
          }),
        ].filter((item): item is ResultMetricViewModel => item !== null);
        const resolveNutritionSectionState = (fieldKey: string) =>
          resolvePremiumMetricRenderState({
            premiumRenderState,
            scanType: 'nutrition',
            fieldKey,
          });
        const resolveNutritionSectionBody = (
          fieldKey: string,
          unlockedValue?: string | null,
        ) => {
          const nextPremiumRenderState = resolveNutritionSectionState(fieldKey);

          return {
            nextPremiumRenderState,
            body:
              nextPremiumRenderState === 'unlocked'
                ? unlockedValue
                : resolvePremiumMetricValue({
                    premiumRenderState: nextPremiumRenderState,
                    unlockedValue: unlockedValue ?? '-',
                    t,
                  }),
          };
        };
        const vitaminsPremiumRenderState = resolvePremiumMetricRenderState({
          premiumRenderState,
          scanType: 'nutrition',
          fieldKey: 'main_vitamins',
        });
        const vitaminTags = localizeVitaminTags(
          analysisData.main_vitamin_keys,
          t,
          locale,
        );
        const displayVitamins = localizeDisplayNutritionVitaminKeys(
          analysisData.main_vitamin_keys,
          analysisData.main_vitamins_fallback_text,
          t,
          {
            locale,
            emptyFallback: '-',
          },
        );
        const vitaminFallbackText = readPreferredText(
          analysisData.main_vitamins_fallback_text,
        );
        const vitaminBody =
          vitaminFallbackText && !isSameAsTagList(vitaminFallbackText, vitaminTags, locale)
            ? vitaminFallbackText
            : vitaminTags.length === 0 && displayVitamins !== '-'
              ? displayVitamins
              : null;
        const micronutrientsSection = resolveNutritionSectionBody(
          'micronutrients',
          analysisData.micronutrients,
        );
        const nutritionPointsSection = resolveNutritionSectionBody(
          'nutrition_points',
          analysisData.nutrition_points,
        );
        const recommendationsSection = resolveNutritionSectionBody(
          'recommendations',
          analysisData.recommendations,
        );
        const dietaryDetailsSection = resolveNutritionSectionBody(
          'dietary_details',
          analysisData.dietary_details,
        );
        const plateAnalysisSection = resolveNutritionSectionBody(
          'plate_analysis',
          analysisData.plate_analysis,
        );
        const estimatedCompositionSection = resolveNutritionSectionBody(
          'estimated_composition',
          analysisData.estimated_composition,
        );
        const nutritionLongSections = [
          longTextSection({
            scanType: 'nutrition',
            id: 'vitamins',
            icon: 'vitamins',
            themeMetricId: 'vitamins',
            title: t('scan.nutrition.long_sections.vitamins'),
            body:
              vitaminsPremiumRenderState === 'unlocked'
                ? vitaminBody
                : resolvePremiumMetricValue({
                    premiumRenderState: vitaminsPremiumRenderState,
                    unlockedValue: displayVitamins,
                    t,
                  }),
            tags: vitaminsPremiumRenderState === 'unlocked' ? vitaminTags : [],
            premiumRenderState: vitaminsPremiumRenderState,
            collapsedMaxLines: 4,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'micronutrients',
            icon: 'vitamins',
            themeMetricId: 'vitamins',
            title: t('scan.nutrition.long_sections.micronutrients'),
            body: micronutrientsSection.body,
            premiumRenderState: micronutrientsSection.nextPremiumRenderState,
            collapsedMaxLines: 4,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'nutrition-points',
            icon: 'ingredients',
            themeMetricId: 'ingredients',
            title: t('scan.nutrition.long_sections.nutrition_points'),
            body: nutritionPointsSection.body,
            premiumRenderState: nutritionPointsSection.nextPremiumRenderState,
            collapsedMaxLines: 4,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'recommendations',
            icon: 'verdict',
            themeMetricId: 'verdict',
            title: t('scan.nutrition.long_sections.recommendations'),
            body: recommendationsSection.body,
            premiumRenderState: recommendationsSection.nextPremiumRenderState,
            collapsedMaxLines: 4,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'dietary-details',
            icon: 'ingredients',
            themeMetricId: 'ingredients',
            title: t('scan.nutrition.long_sections.dietary_details'),
            body: dietaryDetailsSection.body,
            premiumRenderState: dietaryDetailsSection.nextPremiumRenderState,
            collapsedMaxLines: 4,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'plate-analysis',
            icon: 'nutrition',
            themeMetricId: 'satiety',
            title: t('scan.nutrition.long_sections.plate_analysis'),
            body: plateAnalysisSection.body,
            premiumRenderState: plateAnalysisSection.nextPremiumRenderState,
            collapsedMaxLines: 5,
          }),
          longTextSection({
            scanType: 'nutrition',
            id: 'estimated-composition',
            icon: 'calories',
            themeMetricId: 'calories',
            title: t('scan.nutrition.long_sections.estimated_composition'),
            body: estimatedCompositionSection.body,
            premiumRenderState: estimatedCompositionSection.nextPremiumRenderState,
            collapsedMaxLines: 4,
          }),
        ].filter(
          (section): section is ResultLongTextSectionViewModel => section !== null,
        );

        return {
        scanType: 'nutrition',
        typeLabel: t('scan.nutrition.type_label'),
        scoreLabel: t('scan.nutrition.score_label'),
        score: safeGaugeScore(analysisData.plate_health_score),
        analysisQualityLabel: resolveAnalysisQualityLabel({ analysisData, t }),
        quickStats,
        macros: {
          title: t('scan.nutrition.macros_title'),
          items: [
            macroItem(
              'nutrition',
              'proteins',
              t('common.metrics.proteins'),
              resolvePremiumMetricValue({
                premiumRenderState: proteinPremiumRenderState,
                unlockedValue: formatGrams(analysisData.protein_grams, formatOptions),
                t,
              }),
              'text',
              {
                premiumRenderState: proteinPremiumRenderState,
              },
            ),
            macroItem(
              'nutrition',
              'carbs',
              t('common.metrics.carbs'),
              resolvePremiumMetricValue({
                premiumRenderState: carbsPremiumRenderState,
                unlockedValue: formatGrams(analysisData.carbs_grams, formatOptions),
                t,
              }),
              'text',
              {
                premiumRenderState: carbsPremiumRenderState,
              },
            ),
            macroItem(
              'nutrition',
              'fats',
              t('common.metrics.fats'),
              resolvePremiumMetricValue({
                premiumRenderState: fatsPremiumRenderState,
                unlockedValue: formatGrams(analysisData.fat_grams, formatOptions),
                t,
              }),
              'text',
              {
                premiumRenderState: fatsPremiumRenderState,
              },
            ),
          ],
        },
        metrics,
        premiumMetrics,
        nutritionLongSections,
      } satisfies ScanResultViewModel;
      }
  }
}

export function buildResultTrajectoryViewModel(options: {
  analysisData: AnalysisResult | SuperScanResult | FatDistributionScanResult;
  t: TranslateFn;
  locale?: string | null;
  premiumRenderState: PremiumRenderState;
  historicalAverage30d?: number | null;
  recentScoreHistory?: PremiumPotentialHistoryPoint[] | null;
  currentScanDate?: string | null;
}) {
  const { analysisData, t, locale, premiumRenderState } = options;

  if (isFatDistributionScanResult(analysisData)) {
    return createHiddenTrajectoryViewModel(premiumRenderState);
  }

  const trajectoryAnalysisData = analysisData as AnalysisResult | SuperScanResult;
  const historicalAverage30d = parseSafeNumber(options.historicalAverage30d);
  const currentScore = resolveTrajectoryBaseScore(trajectoryAnalysisData);
  const scoreLabel = resolveTrajectoryScoreLabel(trajectoryAnalysisData, t);
  const formatOptions = { locale, t };
  const trajectoryKey = 'common.results.trajectory_preview';
  const projection = buildThirtyDayProjection({
    scanType: trajectoryAnalysisData.scan_type,
    currentScore,
    currentDate: options.currentScanDate,
    history: options.recentScoreHistory,
    historicalAverage30d,
  });
  const projectedDisplayScore = projection.projectedDisplayValue;
  const hasHistory = projection.hasHistoricalContext;
  const visiblePoints =
    premiumRenderState === 'unlocked'
      ? projection.points
      : premiumRenderState === 'loading'
        ? buildLoadingTrajectoryPlaceholder({
            scanType: trajectoryAnalysisData.scan_type,
            currentScore,
            currentDate: options.currentScanDate,
          })
        : buildLockedTrajectoryTeaser({
            scanType: trajectoryAnalysisData.scan_type,
            currentScore,
            currentDate: options.currentScanDate,
          });

  return {
    shouldRender: true,
    premiumRenderState,
    hookLabel:
      premiumRenderState === 'loading'
        ? t(`${trajectoryKey}.eyebrow.loading`)
        : hasHistory
          ? t(`${trajectoryKey}.eyebrow.estimated`)
          : t(`${trajectoryKey}.eyebrow.generic`),
    title: t(`${trajectoryKey}.title`),
    badgeLabel:
      premiumRenderState === 'unlocked'
        ? t(`${trajectoryKey}.badge.unlocked`)
        : premiumRenderState === 'loading'
          ? t(`${trajectoryKey}.badge.loading`)
          : t(`${trajectoryKey}.badge.locked`),
    headline:
      premiumRenderState === 'loading'
        ? t(`${trajectoryKey}.headline.loading`)
        : premiumRenderState === 'unlocked'
          ? projection.direction === 'down'
            ? t(`${trajectoryKey}.headline.unlocked.super`, {
                score: formatScore100(projectedDisplayScore, formatOptions),
              })
            : t(`${trajectoryKey}.headline.unlocked.default`, {
                label: scoreLabel,
                score: formatScore100(projectedDisplayScore, formatOptions),
              })
          : projection.direction === 'down'
            ? t(`${trajectoryKey}.headline.locked.super`)
            : t(`${trajectoryKey}.headline.locked.default`),
    subtitle:
      premiumRenderState === 'loading'
        ? t(`${trajectoryKey}.subtitle.loading`)
        : premiumRenderState === 'unlocked'
          ? hasHistory
            ? t(`${trajectoryKey}.subtitle.unlocked.with_history`)
            : t(`${trajectoryKey}.subtitle.unlocked.without_history`)
          : t(`${trajectoryKey}.subtitle.locked`),
    ctaLabel:
      premiumRenderState === 'locked' ? t(`${trajectoryKey}.cta`) : undefined,
    footnote:
      premiumRenderState === 'unlocked' ? t(`${trajectoryKey}.note`) : undefined,
    points: visiblePoints,
    series: visiblePoints.map((point) => point.chartValue),
    checkpoints:
      premiumRenderState === 'unlocked'
        ? [
            {
              id: 'day_0',
              label: t(`${trajectoryKey}.checkpoints.today`),
              value: formatScore100(projection.currentDisplayValue, formatOptions),
            },
            {
              id: 'day_15',
              label: t(`${trajectoryKey}.checkpoints.day_15`),
              value: formatScore100(projection.midpointDisplayValue, formatOptions),
            },
            {
              id: 'day_30',
              label: t(`${trajectoryKey}.checkpoints.day_30`),
              value: formatScore100(projection.projectedDisplayValue, formatOptions),
              isHighlighted: true,
            },
          ]
        : [],
  } satisfies ResultTrajectoryViewModel;
}

const SEVERITY_ORDER: Record<DetectedCondition['severity_key'], number> = {
  high: 0,
  moderate: 1,
  low: 2,
  unknown: 3,
};

function normalizeConfidencePercentage(value: unknown) {
  const numericValue = parseSafeNumber(value);

  if (numericValue === null) {
    return null;
  }

  return numericValue <= 1 ? numericValue * 100 : numericValue;
}

function normalizePriorityZone(zone: unknown) {
  if (typeof zone === 'string') {
    return readPreferredText(zone);
  }

  if (!zone || typeof zone !== 'object') {
    return null;
  }

  const normalizedZone = zone as Record<string, unknown>;

  return (
    readPreferredText(normalizedZone.area_name) ??
    readPreferredText(normalizedZone.label) ??
    readPreferredText(normalizedZone.name) ??
    readPreferredText(normalizedZone.value) ??
    readPreferredText(normalizedZone.zone)
  );
}

function createFatDistributionPrimaryMetric(options: {
  id: FatDistributionPrimaryMetricViewModel['id'];
  label: string;
  rawValue: unknown;
  t: TranslateFn;
  locale?: string | null;
  premiumRenderState: PremiumRenderState;
}): FatDistributionPrimaryMetricViewModel | null {
  const numericValue = parseSafeNumber(options.rawValue);

  if (numericValue === null) {
    return null;
  }

  return {
    id: options.id,
    label: options.label,
    value: resolvePremiumMetricValue({
      premiumRenderState: options.premiumRenderState,
      unlockedValue: formatPercentage(numericValue, { locale: options.locale }),
      t: options.t,
    }),
    premiumRenderState: options.premiumRenderState,
  } satisfies FatDistributionPrimaryMetricViewModel;
}

export function buildLegacySuperScanResultViewModel(options: {
  analysisData: SuperScanResult;
  t: TranslateFn;
}) {
  const { analysisData, t } = options;
  const summaryFallbackText = readPreferredText(analysisData.summary_fallback_text);
  const disclaimerFallbackText = readPreferredText(
    analysisData.disclaimer_fallback_text
  );

  return {
    kind: 'legacy',
    globalRiskScore: safeGaugeScore(analysisData.global_risk_score),
    analysisSummary:
      summaryFallbackText ??
      localizeSuperScanSummaryKey(analysisData.summary_key, t, '-'),
    analysisSummarySource: summaryFallbackText
      ? 'summary_fallback_text'
      : 'summary_key',
    disclaimerText:
      disclaimerFallbackText ??
      localizeSuperScanDisclaimerKey(analysisData.disclaimer_key, t, '-'),
    disclaimerSource: disclaimerFallbackText
      ? 'disclaimer_fallback_text'
      : 'disclaimer_key',
    conditions: [...analysisData.detected_conditions].sort(
      (left, right) =>
        SEVERITY_ORDER[left.severity_key] - SEVERITY_ORDER[right.severity_key],
    ),
  } satisfies LegacySuperScanResultViewModel;
}

export function buildFatDistributionSuperScanResultViewModel(options: {
  analysisData: FatDistributionScanResult;
  t: TranslateFn;
  locale?: string | null;
  premiumRenderState?: PremiumRenderState;
}) {
  const { analysisData, t, locale, premiumRenderState = 'unlocked' } = options;

  return {
    kind: 'fat_distribution',
    analysisSummary: readPreferredText(analysisData.analysis_summary) ?? '-',
    primaryMetrics: [
      createFatDistributionPrimaryMetric({
        id: 'body_fat',
        label: t('common.metrics.body_fat'),
        rawValue: analysisData.global_body_fat_estimate_percent,
        t,
        locale,
        premiumRenderState,
      }),
      createFatDistributionPrimaryMetric({
        id: 'facial_fat',
        label: t('common.metrics.facial_fat'),
        rawValue: analysisData.global_facial_fat_estimate_percent,
        t,
        locale,
        premiumRenderState,
      }),
      createFatDistributionPrimaryMetric({
        id: 'water_retention',
        label: t('common.metrics.water_retention'),
        rawValue: analysisData.global_water_retention_estimate_percent,
        t,
        locale,
        premiumRenderState,
      }),
    ].filter(
      (
        metric
      ): metric is FatDistributionPrimaryMetricViewModel => metric !== null
    ),
    dominantStoragePattern:
      readPreferredText(analysisData.dominant_storage_pattern) ?? '-',
    priorityZones: analysisData.priority_zones
      .map((zone) => normalizePriorityZone(zone))
      .filter((zone): zone is string => !!zone),
    areas: analysisData.areas_analysis.map((area, index) => ({
      id: `${readPreferredText(area.area_name) ?? 'area'}-${index}`,
      areaName:
        readPreferredText(area.area_name) ??
        t('scan.super.fat_distribution.unnamed_area', {
          index: index + 1,
        }),
      dominantType: readPreferredText(area.dominant_type) ?? '-',
      subcutaneousFatPercent: formatPercentage(area.subcutaneous_fat_percent, {
        locale,
      }),
      waterRetentionPercent: formatPercentage(area.water_retention_percent, {
        locale,
      }),
      definitionPercent: formatPercentage(area.definition_percent, {
        locale,
      }),
      confidencePercent: formatPercentage(
        normalizeConfidencePercentage(area.confidence),
        { locale }
      ),
      explanation: readPreferredText(area.explanation) ?? '-',
      actionableAdvice: readPreferredText(area.actionable_advice) ?? '-',
    })),
    disclaimerText: readPreferredText(analysisData.disclaimer_text) ?? '-',
  } satisfies FatDistributionSuperScanResultViewModel;
}

export function buildSuperScanResultViewModel(options: {
  analysisData: SuperScanResult;
  t: TranslateFn;
}) {
  return buildLegacySuperScanResultViewModel(options);
}

export function formatConditionProbability(
  value: number,
  locale?: string | null,
) {
  return `${formatPlainNumber(value, { locale })}%`;
}
