import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ModalHandle } from '@/components/ModalHandle';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RadialScoreGauge } from '@/components/RadialScoreGauge';
import { MetricCard } from '@/components/MetricCard';
import { ResultQuickStatCard } from '@/components/ResultQuickStatCard';
import { ResultIcon } from '@/components/ResultIcon';
import { TrajectoryPreviewCard } from '@/components/TrajectoryPreviewCard';
import { ResultActionRail } from '@/components/results/ResultActionRail';
import { ScanCoachCtaCard } from '@/components/results/ScanCoachCtaCard';
import { ResultHeroSurface } from '@/components/results/ResultHeroSurface';
import { ResultNarrativeCard } from '@/components/results/ResultNarrativeCard';
import { NutritionLongTextCard } from '@/components/results/NutritionLongTextCard';
import { ResultPillBadge } from '@/components/results/ResultPillBadge';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  FONT_WEIGHTS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { AnalysisResult } from '@/types';
import { useFeatureFlags } from '@/hooks/queries/useFeatureFlags';
import { usePremiumPotential } from '@/hooks/queries/usePremiumPotential';
import { resolveFaceGlowScore } from '@/utils/faceGlow';
import {
  isSuperAnalysisType,
  tryNormalizeAnalysisResult,
} from '@/utils/analysisNormalization';
import { safeParseJsonRouteParam } from '@/utils/deepLinkSchemas';
import { openResultShareFlow } from '@/utils/resultShareFlow';
import { resolvePremiumRenderStateFromProfile } from '@/utils/subscription';
import {
  buildResultTrajectoryViewModel,
  buildScanResultViewModel,
} from '@/utils/resultViewModels';
import {
  RESULT_TEXT_PROPS,
  getResultLayoutState,
  getResultScreenGradient,
} from '@/utils/resultLayout';
import {
  buildCoachGenerationInputFromScanCoachIntent,
  encodeScanCoachIntentParam,
  scanCoachIntent,
} from '@/utils/scanCoachIntent';
import {
  resolveResultItemTheme,
  resolveScanTypeTheme,
} from '@/utils/resultVisualTheme';

const parseAnalysisData = (
  value: string | string[] | undefined,
): AnalysisResult | null => {
  const parsed = safeParseJsonRouteParam(value);
  if (parsed === null) {
    return null;
  }

  const normalized = tryNormalizeAnalysisResult(parsed);
  return normalized && !isSuperAnalysisType(normalized.scan_type)
    ? (normalized as AnalysisResult)
    : null;
};

const parseRouteParam = (value: string | string[] | undefined) =>
  typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value[0]
      : undefined;

