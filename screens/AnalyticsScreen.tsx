import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { Crown, Activity, Utensils, Heart, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useAnalytics } from '@/hooks/queries';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AnalyticsPeriod } from '@/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { SIZES, SPACING, BORDER_RADIUS, FONT_WEIGHTS, SHADOWS, withAlpha } from '@/constants/theme';
import { ContextualPaywall } from '@/components/ContextualPaywall';
import {
  ANALYTICS_LIKE_LINE_CHART_PROPS,
  createAnalyticsLikeLineChartConfig,
} from '@/utils/chartStyles';
import { paywallSession } from '@/utils/paywallSession';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';

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

const CHART_X_LABEL_FONT_SIZE = 12;
const CHART_X_LABEL_ESTIMATED_CHAR_WIDTH = 7;
const CHART_X_LABEL_GAP = 12;
const DENSE_LABEL_BUFFER = 10;
const DENSE_LABEL_MIN_PADDING = 28;
const DENSE_LABEL_MAX_PADDING = 72;
const DENSE_LABEL_STANDARD_ROTATION = 45;
const DENSE_LABEL_COMPACT_ROTATION = 60;
const EMPTY_ANALYTICS_HISTORY: never[] = [];

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const aggregateData = <T extends { date: string }>(
  data: T[],
  bucketSize: number,
  valueExtractor: (item: T) => number
): AggregatedChartPoint[] => {
  if (bucketSize <= 1) {
    return data.map((item) => ({
      date: item.date,
      value: valueExtractor(item),
    }));
  }

  const result: AggregatedChartPoint[] = [];

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucket = data.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;

    const averageValue = bucket.reduce((sum, item) => sum + valueExtractor(item), 0) / bucket.length;
    const startDate = bucket[0].date;
    const endDate = bucket[bucket.length - 1].date;

    result.push({
      date: bucket.length > 1 ? `${startDate}|${endDate}` : startDate,
      value: Math.round(averageValue),
    });
  }

  return result;
};

