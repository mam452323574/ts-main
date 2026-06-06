import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Sun, Moon, Crown, ChevronRight, AlertTriangle, CloudOff, HelpCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../contexts/AuthContext';
import { useNotificationContext } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useStartupDiagnostics } from '../contexts/StartupDiagnosticsContext';
import { useGamification } from '../contexts/GamificationContext';

import { useDashboard } from '../hooks/queries/useDashboard';
import { useAllScanEligibility } from '../hooks/queries/useScanEligibility';
import { useFeatureFlags } from '../hooks/queries/useFeatureFlags';
import { useGrowthExperience } from '../hooks/queries/useGrowthExperience';

import { ScanType } from '../types';
import { AppScreen } from '../components/AppScreen';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
// DailyStat removed
import { FoxEvolutionHero } from '../components/FoxEvolutionHero';
import { AnalyticsHomeCard } from '../components/home/AnalyticsHomeCard';
import { ChefHomeCard } from '../components/home/ChefHomeCard';

import { ScanLimitIndicator } from '../components/ScanLimitIndicator';
import { SuperScanIndicator } from '../components/SuperScanIndicator';
import { SettingsCog } from '../components/SettingsCog';
import { NotificationBell } from '../components/NotificationBell';
import {
  getGamificationStageProgress,
  resolveGamification,
} from '../constants/gamification';
import { SCAN_TYPE_LABELS } from '../constants/scan';
import {
  FONT_FAMILIES,
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONT_WEIGHTS,
  getCtaColors,
  getAndroidLightSurface,
  getMainPageChrome,
  getObsidianSurface,
  getVisualMoodSurface,
  withAlpha,
} from '../constants/theme';
import {
  buildPremiumHealthPalette,
  type PremiumHealthPalette,
} from '../constants/premiumHealth';
import { shouldPresentEntryOffer } from '../services/growthExperience';
import { entryOfferSession } from '../utils/entryOfferSession';
import { getMainTabBarMetrics } from '../utils/mainTabBarMetrics';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '../utils/scanQuotaState';
import { hasPremiumAccess } from '../utils/subscription';
import { logOperationalError } from '../utils/observability';
import { Squircle } from '@/components/Squircle';

const STANDARD_SCAN_TYPES: ScanType[] = ['health', 'body', 'nutrition'];
const EMPTY_LOADING_BY_SCAN_TYPE = {
  body: false,
  health: false,
  nutrition: false,
  super: false,
};
const HOME_HORIZONTAL_PADDING = 12;

