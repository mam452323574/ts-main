import { useState, useEffect, useMemo, useCallback, type ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChartNoAxesCombined,
  ChefHat,
  Check,
  Crown,
  RefreshCw,
  X,
  type LucideProps,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { AppScreen } from '@/components/AppScreen';
import { ModalHandle } from '@/components/ModalHandle';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CoachFeatureIcon, SuperScanFeatureIcon } from '@/components/FeatureIcons';
import {
  SIZES,
  SPACING,
  BORDER_RADIUS,
  FONT_WEIGHTS,
  SHADOWS,
  mixColors,
  withAlpha,
} from '@/constants/theme';
import { buildPremiumHealthPalette, type PremiumHealthPalette } from '@/constants/premiumHealth';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { GROWTH_EXPERIENCE_QUERY_KEY } from '@/hooks/queries/useGrowthExperience';
import { trackEvent, trackFailureEvent } from '@/services/analytics';
import { markEntryOfferClaimed } from '@/services/growthExperience';
import { loadPurchasesModule } from '@/services/purchasesRuntime';
import {
  hasPremiumEntitlement,
  isRevenueCatPurchaseCancelledError,
  purchaseRevenueCatPackage,
  resolveEntryOfferOffering,
  restoreRevenueCatPurchases,
} from '@/services/revenueCatOfferings';
import { logOperationalError } from '@/utils/observability';
import { getRuntimeCapabilities } from '@/utils/runtimeCapabilities';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';
import { resolveSafeReturnRoute, safeOpenExternalUrl } from '@/utils/urlSecurity';
import { Squircle } from '@/components/Squircle';

// ─── Feature list types ───
interface FeatureItem {
  label: string;
  included: boolean;
  icon?: ComponentType<LucideProps>;
}

type RouteParams = {
  source?: string | string[];
  offeringId?: string | string[];
  packageId?: string | string[];
  returnTo?: string | string[];
};

function readRouteParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sortPackages(packages: PurchasesPackage[], highlightedPackageId: string | null) {
  const packagePriority: Record<string, number> = {
    ANNUAL: 1,
    SIX_MONTH: 2,
    THREE_MONTH: 3,
    TWO_MONTH: 4,
    MONTHLY: 5,
    WEEKLY: 6,
    LIFETIME: 7,
    CUSTOM: 8,
    UNKNOWN: 9,
  };

  return [...packages].sort((left, right) => {
    if (left.identifier === highlightedPackageId) {
      return -1;
    }

    if (right.identifier === highlightedPackageId) {
      return 1;
    }

    const leftPriority = packagePriority[left.packageType] ?? 99;
    const rightPriority = packagePriority[right.packageType] ?? 99;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.product.price - right.product.price;
  });
}

function resolvePackageTitle(
  pack: PurchasesPackage,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (pack.packageType) {
    case 'WEEKLY':
      return t('premium.subscription_page.weekly_title');
    case 'MONTHLY':
      return t('premium.subscription_page.monthly_title');
    case 'TWO_MONTH':
      return t('premium.subscription_page.two_month_title');
    case 'THREE_MONTH':
      return t('premium.subscription_page.three_month_title');
    case 'SIX_MONTH':
      return t('premium.subscription_page.six_month_title');
    case 'ANNUAL':
      return t('premium.subscription_page.annual_title');
    case 'LIFETIME':
      return t('premium.subscription_page.premium_title');
    default:
      return pack.product.title || t('premium.subscription_page.premium_title');
  }
}

function resolvePackageTestIdSuffix(pack: PurchasesPackage) {
  switch (pack.packageType) {
    case 'MONTHLY':
      return 'monthly';
    case 'ANNUAL':
      return 'annual';
    case 'WEEKLY':
      return 'weekly';
    case 'TWO_MONTH':
      return 'two-month';
    case 'THREE_MONTH':
      return 'three-month';
    case 'SIX_MONTH':
      return 'six-month';
    default:
      return pack.identifier.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  }
}

