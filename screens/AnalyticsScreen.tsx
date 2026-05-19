import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { Crown, Activity, Utensils, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/hooks/queries/useAnalytics';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  AnalyticsPeriod,
  BodyScoreHistoryItem,
  FaceScoreHistoryItem,
  NutritionHistoryItem,
} from '@/types';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AppScreen } from '@/components/AppScreen';
import {
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONT_WEIGHTS,
  getMainPageChrome,
  getObsidianSurface,
  mixColors,
  softenAccentColor,
  withAlpha,
  type ThemeColors,
} from '@/constants/theme';
import { ContextualPaywall } from '@/components/ContextualPaywall';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenState } from '@/components/ScreenState';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  ANALYTICS_LIKE_LINE_CHART_PROPS,
  createAnalyticsLikeLineChartConfig,
} from '@/utils/chartStyles';
import { paywallSession } from '@/utils/paywallSession';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';
import { Squircle } from '@/components/Squircle';

const PERIODS: { value: AnalyticsPeriod; labelKey: string; premium: boolean }[] = [
  { value: '7days', labelKey: 'analytics.periods.days_7', premium: false },
  { value: '30days', labelKey: 'analytics.periods.days_30', premium: false },
  { value: '3months', labelKey: 'analytics.periods.months_3', premium: true },
  { value: '1year', labelKey: 'analytics.periods.year_1', premium: true },
];

type AggregatedChartPoint = {
  date: string;
  value: number;
};

type DenseMonthEntry = {
  isMonthChange: boolean;
  monthKey: string;
  monthLabel: string;
};

type ChartScaleKind = 'score100' | 'score10' | 'percentage' | 'age' | 'dynamic';
type AnalyticsMetricAccentKey =
  | 'blue'
  | 'green'
  | 'nutrition'
  | 'orange'
  | 'gold'
  | 'violet'
  | 'red';

type MetricSelectorOption<T> = {
  id: string;
  labelKey: string;
  scale: ChartScaleKind;
  accentKey: AnalyticsMetricAccentKey;
  valueExtractor: (item: T) => number;
};

const CHART_X_LABEL_FONT_SIZE = 12;
const CHART_X_LABEL_ESTIMATED_CHAR_WIDTH = 7;
const CHART_X_LABEL_GAP = 12;
const DENSE_LABEL_BUFFER = 10;
const DENSE_LABEL_MIN_PADDING = 28;
const DENSE_LABEL_MAX_PADDING = 72;
const DENSE_LABEL_STANDARD_ROTATION = 45;
const DENSE_LABEL_COMPACT_ROTATION = 60;
const EMPTY_ANALYTICS_HISTORY: never[] = [];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const HEALTH_CHART_METRICS: ReadonlyArray<MetricSelectorOption<FaceScoreHistoryItem>> = [
  {
    id: 'score',
    labelKey: 'analytics.metric_tabs.score',
    scale: 'score100',
    accentKey: 'blue',
    valueExtractor: (item) => item.faceScore,
  },
  {
    id: 'skin_quality',
    labelKey: 'analytics.metric_tabs.skin_quality',
    scale: 'score100',
    accentKey: 'violet',
    valueExtractor: (item) => item.skinQualityScore,
  },
  {
    id: 'symmetry',
    labelKey: 'analytics.metric_tabs.symmetry',
    scale: 'percentage',
    accentKey: 'blue',
    valueExtractor: (item) => item.symmetryPercentage,
  },
  {
    id: 'energy',
    labelKey: 'analytics.metric_tabs.energy',
    scale: 'score10',
    accentKey: 'gold',
    valueExtractor: (item) => item.energyScore,
  },
  {
    id: 'hydration',
    labelKey: 'analytics.metric_tabs.hydration',
    scale: 'score100',
    accentKey: 'blue',
    valueExtractor: (item) => item.hydrationLevel,
  },
  {
    id: 'collagen',
    labelKey: 'analytics.metric_tabs.collagen',
    scale: 'score100',
    accentKey: 'violet',
    valueExtractor: (item) => item.collagenLevel,
  },
];

const BODY_CHART_METRICS: ReadonlyArray<MetricSelectorOption<BodyScoreHistoryItem>> = [
  {
    id: 'score',
    labelKey: 'analytics.metric_tabs.score',
    scale: 'score100',
    accentKey: 'green',
    valueExtractor: (item) => item.bodyScore,
  },
  {
    id: 'body_fat',
    labelKey: 'analytics.metric_tabs.body_fat',
    scale: 'percentage',
    accentKey: 'orange',
    valueExtractor: (item) => item.bodyFatPercentage,
  },
  {
    id: 'strength',
    labelKey: 'analytics.metric_tabs.strength',
    scale: 'score100',
    accentKey: 'green',
    valueExtractor: (item) => item.strengthIndex,
  },
  {
    id: 'posture',
    labelKey: 'analytics.metric_tabs.posture',
    scale: 'score10',
    accentKey: 'green',
    valueExtractor: (item) => item.postureScore,
  },
  {
    id: 'symmetry',
    labelKey: 'analytics.metric_tabs.symmetry',
    scale: 'percentage',
    accentKey: 'blue',
    valueExtractor: (item) => item.bodySymmetry,
  },
  {
    id: 'metabolic_age',
    labelKey: 'analytics.metric_tabs.metabolic_age',
    scale: 'age',
    accentKey: 'orange',
    valueExtractor: (item) => item.metabolicAge,
  },
];

