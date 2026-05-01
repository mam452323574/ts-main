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
import { AlertCircle, Share2, X } from 'lucide-react-native';
import { ModalHandle } from '@/components/ModalHandle';
import { RadialScoreGauge } from '@/components/RadialScoreGauge';
import { MetricCard } from '@/components/MetricCard';
import { ResultQuickStatCard } from '@/components/ResultQuickStatCard';
import { ResultIcon } from '@/components/ResultIcon';
import { TrajectoryPreviewCard } from '@/components/TrajectoryPreviewCard';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import {
  FONT_WEIGHTS,
  SHADOWS,
  SIZES,
  SPACING,
  withAlpha,
} from '@/constants/theme';
import { AnalysisResult } from '@/types';
import { useFeatureFlags, usePremiumPotential } from '@/hooks/queries';
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
  getResultSurfaceChrome,
} from '@/utils/resultLayout';
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
    () => createStyles(colors, insets, isDark, layout),
    [colors, insets, isDark, layout],
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

  useEffect(() => {
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
    ]).start();
  }, [fadeAnim, slideAnim]);

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
    premiumRenderState,
    premiumPotential?.currentScan?.analyzed_at,
    premiumPotential?.currentScan?.created_at,
    premiumPotential?.historicalAverage30d,
    premiumPotential?.recentScoreHistory,
    t,
  ]);

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

  if (!analysisData || !viewModel) {
    return (
      <View style={styles.container}>
        <ModalHandle />
          <View style={styles.header}>
            <View style={styles.headerSidePlaceholder} />
          <Text {...RESULT_TEXT_PROPS} numberOfLines={1} style={styles.headerTitle}>
            {t('common.results.title')}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
            <X color={colors.primaryText} size={20} />
          </TouchableOpacity>
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
            style={[styles.errorButton, { backgroundColor: colors.primary }]}
            onPress={handleClose}
          >
            <Text
              {...RESULT_TEXT_PROPS}
              style={[styles.errorButtonText, { color: colors.white }]}
            >
              {t('common.home_back')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanTypeTheme = resolveScanTypeTheme(viewModel.scanType, colors, isDark);
  const accentColor = scanTypeTheme.accentColor;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {alertElement}
      <ModalHandle />

      <View style={styles.header}>
        <View style={styles.headerSidePlaceholder} />
        <Text
          {...RESULT_TEXT_PROPS}
          numberOfLines={1}
          style={[styles.headerTitle, { color: colors.primaryText }]}
        >
          {t('common.results.title')}
        </Text>
        <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
          <X color={colors.primaryText} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View
            style={[
              styles.typeCard,
              getResultSurfaceChrome({
                colors,
                isDark,
                kind: 'feature',
                accentColor,
              }),
            ]}
          >
            <View
              style={[
                styles.typeIconContainer,
                { backgroundColor: accentColor },
              ]}
            >
              <ResultIcon
                color={scanTypeTheme.iconColor}
                size={layout.typeIconGlyphSize}
                token={viewModel.scanType}
              />
            </View>

            <View style={styles.typeTextContainer}>
              <Text
                {...RESULT_TEXT_PROPS}
                style={[styles.typeTitle, { color: colors.primaryText }]}
              >
                {viewModel.typeLabel}
              </Text>
            </View>
          </View>

          <View style={styles.detailsSection}>
            <Text
              {...RESULT_TEXT_PROPS}
              style={[styles.sectionTitle, { color: colors.primaryText }]}
            >
              {t('common.results.details_title')}
            </Text>

            <RadialScoreGauge
              score={viewModel.score}
              label={viewModel.scoreLabel}
              color={accentColor}
            />

            <View style={styles.gridContainer}>
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
                    theme={itemTheme}
                    value={item.value}
                    valueMaxLines={item.valueMaxLines}
                    valueVariant={item.valueVariant}
                  />
                );
              })}
            </View>

            {viewModel.macros ? (
              <ProportionsCard
                colors={colors}
                isDark={isDark}
                macros={viewModel.macros}
                layout={layout}
              />
            ) : null}

            {viewModel.metrics.map((item) => {
              const itemTheme = resolveResultItemTheme({
                colors,
                isDark,
                theme: item.theme,
              });

              return (
                <MetricCard
                  key={item.id}
                  icon={<ResultIcon color={itemTheme.iconColor} token={item.icon} />}
                  theme={itemTheme}
                  title={item.title}
                  value={item.value}
                  valueMaxLines={item.valueMaxLines}
                  valueVariant={item.valueVariant}
                />
              );
            })}

            {trajectoryViewModel?.shouldRender ? (
              <TrajectoryPreviewCard
              model={trajectoryViewModel}
              onPress={
                  trajectoryViewModel.premiumRenderState === 'locked'
                    ? handleTrajectoryPress
                    : undefined
                }
              />
            ) : null}

            {viewModel.premiumMetrics.map((item) => {
              const itemTheme = resolveResultItemTheme({
                colors,
                isDark,
                theme: item.theme,
              });

              return (
                <MetricCard
                  key={item.id}
                  icon={<ResultIcon color={itemTheme.iconColor} token={item.icon} />}
                  theme={itemTheme}
                  title={item.title}
                  value={item.value}
                  valueMaxLines={item.valueMaxLines}
                  valueVariant={item.valueVariant}
                  premiumRenderState={item.premiumRenderState}
                  onPremiumPress={handlePremiumPress}
                />
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.shareButton,
              {
                borderColor: accentColor,
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.04)'
                  : colors.cardBackground,
              },
            ]}
            disabled={isPreparingCommunityShare}
            onPress={handleSharePress}
            testID="scan-result-share-button"
          >
            <Share2 color={accentColor} size={18} />
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
              numberOfLines={2}
              style={[styles.shareButtonText, { color: colors.primaryText }]}
            >
              {t('share_story.actions.share_score')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.backButton,
              { backgroundColor: colors.primary },
              SHADOWS.button,
            ]}
            onPress={handleClose}
          >
            <Text
              {...RESULT_TEXT_PROPS}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
              numberOfLines={2}
              style={[styles.backButtonText, { color: colors.white }]}
            >
              {t('common.home_back')}
            </Text>
          </TouchableOpacity>
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
}: {
  macros: ReturnType<typeof buildScanResultViewModel>['macros'];
  colors: any;
  isDark: boolean;
  layout: ReturnType<typeof getResultLayoutState>;
}) {
  if (!macros) {
    return null;
  }

  const styles = useMemo(() => createProportionsStyles(layout), [layout]);

  return (
    <View
      style={[
        styles.card,
        getResultSurfaceChrome({
          colors,
          isDark,
          kind: 'standard',
        }),
      ]}
    >
      <Text {...RESULT_TEXT_PROPS} style={[styles.title, { color: colors.gray }]}>
        {macros.title}
      </Text>
      <View style={styles.row}>
        {macros.items.map((item) => {
          const itemTheme = resolveResultItemTheme({
            colors,
            isDark,
            theme: item.theme,
          });

          return (
            <View
              key={item.id}
              testID={`scan-result-macro-item-${item.id}`}
              style={[
                styles.item,
                layout.isCompact ? styles.itemStacked : styles.itemThreeUp,
                layout.isCompact ? styles.itemFull : null,
                {
                  backgroundColor: itemTheme.cardBackgroundColor,
                  borderColor: itemTheme.cardBorderColor,
                },
              ]}
            >
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
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createProportionsStyles = (
  layout: ReturnType<typeof getResultLayoutState>,
) =>
  StyleSheet.create({
    card: {
      borderRadius: layout.standardRadius,
      borderWidth: 1,
      padding: layout.cardPadding,
      marginBottom: SPACING.sm,
    },
    title: {
      fontSize: SIZES.sm,
      lineHeight: layout.isCompact ? 17 : 18,
      marginBottom: layout.sectionGap,
      includeFontPadding: false,
    },
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
      minWidth: layout.isCompact ? 0 : 104,
    },
    itemTwoUp: {
      minWidth: 136,
    },
    itemStacked: {
      minWidth: 0,
    },
    itemHalf: {
      flexBasis: '48%',
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
      includeFontPadding: false,
    },
    value: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      includeFontPadding: false,
    },
  });

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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.page,
      paddingTop: insets.top + SPACING.sm,
      paddingBottom: SPACING.md,
      minHeight: layout.headerMinHeight,
    },
    headerSidePlaceholder: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
    },
    iconButton: {
      width: layout.headerSlotSize,
      height: layout.headerSlotSize,
      borderRadius: layout.headerSlotSize / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? withAlpha(colors.white, 0.06)
        : withAlpha(colors.primaryText, 0.04),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.08),
    },
    headerTitle: {
      fontSize: layout.headerTitleFontSize,
      lineHeight: layout.headerTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      flex: 1,
      textAlign: 'center',
      paddingHorizontal: SPACING.md,
      includeFontPadding: false,
    },
    scrollContent: {
      padding: SPACING.page,
      paddingBottom: SPACING.xxxl + insets.bottom,
    },
    content: {
      gap: layout.contentGap,
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
      color: colors.gray,
      textAlign: 'center',
      lineHeight: layout.emphasizedBodyLineHeight,
      includeFontPadding: false,
    },
    errorButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: layout.ctaRadius,
      marginTop: SPACING.md,
      minHeight: layout.ctaMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorButtonText: {
      color: colors.white,
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    typeCard: {
      borderRadius: layout.featureRadius,
      padding: layout.blockPadding,
      flexDirection: 'row',
      alignItems: layout.isCompact ? 'flex-start' : 'center',
      gap: layout.sectionGap,
      borderWidth: 1,
      borderColor: isDark
        ? withAlpha(colors.white, 0.08)
        : withAlpha(colors.primaryText, 0.06),
    },
    typeIconContainer: {
      width: layout.typeIconSize,
      height: layout.typeIconSize,
      borderRadius: layout.standardRadius,
      justifyContent: 'center',
      alignItems: 'center',
    },
    typeTextContainer: {
      flex: 1,
      minWidth: 0,
      gap: SPACING.xs,
    },
    typeTitle: {
      fontSize: layout.heroTitleFontSize,
      lineHeight: layout.heroTitleLineHeight,
      fontWeight: FONT_WEIGHTS.bold,
      flexShrink: 1,
      includeFontPadding: false,
    },
    detailsSection: {
      gap: layout.sectionGap,
    },
    sectionTitle: {
      fontSize: layout.sectionTitleFontSize,
      lineHeight: layout.sectionTitleLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      marginBottom: SPACING.xs,
      includeFontPadding: false,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: layout.sectionGap,
    },
    shareButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      borderWidth: 1,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    shareButtonText: {
      flexShrink: 1,
      minWidth: 0,
      textAlign: 'center',
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      includeFontPadding: false,
    },
    backButton: {
      minHeight: layout.ctaMinHeight,
      borderRadius: layout.ctaRadius,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.md,
    },
    backButtonText: {
      fontSize: layout.bodyTextFontSize,
      lineHeight: layout.bodyTextLineHeight,
      fontWeight: FONT_WEIGHTS.semiBold,
      textAlign: 'center',
      includeFontPadding: false,
    },
  });
