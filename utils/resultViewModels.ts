import { isFieldLocked } from '@/constants/premiumFields';
import {
  AnalysisResult,
  DetectedCondition,
  FatDistributionPriorityZone,
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
  localizeQualitativeLevel,
  localizeSuperScanDisclaimerKey,
  localizeSuperScanSummaryKey,
  localizeVerdict,
  localizeNutritionVitaminKeys,
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

export interface ResultMacroViewModel {
  title: string;
  items: Array<{
    id: string;
    icon: ResultIconToken;
    label: string;
    value: string;
    valueVariant: ResultValueVariant;
    theme: ResultItemThemeSpec;
  }>;
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
  quickStats: ResultQuickStatViewModel[];
  metrics: ResultMetricViewModel[];
  premiumMetrics: ResultMetricViewModel[];
  macros?: ResultMacroViewModel;
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
    id,
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
    titleMaxLines: overrides.titleMaxLines ?? 2,
    valueMaxLines: overrides.valueMaxLines ?? (valueVariant === 'text' ? 3 : 1),
    premiumRenderState: overrides.premiumRenderState,
  };
}

function resolvePremiumMetricRenderState(options: {
  premiumRenderState: PremiumRenderState;
  scanType: 'face' | 'body' | 'nutrition';
  fieldKey: string;
}) {
  if (options.premiumRenderState !== 'locked') {
    return options.premiumRenderState;
  }

  return isFieldLocked(options.scanType, options.fieldKey, false)
    ? 'locked'
    : 'unlocked';
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
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
      return {
        scanType: 'face',
        typeLabel: t('scan.face.type_label'),
        scoreLabel: t('scan.face.score_label'),
        score: safeGaugeScore(analysisData.face_score),
        quickStats: [
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
            localizeQualitativeLevel(
              'face_shape',
              analysisData.face_shape_key,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.face_shape_key,
            },
          ),
        ],
        metrics: [
          metric(
            'face',
            'symmetry',
            t('common.metrics.symmetry'),
            formatPercentage(analysisData.symmetry_percentage, formatOptions),
            'numeric',
          ),
          metric(
            'face',
            'fatigue',
            t('common.metrics.fatigue'),
            formatScore100(analysisData.fatigue_level, formatOptions),
            'fraction',
          ),
          metric(
            'face',
            'hydration',
            t('common.metrics.hydration'),
            formatScore100(analysisData.hydration_level, formatOptions),
            'fraction',
          ),
          metric(
            'face',
            'photogenic',
            t('common.metrics.photogenic'),
            formatScore10(analysisData.photogenic_score, formatOptions),
            'fraction',
          ),
        ],
        premiumMetrics: [
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'face',
              fieldKey: 'skin_quality_score',
            });

            return metric(
              'face',
              'skin_quality',
              t('common.metrics.skin_quality'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatScore100(analysisData.skin_quality_score, formatOptions),
                t,
              }),
              'fraction',
              {
                premiumRenderState: nextPremiumRenderState,
              },
            );
          })(),
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'face',
              fieldKey: 'energy_score',
            });

            return metric(
              'face',
              'glow',
              t('common.metrics.glow'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatScore10(resolveFaceGlowScore(analysisData), formatOptions),
                t,
              }),
              'fraction',
              { premiumRenderState: nextPremiumRenderState },
            );
          })(),
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'face',
              fieldKey: 'collagen_level',
            });

            return metric(
              'face',
              'collagen',
              t('common.metrics.collagen'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatScore100(analysisData.collagen_level, formatOptions),
                t,
              }),
              'fraction',
              { premiumRenderState: nextPremiumRenderState },
            );
          })(),
        ],
      } satisfies ScanResultViewModel;

    case 'body':
      return {
        scanType: 'body',
        typeLabel: t('scan.body.type_label'),
        scoreLabel: t('scan.body.score_label'),
        score: safeGaugeScore(analysisData.body_score),
        quickStats: [
          quickStat(
            'body',
            'body_type',
            t('common.metrics.body_type'),
            localizeQualitativeLevel(
              'body_type',
              analysisData.body_type_key,
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
            localizeQualitativeLevel(
              'muscle_mass',
              analysisData.muscle_mass_key,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.muscle_mass_key,
            },
          ),
        ],
        metrics: [
          metric(
            'body',
            'waist',
            t('common.metrics.waist'),
            formatCm(analysisData.waist_estimation_cm, formatOptions),
            'text',
          ),
          metric(
            'body',
            'strength',
            t('common.metrics.strength'),
            formatScore100(analysisData.strength_index, formatOptions),
            'fraction',
          ),
          metric(
            'body',
            'bmi',
            t('common.metrics.bmi'),
            formatBMI(analysisData.bmi_estimate, formatOptions),
            'numeric',
          ),
          metric(
            'body',
            'metabolic_age',
            t('common.metrics.metabolic_age'),
            formatAge(analysisData.metabolic_age, formatOptions),
            'text',
          ),
        ],
        premiumMetrics: [
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'body',
              fieldKey: 'body_fat_percentage',
            });

            return metric(
              'body',
              'body_fat',
              t('common.metrics.body_fat'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatPercentage(analysisData.body_fat_percentage, formatOptions),
                t,
              }),
              'numeric',
              {
                premiumRenderState: nextPremiumRenderState,
              },
            );
          })(),
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'body',
              fieldKey: 'posture_score',
            });

            return metric(
              'body',
              'posture',
              t('common.metrics.posture'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatScore10(analysisData.posture_score, formatOptions),
                t,
              }),
              'fraction',
              { premiumRenderState: nextPremiumRenderState },
            );
          })(),
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'body',
              fieldKey: 'body_symmetry',
            });

            return metric(
              'body',
              'body_symmetry',
              t('common.metrics.symmetry'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: formatScore100(analysisData.body_symmetry, formatOptions),
                t,
              }),
              'fraction',
              { premiumRenderState: nextPremiumRenderState },
            );
          })(),
        ],
      } satisfies ScanResultViewModel;

    case 'nutrition':
    default:
      return {
        scanType: 'nutrition',
        typeLabel: t('scan.nutrition.type_label'),
        scoreLabel: t('scan.nutrition.score_label'),
        score: safeGaugeScore(analysisData.plate_health_score),
        quickStats: [
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
            localizeVerdict(analysisData.verdict_key, t, '-'),
            'text',
            {
              span: 'full',
              valueMaxLines: 3,
              semanticValueKey: analysisData.verdict_key,
            },
          ),
        ],
        macros: {
          title: t('scan.nutrition.macros_title'),
          items: [
            macroItem(
              'nutrition',
              'proteins',
              t('common.metrics.proteins'),
              formatGrams(analysisData.protein_grams, formatOptions),
              'text',
            ),
            macroItem(
              'nutrition',
              'carbs',
              t('common.metrics.carbs'),
              formatGrams(analysisData.carbs_grams, formatOptions),
              'text',
            ),
            macroItem(
              'nutrition',
              'fats',
              t('common.metrics.fats'),
              formatGrams(analysisData.fat_grams, formatOptions),
              'text',
            ),
          ],
        },
        metrics: [
          metric(
            'nutrition',
            'satiety',
            t('common.metrics.satiety'),
            formatScore10(analysisData.satiety_index, formatOptions),
            'fraction',
          ),
          metric(
            'nutrition',
            'ingredients',
            t('common.metrics.ingredient_quality'),
            localizeQualitativeLevel(
              'ingredient_quality',
              analysisData.ingredient_quality_key,
              t,
              '-',
            ),
            'text',
            {
              valueMaxLines: 2,
              semanticValueKey: analysisData.ingredient_quality_key,
            },
          ),
        ],
        premiumMetrics: [
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'nutrition',
              fieldKey: 'glycemic_index_label',
            });

            return metric(
              'nutrition',
              'glycemic',
              t('common.metrics.glycemic_index'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: localizeQualitativeLevel(
                  'glycemic_index',
                  analysisData.glycemic_index_key,
                t,
                '-',
                ),
                t,
              }),
              'text',
              {
                premiumRenderState: nextPremiumRenderState,
                valueMaxLines: 2,
                semanticValueKey: analysisData.glycemic_index_key,
              },
            );
          })(),
          (() => {
            const nextPremiumRenderState = resolvePremiumMetricRenderState({
              premiumRenderState,
              scanType: 'nutrition',
              fieldKey: 'main_vitamins',
            });

            return metric(
              'nutrition',
              'vitamins',
              t('common.metrics.vitamins'),
              resolvePremiumMetricValue({
                premiumRenderState: nextPremiumRenderState,
                unlockedValue: localizeNutritionVitaminKeys(analysisData.main_vitamin_keys, t, {
                  locale,
                  emptyFallback: '-',
                }),
                t,
              }),
              'text',
              {
                premiumRenderState: nextPremiumRenderState,
                valueMaxLines: 3,
              },
            );
          })(),
        ],
      } satisfies ScanResultViewModel;
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
  locale?: string | null;
}) {
  const numericValue = parseSafeNumber(options.rawValue);

  if (numericValue === null) {
    return null;
  }

  return {
    id: options.id,
    label: options.label,
    value: formatPercentage(numericValue, { locale: options.locale }),
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
}) {
  const { analysisData, t, locale } = options;

  return {
    kind: 'fat_distribution',
    analysisSummary: readPreferredText(analysisData.analysis_summary) ?? '-',
    primaryMetrics: [
      createFatDistributionPrimaryMetric({
        id: 'body_fat',
        label: t('common.metrics.body_fat'),
        rawValue: analysisData.global_body_fat_estimate_percent,
        locale,
      }),
      createFatDistributionPrimaryMetric({
        id: 'facial_fat',
        label: t('common.metrics.facial_fat'),
        rawValue: analysisData.global_facial_fat_estimate_percent,
        locale,
      }),
      createFatDistributionPrimaryMetric({
        id: 'water_retention',
        label: t('common.metrics.water_retention'),
        rawValue: analysisData.global_water_retention_estimate_percent,
        locale,
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