function formatCurrency(amount: number, currencyCode: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    logOperationalError('[PremiumUpgrade] Failed to format currency', error, {
      currency_code: currencyCode,
    });
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function buildComparedPrice(
  monthlyPackage: PurchasesPackage | null,
  annualPackage: PurchasesPackage,
  locale: string,
) {
  if (!monthlyPackage) {
    return null;
  }

  if (monthlyPackage.product.currencyCode !== annualPackage.product.currencyCode) {
    return null;
  }

  const monthlyAnnualizedPrice = monthlyPackage.product.price * 12;
  if (monthlyAnnualizedPrice <= annualPackage.product.price) {
    return null;
  }

  return formatCurrency(
    monthlyAnnualizedPrice,
    annualPackage.product.currencyCode,
    locale,
  );
}

function buildBillingSubtitle(
  pack: PurchasesPackage,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (pack.packageType !== 'ANNUAL') {
    return null;
  }

  const monthlyEquivalent = pack.product.price / 12;
  return t('premium.subscription_page.price_per_month', {
    price: formatCurrency(monthlyEquivalent, pack.product.currencyCode, locale),
  });
}

export default function PremiumUpgradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const queryClient = useQueryClient();
  const { userProfile, refreshUserProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const premiumHealth = useMemo(
    () => buildPremiumHealthPalette(colors, isDark),
    [colors, isDark],
  );
  const styles = useMemo(
    () => createStyles(colors, insets, isDark, premiumHealth),
    [colors, insets, isDark, premiumHealth],
  );
  const runtime = getRuntimeCapabilities();
  const { showAlert, alertElement } = useCustomAlert();
  const isNativePurchasesAvailable = runtime.canUseNativePurchases;
  const source = readRouteParam(params.source);
  const requestedOfferingId = readRouteParam(params.offeringId);
  const requestedPackageId = readRouteParam(params.packageId);
  const returnTo = readRouteParam(params.returnTo);
  const isEntryOfferSource = source === 'entry_offer';

  const [restoring, setRestoring] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [activeOffering, setActiveOffering] = useState<PurchasesOffering | null>(null);
  const [highlightedPackageId, setHighlightedPackageId] = useState<string | null>(
    requestedPackageId,
  );
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [promoOffering, setPromoOffering] = useState<Awaited<
    ReturnType<typeof resolveEntryOfferOffering>
  > | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPaywall = async () => {
      setLoadingPackages(true);

      try {
        const [purchasesModule, resolvedPromo] = await Promise.all([
          loadPurchasesModule(),
          isEntryOfferSource && requestedOfferingId
            ? resolveEntryOfferOffering(requestedOfferingId)
            : Promise.resolve(null),
        ]);

        if (!isMounted) {
          return;
        }

        setPromoOffering(resolvedPromo);

        if (!purchasesModule) {
          setPackages([]);
          setActiveOffering(null);
          setHighlightedPackageId(null);
          return;
        }

        const offerings = await purchasesModule.default.getOfferings();
        if (!isMounted) {
          return;
        }

        const requestedOffering =
          requestedOfferingId
            ? offerings.all?.[requestedOfferingId] ??
              (offerings.current?.identifier === requestedOfferingId
                ? offerings.current
                : null)
            : null;
        const nextOffering = requestedOffering ?? offerings.current ?? null;
        const nextPackages = nextOffering?.availablePackages ?? [];
        const nextHighlightedPackage =
          (requestedPackageId
            ? nextPackages.find((pack) => pack.identifier === requestedPackageId)
            : null) ??
          (resolvedPromo?.selectedPackage
            ? nextPackages.find(
                (pack) => pack.identifier === resolvedPromo.selectedPackage?.identifier,
              )
            : null) ??
          nextPackages.find((pack) => pack.packageType === 'ANNUAL') ??
          nextPackages[0] ??
          null;

        setActiveOffering(nextOffering);
        setPackages(nextPackages);
        setHighlightedPackageId(nextHighlightedPackage?.identifier ?? null);
      } catch (error) {
        logOperationalError('[PremiumUpgrade] Failed to load offerings', error, {
          offering_id: requestedOfferingId ?? undefined,
          source: source ?? 'premium_upgrade',
        });
        if (isMounted) {
          setPromoOffering(null);
          setActiveOffering(null);
          setPackages([]);
          setHighlightedPackageId(null);
        }
      } finally {
        if (isMounted) {
          setLoadingPackages(false);
        }
      }
    };

    void loadPaywall();

    return () => {
      isMounted = false;
    };
  }, [isEntryOfferSource, requestedOfferingId, requestedPackageId, source]);

  const dismissToOrigin = useCallback(() => {
    const safeReturnTo = resolveSafeReturnRoute(returnTo);
    if (safeReturnTo) {
      router.replace(safeReturnTo as any);
      return;
    }

    if (router.canDismiss()) {
      router.dismiss();
      return;
    }

    router.back();
  }, [returnTo, router]);

  const showPurchasesUnavailableAlert = useCallback(() => {
    showAlert(
      t('premium.web_unavailable_title'),
      Platform.OS === 'web'
        ? t('premium.web_disclaimer')
        : t('premium.native_unavailable'),
    );
  }, [showAlert, t]);

  const activeEntryOfferPackage =
    isEntryOfferSource &&
    promoOffering?.canShowPromo &&
    promoOffering.selectedPackage &&
    highlightedPackageId === promoOffering.selectedPackage.identifier
      ? promoOffering
      : null;
  const sortedPackages = useMemo(
    () => sortPackages(packages, highlightedPackageId),
    [highlightedPackageId, packages],
  );
  const monthlyPackage = useMemo(
    () => packages.find((pack) => pack.packageType === 'MONTHLY') ?? null,
    [packages],
  );
  const buildSubscriptionAnalyticsProps = useCallback(
    (pack?: PurchasesPackage | null) => ({
      offering_id:
        requestedOfferingId ??
        activeOffering?.identifier ??
        promoOffering?.offering?.identifier ??
        undefined,
      package_id: pack?.identifier ?? highlightedPackageId ?? undefined,
      package_type: pack?.packageType ?? undefined,
      source: source ?? 'premium_upgrade',
    }),
    [
      activeOffering?.identifier,
      highlightedPackageId,
      promoOffering?.offering?.identifier,
      requestedOfferingId,
      source,
    ],
  );

  const buildEntryOfferAnalyticsProps = useCallback(
    (pack: PurchasesPackage) => {
      const matchingPromo =
        promoOffering?.selectedPackage?.identifier === pack.identifier
          ? promoOffering
          : null;

      return {
        offering_id:
          requestedOfferingId ??
          activeOffering?.identifier ??
          promoOffering?.offering?.identifier ??
          undefined,
        package_id: pack.identifier,
        package_type: pack.packageType,
        fallback_reason: promoOffering?.fallbackReason ?? undefined,
        has_intro: matchingPromo?.hasIntro ?? undefined,
        intro_eligibility: matchingPromo?.introEligibility ?? undefined,
        source: source ?? 'premium_upgrade',
      };
    },
    [activeOffering?.identifier, promoOffering, requestedOfferingId, source],
  );

  const completeEntryOfferClaim = useCallback(async () => {
    if (!isEntryOfferSource) {
      return;
    }

    const offeringId =
      requestedOfferingId ??
      promoOffering?.offering?.identifier ??
      activeOffering?.identifier ??
      null;

    await markEntryOfferClaimed(offeringId);

    if (userProfile?.id) {
      await queryClient.invalidateQueries({
        queryKey: GROWTH_EXPERIENCE_QUERY_KEY(userProfile.id),
      });
    }
  }, [
    activeOffering?.identifier,
    isEntryOfferSource,
    promoOffering?.offering?.identifier,
    queryClient,
    requestedOfferingId,
    userProfile?.id,
  ]);

  const handlePurchase = useCallback(
    async (pack: PurchasesPackage) => {
      if (!isNativePurchasesAvailable) {
        showPurchasesUnavailableAlert();
        return;
      }

      try {
        setPurchasingPackageId(pack.identifier);

        if (isEntryOfferSource) {
          trackEvent('entry_offer_purchase_attempt', buildEntryOfferAnalyticsProps(pack));
        }

        const { customerInfo } = await purchaseRevenueCatPackage(pack);
        if (!hasPremiumEntitlement(customerInfo)) {
          showAlert(
            t('common.error'),
            t('premium.purchase_error_default'),
          );
          return;
        }

        if (isEntryOfferSource) {
          await completeEntryOfferClaim();
          trackEvent('entry_offer_purchase_completed', buildEntryOfferAnalyticsProps(pack));
        }

        await refreshUserProfile();

        showAlert(
          t('premium.purchase_success_title'),
          t('premium.purchase_success_msg'),
          [
            {
              text: t('common.ok'),
              onPress: dismissToOrigin,
            },
          ],
        );
      } catch (error) {
        if (await isRevenueCatPurchaseCancelledError(error)) {
          return;
        }

        trackFailureEvent(
          'subscription_purchase_failed',
          error,
          buildSubscriptionAnalyticsProps(pack),
        );
        logOperationalError('[PremiumUpgrade] Purchase failed', error, {
          ...buildSubscriptionAnalyticsProps(pack),
        });
        showAlert(
          t('common.error'),
          t('premium.purchase_error_generic'),
        );
      } finally {
        setPurchasingPackageId(null);
      }
    },
    [
      buildEntryOfferAnalyticsProps,
      completeEntryOfferClaim,
      dismissToOrigin,
      buildSubscriptionAnalyticsProps,
      isEntryOfferSource,
      isNativePurchasesAvailable,
      refreshUserProfile,
      showAlert,
      showPurchasesUnavailableAlert,
      t,
    ],
  );

  const handleRestorePurchases = useCallback(async () => {
    if (!isNativePurchasesAvailable) {
      showPurchasesUnavailableAlert();
      return;
    }

    try {
      setRestoring(true);
      const customerInfo = await restoreRevenueCatPurchases();
      if (!hasPremiumEntitlement(customerInfo)) {
        showAlert(
          t('premium.restore_empty_title'),
          t('premium.restore_empty'),
        );
        return;
      }

      await refreshUserProfile();
      showAlert(
        t('premium.restore_success_title'),
        t('premium.restore_success_msg'),
        [
          {
            text: t('common.ok'),
            onPress: dismissToOrigin,
          },
        ],
      );
    } catch (error) {
      trackFailureEvent(
        'subscription_restore_failed',
        error,
        buildSubscriptionAnalyticsProps(),
      );
      logOperationalError('[PremiumUpgrade] Restore failed', error, {
        ...buildSubscriptionAnalyticsProps(),
      });
      showAlert(
        t('common.error'),
        t('premium.restore_error_generic'),
      );
    } finally {
      setRestoring(false);
    }
  }, [
    buildSubscriptionAnalyticsProps,
    dismissToOrigin,
    isNativePurchasesAvailable,
    refreshUserProfile,
    showAlert,
    showPurchasesUnavailableAlert,
    t,
  ]);

  const isPremium = hasPremiumAccessFromProfile(userProfile);

  // ─── Feature lists ───
  const freeFeatures: FeatureItem[] = [
    { label: t('premium.subscription_page.free_feat_face'), included: true },
    { label: t('premium.subscription_page.free_feat_body'), included: true },
    { label: t('premium.subscription_page.free_feat_nutrition'), included: true },
    { label: t('premium.subscription_page.free_feat_partial'), included: true },
    { label: t('premium.subscription_page.free_feat_no_super'), included: false },
    { label: t('premium.subscription_page.free_feat_no_history'), included: false },
  ];

  const premiumFeatures: FeatureItem[] = [
    {
      label: t('premium.subscription_page.prem_feat_coach_quota'),
      included: true,
      icon: CoachFeatureIcon,
    },
    {
      label: t('premium.subscription_page.prem_feat_coach_modes'),
      included: true,
      icon: CoachFeatureIcon,
    },
    {
      label: t('premium.subscription_page.prem_feat_super'),
      included: true,
      icon: SuperScanFeatureIcon,
    },
    {
      label: t('premium.subscription_page.prem_feat_chef'),
      included: true,
      icon: ChefHat,
    },
    {
      label: t('premium.subscription_page.prem_feat_complete_analysis'),
      included: true,
      icon: ChartNoAxesCombined,
    },
  ];

  // ─── Manage subscription ───
  const handleManageSubscription = useCallback(() => {
    if (Platform.OS === 'ios') {
      void safeOpenExternalUrl('https://apps.apple.com/account/subscriptions', {
        context: '[PremiumUpgrade] Failed to open App Store subscriptions',
      });
      return;
    }

    if (Platform.OS === 'android') {
      void safeOpenExternalUrl(
        'https://play.google.com/store/account/subscriptions?package=com.selflens.app',
        {
          context: '[PremiumUpgrade] Failed to open Play Store subscriptions',
        },
      );
      return;
    }

    showAlert(
      t('premium.web_unavailable_title'),
      t('premium.web_disclaimer'),
    );
  }, [showAlert, t]);

  // ─── Already premium view ───
  if (isPremium) {
    let formattedDate = '';
    if (userProfile?.subscription_expiry_date) {
      try {
        const date = new Date(userProfile.subscription_expiry_date);
        formattedDate = new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date);
      } catch (error) {
        logOperationalError('[PremiumUpgrade] Failed to format expiry date', error);
      }
    }

    return (
      <View style={styles.container}>
        {alertElement}
          <View style={styles.alreadyPremiumContainer}>
          <Squircle style={styles.premiumBadge}>
            <Crown color={colors.gold} size={64} fill={withAlpha(colors.gold, 0.2)} />
          </Squircle>
          <Text style={styles.alreadyPremiumTitle}>{t('premium.already_premium_title')}</Text>
          <Text style={[styles.alreadyPremiumText, { color: colors.primaryText, fontWeight: 'bold' }]}>
            {t('premium.already_premium_active')}
          </Text>
          {formattedDate ? (
            <Text style={styles.alreadyPremiumText}>
              {t('premium.renewal_date').replace('%{date}', formattedDate)}
            </Text>
          ) : (
            <Text style={styles.alreadyPremiumText}>
              {t('premium.already_premium_desc')}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: colors.primaryText, width: '100%', maxWidth: 300, marginBottom: SPACING.md }]}
            onPress={handleManageSubscription}
          >
            <Text style={styles.ctaButtonText}>{t('premium.manage_subscription')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ padding: SPACING.md }} onPress={dismissToOrigin}>
            <Text style={[styles.ctaButtonText, { color: colors.gray }]}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Render a feature row ───
  const renderFeatureRow = (item: FeatureItem, index: number, isHighlighted: boolean) => {
    const Icon = item.icon;
    const iconColor = item.included
      ? (isHighlighted ? colors.gold : colors.success)
      : colors.error;

    return (
      <View key={index} style={styles.featureRow}>
        <Squircle
          style={[
            styles.featureIcon,
            {
              backgroundColor: item.included
                ? (isHighlighted ? withAlpha(colors.gold, 0.14) : withAlpha(colors.success, 0.14))
                : withAlpha(colors.error, 0.12),
            },
          ]}
        >
          {Icon ? (
            <Icon color={iconColor} size={14} strokeWidth={2.4} />
          ) : item.included ? (
            <Check color={iconColor} size={14} />
          ) : (
            <X color={colors.error} size={14} />
          )}
        </Squircle>
        <Text
          style={[
            styles.featureText,
            {
              color: item.included ? colors.primaryText : colors.gray,
              opacity: item.included ? 1 : 0.7,
            },
          ]}
        >
          {item.label}
        </Text>
      </View>
    );
  };

  const renderPackageCard = (pack: PurchasesPackage) => {
    const isHighlighted = highlightedPackageId === pack.identifier;
    const isAnnual = pack.packageType === 'ANNUAL';
    const comparedPrice = isAnnual ? buildComparedPrice(monthlyPackage, pack, locale) : null;
    const badge =
      isHighlighted && activeEntryOfferPackage
        ? activeEntryOfferPackage.badge ?? t('premium.subscription_page.entry_offer_badge')
        : isAnnual && comparedPrice
          ? t('premium.subscription_page.annual_badge')
          : null;
    const packageSubtitle =
      isHighlighted && activeEntryOfferPackage
        ? activeEntryOfferPackage.introLabel ??
          activeEntryOfferPackage.billingLabel ??
          activeEntryOfferPackage.subheadline
        : buildBillingSubtitle(pack, locale, t);
    const ctaLabel =
      isHighlighted && activeEntryOfferPackage
        ? t('premium.subscription_page.entry_offer_cta')
        : t('premium.subscription_page.cta_generic');
    const packageTestIdSuffix = resolvePackageTestIdSuffix(pack);
    const purchaseDisabled =
      restoring ||
      loadingPackages ||
      !isNativePurchasesAvailable ||
      purchasingPackageId !== null;

    return (
      <Squircle
        key={pack.identifier}
        style={[
          styles.cardShell,
          isHighlighted ? styles.cardShellSelected : styles.cardShellMonthly,
        ]}
        testID={`premium-card-${packageTestIdSuffix}-shell`}
      >
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}

        <Squircle
          style={[
            styles.cardSurface,
            isHighlighted ? styles.cardSurfaceSelected : styles.cardSurfaceMonthly,
          ]}
          testID={`premium-card-${packageTestIdSuffix}-surface`}
        >
          <View style={[styles.cardHeader, badge ? { marginTop: SPACING.lg } : null]}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
              {resolvePackageTitle(pack, t)}
            </Text>
            <Text style={[styles.cardPrice, { color: isHighlighted ? colors.gold : colors.primaryText }]}>
              {pack.product.priceString}
            </Text>
            {packageSubtitle ? (
              <Text style={[styles.cardSubPrice, { color: colors.gray }]}>
                {packageSubtitle}
              </Text>
            ) : null}
            {comparedPrice ? (
              <Text
                style={[styles.crossedPrice, { color: colors.error }]}
                testID={`premium-card-${packageTestIdSuffix}-compared-price`}
              >
                {comparedPrice}
              </Text>
            ) : null}
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.featuresList} testID="premium-card-features-list">
            {premiumFeatures.map((feature, index) =>
              renderFeatureRow(feature, index, isHighlighted),
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.ctaButton,
              {
                backgroundColor: colors.primaryText,
                opacity: purchaseDisabled ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              void handlePurchase(pack);
            }}
            disabled={purchaseDisabled}
            testID={`premium-card-${packageTestIdSuffix}-cta`}
          >
            {purchasingPackageId === pack.identifier ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.ctaButtonText}>{ctaLabel}</Text>
            )}
          </TouchableOpacity>
        </Squircle>
      </Squircle>
    );
  };

  // ─── Main render ───
  return (
    <AppScreen topInset={false} bottomInset={false} style={[styles.container, { backgroundColor: colors.background }]}>
      {alertElement}
      <ModalHandle />

      <ScreenHeader
        title={t('premium.title')}
        onClose={dismissToOrigin}
        centered
        testID="premium-screen-header"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* ─── Hero section ─── */}
          <Squircle style={styles.heroShell}>
            <View style={styles.heroSection}>
              <Squircle style={styles.heroCrownContainer}>
                <Crown color={colors.gold} size={26} />
              </Squircle>
              <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                {t('premium.subscription_page.hero_title')}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.gray }]}>
                {activeEntryOfferPackage?.introLabel ??
                  activeEntryOfferPackage?.subheadline ??
                  t('premium.subscription_page.hero_subtitle')}
              </Text>
            </View>
          </Squircle>

          <Squircle style={styles.contextCard}>
            <Squircle style={styles.contextIconWrap}>
              <ChartNoAxesCombined color={colors.primary} size={18} />
            </Squircle>
            <View style={styles.contextCopy}>
              <Text style={styles.contextTitle}>
                {t('premium.subscription_page.contextual_analytics_title')}
              </Text>
              <Text style={styles.contextBody}>
                {t('premium.subscription_page.contextual_analytics_body')}
              </Text>
            </View>
          </Squircle>

          {/* ─── Cards horizontal scroll ─── */}
          <View style={styles.cardsContainer} testID="premium-cards-scroll">
            {loadingPackages ? (
              <Squircle style={[styles.cardShell, styles.cardShellMonthly]}>
                <Squircle style={[styles.cardSurface, styles.cardSurfaceMonthly, styles.loadingCard]}>
                  <ActivityIndicator color={colors.primary} />
                </Squircle>
              </Squircle>
            ) : sortedPackages.length > 0 ? (
              sortedPackages.map(renderPackageCard)
            ) : (
              <Squircle style={[styles.cardShell, styles.cardShellMonthly]}>
                <Squircle style={[styles.cardSurface, styles.cardSurfaceMonthly, styles.emptyCard]}>
                  <Text style={[styles.emptyCardTitle, { color: colors.primaryText }]}>
                    {t('premium.subscription_page.packages_unavailable')}
                  </Text>
                  {!isNativePurchasesAvailable ? (
                    <Text style={[styles.emptyCardBody, { color: colors.gray }]}>
                      {Platform.OS === 'web'
                        ? t('premium.web_disclaimer')
                        : t('premium.native_unavailable')}
                    </Text>
                  ) : null}
                </Squircle>
              </Squircle>
            )}

            <Squircle style={[styles.cardShell, styles.cardShellFree]} testID="premium-card-free-shell">
              <Squircle style={[styles.cardSurface, styles.cardSurfaceFree]} testID="premium-card-free-surface">
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.gray }]}>
                    {t('premium.subscription_page.free_title')}
                  </Text>
                  <Text style={[styles.cardPrice, { color: colors.gray }]}>
                    {t('premium.subscription_page.free_price')}
                  </Text>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.featuresList} testID="premium-card-features-list">
                  {freeFeatures.map((f, i) => renderFeatureRow(f, i, false))}
                </View>
              </Squircle>
            </Squircle>
          </View>

          {/* ─── Bottom section ─── */}
          <Squircle style={styles.bottomSection}>
            {/* Restore purchases */}
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => {
                  void handleRestorePurchases();
                }}
                disabled={purchasingPackageId !== null || restoring}
              >
                <RefreshCw color={colors.primary} size={16} />
                <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
                  {restoring ? t('premium.restoring') : t('premium.restore_btn')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Legal text */}
            <Text style={[styles.legalText, { color: colors.gray }]}>
              {t('premium.subscription_page.legal')}
            </Text>

            {/* Links */}
            <View style={styles.linksRow}>
              <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                <Text style={[styles.linkText, { color: colors.primary }]}>
                  {t('premium.subscription_page.privacy_link')}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.linkSeparator, { color: colors.gray }]}>•</Text>
              <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                <Text style={[styles.linkText, { color: colors.primary }]}>
                  {t('premium.subscription_page.terms_link')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Store note */}
            {Platform.OS !== 'web' ? (
              <Text style={[styles.storeNote, { color: colors.gray }]}>
                {t('premium.store_note', { store: Platform.OS === 'android' ? 'Google Play' : 'App Store' })}
              </Text>
            ) : (
              <Text style={[styles.storeNote, { color: colors.gray }]}>
                {t('premium.web_note')}
              </Text>
            )}
          </Squircle>

        </View>
      </ScrollView>
    </AppScreen>
  );
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════