function parseTimestampMs(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveRemainingQuotaCount(quotaState: ReturnType<typeof resolveScanQuotaState>) {
  if (!hasScanQuotaPayload(quotaState)) {
    return 0;
  }

  const eligibility = quotaState.eligibility;
  const limit = Math.max(eligibility.limit ?? 1, 1);
  return Math.max(
    0,
    eligibility.remaining ??
      eligibility.available ??
      (limit - (eligibility.current_count ?? 0)),
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const insets = useSafeAreaInsets();
  const tabBarMetrics = getMainTabBarMetrics(insets.bottom);
  const { scanCount: localScanCount, setScanCount: setLocalScanCount } =
    useGamification();
  const hasAutoPresentedEntryOffer = useRef(false);
  const completedRechargeRefetchKeysRef = useRef<Set<string>>(new Set());
  const sectionAnimationValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const hasAnimatedSectionsRef = useRef(false);
  const premiumHealth = useMemo(
    () => buildPremiumHealthPalette(colors, isDark),
    [colors, isDark],
  );
  const mainChrome = useMemo(
    () => getMainPageChrome(colors, isDark, 'trust'),
    [colors, isDark],
  );

  const premiumBannerColors = useMemo(
    () => premiumHealth.premiumGradient,
    [premiumHealth],
  );
  const premiumCtaForeground = useMemo(
    () => getCtaColors(colors, isDark).premiumForeground,
    [colors, isDark],
  );
  const premiumBannerHighlights = useMemo(
    () => [t('tabs.coach'), t('scan_types.super'), t('tabs.analytics')],
    [t],
  );

  const { checkForAchievements, scheduleScanReadyNotification } =
    useNotificationContext();

  // React Query hooks
  const {
    data,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useDashboard();

  const {
    data: scanEligibility,
    errors: scanEligibilityErrors = {},
    loadingByScanType = EMPTY_LOADING_BY_SCAN_TYPE,
    isAuthReady = true,
    canQuery: canQueryEligibility = true,
    refetchAll: refetchEligibility,
    refetchScanType: refetchScanEligibilityType = async () => null,
    isFetched: isScanEligibilityFetched,
    isFetching: isScanEligibilityFetching,
    isStale: isScanEligibilityStale,
  } = useAllScanEligibility();
  const { data: featureFlags } = useFeatureFlags();
  const { data: growthExperience } = useGrowthExperience();

  const isLoading = dashboardLoading;
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const accountTier = userProfile?.account_tier ?? null;
  const isPremium = hasPremiumAccess(accountTier);
  const styles = useMemo(
    () =>
      createStyles(
        colors,
        isDark,
        tabBarMetrics.scrollPaddingBottom,
        premiumHealth,
      ),
    [colors, isDark, premiumHealth, tabBarMetrics.scrollPaddingBottom],
  );
  const remoteScanCount = data?.gamification.scanCount ?? 0;
  const effectiveScanCount = Math.max(remoteScanCount, localScanCount);
  const effectiveGamification = useMemo(
    () => resolveGamification(effectiveScanCount),
    [effectiveScanCount],
  );
  const hasAnyEligibilityData = Object.keys(scanEligibility ?? {}).length > 0;
  const gamificationProgress = useMemo(
    () => getGamificationStageProgress(effectiveScanCount),
    [effectiveScanCount],
  );
  const scanQuotaStates = useMemo(
    () => ({
      health: resolveScanQuotaState({
        scanType: 'health',
        accountTier,
        eligibility: scanEligibility?.health,
        error: scanEligibilityErrors.health,
        loading: loadingByScanType.health,
        isAuthReady,
        canQuery: canQueryEligibility,
      }),
      body: resolveScanQuotaState({
        scanType: 'body',
        accountTier,
        eligibility: scanEligibility?.body,
        error: scanEligibilityErrors.body,
        loading: loadingByScanType.body,
        isAuthReady,
        canQuery: canQueryEligibility,
      }),
      nutrition: resolveScanQuotaState({
        scanType: 'nutrition',
        accountTier,
        eligibility: scanEligibility?.nutrition,
        error: scanEligibilityErrors.nutrition,
        loading: loadingByScanType.nutrition,
        isAuthReady,
        canQuery: canQueryEligibility,
      }),
      super: resolveScanQuotaState({
        scanType: 'super',
        accountTier,
        eligibility: scanEligibility?.super,
        error: scanEligibilityErrors.super,
        loading: loadingByScanType.super,
        isAuthReady,
        canQuery: canQueryEligibility,
      }),
    }),
    [
      accountTier,
      canQueryEligibility,
      isAuthReady,
      loadingByScanType,
      scanEligibility,
      scanEligibilityErrors,
    ],
  );
  const availableStandardScanCount = useMemo(
    () =>
      STANDARD_SCAN_TYPES.reduce(
        (total, scanType) => total + resolveRemainingQuotaCount(scanQuotaStates[scanType]),
        0,
      ),
    [scanQuotaStates],
  );
  const availableSuperScanCount = useMemo(
    () => resolveRemainingQuotaCount(scanQuotaStates.super),
    [scanQuotaStates.super],
  );
  const totalAvailableScans = availableStandardScanCount + availableSuperScanCount;
  const scanRailAnimatedStyle = useMemo(
    () => createSectionAnimatedStyle(sectionAnimationValues[2]),
    [sectionAnimationValues],
  );
  const journeyAnimatedStyle = useMemo(
    () => createSectionAnimatedStyle(sectionAnimationValues[0]),
    [sectionAnimationValues],
  );
  const modulesAnimatedStyle = useMemo(
    () => createSectionAnimatedStyle(sectionAnimationValues[1]),
    [sectionAnimationValues],
  );

  // Refetch eligibility when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (
        isAuthReady &&
        canQueryEligibility &&
        !isScanEligibilityFetching &&
        (!isScanEligibilityFetched || isScanEligibilityStale)
      ) {
        void refetchEligibility();
      }
    }, [
      canQueryEligibility,
      isAuthReady,
      isScanEligibilityFetched,
      isScanEligibilityFetching,
      isScanEligibilityStale,
      refetchEligibility,
    ]),
  );

  const handleQuotaTimerComplete = useCallback((scanType: ScanType, nextRechargeAt: number) => {
    const refetchKey = `${scanType}:${nextRechargeAt}`;
    if (completedRechargeRefetchKeysRef.current.has(refetchKey)) {
      return;
    }

    completedRechargeRefetchKeysRef.current.add(refetchKey);
    if (canQueryEligibility) {
      void refetchScanEligibilityType(scanType);
    }
  }, [canQueryEligibility, refetchScanEligibilityType]);

  useFocusEffect(
    useCallback(() => {
      if (
        userProfile?.has_seen_tutorial &&
        !hasAutoPresentedEntryOffer.current &&
        entryOfferSession.canAutoPresent(userProfile?.id) &&
        shouldPresentEntryOffer({
          featureFlags,
          growthExperience,
          userProfile,
        })
      ) {
        hasAutoPresentedEntryOffer.current = true;
        entryOfferSession.markAutoPresentationStarted(userProfile.id);
        router.push('/entry-offer' as any);
      }
    }, [featureFlags, growthExperience, router, userProfile]),
  );

  // Program the local notifications when fetch brings new data
  useEffect(() => {
    if (scanEligibility) {
      Object.entries(scanEligibility).forEach(([scanType, eligibility]) => {
        const nextRechargeAt = parseTimestampMs(
          eligibility?.next_recharge_at ??
          eligibility?.nextRechargeAt ??
          eligibility?.next_available_date,
        );

        if (nextRechargeAt) {
          scheduleScanReadyNotification(
            scanType as ScanType,
            nextRechargeAt,
          ).catch((err) => {
            logOperationalError('home.scan_notif.error', err, {
              scan_type: scanType,
            });
          });
        }
      });
    }
  }, [scanEligibility, scheduleScanReadyNotification]);

  useEffect(() => {
    checkForAchievements().catch((err) => {
      logOperationalError('home.achievements.error', err);
    });
  }, [checkForAchievements]);

  useEffect(() => {
    if (remoteScanCount > localScanCount) {
      void setLocalScanCount(remoteScanCount);
    }
  }, [localScanCount, remoteScanCount, setLocalScanCount]);

  useEffect(() => {
    if (isLoading || dashboardError || !data || hasAnimatedSectionsRef.current) {
      return;
    }

    hasAnimatedSectionsRef.current = true;
    Animated.stagger(
      80,
      sectionAnimationValues.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [data, dashboardError, isLoading, sectionAnimationValues]);

  const hasLoggedStartupRef = useRef(false);

  useEffect(() => {
    if (isLoading || dashboardError || !data) {
      return;
    }
    if (hasLoggedStartupRef.current) {
      return;
    }
    hasLoggedStartupRef.current = true;

    markStartup('home-rendered', {
      hasEligibility: hasAnyEligibilityData,
    });
    settleStartup('home-rendered');
  }, [
    data,
    dashboardError,
    hasAnyEligibilityData,
    isLoading,
    markStartup,
    settleStartup,
  ]);

  const onRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    await Promise.all([refetchDashboard(), refetchEligibility()]);
    setIsManualRefresh(false);
  }, [refetchDashboard, refetchEligibility]);

  const renderSuperScanSlot = () => {
    if (!isPremium) {
      return (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.84}
          onPress={() => router.push('/premium-upgrade')}
          style={styles.superScanPromoShell}
          testID="home-super-scan-upsell-card"
        >
          <Squircle
            style={styles.superScanPromoSurface}
            testID="home-super-scan-upsell-surface"
          >
            <LinearGradient
              colors={premiumBannerColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.superScanPromoGradient}
            >
              <View style={styles.superScanPromoHeader}>
                <View style={styles.superScanPromoBadge}>
                  <Crown color={colors.white} size={14} fill={colors.white} />
                  <Text style={styles.superScanPromoBadgeText}>
                    {t('components.feature_list.premium')}
                  </Text>
                </View>
                <Text style={styles.superScanPromoTitle}>
                  {t('components.super_scan.title')}
                </Text>
                <Text style={styles.superScanPromoSubtitle}>
                  {t('components.super_scan.subtitle_locked')}
                </Text>
              </View>

              <View style={styles.superScanPromoFooter}>
                <View style={styles.superScanPromoBenefits}>
                  {premiumBannerHighlights.map((label) => (
                    <View key={label} style={styles.superScanPromoBenefitChip}>
                      <Text style={styles.superScanPromoBenefitChipText}>
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.superScanPromoCta} testID="home-super-scan-upsell-cta">
                  <Text style={styles.superScanPromoCtaText}>
                    {t('scan_limit.upgrade')}
                  </Text>
                  <ChevronRight
                    color={premiumCtaForeground}
                    size={18}
                    strokeWidth={2.7}
                    testID="home-super-scan-upsell-cta-icon"
                  />
                </View>
              </View>
            </LinearGradient>
          </Squircle>
        </TouchableOpacity>
      );
    }

    if (hasScanQuotaPayload(scanQuotaStates.super)) {
      return (
        <SuperScanIndicator
          isPremium={isPremium}
          eligibility={scanQuotaStates.super.eligibility}
          onLockedPress={() => router.push('/premium-upgrade')}
        />
      );
    }

    if (scanQuotaStates.super.status === 'locked') {
      return (
        <SuperScanIndicator
          isPremium={false}
          onLockedPress={() => router.push('/premium-upgrade')}
        />
      );
    }

    return (
      <Squircle style={styles.superQuotaStateCard} testID="super-scan-state-card">
        <Text style={styles.superQuotaStateTitle}>
          {t(SCAN_TYPE_LABELS.super)}
        </Text>
        <Text style={styles.superQuotaStateText}>
          {t(
            getScanQuotaStatusLabelKey(scanQuotaStates.super) ??
              'scan_limit.missing_payload',
          )}
        </Text>
      </Squircle>
    );
  };

  const renderScrollHeader = () => (
    <View
      style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}
      testID="home-scroll-header"
    >
      <View style={styles.headerLeft}>
        <Text
          style={styles.username}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {userProfile?.username || t('common.unknown_user')}
        </Text>
      </View>
      <View style={styles.headerRight}>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
          {isDark ? (
            <Moon color={colors.primary} size={24} />
          ) : (
            <Sun color={colors.gold} size={24} />
          )}
        </TouchableOpacity>
        <NotificationBell />
        <SettingsCog />
      </View>
    </View>
  );

  const renderScrollableHeader = () => {
    if (!data) return null;

    return (
      <>
        {renderScrollHeader()}

        <Animated.View
          style={[styles.companionSection, journeyAnimatedStyle]}
          testID="home-journey-section"
        >
          <Squircle style={styles.companionCardShell}>
            <Squircle style={styles.companionCardSurface}>
              <FoxEvolutionHero
                gamification={effectiveGamification}
                progress={gamificationProgress}
              />
            </Squircle>
          </Squircle>
        </Animated.View>

        <Animated.View
          style={[styles.secondaryModulesSection, modulesAnimatedStyle]}
          testID="home-secondary-modules-section"
        >
          <ChefHomeCard onPress={() => router.push('/scan-frigo' as any)} />

          <AnalyticsHomeCard
            scanCount={effectiveScanCount}
            onPress={() => router.push('/analytics')}
          />
        </Animated.View>

        <Animated.View
          style={[styles.scanLimitsSection, scanRailAnimatedStyle]}
          testID="home-scan-rail-section"
        >
          <Squircle style={styles.scanRailShell} testID="home-scan-rail">
            <Squircle style={styles.scanSectionHeaderCard}>
              <View style={styles.scanSectionHeaderCopy}>
                <Text style={styles.scanSectionEyebrow}>{t('home.items_available')}</Text>
              </View>
              <Squircle style={styles.scanSectionAvailabilityPill}>
                <Text style={styles.scanSectionAvailabilityValue}>
                  {totalAvailableScans}
                </Text>
              </Squircle>
            </Squircle>

            <View style={styles.scanCardsGrid} testID="home-scan-cards-grid">
              {STANDARD_SCAN_TYPES.map((scanType) => {
                const quotaState = scanQuotaStates[scanType];
                const quotaStateLabelKey = getScanQuotaStatusLabelKey(quotaState);

                return (
                  <Squircle
                    key={scanType}
                    style={styles.scanLimitCardShell}
                    testID="scan-limit-card-shell"
                  >
                    <Squircle
                      style={styles.scanLimitCardSurface}
                      testID="scan-limit-card-surface"
                    >
                      <Text
                        style={styles.scanLimitLabel}
                        numberOfLines={2}
                        testID="scan-limit-label"
                      >
                        {t(SCAN_TYPE_LABELS[scanType])}
                      </Text>
                      {hasScanQuotaPayload(quotaState) ? (
                        <ScanLimitIndicator
                          eligibility={quotaState.eligibility}
                          isPremium={isPremium}
                          onLimitReachedPress={
                            !isPremium
                              ? () => router.push('/premium-upgrade')
                              : undefined
                          }
                          onTimerComplete={
                            quotaState.nextRechargeAt
                              ? () =>
                                  handleQuotaTimerComplete(
                                    scanType,
                                    quotaState.nextRechargeAt!,
                                  )
                              : undefined
                          }
                        />
                      ) : (
                        <View
                          style={[
                            styles.quotaStateContainer,
                            quotaState.status === 'query-error' && styles.quotaStateContainerError,
                            quotaState.status === 'backend-unavailable' &&
                              styles.quotaStateContainerWarning,
                          ]}
                          testID={`scan-limit-state-${quotaState.status}`}
                        >
                          {quotaState.status === 'query-error' ? (
                            <AlertTriangle color={colors.error} size={12} strokeWidth={2} />
                          ) : quotaState.status === 'backend-unavailable' ? (
                            <CloudOff color={colors.warning} size={12} strokeWidth={2} />
                          ) : quotaState.status === 'missing-payload' ? (
                            <HelpCircle color={colors.gray} size={12} strokeWidth={2} />
                          ) : null}
                          <Text
                            style={[
                              styles.quotaStateText,
                              quotaState.status === 'query-error' && styles.quotaStateTextError,
                              quotaState.status === 'backend-unavailable' &&
                                styles.quotaStateTextWarning,
                            ]}
                            numberOfLines={2}
                          >
                            {t(quotaStateLabelKey ?? 'scan_limit.missing_payload')}
                          </Text>
                        </View>
                      )}
                    </Squircle>
                  </Squircle>
                );
              })}
            </View>

            <View style={styles.superScanContainer} testID="home-super-scan-container">
              {renderSuperScanSlot()}
            </View>
          </Squircle>
        </Animated.View>
      </>
    );
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (dashboardError) {
    logOperationalError('home.dashboard.error', dashboardError);
    return <ErrorMessage message={t('home.error.generic')} />;
  }

  if (!data) {
    return <ErrorMessage message={t('common.results.no_data')} />;
  }

  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        refreshControl={
          <RefreshControl refreshing={isManualRefresh} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {renderScrollableHeader()}
      </ScrollView>
    </AppScreen>
  );
}