const NUTRITION_CHART_METRICS: ReadonlyArray<MetricSelectorOption<NutritionHistoryItem>> = [
  {
    id: 'score',
    labelKey: 'analytics.metric_tabs.score',
    scale: 'score100',
    accentKey: 'nutrition',
    valueExtractor: (item) => item.nutritionScore,
  },
  {
    id: 'calories',
    labelKey: 'analytics.metric_tabs.calories',
    scale: 'dynamic',
    accentKey: 'orange',
    valueExtractor: (item) => item.caloriesEstimate,
  },
  {
    id: 'protein',
    labelKey: 'analytics.metric_tabs.protein',
    scale: 'dynamic',
    accentKey: 'green',
    valueExtractor: (item) => item.proteinGrams,
  },
  {
    id: 'carbs',
    labelKey: 'analytics.metric_tabs.carbs',
    scale: 'dynamic',
    accentKey: 'blue',
    valueExtractor: (item) => item.carbsGrams,
  },
  {
    id: 'fats',
    labelKey: 'analytics.metric_tabs.fats',
    scale: 'dynamic',
    accentKey: 'orange',
    valueExtractor: (item) => item.fatGrams,
  },
  {
    id: 'satiety',
    labelKey: 'analytics.metric_tabs.satiety',
    scale: 'score10',
    accentKey: 'green',
    valueExtractor: (item) => item.satietyIndex,
  },
];

const ANALYTICS_METRIC_ACCENT_ALIASES: Record<string, AnalyticsMetricAccentKey> = {
  fatigue: 'orange',
  fatigue_level: 'orange',
  inflammation: 'red',
  inflammation_index: 'red',
  inflammation_index_score: 'red',
};

const resolveAnalyticsMetricAccent = (
  colors: ThemeColors,
  isDark: boolean,
  accentKey: AnalyticsMetricAccentKey | string,
) => {
  const resolvedKey = ANALYTICS_METRIC_ACCENT_ALIASES[accentKey] ?? accentKey;
  const accentBaseByKey: Record<AnalyticsMetricAccentKey, string> = {
    blue: colors.primary,
    green: colors.success,
    nutrition: mixColors(colors.success, colors.warning, isDark ? 0.16 : 0.12),
    orange: colors.warning,
    gold: colors.gold,
    violet: isDark ? '#BFA1FF' : '#7D61C8',
    red: colors.error,
  };
  const baseColor = accentBaseByKey[resolvedKey as AnalyticsMetricAccentKey] ?? colors.primary;
  const lineColor = softenAccentColor(colors, isDark, baseColor, 'selected');
  const titleColor = isDark
    ? mixColors(lineColor, colors.white, 0.18)
    : mixColors(lineColor, colors.primaryText, 0.18);
  const chipTextColor = isDark
    ? mixColors(lineColor, colors.white, 0.24)
    : mixColors(lineColor, colors.primaryText, 0.34);

  return {
    lineColor,
    titleColor,
    chipTextColor,
    chipActiveBackgroundColor: withAlpha(lineColor, isDark ? 0.16 : 0.095),
    chipActiveBorderColor: withAlpha(lineColor, isDark ? 0.34 : 0.22),
    chipActiveTextColor: titleColor,
  };
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const aggregateData = <T extends { date: string }>(
  data: T[],
  bucketSpanDays: number,
  valueExtractor: (item: T) => number
): AggregatedChartPoint[] => {
  if (data.length === 0) return [];

  const sortedData = [...data].sort(
    (a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime(),
  );

  if (bucketSpanDays <= 1) {
    return sortedData.map((item) => ({
      date: item.date,
      value: valueExtractor(item),
    }));
  }

  const buckets = new Map<number, T[]>();
  const anchorDate = parseLocalDate(sortedData[0].date);

  sortedData.forEach((item) => {
    const itemDate = parseLocalDate(item.date);
    const dayOffset = Math.max(
      0,
      Math.floor((itemDate.getTime() - anchorDate.getTime()) / MS_PER_DAY),
    );
    const bucketIndex = Math.floor(dayOffset / bucketSpanDays);
    const bucket = buckets.get(bucketIndex) ?? [];
    bucket.push(item);
    buckets.set(bucketIndex, bucket);
  });

  return Array.from(buckets.entries())
    .sort(([bucketIndexA], [bucketIndexB]) => bucketIndexA - bucketIndexB)
    .map(([, bucket]) => {
      const averageValue = bucket.reduce((sum, item) => sum + valueExtractor(item), 0) / bucket.length;
      const startDate = bucket[0].date;
      const endDate = bucket[bucket.length - 1].date;

      return {
        date: bucket.length > 1 ? `${startDate}|${endDate}` : startDate,
        value: Math.round(averageValue),
      };
    });
};

const getBucketSpanDays = (selectedPeriod: AnalyticsPeriod): number => {
  switch (selectedPeriod) {
    case '7days':
      return 1;
    case '30days':
      return 2;
    case '3months':
      return 7;
    case '1year':
      return 30;
    default:
      return 1;
  }
};

const getMaxLabels = (selectedPeriod: AnalyticsPeriod): number => {
  switch (selectedPeriod) {
    case '7days':
      return 7;
    case '30days':
      return 8;
    case '3months':
      return 7;
    case '1year':
      return 6;
    default:
      return 7;
  }
};

const sanitizeChartValue = (
  value: number | null | undefined,
  ceiling: number,
): number => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(ceiling, Math.round(value)));
};