const createStyles = (
  colors: any,
  insets: any,
  isDark: boolean,
  premiumHealth: PremiumHealthPalette,
) => {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: premiumHealth.canvas,
  },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.page || 20,
    paddingVertical: SPACING.md,
    paddingTop: insets.top + SPACING.sm,
    backgroundColor: isDark ? withAlpha(colors.background, 0.94) : colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle ?? withAlpha(colors.primaryText, 0.08),
  },
  headerTitle: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.semiBold,
  },

  // ─── Scroll ───
  scrollContent: {
    paddingBottom: SPACING.xxxl + insets.bottom,
  },
  content: {
    gap: SPACING.xl,
  },

  // ─── Hero ───
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.hero,
    borderWidth: 1,
    borderColor: premiumHealth.borderSubtle,
    backgroundColor: premiumHealth.surfaceRaised,
    gap: SPACING.sm, borderCurve: 'continuous',
  },
  heroShell: {
    marginHorizontal: SPACING.page,
    borderRadius: BORDER_RADIUS.hero,
    ...SHADOWS.none, borderCurve: 'continuous',
  },
  heroCrownContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumHealth.premiumAccentSoft,
    borderWidth: 1,
    borderColor: withAlpha(premiumHealth.premiumAccent, isDark ? 0.2 : 0.16),
    marginBottom: SPACING.sm,
    ...SHADOWS.none, borderCurve: 'continuous',
  },
  heroTitle: {
    fontSize: SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: SIZES.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  contextCard: {
    marginHorizontal: SPACING.page,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: premiumHealth.borderSubtle,
    backgroundColor: premiumHealth.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.none, borderCurve: 'continuous',
  },
  contextIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.primary, isDark ? 0.16 : 0.1), borderCurve: 'continuous',
  },
  contextCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  contextTitle: {
    fontSize: SIZES.text14,
    lineHeight: 18,
    color: colors.primaryText,
    fontWeight: FONT_WEIGHTS.bold,
  },
  contextBody: {
    fontSize: SIZES.text12,
    lineHeight: 18,
    color: colors.gray,
  },

  // ─── Cards container ───
  cardsContainer: {
    paddingHorizontal: SPACING.page,
    gap: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: 'center',
  },

  // ─── Card base ───
  cardShell: {
    width: '100%',
    maxWidth: 460,
    borderRadius: BORDER_RADIUS.hero,
    overflow: 'visible',
    alignSelf: 'center', borderCurve: 'continuous',
  },
  cardShellFree: {
    opacity: 0.76,
    ...SHADOWS.none,
  },
  cardShellMonthly: {
    ...SHADOWS.none,
  },
  cardShellSelected: {
    position: 'relative',
    ...SHADOWS.none,
  },
  cardSurface: {
    borderRadius: BORDER_RADIUS.hero,
    padding: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1, borderCurve: 'continuous',
  },
  cardSurfaceFree: {
    backgroundColor: isDark ? premiumHealth.surfaceBase : premiumHealth.surfaceRaised,
    borderColor: premiumHealth.borderSubtle,
  },
  cardSurfaceMonthly: {
    backgroundColor: premiumHealth.surfaceRaised,
    borderColor: premiumHealth.borderSubtle,
  },
  cardSurfaceSelected: {
    backgroundColor: premiumHealth.surfaceRaised,
    borderColor: withAlpha(premiumHealth.premiumAccent, isDark ? 0.34 : 0.25),
    borderWidth: 1.5,
  },

  // ─── Badge ───
  badge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -65,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    zIndex: 10,
    borderWidth: 1,
    borderColor: withAlpha(premiumHealth.premiumAccent, isDark ? 0.24 : 0.18),
    backgroundColor: premiumHealth.premiumAccentSoft, borderCurve: 'continuous',
  },
  badgeText: {
    // Auparavant `premiumAccent` (or) sur fond `premiumAccentSoft` (or à 6 %
    // d'opacité en light → ~#FAF6EE) donnait un contraste ~3.5:1, sous le
    // seuil WCAG AA pour 12 px bold. Même pattern que PremiumTeaserCard :
    // garder le fond or signature et passer le texte à `primaryText` pour
    // rétablir un contraste ≥14:1 dans les deux thèmes.
    color: colors.primaryText,
    fontSize: SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Card header ───
  cardHeader: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  cardPrice: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cardSubPrice: {
    fontSize: SIZES.sm,
    marginTop: 2,
  },
  crossedPrice: {
    fontSize: SIZES.sm,
    textDecorationLine: 'line-through',
    marginTop: 2,
    opacity: 0.8,
  },

  // ─── Card divider ───
  cardDivider: {
    height: 1,
    backgroundColor: premiumHealth.borderSubtle,
    marginVertical: SPACING.md,
  },

  // ─── Features list ───
  featuresList: {
    gap: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center', borderCurve: 'continuous',
  },
  featureText: {
    fontSize: SIZES.sm - 1,
    flex: 1,
    lineHeight: 18,
  },

  // ─── CTA button ───
  ctaButton: {
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: premiumHealth.primaryActionBorder,
    backgroundColor: premiumHealth.primaryActionBackground, borderCurve: 'continuous',
  },
  ctaButtonText: {
    color: premiumHealth.primaryActionText,
    fontSize: SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  loadingCard: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  emptyCardTitle: {
    fontSize: SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  emptyCardBody: {
    fontSize: SIZES.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ─── Bottom section ───
  bottomSection: {
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: premiumHealth.borderSubtle,
    backgroundColor: premiumHealth.surfaceRaised,
    marginHorizontal: SPACING.page,
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.none, borderCurve: 'continuous',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    padding: SPACING.sm,
  },
  restoreButtonText: {
    fontSize: SIZES.sm,
    fontWeight: '500' as const,
  },
  legalText: {
    fontSize: SIZES.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  linkText: {
    fontSize: SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
  linkSeparator: {
    fontSize: SIZES.xs,
  },
  storeNote: {
    fontSize: SIZES.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xs,
  },

  // ─── Already premium ───
  alreadyPremiumContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingRight: SPACING.xl,
    paddingBottom: SPACING.xl + insets.bottom,
    paddingLeft: SPACING.xl,
  },
  premiumBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: isDark
      ? mixColors(colors.cardBackground, colors.gold, 0.12)
      : mixColors(colors.cardBackground, colors.gold, 0.18),
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.34),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.none, borderCurve: 'continuous',
  },
  alreadyPremiumTitle: {
    fontSize: SIZES.xxxl,
    fontWeight: 'bold' as const,
    marginBottom: SPACING.md,
    color: colors.primaryText,
  },
  alreadyPremiumText: {
    fontSize: SIZES.md,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    color: colors.gray,
    lineHeight: 24,
  },
  });
};