function createSectionAnimatedStyle(animatedValue: Animated.Value) {
  return {
    opacity: animatedValue,
    transform: [
      {
        translateY: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };
}

const createStyles = (
  colors: any,
  isDark: boolean,
  scrollBottomPadding: number,
  premiumHealth: PremiumHealthPalette,
) => {
  const isLight = !isDark;
  const chrome = getMainPageChrome(colors, isDark, 'trust');
  const premiumCtaForeground = getCtaColors(colors, isDark).premiumForeground;
  const companionSurface = getVisualMoodSurface(colors, isDark, {
    mood: 'obsidian',
    accentColor: chrome.accentColor,
    intensity: 'card',
  });
  const scanCardSurface = isLight
    ? getAndroidLightSurface(colors, {
        accentColor: colors.primary,
        backgroundAlpha: 0.025,
        borderAlpha: 0.08,
        overlayAlpha: 0.04,
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffsetY: 4,
        elevation: 2,
      })
    : null;
  const premiumBannerSurface = isLight
    ? getAndroidLightSurface(colors, {
        accentColor: premiumHealth.premiumAccent,
        shadowColor: premiumHealth.premiumAccent,
        backgroundAlpha: 0.12,
        borderAlpha: 0.2,
        overlayAlpha: 0.18,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffsetY: 8,
        elevation: 4,
      })
    : null;
  const obsidianScanSurface = getObsidianSurface(colors, {
    accentColor: chrome.accentColor,
    intensity: 'raised',
    backgroundAlpha: 0.035,
    borderAlpha: 0.13,
    shadowOpacity: 0.12,
  });
  const obsidianPremiumSurface = getObsidianSurface(colors, {
    accentColor: premiumHealth.premiumAccent,
    intensity: 'premium',
    backgroundAlpha: 0.06,
    borderAlpha: 0.28,
    shadowOpacity: 0.18,
  });
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: chrome.canvas,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      paddingBottom: scrollBottomPadding,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: 'transparent',
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
    },
    headerLeft: {
      flexDirection: 'column',
      gap: SPACING.xs,
    },
    username: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      fontFamily: FONT_FAMILIES.display,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    themeToggle: {
      padding: SPACING.sm,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: chrome.chip.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.chip.borderColor, borderCurve: 'continuous',
    },
    scanLimitsSection: {
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
      paddingTop: SPACING.lg,
    },
    scanRailShell: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.md,
      gap: SPACING.md,
      borderRadius: BORDER_RADIUS.hero,
      backgroundColor: chrome.elevatedSurface.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.elevatedSurface.borderColor,
      ...obsidianScanSurface.shadowStyle, borderCurve: 'continuous',
    },
    scanSectionHeaderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: chrome.mutedSurface.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.mutedSurface.borderColor, borderCurve: 'continuous',
    },
    scanSectionHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    scanSectionEyebrow: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      fontFamily: FONT_FAMILIES.display,
    },
    scanSectionAvailabilityPill: {
      minWidth: 54,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.chipActive.backgroundColor,
      borderWidth: 1,
      borderColor: chrome.chipActive.borderColor, borderCurve: 'continuous',
    },
    scanSectionAvailabilityValue: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      fontFamily: FONT_FAMILIES.accent,
    },
    scanCardsGrid: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'stretch',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    scanLimitCardShell: {
      flex: 1,
      minWidth: 0,
      borderRadius: BORDER_RADIUS.xl,
      ...(isLight ? scanCardSurface?.shadowStyle : obsidianScanSurface.shadowStyle), borderCurve: 'continuous',
    },
    scanLimitCardSurface: {
      minWidth: 0,
      flex: 1,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: 6,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      backgroundColor: isLight
        ? scanCardSurface?.backgroundColor
        : obsidianScanSurface.backgroundColor,
      borderWidth: 1,
      borderColor: isLight
        ? scanCardSurface?.borderColor
        : obsidianScanSurface.borderColor,
      overflow: 'hidden', borderCurve: 'continuous',
    },
    scanLimitLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      textAlign: 'center',
      alignSelf: 'stretch',
      marginBottom: SPACING.sm,
      minWidth: 0,
      fontFamily: FONT_FAMILIES.display,
    },
    superScanContainer: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      marginTop: SPACING.xs,
    },
    productsSectionHeader: {
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.sm,
    },
    productItemContainer: {
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
    },
    sectionTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      marginBottom: SPACING.md,
    },
    quotaStateContainer: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: SPACING.sm,
      width: '100%',
      minWidth: 0,
    },
    // Couleurs douces (alpha bas) pour distinguer les états sans crier
    // dans une UI déjà chargée. Le but : que l'utilisateur perçoive
    // "ça ne va pas / patience" sans confondre avec un cooldown normal.
    quotaStateContainerError: {
      // pas de background — on signale via l'icône + couleur du texte
    },
    quotaStateContainerWarning: {
      // idem
    },
    quotaStateText: {
      fontSize: SIZES.text12,
      lineHeight: 14,
      color: colors.gray,
      textAlign: 'center',
    },
    quotaStateTextError: {
      color: colors.error,
    },
    quotaStateTextWarning: {
      color: colors.warning,
    },
    superQuotaStateCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.lg,
      backgroundColor: isLight
        ? scanCardSurface?.backgroundColor
        : obsidianScanSurface.backgroundColor,
      borderWidth: 1,
      borderColor: isLight
        ? scanCardSurface?.borderColor
        : obsidianScanSurface.borderColor,
      alignItems: 'center',
      gap: SPACING.xs,
      ...(isLight ? scanCardSurface?.shadowStyle : obsidianScanSurface.shadowStyle), borderCurve: 'continuous',
    },
    superQuotaStateTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      textAlign: 'center',
    },
    superQuotaStateText: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.medium,
      color: colors.gray,
      textAlign: 'center',
    },
    superScanPromoShell: {
      borderRadius: BORDER_RADIUS.xl,
      ...(isLight
        ? premiumBannerSurface?.shadowStyle
        : obsidianPremiumSurface.shadowStyle), borderCurve: 'continuous',
    },
    superScanPromoSurface: {
      borderRadius: BORDER_RADIUS.xl,
      overflow: 'hidden',
      backgroundColor: isLight
        ? premiumBannerSurface?.backgroundColor
        : obsidianPremiumSurface.backgroundColor,
      borderWidth: 1,
      borderColor: isLight
        ? premiumBannerSurface?.borderColor
        : obsidianPremiumSurface.borderColor, borderCurve: 'continuous',
    },
    superScanPromoGradient: {
      padding: SPACING.lg,
      gap: SPACING.lg,
    },
    superScanPromoHeader: {
      gap: SPACING.sm,
    },
    superScanPromoBadge: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.08 : 0.06,
      ),
      borderWidth: 1,
      borderColor: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.12 : 0.12,
      ), borderCurve: 'continuous',
    },
    superScanPromoBadgeText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? colors.white : colors.primaryText,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      fontFamily: FONT_FAMILIES.accent,
    },
    superScanPromoTitle: {
      fontSize: SIZES.text18,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? colors.white : colors.primaryText,
      fontFamily: FONT_FAMILIES.display,
    },
    superScanPromoSubtitle: {
      fontSize: SIZES.text12,
      lineHeight: 18,
      color: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.85 : 0.72,
      ),
    },
    superScanPromoFooter: {
      gap: SPACING.md,
    },
    superScanPromoBenefits: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
    },
    superScanPromoBenefitChip: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.08 : 0.06,
      ),
      borderWidth: 1,
      borderColor: withAlpha(
        isDark ? colors.white : colors.primaryText,
        isDark ? 0.12 : 0.12,
      ), borderCurve: 'continuous',
    },
    superScanPromoBenefitChipText: {
      fontSize: SIZES.text10,
      fontWeight: FONT_WEIGHTS.bold,
      color: isDark ? colors.white : colors.primaryText,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      fontFamily: FONT_FAMILIES.accent,
    },
    superScanPromoCta: {
      minHeight: 48,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.button,
      backgroundColor: withAlpha(colors.white, 0.96), borderCurve: 'continuous',
    },
    superScanPromoCtaText: {
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.bold,
      color: premiumCtaForeground,
      fontFamily: FONT_FAMILIES.display,
    },
    companionSection: {
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
      paddingTop: SPACING.xl,
      gap: SPACING.sm,
    },
    secondaryModulesSection: {
      paddingHorizontal: HOME_HORIZONTAL_PADDING,
      paddingTop: SPACING.xl,
      gap: SPACING.lg,
    },
    companionCardShell: {
      borderRadius: BORDER_RADIUS.hero,
      ...companionSurface, borderCurve: 'continuous',
    },
    companionCardSurface: {
      borderRadius: BORDER_RADIUS.hero,
      borderWidth: 1,
      borderColor: companionSurface.borderColor,
      backgroundColor: companionSurface.backgroundColor,
      overflow: 'hidden', borderCurve: 'continuous',
    },
  });
};
