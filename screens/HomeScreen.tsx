import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Sun, Moon, Crown, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '@/contexts/AuthContext';
import { useNotificationContext } from '@/contexts/NotificationContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useGamification } from '@/contexts/GamificationContext';

import {
  useDashboard,
  useAllScanEligibility,
  useFeatureFlags,
  useGrowthExperience,
} from '@/hooks/queries';

import { ScanType } from '@/types';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
// DailyStat removed
import { FoxEvolutionHero } from '@/components/FoxEvolutionHero';
import { AnalyticsHomeCard } from '@/components/home/AnalyticsHomeCard';
import { ChefHomeCard } from '@/components/home/ChefHomeCard';

import { ScanLimitIndicator } from '@/components/ScanLimitIndicator';
import { SuperScanIndicator } from '@/components/SuperScanIndicator';
import { SettingsCog } from '@/components/SettingsCog';
import { NotificationBell } from '@/components/NotificationBell';
import {
  getGamificationStageProgress,
  resolveGamification,
} from '@/constants/gamification';
import { SCAN_TYPE_LABELS } from '@/constants/scan';
import {
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  getAndroidLightSurface,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { shouldPresentEntryOffer } from '@/services/growthExperience';
import { entryOfferSession } from '@/utils/entryOfferSession';
import {
  getScanQuotaStatusLabelKey,
  hasScanQuotaPayload,
  resolveScanQuotaState,
} from '@/utils/scanQuotaState';
import { hasPremiumAccess } from '@/utils/subscription';
import { logOperationalError } from '@/utils/observability';

const STANDARD_SCAN_TYPES: ScanType[] = ['health', 'body', 'nutrition'];
const HOME_SCROLL_BOTTOM_PADDING = SPACING.xxxl;
const EMPTY_LOADING_BY_SCAN_TYPE = {
  body: false,
  health: false,
  nutrition: false,
  super: false,
};

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

export default function HomeScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const { markStartup, settleStartup } = useStartupDiagnostics();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isAndroidLight = Platform.OS === 'android' && !isDark;
  const availableGridWidth = Math.max(windowWidth - SPACING.page * 2, 0);
  const canFitThreeCards = (availableGridWidth - SPACING.sm * 2) / 3 >= 108;
  const scanGridColumns = canFitThreeCards ? 3 : 2;
  const scanCardWidth =
    scanGridColumns > 1
      ? (availableGridWidth - SPACING.sm * (scanGridColumns - 1)) /
        scanGridColumns
      : availableGridWidth;
  const { scanCount: localScanCount, setScanCount: setLocalScanCount } =
    useGamification();
  const hasAutoPresentedEntryOffer = useRef(false);
  const completedRechargeRefetchKeysRef = useRef<Set<string>>(new Set());

  const premiumBannerColors = useMemo(
    () =>
      isDark
        ? ([
            mixColors(colors.gold, colors.primaryText, 0.3),
            mixColors(colors.warning, colors.gold, 0.4),
          ] as const)
        : isAndroidLight
          ? ([
              mixColors(colors.gold, colors.white, 0.38),
              mixColors(colors.gold, colors.warning, 0.18),
              mixColors(colors.warning, colors.gold, 0.68),
            ] as const)
          : ([
              colors.gold,
              mixColors(colors.warning, colors.gold, 0.55),
            ] as const),
    [
      colors.gold,
      colors.primaryText,
      colors.warning,
      colors.white,
      isAndroidLight,
      isDark,
    ],
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
        scanCardWidth,
        scanGridColumns,
      ),
    [
      colors,
      isDark,
      scanCardWidth,
      scanGridColumns,
    ],
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

  // Refetch eligibility when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthReady && canQueryEligibility) {
        void refetchEligibility();
      }
    }, [canQueryEligibility, isAuthReady, refetchEligibility]),
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

  // Header avec logo et branding
  const renderFixedHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
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

  // Contenu scrollable du header
  const renderScrollableHeader = () => {
    if (!data) return null;

    return (
      <>
        <View style={styles.heroSection}>
          <View style={styles.heroContent}>
            <FoxEvolutionHero
              gamification={effectiveGamification}
              progress={gamificationProgress}
            />
          </View>
        </View>

        <ChefHomeCard onPress={() => router.push('/scan-frigo' as any)} />

        <AnalyticsHomeCard
          scanCount={effectiveScanCount}
          onPress={() => router.push('/analytics')}
        />

        <View style={styles.scanLimitsSection}>
          <Text style={styles.sectionTitle}>{t('home.items_available')}</Text>

          {/* Grille des 3 types de scan standards */}
          <View style={styles.scanLimitsGrid}>
            {STANDARD_SCAN_TYPES.map((scanType) => {
              const quotaState = scanQuotaStates[scanType];
              const quotaStateLabelKey = getScanQuotaStatusLabelKey(quotaState);

              return (
                <View
                  key={scanType}
                  style={styles.scanLimitCardShell}
                  testID="scan-limit-card-shell"
                >
                  <View
                    style={styles.scanLimitCardSurface}
                    testID="scan-limit-card-surface"
                  >
                    <Text style={styles.scanLimitLabel} numberOfLines={2}>
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
                      <Text style={styles.quotaStateText}>
                        {t(quotaStateLabelKey ?? 'scan_limit.missing_payload')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Super Scan - indicateur séparé avec style premium */}
          <View style={styles.superScanContainer}>
            {hasScanQuotaPayload(scanQuotaStates.super) ? (
              <SuperScanIndicator
                isPremium={isPremium}
                eligibility={scanQuotaStates.super.eligibility}
                onLockedPress={() => router.push('/premium-upgrade')}
              />
            ) : scanQuotaStates.super.status === 'locked' ? (
              <SuperScanIndicator
                isPremium={false}
                onLockedPress={() => router.push('/premium-upgrade')}
              />
            ) : (
              <View
                style={styles.superQuotaStateCard}
                testID="super-scan-state-card"
              >
                <Text style={styles.superQuotaStateTitle}>
                  {t(SCAN_TYPE_LABELS.super)}
                </Text>
                <Text style={styles.superQuotaStateText}>
                  {t(
                    getScanQuotaStatusLabelKey(scanQuotaStates.super) ??
                      'scan_limit.missing_payload',
                  )}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!isPremium && (
          <TouchableOpacity
            style={styles.premiumBannerShell}
            onPress={() => router.push('/premium-upgrade')}
            activeOpacity={0.8}
            testID="home-premium-banner-shell"
          >
            <View
              style={styles.premiumBannerSurface}
              testID="home-premium-banner-surface"
            >
              <LinearGradient
                colors={premiumBannerColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.premiumBannerGradient}
              >
                <Crown color="#FFFFFF" size={24} fill="#FFFFFF" />
                <View style={styles.premiumBannerText}>
                  <Text style={styles.premiumBannerTitle}>
                    {t('home.premium_banner_title')}
                  </Text>
                  <Text style={styles.premiumBannerSubtitle}>
                    {t('home.premium_banner_subtitle')}
                  </Text>
                </View>
                <ChevronRight color="#FFFFFF" size={20} />
              </LinearGradient>
            </View>
          </TouchableOpacity>
        )}
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
    <View style={styles.container}>
      {/* Header fixe */}
      {renderFixedHeader()}

      {/* Contenu scrollable */}
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
    </View>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  scanCardWidth: number,
  scanGridColumns: number,
) => {
  const isAndroidLight = Platform.OS === 'android' && !isDark;
  const scanCardSurface = isAndroidLight
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
  const premiumBannerSurface = isAndroidLight
    ? getAndroidLightSurface(colors, {
        accentColor: colors.gold,
        shadowColor: colors.gold,
        backgroundAlpha: 0.12,
        borderAlpha: 0.2,
        overlayAlpha: 0.18,
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffsetY: 8,
        elevation: 4,
      })
    : null;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      paddingBottom: HOME_SCROLL_BOTTOM_PADDING,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
      backgroundColor: colors.cardBackground,
      ...SHADOWS.header,
    },
    headerLeft: {
      flexDirection: 'column',
      gap: SPACING.xs,
    },
    username: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    themeToggle: {
      padding: SPACING.sm,
    },
    heroSection: {
      paddingTop: SPACING.lg,
      paddingBottom: SPACING.lg,
      backgroundColor: colors.background,
    },
    heroContent: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingHorizontal: SPACING.page,
    },
    scanLimitsSection: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.md,
    },
    scanLimitsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: SPACING.sm,
      rowGap: SPACING.sm,
      justifyContent: scanGridColumns === 3 ? 'space-between' : 'flex-start',
    },
    scanLimitCardShell: {
      width: scanCardWidth,
      minWidth: 0,
      borderRadius: BORDER_RADIUS.lg,
      ...(isAndroidLight ? scanCardSurface?.shadowStyle : SHADOWS.card),
    },
    scanLimitCardSurface: {
      minWidth: 0,
      flex: 1,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.md,
      alignItems: 'stretch',
      backgroundColor: isAndroidLight
        ? scanCardSurface?.backgroundColor
        : colors.cardBackground,
      borderWidth: isAndroidLight ? 1 : 0,
      borderColor: isAndroidLight
        ? scanCardSurface?.borderColor
        : 'transparent',
      overflow: 'hidden',
    },
    scanLimitLabel: {
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.semiBold,
      color: colors.primaryText,
      textAlign: 'center',
      marginBottom: SPACING.sm,
      minWidth: 0,
    },
    superScanContainer: {
      marginTop: SPACING.md,
    },
    productsSectionHeader: {
      paddingHorizontal: SPACING.page,
      paddingTop: SPACING.xl,
      paddingBottom: SPACING.sm,
    },
    productItemContainer: {
      paddingHorizontal: SPACING.page,
    },
    sectionTitle: {
      fontSize: SIZES.text18,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.primaryText,
      marginBottom: SPACING.md,
    },
    quotaStateText: {
      fontSize: SIZES.text16,
      color: colors.gray,
      textAlign: 'center',
      paddingVertical: SPACING.md,
    },
    superQuotaStateCard: {
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.lg,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: withAlpha(colors.primary, 0.08),
      alignItems: 'center',
      gap: SPACING.xs,
      ...SHADOWS.card,
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
    premiumBannerShell: {
      marginHorizontal: SPACING.page,
      marginTop: SPACING.xl,
      borderRadius: BORDER_RADIUS.xl,
      ...(isAndroidLight
        ? premiumBannerSurface?.shadowStyle
        : SHADOWS.cardHover),
    },
    premiumBannerSurface: {
      borderRadius: BORDER_RADIUS.xl,
      overflow: 'hidden',
      backgroundColor: isAndroidLight
        ? premiumBannerSurface?.backgroundColor
        : 'transparent',
      borderWidth: isAndroidLight ? 1 : 0,
      borderColor: isAndroidLight
        ? premiumBannerSurface?.borderColor
        : 'transparent',
    },
    premiumBannerGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: SPACING.lg,
      gap: SPACING.md,
      minWidth: 0,
    },
    premiumBannerText: {
      flex: 1,
      minWidth: 0,
    },
    premiumBannerTitle: {
      fontSize: SIZES.text16,
      fontWeight: FONT_WEIGHTS.bold,
      color: '#FFFFFF',
    },
    premiumBannerSubtitle: {
      fontSize: SIZES.text12,
      color: withAlpha(colors.white, isAndroidLight ? 0.88 : 0.85),
      marginTop: 2,
    },
  });
};
