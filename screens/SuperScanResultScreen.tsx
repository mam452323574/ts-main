import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  CheckCircle,
  CirclePercent,
  Droplets,
  Lock,
  ScanFace,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SuperScanAreaCard } from '@/components/SuperScanAreaCard';
import { TrajectoryPreviewCard } from '@/components/TrajectoryPreviewCard';
import { UrgencyModal } from '@/components/UrgencyModal';
import { ConditionCard } from '@/components/ConditionCard';
import { MetricCard } from '@/components/MetricCard';
import { RadialScoreGauge } from '@/components/RadialScoreGauge';
import { ResultActionRail } from '@/components/results/ResultActionRail';
import { ResultHeroSurface } from '@/components/results/ResultHeroSurface';
import { ResultNarrativeCard } from '@/components/results/ResultNarrativeCard';
import { ResultPillBadge } from '@/components/results/ResultPillBadge';
import { PremiumTeaserCard } from '@/components/results/PremiumTeaserCard';
import { ScanCoachCtaCard } from '@/components/results/ScanCoachCtaCard';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import { usePremiumPotential } from '@/hooks/queries/usePremiumPotential';
import { FatDistributionScanResult, SuperScanResult } from '@/types';
import { FONT_WEIGHTS, SIZES, SPACING, mixColors, withAlpha } from '@/constants/theme';
import {
  isSuperAnalysisType,
  tryNormalizeAnalysisResult,
} from '@/utils/analysisNormalization';
import { safeParseJsonRouteParam } from '@/utils/deepLinkSchemas';
import { openResultShareFlow } from '@/utils/resultShareFlow';
import {
  buildResultTrajectoryViewModel,
  buildFatDistributionSuperScanResultViewModel,
  buildLegacySuperScanResultViewModel,
  formatConditionProbability,
} from '@/utils/resultViewModels';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
import {
  localizeQualitativeLevel,
  localizeSuperScanConditionLabel,
} from '@/utils/resultLocalization';
import { resolveResultItemTheme } from '@/utils/resultVisualTheme';
import {
  normalizeSuperScanTextKey,
  resolveDefaultSuperScanPalette,
  resolveFatDistributionDominantMetricId,
  resolveFatDistributionPrimaryMetricThemeSpec,
  resolveFatDistributionSuperScanPalette,
  resolveLegacySuperScanPalette,
  resolveSuperScanAreaTheme,
} from '@/utils/superScanVisualTheme';
import { parseSafeNumber } from '@/utils/scanFormatters';
import { resolvePremiumRenderStateFromProfile } from '@/utils/subscription';
import {
  buildCoachGenerationInputFromScanCoachIntent,
  encodeScanCoachIntentParam,
  scanCoachIntent,
} from '@/utils/scanCoachIntent';

type SuperScreenAnalysisData = SuperScanResult | FatDistributionScanResult;

const parseAnalysisData = (
  value: string | string[] | undefined,
): SuperScreenAnalysisData | null => {
  const parsed = safeParseJsonRouteParam(value);
  if (parsed === null) {
    return null;
  }

  const normalized = tryNormalizeAnalysisResult(parsed);
  return normalized && isSuperAnalysisType(normalized.scan_type)
    ? (normalized as SuperScreenAnalysisData)
    : null;
};

const parseRouteParam = (value: string | string[] | undefined) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;

function getSeverityAccent(
  severity: 'low' | 'moderate' | 'high' | 'unknown',
  colors: any,
) {
  if (severity === 'high') {
    return colors.error;
  }

  if (severity === 'moderate') {
    return colors.warning;
  }

  return colors.success;
}