const getBucketSize = (selectedPeriod: AnalyticsPeriod): number => {
  switch (selectedPeriod) {
    case '7days':
      return 1;
    case '30days':
      return 3;
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

const sanitizeScore = (value: number | null | undefined): number => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
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
  const { colors } = useTheme();
  const { t, locale } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [period, setPeriod] = useState<AnalyticsPeriod>('7days');
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [measuredDenseLabelWidth, setMeasuredDenseLabelWidth] = useState(0);
  const { showAlert, alertElement } = useCustomAlert();
  const isPremium = hasPremiumAccessFromProfile(userProfile);

  const { data, isLoading, error, refetch } = useAnalytics(period);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    await refetch();
    setIsManualRefresh(false);
  }, [refetch]);

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
  const nutritionHistory = data?.nutritionHistory ?? EMPTY_ANALYTICS_HISTORY;

  const hasData =
    healthScoreHistory.length > 0 ||
    bodyScoreHistory.length > 0 ||
    nutritionHistory.length > 0;

  const chartConfig = useMemo(() => createAnalyticsLikeLineChartConfig({
    backgroundColor: colors.cardBackground,
    lineColor: '#0A84FF',
    labelColor: colors.gray,
    fillShadowGradientFrom: colors.primary,
    fillShadowGradientTo: colors.cardBackground,
    fillShadowGradientOpacity: 0.2,
    backgroundLineColor: colors.gray,
    dotStrokeColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
  }), [colors]);

  const bucketSize = getBucketSize(period);
  const maxLabels = getMaxLabels(period);
  const isDensePeriod = period === '3months' || period === '1year';
  const chartWidth = Math.max(screenWidth - SPACING.page * 2 - SPACING.lg * 2, 0);

  const aggregatedHistory = useMemo(() => {
    return {
      healthAgg: aggregateData(healthScoreHistory, bucketSize, (item) => item.value),
      bodyAgg: aggregateData(bodyScoreHistory, bucketSize, (item) => item.bodyScore),
      nutritionAgg: aggregateData(nutritionHistory, bucketSize, (item) => item.nutritionScore),
    };
  }, [healthScoreHistory, bodyScoreHistory, nutritionHistory, bucketSize]);

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
    (aggregated: AggregatedChartPoint[], colorRgba: string) => {
      if (aggregated.length === 0) return null;

      const rawLabels = isDensePeriod
        ? buildDenseMonthLabels(buildDenseMonthEntries(aggregated, locale), showEveryOtherDenseMonth)
        : aggregated.map((item) => formatDateLabel(item.date, locale));

      return {
        labels: isDensePeriod ? rawLabels : sparseLabels(rawLabels, maxLabels),
        datasets: [
          {
            data: aggregated.map((item) => sanitizeScore(item.value)),
            color: (opacity = 1) => colorRgba.replace('OPACITY', String(opacity)),
            strokeWidth: 3,
          },
          { data: [0], withDots: false, strokeWidth: 0, color: () => 'transparent' },
          { data: [100], withDots: false, strokeWidth: 0, color: () => 'transparent' },
        ],
      };
    },
    [isDensePeriod, locale, maxLabels, showEveryOtherDenseMonth]
  );

  const { healthScoreData, physicalEvolutionData, nutritionScoreData } = useMemo(() => {
    return {
      healthScoreData: buildChartData(aggregatedHistory.healthAgg, 'rgba(50, 173, 230, OPACITY)'),
      physicalEvolutionData: buildChartData(aggregatedHistory.bodyAgg, 'rgba(0, 122, 255, OPACITY)'),
      nutritionScoreData: buildChartData(aggregatedHistory.nutritionAgg, 'rgba(52, 199, 89, OPACITY)'),
    };
  }, [aggregatedHistory, buildChartData]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <View style={styles.container}>
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

      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={styles.headerBackButton}
          hitSlop={8}
          testID="analytics-back-button"
        >
          <ChevronLeft color={colors.primaryText} size={20} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{t('analytics.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('analytics.subtitle')}</Text>
        </View>
      </View>

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
          <View style={styles.periodSelector}>
            {PERIODS.map((periodOption) => (
              <TouchableOpacity
                key={periodOption.value}
                style={[
                  styles.periodButton,
                  period === periodOption.value && styles.periodButtonActive,
                ]}
                onPress={() => handlePeriodSelect(periodOption.value, periodOption.premium)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t(periodOption.labelKey)}
                accessibilityState={{ selected: period === periodOption.value }}
                accessibilityHint={periodOption.premium && !isPremium ? t('analytics.premium_feature') : undefined}
              >
                {periodOption.premium && !isPremium && (
                  <Crown
                    color={period === periodOption.value ? colors.white : colors.gold}
                    size={12}
                    fill={period === periodOption.value ? colors.white : colors.gold}
                    style={styles.crownIcon}
                  />
                )}
                <Text
                  style={[
                    styles.periodButtonText,
                    period === periodOption.value && styles.periodButtonTextActive,
                    periodOption.premium && !isPremium && styles.periodButtonTextPremium,
                  ]}
                >
                  {t(periodOption.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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

        {!hasData && !error && (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateText}>{t('analytics.empty_state')}</Text>
          </View>
        )}

        <View
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            healthScoreData
              ? `${t('analytics.health_score')}: ${healthScoreData.datasets[0].data.slice(-1)[0]}/100`
              : `${t('analytics.health_score')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Heart color="#32ADE6" size={20} />
            <Text style={styles.chartTitle}>{t('analytics.health_score')}</Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.health_score_subtitle')}</Text>
          {healthScoreData ? (
            <LineChart
              data={healthScoreData}
              width={chartWidth}
              height={220}
              chartConfig={{
                ...chartConfig,
                fillShadowGradientFrom: '#32ADE6',
                fillShadowGradientTo: colors.cardBackground,
              }}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              yAxisInterval={10}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <View style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </View>
          )}
        </View>

        <View
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            physicalEvolutionData
              ? `${t('analytics.physical_evolution')}: ${physicalEvolutionData.datasets[0].data.slice(-1)[0]}/100`
              : `${t('analytics.physical_evolution')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Activity color="#007AFF" size={20} />
            <Text style={styles.chartTitle}>{t('analytics.physical_evolution')}</Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.physical_evolution_subtitle')}</Text>
          {physicalEvolutionData ? (
            <LineChart
              data={physicalEvolutionData}
              width={chartWidth}
              height={220}
              chartConfig={{
                ...chartConfig,
                fillShadowGradientFrom: '#007AFF',
                fillShadowGradientTo: colors.cardBackground,
              }}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <View style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </View>
          )}
        </View>

        <View
          style={styles.chartCard}
          accessible={true}
          accessibilityLabel={
            nutritionScoreData
              ? `${t('analytics.nutrition_score')}: ${nutritionScoreData.datasets[0].data.slice(-1)[0]}/100`
              : `${t('analytics.nutrition_score')}: ${t('analytics.empty_state')}`
          }
        >
          <View style={styles.chartHeaderWithIcon}>
            <Utensils color="#34C759" size={20} />
            <Text style={styles.chartTitle}>{t('analytics.nutrition_score')}</Text>
          </View>
          <Text style={styles.chartSubtitle}>{t('analytics.nutrition_score_subtitle')}</Text>
          {nutritionScoreData ? (
            <LineChart
              data={nutritionScoreData}
              width={chartWidth}
              height={220}
              chartConfig={{
                ...chartConfig,
                fillShadowGradientFrom: '#34C759',
                fillShadowGradientTo: colors.cardBackground,
              }}
              {...ANALYTICS_LIKE_LINE_CHART_PROPS}
              style={chartStyle}
              verticalLabelRotation={denseXAxisLayout.labelRotation}
              xLabelsOffset={denseXAxisLayout.xLabelsOffset}
            />
          ) : (
            <View style={styles.emptyChartContainer}>
              <Text style={styles.emptyChartText}>{t('analytics.empty_state')}</Text>
            </View>
          )}
        </View>

        <View style={[styles.footer, { height: insets.bottom + SPACING.xl }]} />
      </ScrollView>

      <ContextualPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        title={t('premium.subscription_page.contextual_analytics_title')}
        description={t('premium.subscription_page.contextual_analytics_body')}
        primaryButtonText={t('premium.subscription_page.contextual_cta')}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cardBackground,
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: colors.cardBackground,
    ...SHADOWS.header,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: withAlpha(colors.primaryText, 0.06),
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
    paddingVertical: SPACING.lg,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.lightGray,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.md - 2,
  },
  periodButtonActive: {
    backgroundColor: colors.cardBackground,
    ...SHADOWS.card,
  },
  periodButtonText: {
    fontSize: SIZES.text12,
    color: colors.gray,
    fontWeight: FONT_WEIGHTS.medium,
  },
  periodButtonTextActive: {
    color: colors.primaryText,
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
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.card,
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
    color: colors.gray,
    marginBottom: SPACING.md,
  },
  chart: {
    marginLeft: -SPACING.md,
    borderRadius: BORDER_RADIUS.md,
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
    backgroundColor: colors.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  emptyStateText: {
    fontSize: SIZES.text14,
    color: colors.gray,
    textAlign: 'center',
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
    backgroundColor: colors.lightGray,
    borderRadius: BORDER_RADIUS.md,
  },
  emptyChartText: {
    fontSize: SIZES.text14,
    color: colors.gray,
    textAlign: 'center',
  },
});