const roundUpToStep = (value: number, step: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return step;
  }

  return Math.ceil(value / step) * step;
};

const resolveChartCeiling = (
  values: number[],
  scale: ChartScaleKind,
): number => {
  const maxValue = values.length > 0 ? Math.max(...values, 0) : 0;

  switch (scale) {
    case 'score10':
      return 10;
    case 'score100':
    case 'percentage':
      return 100;
    case 'age':
      return Math.max(40, roundUpToStep(maxValue + 5, 5));
    case 'dynamic':
    default:
      if (maxValue <= 10) {
        return 10;
      }

      if (maxValue <= 50) {
        return roundUpToStep(maxValue * 1.15, 5);
      }

      if (maxValue <= 150) {
        return roundUpToStep(maxValue * 1.15, 10);
      }

      return roundUpToStep(maxValue * 1.15, 25);
  }
};

const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getBucketEndDate = (dateStr: string): Date => {
  const endDateStr = dateStr.includes('|') ? dateStr.split('|')[1] : dateStr;
  return parseLocalDate(endDateStr);
};

const formatDayMonth = (day: number, month: number, locale: string): string => {
  return locale === 'en' ? `${month}/${day}` : `${day}/${month}`;
};

const formatDateLabel = (dateStr: string, locale: string): string => {
  const date = getBucketEndDate(dateStr);
  return formatDayMonth(date.getDate(), date.getMonth() + 1, locale);
};

const sparseLabels = (labels: string[], maxLabels: number): string[] => {
  if (labels.length <= maxLabels) return labels;

  const step = Math.ceil(labels.length / maxLabels);
  return labels.map((label, index) => (index % step === 0 || index === labels.length - 1 ? label : ''));
};

const capitalizeMonthLabel = (label: string, locale: string): string => {
  if (!label) return '';
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
};

const getFullMonthLabel = (date: Date, locale: string): string => {
  return capitalizeMonthLabel(
    date.toLocaleDateString(locale, { month: 'long' }),
    locale
  );
};

const buildDenseMonthEntries = (
  aggregated: AggregatedChartPoint[],
  locale: string
): DenseMonthEntry[] => {
  let previousMonthKey: string | null = null;

  return aggregated.map((item) => {
    const endDate = getBucketEndDate(item.date);
    const monthKey = `${endDate.getFullYear()}-${endDate.getMonth()}`;
    const monthLabel = getFullMonthLabel(endDate, locale);
    const isMonthChange = monthKey !== previousMonthKey;

    previousMonthKey = monthKey;

    return {
      isMonthChange,
      monthKey,
      monthLabel,
    };
  });
};

const buildDenseMonthLabels = (
  entries: DenseMonthEntry[],
  showEveryOtherMonth: boolean
): string[] => {
  let visibleMonthIndex = 0;

  return entries.map((entry) => {
    if (!entry.isMonthChange) return '';

    const shouldShow = !showEveryOtherMonth || visibleMonthIndex % 2 === 0;
    visibleMonthIndex += 1;

    return shouldShow ? entry.monthLabel : '';
  });
};

const getLongestLabel = (labels: string[]): string => {
  return labels.reduce((longest, label) => (label.length > longest.length ? label : longest), '');
};

const estimateLabelWidth = (label: string): number => {
  if (!label) return 0;

  return Math.max(
    CHART_X_LABEL_FONT_SIZE * 2,
    Math.ceil(label.length * CHART_X_LABEL_ESTIMATED_CHAR_WIDTH)
  );
};

const getProjectedLabelWidth = (labelWidth: number, rotation: number): number => {
  const angleInRadians = (rotation * Math.PI) / 180;
  return labelWidth * Math.cos(angleInRadians) + CHART_X_LABEL_FONT_SIZE * Math.sin(angleInRadians);
};

const shouldUseAlternateDenseMonths = (
  chartWidth: number,
  visibleMonthCount: number,
  labelWidth: number
): boolean => {
  if (visibleMonthCount <= 2 || labelWidth <= 0) return false;

  const widthPerVisibleMonth = chartWidth / visibleMonthCount;
  return widthPerVisibleMonth < getProjectedLabelWidth(labelWidth, DENSE_LABEL_COMPACT_ROTATION) + CHART_X_LABEL_GAP;
};

