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
import { LinearGradient } from 'expo-linear-gradient';
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
  const selectedPackage = useMemo(() => {
    if (highlightedPackageId) {
      return sortedPackages.find((pack) => pack.identifier === highlightedPackageId) ??
        sortedPackages[0] ??
        null;
    }

    return sortedPackages[0] ?? null;
  }, [highlightedPackageId, sortedPackages]);
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

  const purchaseDisabled =
    restoring ||
    loadingPackages ||
    !isNativePurchasesAvailable ||
    purchasingPackageId !== null ||
    !selectedPackage;
  const primaryCtaLabel =
    activeEntryOfferPackage
      ? t('premium.subscription_page.entry_offer_cta')
      : t('premium.subscription_page.cta_generic');
  const heroBadgeLabel =
    activeEntryOfferPackage?.badge ??
    (selectedPackage?.packageType === 'ANNUAL'
      ? t('premium.subscription_page.annual_badge')
      : t('premium.subscription_page.premium_title'));
  const heroSubtitle =
    activeEntryOfferPackage?.introLabel ??
    activeEntryOfferPackage?.subheadline ??
    t('premium.subscription_page.hero_subtitle');
  const proofTiles = [
    premiumFeatures[0],
    premiumFeatures[2],
    premiumFeatures[3],
  ].filter(Boolean);

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
      <AppScreen topInset={false} bottomInset={false} style={styles.container}>
        <LinearGradient colors={premiumHealth.paywall.screenGradient} style={styles.screenGradient}>
          {alertElement}
          <ModalHandle />
          <ScreenHeader
            title={t('premium.title')}
            onClose={dismissToOrigin}
            centered
            testID="premium-screen-header"
          />

          <View style={styles.alreadyPremiumContainer}>
            <Squircle style={styles.alreadyPremiumCard}>
              <LinearGradient
                colors={premiumHealth.paywall.heroGradient}
                style={styles.alreadyPremiumSurface}
              >
                <Squircle style={styles.premiumBadge}>
                  <Crown color={colors.gold} size={54} fill={withAlpha(colors.gold, 0.2)} />
                </Squircle>
                <Text style={styles.alreadyPremiumTitle}>
                  {t('premium.already_premium_title')}
                </Text>
                <Text style={styles.alreadyPremiumText}>
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

                <View style={styles.alreadyPremiumActions}>
                  <TouchableOpacity
                    style={styles.primaryCtaButton}
                    onPress={handleManageSubscription}
                  >
                    <Text style={styles.primaryCtaText}>
                      {t('premium.manage_subscription')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryButton} onPress={dismissToOrigin}>
                    <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Squircle>
          </View>
        </LinearGradient>
      </AppScreen>
    );
  }

  // ─── Render helpers ───
  const renderFeatureRow = (item: FeatureItem, index: number) => {
    const Icon = item.icon;
    const iconColor = item.included
      ? premiumHealth.trustAccent
      : colors.error;

    return (
      <View key={index} style={styles.featureRow}>
        <Squircle
          style={[
            styles.featureIcon,
            {
              backgroundColor: item.included
                ? premiumHealth.paywall.benefitIconBackground
                : withAlpha(colors.error, 0.12),
              borderColor: item.included
                ? premiumHealth.paywall.benefitIconBorder
                : withAlpha(colors.error, 0.16),
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

  const renderProofTile = (item: FeatureItem, index: number) => {
    const Icon = item.icon ?? Check;

    return (
      <Squircle key={`${item.label}-${index}`} style={styles.proofTile}>
        <Squircle style={styles.proofIcon}>
          <Icon color={premiumHealth.trustAccent} size={16} strokeWidth={2.4} />
        </Squircle>
        <Text numberOfLines={2} style={styles.proofTileText}>
          {item.label}
        </Text>
      </Squircle>
    );
  };

  const renderPlanOption = (pack: PurchasesPackage) => {
    const isSelected = selectedPackage?.identifier === pack.identifier;
    const isAnnual = pack.packageType === 'ANNUAL';
    const comparedPrice = isAnnual ? buildComparedPrice(monthlyPackage, pack, locale) : null;
    const badge =
      isSelected && activeEntryOfferPackage
        ? activeEntryOfferPackage.badge ?? t('premium.subscription_page.entry_offer_badge')
        : isAnnual && comparedPrice
          ? t('premium.subscription_page.annual_badge')
          : null;
    const packageSubtitle =
      isSelected && activeEntryOfferPackage
        ? activeEntryOfferPackage.introLabel ??
          activeEntryOfferPackage.billingLabel ??
          activeEntryOfferPackage.subheadline
        : buildBillingSubtitle(pack, locale, t);
    const packageTestIdSuffix = resolvePackageTestIdSuffix(pack);

    return (
      <View
        key={pack.identifier}
        style={styles.planOptionShell}
        testID={`premium-card-${packageTestIdSuffix}-shell`}
      >
        <TouchableOpacity
          activeOpacity={0.86}
          disabled={purchasingPackageId !== null}
          onPress={() => setHighlightedPackageId(pack.identifier)}
          testID={`premium-plan-option-${packageTestIdSuffix}`}
        >
          <Squircle
            style={[
              styles.planOptionSurface,
              isSelected ? styles.planOptionSurfaceSelected : null,
            ]}
            testID={`premium-card-${packageTestIdSuffix}-surface`}
          >
            <View style={styles.planOptionMain}>
              <View style={styles.planTitleRow}>
                <Text style={styles.planTitle}>{resolvePackageTitle(pack, t)}</Text>
                {badge ? (
                  <Squircle style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{badge}</Text>
                  </Squircle>
                ) : null}
              </View>
              {packageSubtitle ? (
                <Text style={styles.planSubtitle}>{packageSubtitle}</Text>
              ) : null}
              {comparedPrice ? (
                <Text
                  style={styles.crossedPrice}
                  testID={`premium-card-${packageTestIdSuffix}-compared-price`}
                >
                  {comparedPrice}
                </Text>
              ) : null}
            </View>

            <View style={styles.planPriceCluster}>
              <Text style={styles.planPrice}>{pack.product.priceString}</Text>
              <Squircle
                style={[
                  styles.planSelectionMark,
                  isSelected ? null : styles.planSelectionMarkIdle,
                ]}
              >
                {isSelected ? (
                  <Check
                    color={premiumHealth.paywall.selectionText}
                    size={14}
                    strokeWidth={3}
                  />
                ) : null}
              </Squircle>
            </View>
          </Squircle>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Main render ───
  return (
    <AppScreen topInset={false} bottomInset={false} style={styles.container}>
      <LinearGradient colors={premiumHealth.paywall.screenGradient} style={styles.screenGradient}>
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
            <Squircle style={styles.heroShell}>
              <LinearGradient
                colors={premiumHealth.paywall.heroGradient}
                style={styles.heroSection}
              >
                <View style={styles.heroTopRow}>
                  <Squircle style={styles.heroCrownContainer}>
                    <Crown color={colors.gold} size={24} />
                  </Squircle>
                  <Squircle style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>{heroBadgeLabel}</Text>
                  </Squircle>
                </View>

                <Text style={styles.heroTitle}>
                  {t('premium.subscription_page.hero_title')}
                </Text>
                <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>

                <View style={styles.proofGrid}>
                  {proofTiles.map(renderProofTile)}
                </View>
              </LinearGradient>
            </Squircle>

            <Squircle style={styles.benefitsPanel}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEyebrow}>
                  {t('premium.subscription_page.contextual_analytics_title')}
                </Text>
                <Text style={styles.sectionBody}>
                  {t('premium.subscription_page.contextual_analytics_body')}
                </Text>
              </View>

              <View style={styles.featuresList} testID="premium-card-features-list">
                {premiumFeatures.map(renderFeatureRow)}
              </View>
            </Squircle>

            <Squircle style={styles.planPanel} testID="premium-cards-scroll">
              <View style={styles.planPanelHeader}>
                <Text style={styles.planPanelTitle}>
                  {t('premium.subscription_page.premium_title')}
                </Text>
                <Text style={styles.planPanelSubtitle}>
                  {t('premium.subscription_page.legal')}
                </Text>
              </View>

              <View style={styles.planOptions}>
                {loadingPackages ? (
                  <Squircle style={styles.loadingCard}>
                    <ActivityIndicator color={premiumHealth.trustAccent} />
                  </Squircle>
                ) : sortedPackages.length > 0 ? (
                  sortedPackages.map(renderPlanOption)
                ) : (
                  <Squircle style={styles.emptyCard}>
                    <Text style={styles.emptyCardTitle}>
                      {t('premium.subscription_page.packages_unavailable')}
                    </Text>
                    {!isNativePurchasesAvailable ? (
                      <Text style={styles.emptyCardBody}>
                        {Platform.OS === 'web'
                          ? t('premium.web_disclaimer')
                          : t('premium.native_unavailable')}
                      </Text>
                    ) : null}
                  </Squircle>
                )}
              </View>

              {selectedPackage ? (
                <TouchableOpacity
                  style={[
                    styles.primaryCtaButton,
                    purchaseDisabled ? styles.disabledAction : null,
                  ]}
                  onPress={() => {
                    void handlePurchase(selectedPackage);
                  }}
                  disabled={purchaseDisabled}
                  testID="premium-primary-cta"
                >
                  {purchasingPackageId === selectedPackage.identifier ? (
                    <ActivityIndicator color={premiumHealth.paywall.ctaText} />
                  ) : (
                    <Text style={styles.primaryCtaText}>{primaryCtaLabel}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </Squircle>

            <View style={styles.footerSection}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={() => {
                    void handleRestorePurchases();
                  }}
                  disabled={purchasingPackageId !== null || restoring}
                >
                  <RefreshCw color={premiumHealth.trustAccent} size={16} />
                  <Text style={styles.restoreButtonText}>
                    {restoring ? t('premium.restoring') : t('premium.restore_btn')}
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.legalText}>
                {t('premium.subscription_page.legal')}
              </Text>

              <View style={styles.linksRow}>
                <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                  <Text style={styles.linkText}>
                    {t('premium.subscription_page.privacy_link')}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.linkSeparator}>•</Text>
                <TouchableOpacity onPress={() => router.push('/terms-of-use')}>
                  <Text style={styles.linkText}>
                    {t('premium.subscription_page.terms_link')}
                  </Text>
                </TouchableOpacity>
              </View>

              {Platform.OS !== 'web' ? (
                <Text style={styles.storeNote}>
                  {t('premium.store_note', {
                    store: Platform.OS === 'android' ? 'Google Play' : 'App Store',
                  })}
                </Text>
              ) : (
                <Text style={styles.storeNote}>
                  {t('premium.web_note')}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
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
  const paywall = premiumHealth.paywall;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: premiumHealth.canvas,
    },
    screenGradient: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.xxxl + insets.bottom,
    },
    content: {
      paddingHorizontal: SPACING.page,
      gap: SPACING.lg,
    },
    heroShell: {
      borderRadius: BORDER_RADIUS.hero,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: paywall.heroBorder,
      ...SHADOWS.soft,
      shadowColor: paywall.shadowColor,
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
      borderCurve: 'continuous',
    },
    heroSection: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.lg,
      gap: SPACING.md,
      overflow: 'hidden',
      borderCurve: 'continuous',
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
    },
    heroCrownContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: paywall.heroIconBackground,
      borderWidth: 1,
      borderColor: paywall.heroIconBorder,
      borderCurve: 'continuous',
    },
    heroBadge: {
      maxWidth: '72%',
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 2,
      backgroundColor: paywall.heroBadgeBackground,
      borderWidth: 1,
      borderColor: paywall.heroBadgeBorder,
      borderCurve: 'continuous',
    },
    heroBadgeText: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    heroTitle: {
      color: colors.primaryText,
      fontSize: SIZES.text28,
      lineHeight: 34,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'left',
    },
    heroSubtitle: {
      color: paywall.softText,
      fontSize: SIZES.text15,
      lineHeight: 22,
    },
    proofGrid: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    proofTile: {
      flex: 1,
      minHeight: 86,
      borderRadius: BORDER_RADIUS.lg,
      padding: SPACING.sm,
      justifyContent: 'space-between',
      backgroundColor: paywall.proofTileBackground,
      borderWidth: 1,
      borderColor: paywall.proofTileBorder,
      borderCurve: 'continuous',
    },
    proofIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: paywall.proofTileIconBackground,
      borderWidth: 1,
      borderColor: paywall.proofTileIconBorder,
      borderCurve: 'continuous',
    },
    proofTileText: {
      color: colors.primaryText,
      fontSize: SIZES.text12,
      lineHeight: 16,
      fontWeight: FONT_WEIGHTS.semiBold,
      flexShrink: 1,
    },
    benefitsPanel: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.lg,
      gap: SPACING.lg,
      backgroundColor: paywall.benefitsBackground,
      borderWidth: 1,
      borderColor: paywall.benefitsBorder,
      borderCurve: 'continuous',
    },
    sectionHeader: {
      gap: SPACING.xs,
    },
    sectionEyebrow: {
      color: premiumHealth.trustAccent,
      fontSize: SIZES.text14,
      lineHeight: 18,
      fontWeight: FONT_WEIGHTS.bold,
    },
    sectionBody: {
      color: paywall.softText,
      fontSize: SIZES.text14,
      lineHeight: 21,
    },
    featuresList: {
      gap: SPACING.sm,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
    },
    featureIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      marginTop: 1,
      borderCurve: 'continuous',
    },
    featureText: {
      fontSize: SIZES.text14,
      flex: 1,
      lineHeight: 20,
    },
    planPanel: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.lg,
      gap: SPACING.lg,
      backgroundColor: paywall.planPanelBackground,
      borderWidth: 1,
      borderColor: paywall.planPanelBorder,
      ...SHADOWS.card,
      shadowColor: paywall.shadowColor,
      shadowOpacity: isDark ? 0.14 : 0.06,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
      borderCurve: 'continuous',
    },
    planPanelHeader: {
      gap: SPACING.xs,
    },
    planPanelTitle: {
      color: colors.primaryText,
      fontSize: SIZES.text22,
      lineHeight: 28,
      fontWeight: FONT_WEIGHTS.bold,
    },
    planPanelSubtitle: {
      color: paywall.softText,
      fontSize: SIZES.text12,
      lineHeight: 18,
    },
    planOptions: {
      gap: SPACING.sm,
    },
    planOptionShell: {
      width: '100%',
      ...SHADOWS.none,
    },
    planOptionSurface: {
      minHeight: 88,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      backgroundColor: paywall.planOptionBackground,
      borderWidth: 1,
      borderColor: paywall.planOptionBorder,
      borderCurve: 'continuous',
    },
    planOptionSurfaceSelected: {
      backgroundColor: paywall.planOptionSelectedBackground,
      borderColor: paywall.planOptionSelectedBorder,
      borderWidth: 1.5,
    },
    planOptionMain: {
      flex: 1,
      minWidth: 0,
      gap: SPACING.xs,
    },
    planTitleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    planTitle: {
      color: colors.primaryText,
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.bold,
      flexShrink: 1,
    },
    planSubtitle: {
      color: paywall.softText,
      fontSize: SIZES.text12,
      lineHeight: 17,
    },
    crossedPrice: {
      color: colors.error,
      fontSize: SIZES.text12,
      lineHeight: 16,
      textDecorationLine: 'line-through',
      opacity: 0.82,
    },
    planBadge: {
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      backgroundColor: paywall.planBadgeBackground,
      borderWidth: 1,
      borderColor: paywall.planBadgeBorder,
      borderCurve: 'continuous',
    },
    planBadgeText: {
      color: paywall.planBadgeText,
      fontSize: SIZES.text10,
      lineHeight: 12,
      fontWeight: FONT_WEIGHTS.bold,
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    planPriceCluster: {
      alignItems: 'flex-end',
      gap: SPACING.sm,
    },
    planPrice: {
      color: colors.primaryText,
      fontSize: SIZES.text18,
      lineHeight: 22,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'right',
    },
    planSelectionMark: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: paywall.selectionBackground,
      borderWidth: 1,
      borderColor: paywall.selectionBorder,
      borderCurve: 'continuous',
    },
    planSelectionMarkIdle: {
      backgroundColor: paywall.planOptionMutedBackground,
      borderColor: paywall.planOptionBorder,
    },
    primaryCtaButton: {
      minHeight: 56,
      borderRadius: BORDER_RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      backgroundColor: paywall.ctaBackground,
      borderWidth: 1,
      borderColor: paywall.ctaBorder,
      shadowColor: paywall.ctaShadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.18 : 0.14,
      shadowRadius: 22,
      elevation: 5,
      borderCurve: 'continuous',
    },
    primaryCtaText: {
      color: paywall.ctaText,
      fontSize: SIZES.text16,
      lineHeight: 20,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
    },
    disabledAction: {
      opacity: 0.62,
    },
    loadingCard: {
      minHeight: 156,
      borderRadius: BORDER_RADIUS.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: paywall.planOptionMutedBackground,
      borderWidth: 1,
      borderColor: paywall.planOptionBorder,
      borderCurve: 'continuous',
    },
    emptyCard: {
      minHeight: 172,
      borderRadius: BORDER_RADIUS.xl,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.lg,
      gap: SPACING.sm,
      backgroundColor: paywall.planOptionMutedBackground,
      borderWidth: 1,
      borderColor: paywall.planOptionBorder,
      borderCurve: 'continuous',
    },
    emptyCardTitle: {
      color: colors.primaryText,
      fontSize: SIZES.text18,
      lineHeight: 23,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
    },
    emptyCardBody: {
      color: paywall.softText,
      fontSize: SIZES.text14,
      textAlign: 'center',
      lineHeight: 20,
    },
    footerSection: {
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.lg,
    },
    restoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: paywall.footerBackground,
      borderWidth: 1,
      borderColor: paywall.footerBorder,
      borderCurve: 'continuous',
    },
    restoreButtonText: {
      color: premiumHealth.trustAccent,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
    legalText: {
      color: paywall.softText,
      fontSize: SIZES.xs,
      textAlign: 'center',
      lineHeight: 18,
    },
    linksRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    linkText: {
      color: premiumHealth.trustAccent,
      fontSize: SIZES.xs,
      fontWeight: FONT_WEIGHTS.medium,
    },
    linkSeparator: {
      color: paywall.softText,
      fontSize: SIZES.xs,
    },
    storeNote: {
      color: paywall.softText,
      fontSize: SIZES.xs,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: SPACING.xs,
    },
    alreadyPremiumContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: SPACING.xl,
      paddingRight: SPACING.page,
      paddingBottom: SPACING.xl + insets.bottom,
      paddingLeft: SPACING.page,
    },
    alreadyPremiumCard: {
      width: '100%',
      maxWidth: 440,
      borderRadius: BORDER_RADIUS.hero,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: paywall.heroBorder,
      ...SHADOWS.soft,
      shadowColor: paywall.shadowColor,
      shadowOpacity: isDark ? 0.16 : 0.08,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
      borderCurve: 'continuous',
    },
    alreadyPremiumSurface: {
      borderRadius: BORDER_RADIUS.hero,
      padding: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.md,
      borderCurve: 'continuous',
    },
    premiumBadge: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: paywall.heroIconBackground,
      borderWidth: 1,
      borderColor: paywall.heroIconBorder,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.sm,
      borderCurve: 'continuous',
    },
    alreadyPremiumTitle: {
      fontSize: SIZES.text28,
      lineHeight: 34,
      fontWeight: FONT_WEIGHTS.bold,
      textAlign: 'center',
      color: colors.primaryText,
    },
    alreadyPremiumText: {
      fontSize: SIZES.text15,
      textAlign: 'center',
      color: paywall.softText,
      lineHeight: 22,
    },
    alreadyPremiumActions: {
      width: '100%',
      gap: SPACING.sm,
      marginTop: SPACING.md,
    },
    secondaryButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: paywall.footerBackground,
      borderWidth: 1,
      borderColor: paywall.footerBorder,
      borderCurve: 'continuous',
    },
    secondaryButtonText: {
      color: paywall.softText,
      fontSize: SIZES.text14,
      fontWeight: FONT_WEIGHTS.semiBold,
    },
  });
};
