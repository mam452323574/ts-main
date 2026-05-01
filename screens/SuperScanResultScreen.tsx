import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, CheckCircle, Share2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SuperScanFeatureIcon } from '@/components/FeatureIcons';
import { SuperScanAreaCard } from '@/components/SuperScanAreaCard';
import { TrajectoryPreviewCard } from '@/components/TrajectoryPreviewCard';
import { UrgencyModal } from '@/components/UrgencyModal';
import { ConditionCard } from '@/components/ConditionCard';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { useFeatureFlags, usePremiumPotential } from '@/hooks/queries';
import { FatDistributionScanResult, SuperScanResult } from '@/types';
import { FONT_WEIGHTS, SIZES, SPACING } from '@/constants/theme';
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
} from '@/utils/resultViewModels';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
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
import { resolvePremiumRenderStateFromProfile } from '@/utils/subscription';

type SuperScreenAnalysisData = SuperScanResult | FatDistributionScanResult;

const parseAnalysisData = (
  value: string | string[] | undefined
): SuperScreenAnalysisData | null => {
  const parsed = safeParseJsonRouteParam(value);
  if (parsed === null) return null;

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

  const styles = useMemo(() => createStyles(colors, isDark, insets, layout), [colors, insets, isDark, layout]);

  const premiumRenderState = resolvePremiumRenderStateFromProfile(
    userProfile,
    authLoading,
  );
  const analysisData = useMemo(() => parseAnalysisData(params.analysisData), [params.analysisData]);
  const legacyAnalysisData = analysisData?.scan_type === 'super_health_v2'
    ? (analysisData as SuperScanResult)
    : null;
  const fatDistributionAnalysisData = analysisData?.scan_type === 'fat_distribution_scan_v2'
    ? (analysisData as FatDistributionScanResult)
    : null;
  const scanId = parseRouteParam(params.scanId);
  const imageUri =
    typeof params.imageUri === 'string'
      ? params.imageUri
      : Array.isArray(params.imageUri)
        ? params.imageUri[0]
        : undefined;
  const { data: premiumPotential } = usePremiumPotential(
    'super',
    scanId ?? null,
    !!legacyAnalysisData,
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
    });
  }, [fatDistributionAnalysisData, locale, t]);

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
    premiumRenderState,
    premiumPotential?.currentScan?.analyzed_at,
    premiumPotential?.currentScan?.created_at,
    premiumPotential?.historicalAverage30d,
    premiumPotential?.recentScoreHistory,
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
    fatDistributionAnalysisData?.global_body_fat_estimate_percent,
    fatDistributionAnalysisData?.global_facial_fat_estimate_percent,
    fatDistributionAnalysisData?.global_water_retention_estimate_percent,
    isDark,
    legacyAnalysisData?.global_risk_score,
    legacyAnalysisData?.urgency_flag,
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
    [
      fatDistributionAnalysisData?.global_body_fat_estimate_percent,
      fatDistributionAnalysisData?.global_facial_fat_estimate_percent,
      fatDistributionAnalysisData?.global_water_retention_estimate_percent,
    ],
  );
  const fatPrimaryMetricThemes = useMemo(() => {
    if (!fatDistributionViewModel) {
      return {};
    }

    return fatDistributionViewModel.primaryMetrics.reduce<
      Record<string, ReturnType<typeof resolveResultItemTheme>>
    >((accumulator, metric) => {
      accumulator[metric.id] = resolveResultItemTheme({
        colors,
        isDark,
        theme: resolveFatDistributionPrimaryMetricThemeSpec({
          metricId: metric.id,
          highlightedMetricId: dominantFatMetricId,
        }),
      });

      return accumulator;
    }, {});
  }, [colors, dominantFatMetricId, fatDistributionViewModel, isDark]);
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
  const sectionSurfaceStyle = useMemo(
    () => ({
      backgroundColor: screenPalette.sectionBackgroundColor,
      borderColor: screenPalette.sectionBorderColor,
    }),
    [screenPalette.sectionBackgroundColor, screenPalette.sectionBorderColor],
  );

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

  const handleTrajectoryPress = () => {
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
      <View style={styles.container}>
        <LinearGradient
          colors={screenPalette.backgroundGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          testID="super-scan-background-layer"
          style={styles.backgroundLayer}
        />
        <View style={styles.header}>
          <View style={styles.headerSidePlaceholder} />
          <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.headerTitle}>
            {t('scan.super.type_label')}
          </Text>
          <View style={styles.headerSidePlaceholder} />
        </View>

        <View style={styles.errorCard} testID="super-scan-empty-state">
          <View style={styles.errorIconContainer}>
            <AlertCircle color={colors.error} size={34} />
          </View>
          <Text {...RESULT_TEXT_PROPS} style={styles.errorText}>
            {t('common.results.no_data')}
          </Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleClose}>
            <Text {...RESULT_TEXT_PROPS} style={styles.primaryButtonText}>
              {t('common.home_back')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {alertElement}
      <LinearGradient
        colors={screenPalette.backgroundGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        testID="super-scan-background-layer"
        style={styles.backgroundLayer}
      />

      <UrgencyModal
        visible={!!legacyAnalysisData && showUrgencyModal}
        onDismiss={handleUrgencyDismiss}
      />

      <View style={styles.header}>
        <View style={styles.headerSidePlaceholder} />
        <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.headerTitle}>
          {t('scan.super.type_label')}
        </Text>
        <View style={styles.headerSidePlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              <LinearGradient
                colors={screenPalette.heroGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.scoreCard,
                  {
                    borderColor: screenPalette.heroBorderColor,
                  },
                ]}
                testID="super-scan-score-card"
              >
                <View style={styles.heroTopRow}>
                  <View
                    style={[
                      styles.metricBadge,
                      {
                        backgroundColor: screenPalette.heroBadgeBackgroundColor,
                        borderColor: screenPalette.heroBadgeBorderColor,
                      },
                    ]}
                  >
                    <Text
                      {...RESULT_TEXT_PROPS}
                      numberOfLines={2}
                      style={[
                        styles.metricBadgeText,
                        { color: screenPalette.heroBadgeTextColor },
                      ]}
                    >
                      {t('scan.super.score_label')}
                    </Text>
                  </View>
                  {legacyAnalysisData.urgency_flag ? (
                    <View
                      style={[
                        styles.urgencyBadge,
                        {
                          backgroundColor: screenPalette.heroBadgeBackgroundColor,
                          borderColor: screenPalette.accentColorSecondary,
                        },
                      ]}
                    >
                      <Text
                        {...RESULT_TEXT_PROPS}
                        testID="super-scan-urgency-badge-text"
                        numberOfLines={1}
                        style={[
                          styles.urgencyBadgeText,
                          { color: screenPalette.heroBadgeTextColor },
                        ]}
                      >
                        {t('components.urgency.title')}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.scoreMainRow}>
                  <View
                    style={[
                      styles.scoreIconContainer,
                      {
                        backgroundColor: screenPalette.heroIconBackgroundColor,
                        borderColor: screenPalette.heroIconBorderColor,
                      },
                    ]}
                  >
                    <SuperScanFeatureIcon
                      color={screenPalette.heroIconColor}
                      size={30}
                    />
                  </View>

                  <View style={styles.scoreTextContainer}>
                    <View style={styles.scoreValueRow}>
                      <Text
                        {...RESULT_TEXT_PROPS}
                        testID="super-scan-score-value"
                        numberOfLines={1}
                        style={[
                          styles.scoreValue,
                          { color: screenPalette.scoreColor },
                        ]}
                      >
                        {legacyViewModel.globalRiskScore}
                      </Text>
                      <Text {...RESULT_TEXT_PROPS} testID="super-scan-score-suffix" numberOfLines={1} style={styles.scoreSuffix}>
                        /100
                      </Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>

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

              <View
                style={[
                  styles.summaryCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-summary-card"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.summaryLabel}>
                  {t('scan.super.summary_label')}
                </Text>
                <Text {...RESULT_TEXT_PROPS} style={styles.summaryText}>
                  {legacyViewModel.analysisSummary}
                </Text>
              </View>

              <View
                style={[
                  styles.conditionsWrapper,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-conditions"
              >
                <View style={styles.conditionsHeader}>
                  <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.sectionTitle}>
                    {t('scan.super.conditions_label')}
                  </Text>
                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: screenPalette.countBadgeBackgroundColor,
                      },
                    ]}
                  >
                    <Text
                      {...RESULT_TEXT_PROPS}
                      numberOfLines={1}
                      style={[
                        styles.countBadgeText,
                        { color: screenPalette.countBadgeTextColor },
                      ]}
                    >
                      {legacyViewModel.conditions.length}
                    </Text>
                  </View>
                </View>

                {legacyViewModel.conditions.length === 0 ? (
                  <View style={styles.rasCard} testID="super-scan-ras">
                    <View style={styles.rasIconContainer}>
                      <CheckCircle color={colors.success} size={48} strokeWidth={2} />
                    </View>
                    <Text {...RESULT_TEXT_PROPS} style={styles.rasTitle}>
                      {t('scan.super.ras_title')}
                    </Text>
                    <Text {...RESULT_TEXT_PROPS} style={styles.rasSubtitle}>
                      {t('scan.super.ras_subtitle')}
                    </Text>
                    <Text {...RESULT_TEXT_PROPS} style={styles.rasDescription}>
                      {t('scan.super.ras_description')}
                    </Text>
                  </View>
                ) : (
                  // ConditionCard remains scoped to legacy super_health_v2 findings.
                  legacyViewModel.conditions.map((condition, index) => (
                    <ConditionCard
                      key={`${condition.condition_key}-${index}`}
                      condition={condition}
                      premiumRenderState={premiumRenderState}
                    />
                  ))
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.shareButton,
                  {
                    borderColor: screenPalette.shareBorderColor,
                    backgroundColor: screenPalette.shareBackgroundColor,
                  },
                ]}
                disabled={isPreparingCommunityShare}
                onPress={handleSharePress}
                testID="super-scan-share-button"
              >
                <Share2 color={screenPalette.shareIconColor} size={18} />
                <Text
                  {...RESULT_TEXT_PROPS}
                  adjustsFontSizeToFit
                  minimumFontScale={0.84}
                  numberOfLines={2}
                  style={[
                    styles.shareButtonText,
                    { color: screenPalette.shareTextColor },
                  ]}
                >
                  {t('share_story.actions.share_report')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, styles.primaryButtonLarge, { backgroundColor: colors.primary }]}
                onPress={handleClose}
                testID="super-scan-back-button"
              >
                <Text
                  {...RESULT_TEXT_PROPS}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                  numberOfLines={2}
                  style={styles.primaryButtonText}
                >
                  {t('common.home_back')}
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.disclaimerCard,
                  {
                    backgroundColor: screenPalette.disclaimerBackgroundColor,
                    borderColor: screenPalette.disclaimerBorderColor,
                  },
                ]}
              >
                <Text
                  {...RESULT_TEXT_PROPS}
                  style={[
                    styles.disclaimer,
                    { color: screenPalette.disclaimerTextColor },
                  ]}
                >
                  {legacyViewModel.disclaimerText}
                </Text>
              </View>
            </>
          ) : fatDistributionViewModel ? (
            <>
              <View
                style={[
                  styles.summaryCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-fat-summary-card"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.summaryLabel}>
                  {t('scan.super.summary_label')}
                </Text>
                <Text
                  {...RESULT_TEXT_PROPS}
                  style={styles.summaryText}
                  testID="super-scan-fat-summary"
                >
                  {fatDistributionViewModel.analysisSummary}
                </Text>
              </View>

              <View
                style={[
                  styles.fatSectionCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-fat-main-metrics"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.main_metrics_title')}
                </Text>

                <View style={styles.fatMetricGrid}>
                  {fatDistributionViewModel.primaryMetrics.map((metric) => {
                    const metricTheme = fatPrimaryMetricThemes[metric.id];

                    return (
                    <View
                      key={metric.id}
                      style={[
                        styles.fatMetricCard,
                        metricTheme
                          ? {
                              backgroundColor: metricTheme.cardBackgroundColor,
                              borderColor: metricTheme.cardBorderColor,
                            }
                          : null,
                      ]}
                      testID={`super-scan-fat-metric-${metric.id}`}
                    >
                      <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.fatMetricLabel}>
                        {metric.label}
                      </Text>
                      <Text
                        {...RESULT_TEXT_PROPS}
                        numberOfLines={1}
                        style={[
                          styles.fatMetricValue,
                          metricTheme
                            ? {
                                color: metricTheme.valueColor,
                              }
                            : null,
                        ]}
                      >
                        {metric.value}
                      </Text>
                    </View>
                    );
                  })}
                </View>
              </View>

              <View
                style={[
                  styles.fatSectionCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-fat-pattern"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.dominant_storage_pattern')}
                </Text>
                <Text {...RESULT_TEXT_PROPS} style={styles.summaryText}>
                  {fatDistributionViewModel.dominantStoragePattern}
                </Text>
              </View>

              <View
                style={[
                  styles.fatSectionCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-fat-priority-zones"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.priority_zones')}
                </Text>

                {fatDistributionViewModel.priorityZones.length > 0 ? (
                  <View style={styles.priorityZonesWrap}>
                    {fatDistributionViewModel.priorityZones.map((zone, index) => {
                      const zoneTheme = priorityZoneThemes[index] ?? screenPalette;

                      return (
                       <View
                         key={`${zone}-${index}`}
                         style={[
                           styles.priorityZoneChip,
                           {
                             backgroundColor: zoneTheme.chipBackgroundColor,
                             borderColor: zoneTheme.chipBorderColor,
                           },
                         ]}
                         testID={`super-scan-fat-priority-zone-${index}`}
                       >
                         <Text
                           {...RESULT_TEXT_PROPS}
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
                    style={[
                      styles.emptySectionText,
                      { color: screenPalette.subtleTextColor },
                    ]}
                    testID="super-scan-fat-priority-zones-empty"
                  >
                    {t('scan.super.fat_distribution.no_priority_zones')}
                  </Text>
                )}
              </View>

              <View
                style={[
                  styles.fatSectionCard,
                  getResultSurfaceChrome({
                    colors,
                    isDark,
                    kind: 'feature',
                    accentColor: screenPalette.sectionAccentColor,
                    surfaceVariant: screenPalette.sectionSurfaceVariant,
                  }),
                  sectionSurfaceStyle,
                ]}
                testID="super-scan-fat-areas"
              >
                <Text {...RESULT_TEXT_PROPS} numberOfLines={2} style={styles.sectionTitle}>
                  {t('scan.super.fat_distribution.areas_title')}
                </Text>

                <View style={styles.areaList}>
                  {fatDistributionViewModel.areas.length > 0 ? (
                    fatDistributionViewModel.areas.map((area, index) => (
                      <SuperScanAreaCard
                        key={area.id}
                        area={area}
                        labels={fatDistributionAreaLabels}
                        testID={`super-scan-area-card-${index}`}
                        theme={fatAreaThemes[index]}
                      />
                    ))
                  ) : (
                    <View
                      style={[
                        styles.emptyBlock,
                        {
                          backgroundColor: screenPalette.subtleBackgroundColor,
                          borderColor: screenPalette.subtleBorderColor,
                        },
                      ]}
                      testID="super-scan-fat-areas-empty"
                    >
                      <Text
                        {...RESULT_TEXT_PROPS}
                        style={[
                          styles.emptySectionText,
                          { color: screenPalette.subtleTextColor },
                        ]}
                      >
                        {t('scan.super.fat_distribution.no_areas')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, styles.primaryButtonLarge, { backgroundColor: colors.primary }]}
                onPress={handleClose}
                testID="super-scan-back-button"
              >
                <Text
                  {...RESULT_TEXT_PROPS}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                  numberOfLines={2}
                  style={styles.primaryButtonText}
                >
                  {t('common.home_back')}
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.disclaimerCard,
                  {
                    backgroundColor: screenPalette.disclaimerBackgroundColor,
                    borderColor: screenPalette.disclaimerBorderColor,
                  },
                ]}
              >
                <Text
                  {...RESULT_TEXT_PROPS}
                  style={[
                    styles.disclaimer,
                    { color: screenPalette.disclaimerTextColor },
                  ]}
                >
                  {fatDistributionViewModel.disclaimerText}
                </Text>
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
  isDark: boolean,
  insets: any,
  layout: ReturnType<typeof getResultLayoutState>
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backgroundLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.page,
      paddingTop: insets.top + SPACING.sm,
      paddingBottom: SPACING.md,
      minHeight: layout.headerMinHeight,
    },
    headerSidePlaceholder: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      paddingHorizontal: SPACING.md,
      fontSize: layout.headerTitleFontSize,
      lineHeight: layout.headerTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      includeFontPadding: false,
    },
    scrollContent: {
      padding: SPACING.page,
      paddingBottom: SPACING.xxxl + insets.bottom,
    },
    content: {
      gap: layout.contentGap,
    },
    errorCard: {
      marginHorizontal: SPACING.page,
      marginTop: SPACING.xxxl,
      borderRadius: layout.heroRadius,
      padding: layout.largeBlockPadding,
      gap: SPACING.sm,
      alignItems: 'center',
      ...getResultSurfaceChrome({
        colors,
        isDark,
        kind: 'hero',
        accentColor: colors.error,
      }),
    },
    errorIconContainer: {
      width: 66,
      height: 66,
      borderRadius: 33,
      backgroundColor: isDark ? 'rgba(255,69,58,0.16)' : '#FEECEC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: SPACING.xs,
    },
    errorText: {
      fontSize: layout.bodyTextFontSize,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: layout.bodyTextLineHeight,
      includeFontPadding: false,
    },
    scoreCard: {
      borderRadius: layout.heroRadius,
      padding: layout.largeBlockPadding,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3E8C8',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 24,
      elevation: 8,
    },
    heroTopRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      marginBottom: layout.blockPadding,
    },
    metricBadge: {
      flex: 1,
      minWidth: 0,
      borderRadius: 9999,
      borderWidth: 1,
      paddingHorizontal: SPACING.md,
      paddingVertical: layout.isCompact ? SPACING.xs + 1 : SPACING.xs + 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F7F9FF',
    },
    metricBadgeText: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.heroBadgeLineHeight,
      color: colors.gray,
      textTransform: 'uppercase',
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: layout.isCompact ? 0.45 : 0.6,
      textAlign: 'center',
      includeFontPadding: false,
    },
    urgencyBadge: {
      borderRadius: 9999,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm + 2,
      paddingVertical: layout.isCompact ? SPACING.xs : SPACING.xs + 1,
      backgroundColor: isDark ? 'rgba(255,69,58,0.2)' : '#FEECEC',
      alignSelf: 'flex-start',
    },
    urgencyBadgeText: {
      fontSize: layout.heroBadgeFontSize,
      lineHeight: layout.isCompact ? 13 : 14,
      fontWeight: FONT_WEIGHTS.semiBold,
      textTransform: 'uppercase',
      letterSpacing: layout.isCompact ? 0.35 : 0.5,
      includeFontPadding: false,
    },
    scoreMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    scoreIconContainer: {
      width: layout.isCompact ? 58 : 64,
      height: layout.isCompact ? 58 : 64,
      borderRadius: layout.isCompact ? 29 : 32,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5ECD5',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.15 : 0.07,
      shadowRadius: 12,
      elevation: 4,
    },
    scoreTextContainer: {
      marginLeft: layout.sectionGap,
      flex: 1,
      minWidth: 0,
    },
    scoreValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      minWidth: 0,
    },
    scoreValue: {
      fontSize: layout.heroScoreValueFontSize,
      lineHeight: layout.heroScoreValueLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      letterSpacing: -1.2,
      includeFontPadding: false,
    },
    scoreSuffix: {
      fontSize: layout.heroScoreSuffixFontSize,
      lineHeight: layout.heroScoreSuffixLineHeight,
      color: colors.gray,
      fontWeight: FONT_WEIGHTS.medium,
      marginLeft: 4,
      includeFontPadding: false,
    },
    summaryCard: {
      minHeight: layout.summaryMinHeight,
      borderRadius: layout.featureRadius,
      padding: layout.largeBlockPadding,
      borderWidth: 1,
    },
    summaryLabel: {
      fontSize: SIZES.sm,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.gray,
      marginBottom: SPACING.sm,
      textTransform: 'uppercase',
      letterSpacing: layout.isCompact ? 0.55 : 0.8,
      includeFontPadding: false,
    },
    summaryText: {
      fontSize: layout.bodyTextFontSize,
      color: colors.primaryText,
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    fatSectionCard: {
      gap: layout.sectionGap,
      borderRadius: layout.featureRadius,
      padding: layout.blockPadding,
      borderWidth: 1,
    },
    fatMetricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    fatMetricCard: {
      flexGrow: 1,
      flexBasis: layout.isCompact ? '47%' : '48%',
      minWidth: layout.isCompact ? 132 : 148,
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8F9FD',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#ECEFF7',
      gap: 4,
    },
    fatMetricLabel: {
      fontSize: SIZES.xs,
      lineHeight: 14,
      color: colors.gray,
      fontWeight: FONT_WEIGHTS.medium,
      includeFontPadding: false,
    },
    fatMetricValue: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4F6FA',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E9ECF5',
    },
    priorityZoneText: {
      fontSize: SIZES.sm,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.primaryText,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    areaList: {
      gap: layout.sectionGap,
    },
    emptyBlock: {
      borderRadius: layout.standardRadius,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8F9FD',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#ECEFF7',
    },
    emptySectionText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      color: colors.gray,
      includeFontPadding: false,
    },
    conditionsWrapper: {
      gap: layout.sectionGap,
      borderRadius: layout.featureRadius,
      padding: layout.blockPadding,
      borderWidth: 1,
    },
    conditionsHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    sectionTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      includeFontPadding: false,
    },
    countBadge: {
      borderRadius: 9999,
      minWidth: 34,
      height: 28,
      paddingHorizontal: SPACING.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : '#F4F6FA',
    },
    countBadgeText: {
      fontSize: SIZES.sm,
      color: colors.gray,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    rasCard: {
      backgroundColor: isDark ? 'rgba(48,209,88,0.1)' : '#ECFBF0',
      borderRadius: layout.featureRadius,
      padding: layout.largeBlockPadding,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(48,209,88,0.32)' : '#CDEFD8',
    },
    rasIconContainer: {
      marginBottom: SPACING.sm,
    },
    rasTitle: {
      fontSize: layout.heroTitleFontSize,
      lineHeight: layout.heroTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.success,
      marginBottom: SPACING.xs,
      textAlign: 'center',
      includeFontPadding: false,
    },
    rasSubtitle: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.success,
      marginBottom: SPACING.sm,
      textAlign: 'center',
      includeFontPadding: false,
    },
    rasDescription: {
      fontSize: layout.bodyTextFontSize,
      color: colors.primaryText,
      textAlign: 'center',
      lineHeight: layout.bodyTextLineHeight,
      includeFontPadding: false,
    },
    primaryButton: {
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.md + 1,
      borderRadius: layout.ctaRadius,
      minHeight: layout.ctaMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.28 : 0.12,
      shadowRadius: 16,
      elevation: 5,
    },
    shareButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    shareButtonText: {
      flexShrink: 1,
      minWidth: 0,
      color: colors.primaryText,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      includeFontPadding: false,
    },
    primaryButtonLarge: {
      marginTop: SPACING.md,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      letterSpacing: 0.1,
      includeFontPadding: false,
    },
    disclaimerCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F7F8FC',
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#ECEEF6',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
    },
    disclaimer: {
      fontSize: SIZES.xs,
      color: colors.gray,
      textAlign: 'center',
      lineHeight: layout.isCompact ? 17 : 18,
      includeFontPadding: false,
    },
  });