export default function ScanResultScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const { userProfile, loading: authLoading } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const { alertElement, showAlert } = useCustomAlert();
  const { width } = useWindowDimensions();
  const layout = useMemo(() => getResultLayoutState(width), [width]);
  const premiumRenderState = resolvePremiumRenderStateFromProfile(
    userProfile,
    authLoading,
  );
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets, layout),
    [colors, insets, layout],
  );

  const params = useLocalSearchParams();
  const analysisData = useMemo(
    () => parseAnalysisData(params.analysisData),
    [params.analysisData],
  );
  const imageUri = parseRouteParam(params.imageUri);
  const scanId = parseRouteParam(params.scanId);
  const [isPreparingCommunityShare, setIsPreparingCommunityShare] = useState(false);
  const premiumPotentialScanType = useMemo(() => {
    if (!analysisData) {
      return 'health' as const;
    }

    switch (analysisData.scan_type) {
      case 'face':
        return 'health' as const;
      case 'body':
        return 'body' as const;
      case 'nutrition':
      default:
        return 'nutrition' as const;
    }
  }, [analysisData]);
  const { data: premiumPotential } = usePremiumPotential(
    premiumPotentialScanType,
    scanId ?? null,
    !!analysisData,
  );
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sectionAnimations = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    sectionAnimations.forEach((value) => value.setValue(0));

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.stagger(
        55,
        sectionAnimations.map((value) =>
          Animated.timing(value, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, [fadeAnim, sectionAnimations, slideAnim]);

  const getSectionAnimationStyle = (index: number) => ({
    opacity: Animated.multiply(fadeAnim, sectionAnimations[index]),
    transform: [
      {
        translateY: sectionAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  });

  const viewModel = useMemo(() => {
    if (!analysisData) {
      return null;
    }

    return buildScanResultViewModel({
      analysisData,
      t,
      locale,
      premiumRenderState,
      resolveFaceGlowScore,
    });
  }, [analysisData, locale, premiumRenderState, t]);
  const trajectoryViewModel = useMemo(() => {
    if (!analysisData) {
      return null;
    }

    return buildResultTrajectoryViewModel({
      analysisData,
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
    analysisData,
    locale,
    premiumPotential?.currentScan?.analyzed_at,
    premiumPotential?.currentScan?.created_at,
    premiumPotential?.historicalAverage30d,
    premiumPotential?.recentScoreHistory,
    premiumRenderState,
    t,
  ]);
  const coachIntent = useMemo(
    () =>
      analysisData
        ? scanCoachIntent(analysisData, {
            locale,
            scanId,
            scanType: analysisData.scan_type,
          })
        : null,
    [analysisData, locale, scanId],
  );
  const coachScanType = useMemo(() => {
    if (!analysisData) {
      return null;
    }

    return analysisData.scan_type === 'face'
      ? 'health'
      : analysisData.scan_type;
  }, [analysisData]);

  const handleClose = () => {
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handlePremiumPress = () => {
    router.push('/premium-upgrade');
  };

  const handleTrajectoryPress = () => {
    router.push('/premium-upgrade');
  };

  const handleSharePress = () => {
    if (!analysisData) {
      return;
    }

    openResultShareFlow({
      analysisData,
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
        ...(coachScanType ? { scanType: coachScanType } : {}),
        promptType: coachGenerationInput.promptType,
        fallbackPromptType: coachIntent.fallback_prompt_type,
        questionKey: coachGenerationInput.questionKey ?? '',
        questionText: coachGenerationInput.questionText,
        priorityMetric: coachIntent.priority_metric ?? '',
        scanIntent: encodeScanCoachIntentParam(coachIntent),
      },
    } as any);
  };

  const fallbackBackgroundGradient = getResultScreenGradient({
    colors,
    isDark,
  });

  if (!analysisData || !viewModel) {
    return (
      <View
        style={[styles.container, { backgroundColor: fallbackBackgroundGradient[0] }]}
        testID="scan-result-screen"
      >
        <LinearGradient
          colors={fallbackBackgroundGradient}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.backgroundLayer}
          testID="scan-result-background-layer"
        />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.errorScrollContent]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.resultTopChrome} testID="scan-result-top-chrome">
            <ModalHandle />
            <ScreenHeader
              title={t('common.results.title')}
              onClose={handleClose}
              centered
              variant="inline"
              borderless
              topInset={false}
              closeTestID="scan-result-close-button"
              style={styles.resultHeader}
              testID="scan-result-screen-header"
            />
          </View>

          <View style={styles.errorContainer}>
            <AlertCircle color={colors.error} size={48} />
            <Text
              {...RESULT_TEXT_PROPS}
              style={[styles.errorText, { color: colors.gray }]}
            >
              {t('common.results.no_data')}
            </Text>
            <TouchableOpacity
              style={[styles.errorButton, { backgroundColor: colors.primaryText }]}
              onPress={handleClose}
            >
              <Text
                {...RESULT_TEXT_PROPS}
                style={[styles.errorButtonText, { color: colors.background }]}
              >
                {t('common.home_back')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  const scanTypeTheme = resolveScanTypeTheme(viewModel.scanType, colors, isDark);
  const accentColor = scanTypeTheme.accentColor;
  const backgroundGradient = getResultScreenGradient({
    colors,
    isDark,
    accentColor,
  });

  return (
    <View
      style={[styles.container, { backgroundColor: backgroundGradient[0] }]}
      testID="scan-result-screen"
    >
      <LinearGradient
        colors={backgroundGradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.backgroundLayer}
        testID="scan-result-background-layer"
      />
      {alertElement}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.resultTopChrome} testID="scan-result-top-chrome">
          <ModalHandle />
          <ScreenHeader
            title={t('common.results.title')}
            onClose={handleClose}
            centered
            variant="inline"
            borderless
            topInset={false}
            closeTestID="scan-result-close-button"
            style={styles.resultHeader}
            testID="scan-result-screen-header"
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
          <Animated.View style={getSectionAnimationStyle(0)}>
            <ResultHeroSurface
              accentColor={accentColor}
              title={viewModel.scoreLabel}
              backgroundMediaUri={imageUri ?? null}
              headerContent={(
                <View style={styles.heroBadgeRow}>
                  <ResultPillBadge
                    accentColor={accentColor}
                    backgroundColor={scanTypeTheme.chipBackground}
                    borderColor={scanTypeTheme.chipBorder}
                    icon={(
                      <ResultIcon
                        color={scanTypeTheme.iconColor}
                        size={layout.isCompact ? 14 : 15}
                        token={viewModel.scanType}
                      />
                    )}
                    label={viewModel.typeLabel}
                    textColor={scanTypeTheme.chipText}
                    variant="accent"
                  />
                  <ResultPillBadge
                    backgroundColor={scanTypeTheme.neutralChipBackground}
                    borderColor={scanTypeTheme.neutralChipBorder}
                    label={t('common.results.ai_report')}
                    textColor={scanTypeTheme.neutralChipText}
                    variant="neutral"
                  />
                  {viewModel.analysisQualityLabel ? (
                    <ResultPillBadge
                      accentColor={accentColor}
                      backgroundColor={scanTypeTheme.chipBackground}
                      borderColor={scanTypeTheme.chipBorder}
                      label={viewModel.analysisQualityLabel}
                      textColor={scanTypeTheme.chipText}
                    />
                  ) : null}
                </View>
              )}
              footerContent={(
                <View style={styles.heroQuickStatsGrid}>
                  {viewModel.quickStats.map((item) => {
                    const itemTheme = resolveResultItemTheme({
                      colors,
                      isDark,
                      theme: item.theme,
                    });

                    return (
                      <ResultQuickStatCard
                        key={item.id}
                        fullWidth={item.span === 'full'}
                        icon={<ResultIcon color={itemTheme.iconColor} token={item.icon} />}
                        label={item.label}
                        labelMaxLines={item.labelMaxLines}
                        theme={itemTheme}
                        value={item.value}
                        valueMaxLines={item.valueMaxLines}
                        valueVariant={item.valueVariant}
                      />
                    );
                  })}
                </View>
              )}
              visual={(
                <RadialScoreGauge
                  score={viewModel.score}
                  label={viewModel.scoreLabel}
                  color={accentColor}
                />
              )}
            />
          </Animated.View>

          {coachIntent ? (
            <Animated.View style={getSectionAnimationStyle(1)}>
              <ScanCoachCtaCard
                accentColor={accentColor}
                intent={coachIntent}
                onPress={handleCoachPress}
                testID="scan-result-coach-cta"
                variant="hero"
              />
            </Animated.View>
          ) : null}

          {trajectoryViewModel?.shouldRender ? (
            <Animated.View style={getSectionAnimationStyle(2)}>
              <TrajectoryPreviewCard
                model={trajectoryViewModel}
                onPress={
                  trajectoryViewModel.premiumRenderState === 'locked'
                    ? handleTrajectoryPress
                    : undefined
                }
              />
            </Animated.View>
          ) : null}

          <Animated.View style={getSectionAnimationStyle(3)}>
            <View style={styles.sectionStack}>
              <Text
                {...RESULT_TEXT_PROPS}
                style={[styles.sectionTitle, { color: colors.primaryText }]}
              >
                {t('common.results.details_title')}
              </Text>

              {viewModel.macros ? (
                <ProportionsCard
                  colors={colors}
                  isDark={isDark}
                  layout={layout}
                  macros={viewModel.macros}
                  onPremiumPress={handlePremiumPress}
                />
              ) : null}

              <View style={styles.metricGrid}>
                {viewModel.metrics.map((item) => {
                  const itemTheme = resolveResultItemTheme({
                    colors,
                    isDark,
                    theme: item.theme,
                  });

                  return (
                    <View
                      key={item.id}
                      style={styles.metricGridItem}
                      testID={`scan-result-metric-grid-item-${item.id}`}
                    >
                      <MetricCard
                        icon={<ResultIcon color={itemTheme.iconColor} token={item.icon} />}
                        theme={itemTheme}
                        title={item.title}
                        titleMaxLines={item.titleMaxLines}
                        value={item.value}
                        valueMaxLines={item.valueMaxLines}
                        valueVariant={item.valueVariant}
                        premiumRenderState={item.premiumRenderState}
                        onPremiumPress={handlePremiumPress}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          </Animated.View>

          <Animated.View style={getSectionAnimationStyle(4)}>
            <ResultNarrativeCard
              accentColor={accentColor}
              eyebrow={t('common.results.deep_analysis_label')}
            >
              <View style={styles.deepAnalysisStack}>
                {viewModel.premiumMetrics.length > 0 ? (
                  <View style={styles.metricGrid}>
                    {viewModel.premiumMetrics.map((item) => {
                      const itemTheme = resolveResultItemTheme({
                        colors,
                        isDark,
                        theme: item.theme,
                      });

                      return (
                        <View
                          key={item.id}
                          style={styles.metricGridItem}
                          testID={`scan-result-premium-metric-grid-item-${item.id}`}
                        >
                          <MetricCard
                            icon={<ResultIcon color={itemTheme.iconColor} token={item.icon} />}
                            theme={itemTheme}
                            title={item.title}
                            titleMaxLines={item.titleMaxLines}
                            value={item.value}
                            valueMaxLines={item.valueMaxLines}
                            valueVariant={item.valueVariant}
                            premiumRenderState={item.premiumRenderState}
                            onPremiumPress={handlePremiumPress}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {viewModel.nutritionLongSections?.map((section) => {
                  const sectionTheme = resolveResultItemTheme({
                    colors,
                    isDark,
                    theme: section.theme,
                  });

                  return (
                    <NutritionLongTextCard
                      key={section.id}
                      onPremiumPress={handlePremiumPress}
                      section={section}
                      theme={sectionTheme}
                    />
                  );
                })}
              </View>
            </ResultNarrativeCard>
          </Animated.View>

          <Animated.View style={getSectionAnimationStyle(5)}>
            <View style={styles.actionStack}>
              <ResultActionRail
                accentColor={accentColor}
                onPrimaryPress={handleClose}
                onSecondaryPress={handleSharePress}
                primaryLabel={t('common.home_back')}
                secondaryDisabled={isPreparingCommunityShare}
                secondaryLabel={t('share_story.actions.share_score')}
              />
            </View>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function ProportionsCard({
  macros,
  colors,
  isDark,
  layout,
  onPremiumPress,
}: {
  macros: ReturnType<typeof buildScanResultViewModel>['macros'];
  colors: any;
  isDark: boolean;
  layout: ReturnType<typeof getResultLayoutState>;
  onPremiumPress?: () => void;
}) {
  const { t } = useLanguage();
  const styles = useMemo(() => createProportionsStyles(layout), [layout]);

  if (!macros) {
    return null;
  }

  return (
    <ResultNarrativeCard
      accentColor={colors.warning}
      eyebrow={macros.title}
      surfaceVariant="wellnessPremium"
    >
      <View style={styles.row}>
        {macros.items.map((item) => {
          const itemTheme = resolveResultItemTheme({
            colors,
            isDark,
            theme: item.theme,
          });
          const isLocked = item.premiumRenderState === 'locked';
          const isLoading = item.premiumRenderState === 'loading';
          const itemContent = (
            <>
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: itemTheme.iconSurfaceColor,
                    borderColor: itemTheme.iconBorderColor,
                  },
                ]}
              >
                <ResultIcon
                  color={itemTheme.iconColor}
                  size={layout.isCompact ? 16 : 18}
                  testID={`scan-result-macro-icon-${item.id}`}
                  token={item.icon}
                />
              </View>
              <Text
                {...RESULT_TEXT_PROPS}
                adjustsFontSizeToFit
                ellipsizeMode="tail"
                minimumFontScale={0.82}
                numberOfLines={2}
                testID={`scan-result-macro-label-${item.id}`}
                style={[styles.label, { color: colors.gray }]}
              >
                {item.label}
              </Text>
              <Text
                {...RESULT_TEXT_PROPS}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[styles.value, { color: itemTheme.valueColor }]}
              >
                {item.value}
              </Text>
              {isLocked || isLoading ? (
                <View
                  style={[
                    styles.statusTag,
                    {
                      backgroundColor: isLoading
                        ? withAlpha(colors.primaryText, isDark ? 0.08 : 0.05)
                        : withAlpha(colors.gold, isDark ? 0.15 : 0.18),
                      borderColor: isLoading
                        ? withAlpha(colors.primaryText, isDark ? 0.12 : 0.08)
                        : withAlpha(colors.gold, isDark ? 0.25 : 0.2),
                    },
                  ]}
                >
                  {isLocked ? <Lock color={colors.gold} size={11} /> : null}
                  <Text
                    {...RESULT_TEXT_PROPS}
                    numberOfLines={1}
                    style={[
                      styles.statusText,
                      { color: isLocked ? colors.gold : colors.gray },
                    ]}
                  >
                    {isLoading
                      ? t('metric_card.loading_label')
                      : t('metric_card.premium_label')}
                  </Text>
                </View>
              ) : null}
            </>
          );
          const itemStyle = [
            styles.item,
            layout.useSingleColumnResultCards ? styles.itemStacked : styles.itemThreeUp,
            layout.useSingleColumnResultCards ? styles.itemFull : null,
            {
              backgroundColor: itemTheme.cardBackgroundColor,
              borderColor: itemTheme.cardBorderColor,
            },
          ];

          return isLocked && onPremiumPress ? (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.86}
              onPress={onPremiumPress}
              testID={`scan-result-macro-item-${item.id}`}
              style={itemStyle}
            >
              {itemContent}
            </TouchableOpacity>
          ) : (
            <View
              key={item.id}
              testID={`scan-result-macro-item-${item.id}`}
              style={itemStyle}
            >
              {itemContent}
            </View>
          );
        })}
      </View>
    </ResultNarrativeCard>
  );
}

const createProportionsStyles = (
  layout: ReturnType<typeof getResultLayoutState>,
) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    item: {
      flex: 1,
      padding: layout.cardPadding,
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      alignItems: 'center',
      gap: SPACING.xs,
    },
    iconWrap: {
      width: layout.isCompact ? 30 : 34,
      height: layout.isCompact ? 30 : 34,
      borderRadius: 9999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      flexShrink: 0,
    },
    itemThreeUp: {
      minWidth: 104,
    },
    itemStacked: {
      minWidth: 0,
    },
    itemFull: {
      flexBasis: '100%',
    },
    label: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 15 : 16,
      textAlign: 'center',
      alignSelf: 'stretch',
      flexShrink: 1,
      minWidth: 0,
      includeFontPadding: false,
    },
    value: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
    statusTag: {
      minHeight: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      borderRadius: 9999,
      borderWidth: 1,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      marginTop: SPACING.xs - 2,
      alignSelf: 'center',
      maxWidth: '100%',
    },
    statusText: {
      fontSize: SIZES.xs,
      lineHeight: layout.isCompact ? 12 : 13,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
      letterSpacing: layout.isCompact ? 0.25 : 0.35,
    },
  });

const createStyles = (
  colors: any,
  insets: any,
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
      gap: SPACING.xs - 1,
    },
    heroQuickStatsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: layout.sectionGap,
    },
    sectionStack: {
      gap: layout.sectionGap,
    },
    sectionTitle: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: layout.sectionGap,
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: layout.sectionGap,
    },
    deepAnalysisStack: {
      gap: layout.sectionGap,
    },
    actionStack: {
      gap: layout.sectionGap,
    },
    metricGridItem: {
      flexBasis: layout.useSingleColumnResultCards ? '100%' : '47%',
      flexGrow: 1,
      minWidth: 0,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
      padding: SPACING.page,
    },
    errorText: {
      fontSize: layout.bodyTextFontSize,
      textAlign: 'center',
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    errorButton: {
      backgroundColor: colors.primaryText,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: layout.ctaRadius,
      marginTop: SPACING.md,
      minHeight: layout.ctaMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorButtonText: {
      color: colors.background,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
  });