const getDenseXAxisLayout = (
  chartWidth: number,
  visibleMonthCount: number,
  labelWidth: number
) => {
  if (visibleMonthCount <= 1 || labelWidth <= 0) {
    return {
      labelRotation: 0,
      xLabelsOffset: 0,
      chartBottomPadding: 0,
    };
  }

  const widthPerVisibleMonth = chartWidth / visibleMonthCount;
  const labelRotation =
    widthPerVisibleMonth >= getProjectedLabelWidth(labelWidth, DENSE_LABEL_STANDARD_ROTATION) + CHART_X_LABEL_GAP
      ? DENSE_LABEL_STANDARD_ROTATION
      : DENSE_LABEL_COMPACT_ROTATION;

  const xLabelsOffset = labelRotation === DENSE_LABEL_STANDARD_ROTATION ? -6 : -10;
  const rotationInRadians = (labelRotation * Math.PI) / 180;
  const chartBottomPadding = clamp(
    Math.ceil(
      labelWidth * Math.sin(rotationInRadians) +
      DENSE_LABEL_BUFFER +
      CHART_X_LABEL_FONT_SIZE / 2 +
      xLabelsOffset
    ),
    DENSE_LABEL_MIN_PADDING,
    DENSE_LABEL_MAX_PADDING
  );

  return {
    labelRotation,
    xLabelsOffset,
    chartBottomPadding,
  };
};