export default function SuperScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { data: featureFlags } = useFeatureFlags();
  const { alertElement, showAlert } = useCustomAlert();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () => createStyles(colors, insets, isDark, layout),
    [colors, insets, isDark, layout],
  );

  const premiumRenderState = resolvePremiumRenderStateFromProfile(
    userProfile,
    authLoading,
  );
  const analysisData = useMemo(
    () => parseAnalysisData(params.analysisData),
    [params.analysisData],
  );
  const legacyAnalysisData = analysisData?.scan_type === 'super_health_v2'
    ? (analysisData as SuperScanResult)
    : null;
  const fatDistributionAnalysisData = analysisData?.scan_type === 'fat_distribution_scan_v2'
    ? (analysisData as FatDistributionScanResult)
    : null;
  const scanId = parseRouteParam(params.scanId);
  const imageUri = parseRouteParam(params.imageUri);
  const { data: premiumPotential } = usePremiumPotential(
    'super',
    scanId ?? null,
    !!legacyAnalysisData,
  );
  const coachIntent = useMemo(
    () =>
      analysisData
        ? scanCoachIntent(analysisData, {
            locale,
            scanId,
            scanType: 'super',
          })
        : null,
    [analysisData, locale, scanId],
  );

  const legacyViewModel = useMemo(() => {
    if (!legacyAnalysisData) {
      return null;
    }

    return buildLegacySuperScanResultViewModel({
      analysisData: legacyAnalysisData,
      t,
    });
  }, [legacyAnalysisData, t]);
  const fatDistributionViewModel = useMemo(() => {
    if (!fatDistributionAnalysisData) {
      return null;
    }

    return buildFatDistributionSuperScanResultViewModel({
      analysisData: fatDistributionAnalysisData,
      t,
      locale,
      premiumRenderState,
    });
  }, [fatDistributionAnalysisData, locale, premiumRenderState, t]);
  const trajectoryViewModel = useMemo(() => {
    if (!legacyAnalysisData) {
      return null;
    }

    return buildResultTrajectoryViewModel({
      analysisData: legacyAnalysisData,
      t,
      locale,
      premiumRenderState,
      historicalAverage30d: premiumPotential?.historicalAverage30d ?? null,
      recentScoreHistory: premiumPotential?.recentScoreHistory ?? [],
      currentScanDate:
        premiumPotential?.currentScan?.analyzed_at ??
        premiumPotential?.currentScan?.created_at ??
        null,
    });
  }, [
    legacyAnalysisData,
    locale,
    premiumPotential?.currentScan?.analyzed_at,
    premiumPotential?.currentScan?.created_at,
    premiumPotential?.historicalAverage30d,
    premiumPotential?.recentScoreHistory,
    premiumRenderState,
    t,
  ]);

  const [showUrgencyModal, setShowUrgencyModal] = useState(false);
  const [hasAcknowledgedUrgency, setHasAcknowledgedUrgency] = useState(false);
  const [isPreparingCommunityShare, setIsPreparingCommunityShare] = useState(false);
  const screenPalette = useMemo(() => {
    if (legacyAnalysisData) {
      return resolveLegacySuperScanPalette({
        colors,
        isDark,
        globalRiskScore: legacyAnalysisData.global_risk_score,
        urgencyFlag: legacyAnalysisData.urgency_flag,
      });
    }

    if (fatDistributionAnalysisData) {
      return resolveFatDistributionSuperScanPalette({
        colors,
        isDark,
        bodyFat: fatDistributionAnalysisData.global_body_fat_estimate_percent,
        facialFat: fatDistributionAnalysisData.global_facial_fat_estimate_percent,
        waterRetention:
          fatDistributionAnalysisData.global_water_retention_estimate_percent,
      });
    }

    return resolveDefaultSuperScanPalette({ colors, isDark });
  }, [
    colors,
    isDark,
    legacyAnalysisData,
    fatDistributionAnalysisData,
  ]);
  const dominantFatMetricId = useMemo(
    () =>
      fatDistributionAnalysisData
        ? resolveFatDistributionDominantMetricId({
            bodyFat: fatDistributionAnalysisData.global_body_fat_estimate_percent,
            facialFat:
              fatDistributionAnalysisData.global_facial_fat_estimate_percent,
            waterRetention:
              fatDistributionAnalysisData.global_water_retention_estimate_percent,
          })
        : null,
    [fatDistributionAnalysisData],
  );
  const fatAreaThemes = useMemo(() => {
    if (!fatDistributionViewModel) {
      return [];
    }

    return fatDistributionViewModel.areas.map((area) =>
      resolveSuperScanAreaTheme({
        colors,
        isDark,
        area,
        screenPalette,
      }),
    );
  }, [colors, fatDistributionViewModel, isDark, screenPalette]);
  const priorityZoneThemes = useMemo(() => {
    if (!fatDistributionViewModel) {
      return [];
    }

    const areaThemeByName = new Map(
      fatDistributionViewModel.areas.map((area, index) => [
        normalizeSuperScanTextKey(area.areaName),
        fatAreaThemes[index],
      ]),
    );

    return fatDistributionViewModel.priorityZones.map(
      (zone) =>
        areaThemeByName.get(normalizeSuperScanTextKey(zone)) ?? screenPalette,
    );
  }, [fatAreaThemes, fatDistributionViewModel, screenPalette]);
  const topLegacyConditions = useMemo(
    () => legacyViewModel?.conditions.slice(0, 3) ?? [],
    [legacyViewModel],
  );
  const remainingLegacyConditions = useMemo(
    () => legacyViewModel?.conditions.slice(3) ?? [],
    [legacyViewModel],
  );
  const fatPrimaryMetricThemes = useMemo(() => {
    if (!fatDistributionViewModel) {
      return {};
    }

    return fatDistributionViewModel.primaryMetrics.reduce<Record<string, ReturnType<typeof resolveResultItemTheme>>>(
      (accumulator, metric) => {
        accumulator[metric.id] = resolveResultItemTheme({
          colors,
          isDark,
          theme: resolveFatDistributionPrimaryMetricThemeSpec({
            metricId: metric.id,
            highlightedMetricId: dominantFatMetricId,
          }),
        });

        return accumulator;
      },
      {},
    );
  }, [colors, dominantFatMetricId, fatDistributionViewModel, isDark]);
  const fatHeroMetric = useMemo(() => {
    if (!fatDistributionViewModel) {
      return null;
    }

    return (
      fatDistributionViewModel.primaryMetrics.find(
        (metric) => metric.id === dominantFatMetricId,
      ) ?? fatDistributionViewModel.primaryMetrics[0] ?? null
    );
  }, [dominantFatMetricId, fatDistributionViewModel]);
  const fatHeroScore = useMemo(() => {
    if (!fatHeroMetric || !fatDistributionAnalysisData) {
      return 0;
    }

    switch (fatHeroMetric.id) {
      case 'body_fat':
        return Math.round(
          parseSafeNumber(
            fatDistributionAnalysisData.global_body_fat_estimate_percent,
          ) ?? 0,
        );
      case 'facial_fat':
        return Math.round(
          parseSafeNumber(
            fatDistributionAnalysisData.global_facial_fat_estimate_percent,
          ) ?? 0,
        );
      case 'water_retention':
      default:
        return Math.round(
          parseSafeNumber(
            fatDistributionAnalysisData.global_water_retention_estimate_percent,
          ) ?? 0,
        );
    }
  }, [fatDistributionAnalysisData, fatHeroMetric]);
  const fatDistributionHeroInsight =
    premiumRenderState === 'unlocked' &&
    fatDistributionViewModel?.dominantStoragePattern.trim() &&
    fatDistributionViewModel.dominantStoragePattern.trim() !== '-'
      ? fatDistributionViewModel.dominantStoragePattern
      : undefined;
  const shouldRenderFatDistributionSummary =
    !!fatDistributionViewModel?.analysisSummary.trim() &&
    fatDistributionViewModel.analysisSummary.trim() !== '-';

  const slideAnim = useRef(new Animated.Value(34)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (legacyAnalysisData?.urgency_flag && !hasAcknowledgedUrgency) {
      setShowUrgencyModal(true);
    }
  }, [hasAcknowledgedUrgency, legacyAnalysisData?.urgency_flag]);

  useEffect(() => {
    if (!showUrgencyModal) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          speed: 18,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [fadeAnim, showUrgencyModal, slideAnim]);

  const handleUrgencyDismiss = () => {
    setShowUrgencyModal(false);
    setHasAcknowledgedUrgency(true);
  };

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSharePress = () => {
    if (!legacyAnalysisData) {
      return;
    }

    openResultShareFlow({
      analysisData: legacyAnalysisData,
      imageUri,
      scanId,
      locale,
      t,
      userProfile,
      socialEnabled: featureFlags?.social_enabled,
      isPreparingCommunityShare,
      setIsPreparingCommunityShare,
      router,
      showAlert,
    });
  };

  const handleCoachPress = () => {
    if (!coachIntent) {
      return;
    }
    const coachGenerationInput =
      buildCoachGenerationInputFromScanCoachIntent(coachIntent, {
        accountTier: userProfile?.account_tier,
      });

    router.push({
      pathname: '/coach',
      params: {
        source: 'scan_result',
        autoSubmit: '1',
        ...(scanId ? { scanId } : {}),
        scanType: 'super',
        promptType: coachGenerationInput.promptType,
        fallbackPromptType: coachIntent.fallback_prompt_type,
        questionKey: coachGenerationInput.questionKey ?? '',
        questionText: coachGenerationInput.questionText,
        priorityMetric: coachIntent.priority_metric ?? '',
        scanIntent: encodeScanCoachIntentParam(coachIntent),
      },
    } as any);
  };

  const handleTrajectoryPress = () => {
    router.push('/premium-upgrade');
  };

  const handlePremiumPress = () => {
    router.push('/premium-upgrade');
  };

  const fatDistributionAreaLabels = useMemo(
    () => ({
      dominantType: t('common.metrics.dominant_type'),
      subcutaneousFat: t('scan.super.fat_distribution.subcutaneous_fat'),
      waterRetention: t('common.metrics.water_retention'),
      definition: t('common.metrics.definition'),
      confidence: t('common.metrics.confidence'),
      explanation: t('common.metrics.explanation'),
      advice: t('common.metrics.advice'),
    }),
    [t],
  );

  if (
    !analysisData ||
    (legacyAnalysisData && !legacyViewModel) ||
    (fatDistributionAnalysisData && !fatDistributionViewModel)
  ) {
    return (
      <View
        style={[styles.container, { backgroundColor: screenPalette.backgroundGradient[0] }]}
        testID="super-scan-result-screen"
      >
        <LinearGradient
          colors={screenPalette.backgroundGradient}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.backgroundLayer}
          testID="super-scan-background-layer"
        />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.errorScrollContent]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resultTopChrome} testID="super-scan-result-top-chrome">
            <ScreenHeader
              title={t('scan.super.type_label')}
              centered
              onClose={handleClose}
              variant="inline"
              borderless
              topInset={false}
              closeTestID="super-scan-result-close-button"
              style={styles.resultHeader}
              testID="super-scan-result-screen-header"
            />
          </View>

          <View
            style={[
              styles.errorCard,
              getResultSurfaceChrome({
                colors,
                isDark,
                kind: 'hero',
                accentColor: screenPalette.sectionAccentColor,
                surfaceVariant: 'soft',
              }),
            ]}
            testID="super-scan-empty-state"
          >
            <AlertCircle color={colors.error} size={34} />
            <Text {...RESULT_TEXT_PROPS} style={styles.errorText}>
              {t('common.results.no_data')}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.primaryButton, { backgroundColor: colors.primaryText }]}
            >
              <Text {...RESULT_TEXT_PROPS} style={styles.primaryButtonText}>
                {t('common.home_back')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: screenPalette.backgroundGradient[0] }]}
      testID="super-scan-result-screen"
    >
      {alertElement}

      <LinearGradient
        colors={screenPalette.backgroundGradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.backgroundLayer}
        testID="super-scan-background-layer"
      />

      <UrgencyModal
        onDismiss={handleUrgencyDismiss}
        visible={!!legacyAnalysisData && showUrgencyModal}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.resultTopChrome} testID="super-scan-result-top-chrome">
          <ScreenHeader
            title={t('scan.super.type_label')}
            centered
            onClose={handleClose}
            variant="inline"
            borderless
            topInset={false}
            closeTestID="super-scan-result-close-button"
            style={styles.resultHeader}
            testID="super-scan-result-screen-header"
          />
        </View>

        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {legacyAnalysisData && legacyViewModel ? (
            <>
              <ResultHeroSurface
                accentColor={screenPalette.sectionAccentColor}
                headerContent={(
                  <View style={styles.heroBadgeRow}>
                    <ResultPillBadge
                      accentColor={screenPalette.sectionAccentColor}
                      icon={<SuperScanFeatureIcon color={screenPalette.heroIconColor} size={14} />}
                      label={t('scan.super.type_label')}
                      variant="premium"
                    />
                    <ResultPillBadge
                      label={t('common.results.ai_report')}
                      variant="neutral"
                    />
                    {legacyAnalysisData.urgency_flag ? (
                      <ResultPillBadge
                        accentColor={colors.error}
                        label={t('components.urgency.title')}
                      />
                    ) : null}
                  </View>
                )}
                subtitle={t('common.results.ai_complete')}
                title={t('scan.super.score_label')}
                visual={(
                  <RadialScoreGauge
                    color={screenPalette.scoreColor}
                    label={t('scan.super.score_label')}
                    score={legacyViewModel.globalRiskScore}
                  />
                )}
              />

              <ResultNarrativeCard
                accentColor={screenPalette.sectionAccentColor}
                eyebrow={t('scan.super.summary_label')}
                title={legacyViewModel.analysisSummary}
              />

              {coachIntent ? (
                <ScanCoachCtaCard
                  accentColor={screenPalette.sectionAccentColor}
                  intent={coachIntent}
                  onPress={handleCoachPress}
                  testID="super-scan-coach-cta"
                  variant="hero"
                />
              ) : null}

              {topLegacyConditions.length > 0 ? (
                <View style={styles.sectionStack} testID="super-scan-priority-findings">
                  <Text {...RESULT_TEXT_PROPS} style={styles.sectionTitle}>
                    {t('scan.super.conditions_label')}
                  </Text>

                  <View style={styles.findingList}>
                    {topLegacyConditions.map((condition, index) => {
                      const accent = getSeverityAccent(condition.severity_key, colors);
                      const label =
                        condition.condition_fallback_text?.trim() ||
                        localizeSuperScanConditionLabel(condition.condition_key, t, '-');
                      const severity = localizeQualitativeLevel(
                        'severity',
                        condition.severity_key,
                        t,
                        '-',
                      );
                      const isPriorityLocked = premiumRenderState === 'locked';
                      const isPriorityLoading = premiumRenderState === 'loading';
                      const probabilityText =
                        premiumRenderState === 'unlocked'
                          ? formatConditionProbability(condition.probability, locale)
                          : isPriorityLoading
                            ? t('metric_card.loading_value')
                            : t('metric_card.blurred_text');
                      const priorityFindingContent = (
                        <>
                          <View style={styles.primaryFindingCopy}>
                            <Text
                              {...RESULT_TEXT_PROPS}
                              numberOfLines={2}
                              style={styles.primaryFindingTitle}
                            >
                              {label}
                            </Text>
                            <Text
                              {...RESULT_TEXT_PROPS}
                              numberOfLines={1}
                              style={[styles.primaryFindingMeta, { color: accent }]}
                            >
                              {severity}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.primaryFindingScoreChip,
                              {
                                backgroundColor: isDark
                                  ? withAlpha(accent, 0.12)
                                  : withAlpha(accent, 0.065),
                              },
                            ]}
                          >
                            {isPriorityLocked ? (
                              <Lock color={accent} size={layout.isCompact ? 12 : 13} />
                            ) : null}
                            <Text
                              {...RESULT_TEXT_PROPS}
                              numberOfLines={1}
                              style={[styles.primaryFindingScore, { color: accent }]}
                            >
                              {probabilityText}
                            </Text>
                            {isPriorityLocked || isPriorityLoading ? (
                              <Text
                                {...RESULT_TEXT_PROPS}
                                numberOfLines={1}
                                style={[styles.primaryFindingPremiumLabel, { color: accent }]}
                              >
                                {isPriorityLoading
                                  ? t('metric_card.loading_label')
                                  : t('metric_card.premium_label')}
                              </Text>
                            ) : null}
                          </View>

                          <Text
                            {...RESULT_TEXT_PROPS}
                            accessible={false}
                            style={styles.testMarker}
                          >
                            {`${condition.severity_key}:${premiumRenderState}`}
                          </Text>
                        </>
                      );
                      const priorityFindingStyle = [
                        styles.primaryFindingCard,
                        {
                          backgroundColor: mixColors(
                            colors.cardBackground,
                            accent,
                            isDark ? 0.032 : 0.016,
                          ),
                          borderColor: withAlpha(accent, isDark ? 0.14 : 0.08),
                        },
                      ];

                      return isPriorityLocked ? (
                        <TouchableOpacity
                          key={`${condition.condition_key}-${index}`}
                          accessibilityRole="button"
                          activeOpacity={0.86}
                          onPress={handlePremiumPress}
                          style={priorityFindingStyle}
                        >
                          {priorityFindingContent}
                        </TouchableOpacity>
                      ) : (
                        <View
                          key={`${condition.condition_key}-${index}`}
                          style={priorityFindingStyle}
                        >
                          {priorityFindingContent}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View testID="super-scan-ras">
                  <ResultNarrativeCard
                    accentColor={colors.success}
                    body={t('scan.super.ras_description')}
                    eyebrow={t('scan.super.summary_label')}
                    title={t('scan.super.ras_subtitle')}
                  >
                    <View style={styles.emptyStateIconRow}>
                      <CheckCircle color={colors.success} size={20} />
                      <Text {...RESULT_TEXT_PROPS} style={[styles.emptyStateTitle, { color: colors.success }]}>
                        {t('scan.super.ras_title')}
                      </Text>
                    </View>
                  </ResultNarrativeCard>
                </View>
              )}

              {trajectoryViewModel?.shouldRender ? (
                <TrajectoryPreviewCard
                  model={trajectoryViewModel}
                  onPress={
                    trajectoryViewModel.premiumRenderState === 'locked'
                      ? handleTrajectoryPress
                      : undefined
                  }
                  visualVariant="super-scan-premium"
                />
              ) : null}

              {remainingLegacyConditions.length > 0 ? (
                <View style={styles.sectionStack}>
                  <Text {...RESULT_TEXT_PROPS} style={styles.sectionTitle}>
                    {t('common.results.deep_analysis_label')}
                  </Text>

                  {remainingLegacyConditions.map((condition, index) => (
                    <ConditionCard
                      key={`${condition.condition_key}-${index}-detail`}
                      condition={condition}
                      premiumRenderState={premiumRenderState}
                    />
                  ))}
                </View>
              ) : null}

              <ResultNarrativeCard
                accentColor={screenPalette.sectionAccentColor}
                body={legacyViewModel.disclaimerText}
                eyebrow={t('common.results.attention')}
              />

              <View style={styles.actionStack}>
                <ResultActionRail
                  accentColor={screenPalette.sectionAccentColor}
                  onPrimaryPress={handleClose}
                  onSecondaryPress={handleSharePress}
                  primaryLabel={t('common.home_back')}
                  primaryTestID="super-scan-back-button"
                  secondaryDisabled={isPreparingCommunityShare}
                  secondaryLabel={t('share_story.actions.share_report')}
                  secondaryTestID="super-scan-share-button"
                />
              </View>
            </>
          ) : null}

          {fatDistributionAnalysisData && fatDistributionViewModel ? (
            <>
              <ResultHeroSurface
                accentColor={screenPalette.sectionAccentColor}
                headerContent={(
                  <View style={styles.heroBadgeRow}>
                    <ResultPillBadge
                      accentColor={screenPalette.sectionAccentColor}
                      icon={<SuperScanFeatureIcon color={screenPalette.heroIconColor} size={14} />}
                      label={t('scan.super.type_label')}
                      variant="premium"
                    />
                    {fatHeroMetric ? (
                      <ResultPillBadge
                        accentColor={screenPalette.sectionAccentColor}
                        label={fatHeroMetric.label}
                      />
                    ) : null}
                  </View>
                )}
                insight={fatDistributionHeroInsight}
                subtitle={t('scan.super.fat_distribution.main_metrics_title')}
                title={
                  premiumRenderState === 'unlocked'
                    ? fatHeroMetric?.label ?? t('scan.super.type_label')
                    : t('scan.super.type_label')
                }
                visual={(
                  <RadialScoreGauge
                    color={screenPalette.scoreColor}
                    label={
                      premiumRenderState === 'unlocked'
                        ? fatHeroMetric?.label ?? t('scan.super.type_label')
                        : t('scan.super.type_label')
                    }
                    score={premiumRenderState === 'unlocked' ? fatHeroScore : 0}
                  />
                )}
              />

                {shouldRenderFatDistributionSummary ? (
                  <>
                    <Text
                      {...RESULT_TEXT_PROPS}
                      testID="super-scan-fat-summary"
                    accessible={false}
                    style={styles.testMarker}
                  >
                    {fatDistributionViewModel.analysisSummary}
                  </Text>
                    <ResultNarrativeCard
                      accentColor={screenPalette.sectionAccentColor}
                      eyebrow={t('scan.super.summary_label')}
                      title={fatDistributionViewModel.analysisSummary}
                    />

                    {coachIntent ? (
                      <ScanCoachCtaCard
                        accentColor={screenPalette.sectionAccentColor}
                        intent={coachIntent}
                        onPress={handleCoachPress}
                        testID="super-scan-fat-coach-cta"
                        variant="hero"
                      />
                    ) : null}
                  </>
                ) : coachIntent ? (
                  <ScanCoachCtaCard
                    accentColor={screenPalette.sectionAccentColor}
                    intent={coachIntent}
                    onPress={handleCoachPress}
                    testID="super-scan-fat-coach-cta"
                    variant="hero"
                  />
                ) : null}

              <View style={styles.sectionStack}>
                <Text {...RESULT_TEXT_PROPS} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.main_metrics_title')}
                </Text>

                <View style={styles.metricGrid} testID="super-scan-fat-main-metrics">
                  {fatDistributionViewModel.primaryMetrics.map((metric) => {
                    const metricTheme = fatPrimaryMetricThemes[metric.id];
                    const icon =
                      metric.id === 'body_fat'
                        ? <CirclePercent />
                        : metric.id === 'facial_fat'
                          ? <ScanFace />
                          : <Droplets />;

                    return (
                      <View
                        key={metric.id}
                        style={styles.metricGridItem}
                        testID={`super-scan-fat-metric-grid-item-${metric.id}`}
                      >
                        <MetricCard
                          icon={icon}
                          testID={`super-scan-fat-metric-${metric.id}`}
                          theme={metricTheme}
                          title={metric.label}
                          value={metric.value}
                          valueVariant="numeric"
                          premiumRenderState={metric.premiumRenderState}
                          onPremiumPress={handlePremiumPress}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>

              {premiumRenderState === 'unlocked' ? (
                <ResultNarrativeCard
                  accentColor={screenPalette.sectionAccentColor}
                  eyebrow={t('scan.super.fat_distribution.priority_zones')}
                >
                  {fatDistributionViewModel.priorityZones.length > 0 ? (
                    <View style={styles.priorityZonesWrap}>
                      {fatDistributionViewModel.priorityZones.map((zone, index) => {
                        const zoneTheme = priorityZoneThemes[index] ?? screenPalette;

                        return (
                          <View
                            key={`${zone}-${index}`}
                            testID={`super-scan-fat-priority-zone-${index}`}
                            style={[
                              styles.priorityZoneChip,
                              {
                                backgroundColor: zoneTheme.chipBackgroundColor,
                                borderColor: zoneTheme.chipBorderColor,
                              },
                            ]}
                          >
                            <Text
                              {...RESULT_TEXT_PROPS}
                              adjustsFontSizeToFit
                              ellipsizeMode="tail"
                              minimumFontScale={0.82}
                              numberOfLines={1}
                              style={[
                                styles.priorityZoneText,
                                { color: zoneTheme.chipTextColor },
                              ]}
                            >
                              {zone}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text
                      {...RESULT_TEXT_PROPS}
                      testID="super-scan-fat-priority-zones-empty"
                      style={[styles.emptyStateBody, { color: screenPalette.subtleTextColor }]}
                    >
                      {t('scan.super.fat_distribution.no_priority_zones')}
                    </Text>
                  )}
                </ResultNarrativeCard>
              ) : (
                <PremiumTeaserCard
                  accentColor={screenPalette.sectionAccentColor}
                  lineCount={3}
                  onPress={premiumRenderState === 'locked' ? handlePremiumPress : undefined}
                  premiumRenderState={premiumRenderState}
                  testID="super-scan-fat-priority-zones-premium"
                  title={t('scan.super.fat_distribution.priority_zones')}
                />
              )}

              <View style={styles.sectionStack}>
                <Text {...RESULT_TEXT_PROPS} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.areas_title')}
                </Text>

                {fatDistributionViewModel.areas.length > 0 ? (
                  fatDistributionViewModel.areas.map((area, index) => (
                    <SuperScanAreaCard
                      key={area.id}
                      area={area}
                      labels={fatDistributionAreaLabels}
                      lockedTitle={t('scan.super.fat_distribution.areas_title')}
                      onPremiumPress={handlePremiumPress}
                      premiumRenderState={premiumRenderState}
                      testID={`super-scan-area-card-${index}`}
                      theme={fatAreaThemes[index]}
                    />
                  ))
                ) : (
                  <View testID="super-scan-fat-areas-empty">
                    <ResultNarrativeCard
                      accentColor={screenPalette.sectionAccentColor}
                      body={t('scan.super.fat_distribution.no_areas')}
                    />
                  </View>
                )}
              </View>

              <ResultNarrativeCard
                accentColor={screenPalette.sectionAccentColor}
                body={fatDistributionViewModel.disclaimerText}
                eyebrow={t('common.results.attention')}
              />

              <View style={styles.actionStack}>
                <ResultActionRail
                  accentColor={screenPalette.sectionAccentColor}
                  onPrimaryPress={handleClose}
                  primaryLabel={t('common.home_back')}
                  primaryTestID="super-scan-back-button"
                />
              </View>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (
  colors: any,
  insets: any,
  isDark: boolean,
  layout: ReturnType<typeof getResultLayoutState>,
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backgroundLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    resultHeader: {
      backgroundColor: 'transparent',
      borderBottomColor: 'transparent',
      borderBottomWidth: 0,
    },
    scrollContent: {
      paddingHorizontal: SPACING.page,
      paddingTop: 0,
      paddingBottom: SPACING.xxxl + insets.bottom,
    },
    errorScrollContent: {
      flexGrow: 1,
    },
    resultTopChrome: {
      marginHorizontal: -SPACING.page,
      paddingTop: insets.top,
      paddingBottom: SPACING.sm,
      backgroundColor: 'transparent',
    },
    content: {
      gap: layout.contentGap,
    },
    heroBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    sectionStack: {
      gap: layout.sectionGap,
    },
    actionStack: {
      gap: layout.sectionGap,
    },
    sectionTitle: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      includeFontPadding: false,
    },
    findingList: {
      gap: SPACING.sm,
    },
    primaryFindingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderWidth: 1,
    },
    primaryFindingCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    primaryFindingTitle: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    primaryFindingMeta: {
      fontSize: SIZES.xs,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    primaryFindingScoreChip: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: 9999,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: SPACING.sm,
      flexShrink: 0,
    },
    primaryFindingScore: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    primaryFindingPremiumLabel: {
      fontSize: SIZES.xs,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
      letterSpacing: 0.35,
    },
    emptyStateIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },
    emptyStateTitle: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    emptyStateBody: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    testMarker: {
      position: 'absolute',
      width: 0,
      height: 0,
      opacity: 0,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: layout.sectionGap,
    },
    metricGridItem: {
      flexBasis: layout.useSingleColumnResultCards ? '100%' : '47%',
      flexGrow: 1,
      minWidth: 0,
    },
    priorityZonesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    priorityZoneChip: {
      borderRadius: 9999,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
    },
    priorityZoneText: {
      fontSize: SIZES.sm,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    errorCard: {
      marginHorizontal: 0,
      marginTop: SPACING.xxxl,
      borderRadius: layout.heroRadius,
      padding: layout.largeBlockPadding,
      gap: SPACING.md,
      alignItems: 'center',
      borderWidth: 1,
    },
    errorText: {
      fontSize: layout.bodyTextFontSize,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: layout.bodyTextLineHeight,
      includeFontPadding: false,
    },
    primaryButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
      textAlign: 'center',
    },
  });