export default function AnalyticsScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mainPageChrome = useMemo(
    () => getMainPageChrome(colors, isDark, 'analytics'),
    [colors, isDark],
  );
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [period, setPeriod] = useState<AnalyticsPeriod>('7days');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [measuredDenseLabelWidth, setMeasuredDenseLabelWidth] = useState(0);
  const [healthMetricId, setHealthMetricId] = useState(HEALTH_CHART_METRICS[0].id);
  const [bodyMetricId, setBodyMetricId] = useState(BODY_CHART_METRICS[0].id);
  const [nutritionMetricId, setNutritionMetricId] = useState(
    NUTRITION_CHART_METRICS[0].id,
  );
  const [chartsReady, setChartsReady] = useState(false);
  const { showAlert, alertElement } = useCustomAlert();
  const isPremium = hasPremiumAccessFromProfile(userProfile);

  const { data, isLoading, error, refetch } = useAnalytics(period);
  const isInitialLoading = isLoading && !data && !error;

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    await refetch();
    setIsManualRefresh(false);
  }, [refetch]);

  useEffect(() => {
    setChartsReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setChartsReady(true);
    });

    return () => {
      task.cancel?.();
    };
  }, [period, data]);

  const handlePeriodSelect = (selectedPeriod: AnalyticsPeriod, requiresPremium: boolean) => {
    if (requiresPremium && !isPremium) {
      if (paywallSession.canShowPaywall()) {
        setPaywallVisible(true);
        paywallSession.markPaywallShown();
      } else {
        showAlert(
          t('premium.subscription_page.contextual_analytics_title'),
          t('premium.subscription_page.contextual_analytics_body'),
          [
            { text: t('common.later'), style: 'cancel' },
            {
              text: t('premium.upgrade_premium'),
              onPress: () => router.push('/premium-upgrade'),
            },
          ],
          undefined,
          { variant: 'premium', emoji: '\u2728' }
        );
      }
      return;
    }

    setPeriod(selectedPeriod);
  };

  const healthScoreHistory = data?.healthScoreHistory ?? EMPTY_ANALYTICS_HISTORY;
  const bodyScoreHistory = data?.bodyScoreHistory ?? EMPTY_ANALYTICS_HISTORY;
  const faceScoreHistory = data?.faceScoreHistory ?? EMPTY_ANALYTICS_HISTORY;
  const nutritionHistory = data?.nutritionHistory ?? EMPTY_ANALYTICS_HISTORY;

  const selectedHealthMetric =
    HEALTH_CHART_METRICS.find((metric) => metric.id === healthMetricId) ??
    HEALTH_CHART_METRICS[0];
  const selectedBodyMetric =
    BODY_CHART_METRICS.find((metric) => metric.id === bodyMetricId) ??
    BODY_CHART_METRICS[0];
  const selectedNutritionMetric =
    NUTRITION_CHART_METRICS.find((metric) => metric.id === nutritionMetricId) ??
    NUTRITION_CHART_METRICS[0];

  const hasData =
    healthScoreHistory.length > 0 ||
    bodyScoreHistory.length > 0 ||
    nutritionHistory.length > 0;
  const getMetricAccent = useCallback(
    (accentKey: AnalyticsMetricAccentKey) =>
      resolveAnalyticsMetricAccent(colors, isDark, accentKey),
    [colors, isDark],
  );
  const selectedHealthAccent = useMemo(
    () => getMetricAccent(selectedHealthMetric.accentKey),
    [getMetricAccent, selectedHealthMetric.accentKey],
  );
  const selectedBodyAccent = useMemo(
    () => getMetricAccent(selectedBodyMetric.accentKey),
    [getMetricAccent, selectedBodyMetric.accentKey],
  );
  const selectedNutritionAccent = useMemo(
    () => getMetricAccent(selectedNutritionMetric.accentKey),
    [getMetricAccent, selectedNutritionMetric.accentKey],
  );

  const createMetricChartConfig = useCallback((lineColor: string) => createAnalyticsLikeLineChartConfig({
    backgroundColor: mainPageChrome.elevatedSurface.backgroundColor,
    lineColor,
    labelColor: colors.gray,
    fillShadowGradientFrom: lineColor,
    fillShadowGradientTo: mainPageChrome.elevatedSurface.backgroundColor,
    fillShadowGradientFromOpacity: isDark ? 0.2 : 0.15,
    fillShadowGradientToOpacity: 0.02,
    backgroundLineColor: withAlpha(colors.primaryText, 0.14),
    dotStrokeColor: mainPageChrome.elevatedSurface.backgroundColor,
    borderRadius: BORDER_RADIUS.lg,
  }), [colors.gray, colors.primaryText, isDark, mainPageChrome.elevatedSurface.backgroundColor]);

  const healthChartConfig = useMemo(
    () => createMetricChartConfig(selectedHealthAccent.lineColor),
    [createMetricChartConfig, selectedHealthAccent.lineColor],
  );
  const bodyChartConfig = useMemo(
    () => createMetricChartConfig(selectedBodyAccent.lineColor),
    [createMetricChartConfig, selectedBodyAccent.lineColor],
  );
  const nutritionChartConfig = useMemo(
    () => createMetricChartConfig(selectedNutritionAccent.lineColor),
    [createMetricChartConfig, selectedNutritionAccent.lineColor],
  );

  const bucketSpanDays = getBucketSpanDays(period);
  const maxLabels = getMaxLabels(period);
  const isDensePeriod = period === '3months' || period === '1year';
  const chartWidth = Math.max(screenWidth - SPACING.page * 2 - SPACING.lg * 2, 0);

  const aggregatedHistory = useMemo(() => {
    return {
      healthAgg: aggregateData(faceScoreHistory, bucketSpanDays, (item) =>
        selectedHealthMetric.valueExtractor(item),
      ),
      bodyAgg: aggregateData(bodyScoreHistory, bucketSpanDays, (item) =>
        selectedBodyMetric.valueExtractor(item),
      ),
      nutritionAgg: aggregateData(nutritionHistory, bucketSpanDays, (item) =>
        selectedNutritionMetric.valueExtractor(item),
      ),
    };
  }, [
    faceScoreHistory,
    bodyScoreHistory,
    nutritionHistory,
    bucketSpanDays,
    selectedHealthMetric,
    selectedBodyMetric,
    selectedNutritionMetric,
  ]);

  const denseMonthEntrySets = useMemo(() => {
    if (!isDensePeriod) return [] as DenseMonthEntry[][];

    return [
      aggregatedHistory.healthAgg,
      aggregatedHistory.bodyAgg,
      aggregatedHistory.nutritionAgg,
    ]
      .filter((aggregated) => aggregated.length > 0)
      .map((aggregated) => buildDenseMonthEntries(aggregated, locale));
  }, [aggregatedHistory, isDensePeriod, locale]);

  const denseMonthCounts = useMemo(() => {
    return denseMonthEntrySets.map((entries) => entries.filter((entry) => entry.isMonthChange).length);
  }, [denseMonthEntrySets]);

  const maxDenseMonthCount = denseMonthCounts.length > 0 ? Math.max(...denseMonthCounts) : 0;

  const baseDenseLabels = useMemo(() => {
    return denseMonthEntrySets.flatMap((entries) => {
      return entries
        .filter((entry) => entry.isMonthChange)
        .map((entry) => entry.monthLabel);
    });
  }, [denseMonthEntrySets]);

  const baseLongestDenseLabel = useMemo(() => getLongestLabel(baseDenseLabels), [baseDenseLabels]);
  const baseDenseLabelWidth = Math.max(measuredDenseLabelWidth, estimateLabelWidth(baseLongestDenseLabel));

  const showEveryOtherDenseMonth = isDensePeriod
    ? shouldUseAlternateDenseMonths(chartWidth, maxDenseMonthCount, baseDenseLabelWidth)
    : false;

  const visibleDenseLabelSets = useMemo(() => {
    return denseMonthEntrySets.map((entries) => buildDenseMonthLabels(entries, showEveryOtherDenseMonth));
  }, [denseMonthEntrySets, showEveryOtherDenseMonth]);

  const visibleDenseMonthCounts = useMemo(() => {
    return visibleDenseLabelSets.map((labels) => labels.filter(Boolean).length);
  }, [visibleDenseLabelSets]);

  const maxVisibleDenseMonthCount = visibleDenseMonthCounts.length > 0 ? Math.max(...visibleDenseMonthCounts) : 0;

  const visibleDenseLabels = useMemo(() => {
    return visibleDenseLabelSets.flatMap((labels) => labels.filter(Boolean));
  }, [visibleDenseLabelSets]);

  const denseMeasurementLabel = useMemo(() => {
    return getLongestLabel(visibleDenseLabels);
  }, [visibleDenseLabels]);

  useEffect(() => {
    setMeasuredDenseLabelWidth(0);
  }, [denseMeasurementLabel]);

  const denseLabelWidth = measuredDenseLabelWidth || estimateLabelWidth(denseMeasurementLabel);
  const denseXAxisLayout = isDensePeriod
    ? getDenseXAxisLayout(chartWidth, maxVisibleDenseMonthCount, denseLabelWidth)
    : { labelRotation: 0, xLabelsOffset: 0, chartBottomPadding: 0 };

  const chartStyle = denseXAxisLayout.chartBottomPadding > 0
    ? StyleSheet.flatten([styles.chart, { paddingBottom: denseXAxisLayout.chartBottomPadding }])
    : styles.chart;

  const buildChartData = useCallback(
    (
      aggregated: AggregatedChartPoint[],
      lineColor: string,
      scale: ChartScaleKind,
    ) => {
      if (aggregated.length === 0) return null;

      const ceiling = resolveChartCeiling(
        aggregated.map((item) => item.value),
        scale,
      );

      const rawLabels = isDensePeriod
        ? buildDenseMonthLabels(buildDenseMonthEntries(aggregated, locale), showEveryOtherDenseMonth)
        : aggregated.map((item) => formatDateLabel(item.date, locale));

      return {
        labels: isDensePeriod ? rawLabels : sparseLabels(rawLabels, maxLabels),
        datasets: [
          {
            data: aggregated.map((item) => sanitizeChartValue(item.value, ceiling)),
            color: (opacity = 1) => withAlpha(lineColor, opacity),
            strokeWidth: 3,
          },
          { data: [0], withDots: false, strokeWidth: 0, color: () => 'transparent' },
          {
            data: [ceiling],
            withDots: false,
            strokeWidth: 0,
            color: () => 'transparent',
          },
        ],
      };
    },
    [isDensePeriod, locale, maxLabels, showEveryOtherDenseMonth]
  );

  const { healthScoreData, physicalEvolutionData, nutritionScoreData } = useMemo(() => {
    return {
      healthScoreData: buildChartData(
        aggregatedHistory.healthAgg,
        selectedHealthAccent.lineColor,
        selectedHealthMetric.scale,
      ),
      physicalEvolutionData: buildChartData(
        aggregatedHistory.bodyAgg,
        selectedBodyAccent.lineColor,
        selectedBodyMetric.scale,
      ),
      nutritionScoreData: buildChartData(
        aggregatedHistory.nutritionAgg,
        selectedNutritionAccent.lineColor,
        selectedNutritionMetric.scale,
      ),
    };
  }, [
    aggregatedHistory,
    buildChartData,
    selectedHealthAccent.lineColor,
    selectedBodyAccent.lineColor,
    selectedNutritionAccent.lineColor,
    selectedHealthMetric.scale,
    selectedBodyMetric.scale,
    selectedNutritionMetric.scale,
  ]);

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      {alertElement}
      {isDensePeriod && denseMeasurementLabel ? (
        <View pointerEvents="none" style={styles.labelMeasurementContainer}>
          <Text
            style={styles.labelMeasurementText}
            onLayout={(event) => {
              const nextWidth = Math.ceil(event.nativeEvent.layout.width);
              if (nextWidth > 0 && nextWidth !== measuredDenseLabelWidth) {
                setMeasuredDenseLabelWidth(nextWidth);
              }
            }}
          >
            {denseMeasurementLabel}
          </Text>
        </View>
      ) : null}

      <ScreenHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
        onBack={() => router.back()}
        testID="analytics-screen-header"
      />

      <ScrollView
        style={styles.listContainer}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        refreshControl={
          <RefreshControl refreshing={isManualRefresh} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.periodSelectorContainer}>
          <SegmentedControl<AnalyticsPeriod>
            value={period}
            onChange={(nextPeriod) => {
              const option = PERIODS.find((item) => item.value === nextPeriod);
              handlePeriodSelect(nextPeriod, option?.premium ?? false);
            }}
            options={PERIODS.map((periodOption) => ({
              value: periodOption.value,
              label: t(periodOption.labelKey),
              premium: periodOption.premium && !isPremium,
              icon: periodOption.premium && !isPremium ? (
                <Crown size={12} fill={colors.gold} />
              ) : undefined,
              accessibilityLabel: t(periodOption.labelKey),
              accessibilityHint:
                periodOption.premium && !isPremium
                  ? t('analytics.premium_feature')
                  : undefined,
            }))}
            testID="analytics-period-selector"
          />
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <ErrorMessage
              message={error.message}
              onRetry={() => refetch()}
              fullScreen={false}
            />
          </View>
        )}

        {isInitialLoading && (
          <Squircle style={styles.emptyStateCard}>
            <ScreenState
              tone="loading"
              layout="inline"
              title={t('common.loading')}
              surfaceVariant="inset"
              testID="analytics-loading-state"
            />
          </Squircle>
        )}

        {!hasData && !error && !isInitialLoading && (
          <Squircle style={styles.emptyStateCard}>
            <ScreenState
              tone="empty"
              layout="inline"
              title={t('analytics.empty_state')}
              surfaceVariant="inset"
              testID="analytics-empty-state"
            />
          </Squircle>
        )}

        <Squircle
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            healthScoreData
              ? `${t('analytics.health_score')} - ${t(selectedHealthMetric.labelKey)}: ${healthScoreData.datasets[0].data.slice(-1)[0]}`
              : `${t('analytics.health_score')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Heart color={selectedHealthAccent.lineColor} size={20} />
            <Text style={[styles.chartTitle, { color: selectedHealthAccent.titleColor }]}>
              {t('analytics.health_score')}
            </Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.health_score_subtitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricSelector}
            style={styles.metricSelectorScroll}
          >
            {HEALTH_CHART_METRICS.map((metric) => {
              const isSelected = selectedHealthMetric.id === metric.id;
              const metricAccent = getMetricAccent(metric.accentKey);

              return (
                <TouchableOpacity
                  key={metric.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(metric.labelKey)}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.metricButton,
                    { borderColor: withAlpha(metricAccent.lineColor, isDark ? 0.16 : 0.11) },
                    isSelected && styles.metricButtonActive,
                    isSelected && {
                      backgroundColor: metricAccent.chipActiveBackgroundColor,
                      borderColor: metricAccent.chipActiveBorderColor,
                    },
                  ]}
                  testID={`analytics-health-metric-${metric.id}`}
                  onPress={() => setHealthMetricId(metric.id)}
                >
                  <Text
                    style={[
                      styles.metricButtonText,
                      { color: metricAccent.chipTextColor },
                      isSelected && styles.metricButtonTextActive,
                      isSelected && { color: metricAccent.chipActiveTextColor },
                    ]}
                  >
                    {t(metric.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {healthScoreData && chartsReady ? (
            <LineChart
              data={healthScoreData}
              width={chartWidth}
              height={220}
              chartConfig={healthChartConfig}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              yAxisInterval={selectedHealthMetric.scale === 'score10' ? 1 : 10}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <Squircle style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </Squircle>
          )}
        </Squircle>

        <Squircle
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            physicalEvolutionData
              ? `${t('analytics.physical_evolution')} - ${t(selectedBodyMetric.labelKey)}: ${physicalEvolutionData.datasets[0].data.slice(-1)[0]}`
              : `${t('analytics.physical_evolution')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Activity color={selectedBodyAccent.lineColor} size={20} />
            <Text style={[styles.chartTitle, { color: selectedBodyAccent.titleColor }]}>
              {t('analytics.physical_evolution')}
            </Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.physical_evolution_subtitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricSelector}
            style={styles.metricSelectorScroll}
          >
            {BODY_CHART_METRICS.map((metric) => {
              const isSelected = selectedBodyMetric.id === metric.id;
              const metricAccent = getMetricAccent(metric.accentKey);

              return (
                <TouchableOpacity
                  key={metric.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(metric.labelKey)}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.metricButton,
                    { borderColor: withAlpha(metricAccent.lineColor, isDark ? 0.16 : 0.11) },
                    isSelected && styles.metricButtonActive,
                    isSelected && {
                      backgroundColor: metricAccent.chipActiveBackgroundColor,
                      borderColor: metricAccent.chipActiveBorderColor,
                    },
                  ]}
                  testID={`analytics-body-metric-${metric.id}`}
                  onPress={() => setBodyMetricId(metric.id)}
                >
                  <Text
                    style={[
                      styles.metricButtonText,
                      { color: metricAccent.chipTextColor },
                      isSelected && styles.metricButtonTextActive,
                      isSelected && { color: metricAccent.chipActiveTextColor },
                    ]}
                  >
                    {t(metric.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {physicalEvolutionData && chartsReady ? (
            <LineChart
              data={physicalEvolutionData}
              width={chartWidth}
              height={220}
              chartConfig={bodyChartConfig}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <Squircle style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </Squircle>
          )}
        </Squircle>

        <Squircle
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            nutritionScoreData
              ? `${t('analytics.nutrition_score')} - ${t(selectedNutritionMetric.labelKey)}: ${nutritionScoreData.datasets[0].data.slice(-1)[0]}`
              : `${t('analytics.nutrition_score')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Utensils color={selectedNutritionAccent.lineColor} size={20} />
            <Text style={[styles.chartTitle, { color: selectedNutritionAccent.titleColor }]}>
              {t('analytics.nutrition_score')}
            </Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.nutrition_score_subtitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricSelector}
            style={styles.metricSelectorScroll}
          >
            {NUTRITION_CHART_METRICS.map((metric) => {
              const isSelected = selectedNutritionMetric.id === metric.id;
              const metricAccent = getMetricAccent(metric.accentKey);

              return (
                <TouchableOpacity
                  key={metric.id}
                  accessibilityRole="button"
                  accessibilityLabel={t(metric.labelKey)}
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.metricButton,
                    { borderColor: withAlpha(metricAccent.lineColor, isDark ? 0.16 : 0.11) },
                    isSelected && styles.metricButtonActive,
                    isSelected && {
                      backgroundColor: metricAccent.chipActiveBackgroundColor,
                      borderColor: metricAccent.chipActiveBorderColor,
                    },
                  ]}
                  testID={`analytics-nutrition-metric-${metric.id}`}
                  onPress={() => setNutritionMetricId(metric.id)}
                >
                  <Text
                    style={[
                      styles.metricButtonText,
                      { color: metricAccent.chipTextColor },
                      isSelected && styles.metricButtonTextActive,
                      isSelected && { color: metricAccent.chipActiveTextColor },
                    ]}
                  >
                    {t(metric.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {nutritionScoreData && chartsReady ? (
            <LineChart
              data={nutritionScoreData}
              width={chartWidth}
              height={220}
              chartConfig={nutritionChartConfig}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <Squircle style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </Squircle>
          )}
        </Squircle>

        <View style={[styles.footer, { height: insets.bottom + SPACING.xl }]} />
      </ScrollView>

      <ContextualPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        title={t('premium.subscription_page.contextual_analytics_title')}
        description={t('premium.subscription_page.contextual_analytics_body')}
        primaryButtonText={t('premium.subscription_page.contextual_cta')}
      />
    </AppScreen>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const chrome = getMainPageChrome(colors, isDark, 'analytics');
  const selectorSurface = getObsidianSurface(colors, {
    accentColor: colors.primaryText,
    intensity: 'flat',
    backgroundAlpha: 0.035,
    borderAlpha: 0.08,
    shadowOpacity: 0.06,
  });

  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: chrome.canvas,
  },
  listContainer: {
    flex: 1,
    backgroundColor: chrome.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: chrome.headerBackground,
    borderBottomWidth: 1,
    borderBottomColor: chrome.headerBorder,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted ?? colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08), borderCurve: 'continuous',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: SIZES.text20,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
  },
  headerSubtitle: {
    fontSize: SIZES.text14,
    color: colors.gray,
    marginTop: SPACING.xs,
  },
  periodSelectorContainer: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: chrome.canvas,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: selectorSurface.backgroundColor,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    borderWidth: 1,
    borderColor: selectorSurface.borderColor,
    ...selectorSurface.shadowStyle, borderCurve: 'continuous',
  },
  periodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.full, borderCurve: 'continuous',
  },
  periodButtonActive: {
    backgroundColor: colors.primaryText,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: SIZES.text12,
    color: colors.gray,
    fontWeight: FONT_WEIGHTS.medium,
  },
  periodButtonTextActive: {
    color: colors.background,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  periodButtonTextPremium: {
    color: colors.gold,
  },
  crownIcon: {
    marginRight: 4,
  },
  chartCard: {
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.lg,
    backgroundColor: chrome.elevatedSurface.backgroundColor,
    borderRadius: BORDER_RADIUS.hero,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: chrome.elevatedSurface.borderColor,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isDark ? 0.1 : 0.04,
    shadowRadius: 16,
    elevation: 1, borderCurve: 'continuous',
  },
  chartHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  chartTitle: {
    fontSize: SIZES.text18,
    fontWeight: FONT_WEIGHTS.bold,
    color: colors.primaryText,
    marginBottom: SPACING.xs,
  },
  chartSubtitle: {
    fontSize: SIZES.text12,
    color: withAlpha(colors.primaryText, 0.64),
    marginBottom: SPACING.md,
  },
  metricSelectorScroll: {
    marginBottom: SPACING.md,
  },
  metricSelector: {
    gap: SPACING.sm,
    paddingRight: SPACING.xs,
  },
  metricButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: chrome.chip.backgroundColor,
    borderWidth: 1,
    borderColor: chrome.chip.borderColor, borderCurve: 'continuous',
  },
  metricButtonActive: {
    backgroundColor: chrome.chipActive.backgroundColor,
    borderColor: chrome.chipActive.borderColor,
  },
  metricButtonText: {
    fontSize: SIZES.text12,
    color: chrome.chip.textColor,
    fontWeight: FONT_WEIGHTS.medium,
  },
  metricButtonTextActive: {
    color: chrome.chipActive.textColor,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  chart: {
    marginLeft: -SPACING.md,
    borderRadius: BORDER_RADIUS.xl, borderCurve: 'continuous',
  },
  labelMeasurementContainer: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    opacity: 0,
  },
  labelMeasurementText: {
    fontSize: SIZES.text12,
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyStateCard: {
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden', borderCurve: 'continuous',
  },
  errorContainer: {
    marginHorizontal: SPACING.page,
    marginBottom: SPACING.lg,
  },
  footer: {
    height: SPACING.xxl,
  },
  emptyChartContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: chrome.chart.emptyBackground,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: chrome.chip.borderColor, borderCurve: 'continuous',
  },
  emptyChartText: {
    fontSize: SIZES.text14,
    color: colors.gray,
    textAlign: 'center',
  },
  });
};
