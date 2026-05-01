import { Platform } from 'react-native';

import { loadPurchasesModule } from './purchasesRuntime';

import { i18n } from '@/i18n/translations';
import { logOperationalError } from '@/utils/observability';
import { hasPremiumAccess } from '@/utils/subscription';
import type { AccountTier } from '@/types';
import type {
  CustomerInfo,
  IntroEligibility,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

type IntroEligibilityStatus =
  | 'eligible'
  | 'ineligible'
  | 'not_available'
  | 'unknown';

export type EntryOfferFallbackReason =
  | 'missing_offering_id'
  | 'revenuecat_unavailable'
  | 'offerings_fetch_failed'
  | 'offering_not_found'
  | 'no_available_package'
  | 'intro_ineligible'
  | 'no_promotional_value';

export interface ResolvedEntryOfferOffering {
  offering: PurchasesOffering | null;
  selectedPackage: PurchasesPackage | null;
  comparablePackage: PurchasesPackage | null;
  metadata: Record<string, unknown>;
  headline: string | null;
  subheadline: string | null;
  badge: string | null;
  revealLabel: string | null;
  claimLabel: string | null;
  displayPrice: string | null;
  billingLabel: string | null;
  introLabel: string | null;
  packageType: string | null;
  introEligibility: IntroEligibilityStatus;
  hasIntro: boolean;
  hasDiscount: boolean;
  discountPercentage: number | null;
  canShowPromo: boolean;
  shouldFallbackToPaywall: boolean;
  consumeOnFallback: boolean;
  fallbackReason: EntryOfferFallbackReason | null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatPeriodUnit(unit: string | null, count: number) {
  const normalizedUnit = unit?.toLowerCase() ?? 'day';

  switch (normalizedUnit) {
    case 'day':
      return count === 1
        ? String(i18n.t('entry_offer.unit.day_one'))
        : String(i18n.t('entry_offer.unit.day_other'));
    case 'week':
      return count === 1
        ? String(i18n.t('entry_offer.unit.week_one'))
        : String(i18n.t('entry_offer.unit.week_other'));
    case 'month':
      return count === 1
        ? String(i18n.t('entry_offer.unit.month_one'))
        : String(i18n.t('entry_offer.unit.month_other'));
    case 'year':
      return count === 1
        ? String(i18n.t('entry_offer.unit.year_one'))
        : String(i18n.t('entry_offer.unit.year_other'));
    default:
      return count === 1
        ? String(i18n.t('entry_offer.unit.day_one'))
        : String(i18n.t('entry_offer.unit.day_other'));
  }
}

function formatDurationLabel(count: number, unit: string | null) {
  return String(
    i18n.t('entry_offer.duration_label', {
      count,
      unit: formatPeriodUnit(unit, count),
    }),
  );
}

function formatBillingLabel(targetPackage: PurchasesPackage | null) {
  switch (targetPackage?.packageType) {
    case 'MONTHLY':
      return String(i18n.t('entry_offer.billing.monthly'));
    case 'ANNUAL':
      return String(i18n.t('entry_offer.billing.annual'));
    case 'WEEKLY':
      return String(i18n.t('entry_offer.billing.weekly'));
    case 'SIX_MONTH':
      return String(i18n.t('entry_offer.billing.six_month'));
    case 'THREE_MONTH':
      return String(i18n.t('entry_offer.billing.three_month'));
    case 'TWO_MONTH':
      return String(i18n.t('entry_offer.billing.two_month'));
    default:
      return null;
  }
}

function resolvePreferredPackage(
  offering: PurchasesOffering,
  metadata: Record<string, unknown>,
) {
  const preferredIdentifier =
    readMetadataString(metadata, 'entry_offer_package_identifier') ??
    readMetadataString(metadata, 'package_identifier');

  if (preferredIdentifier) {
    const matchingPackage = offering.availablePackages.find(
      (pack) => pack.identifier === preferredIdentifier,
    );
    if (matchingPackage) {
      return matchingPackage;
    }
  }

  return offering.availablePackages[0] ?? null;
}

function findComparablePackage(
  targetOffering: PurchasesOffering,
  targetPackage: PurchasesPackage,
  currentOffering: PurchasesOffering | null,
) {
  if (!currentOffering) {
    return null;
  }

  const comparableCandidates = [
    ...currentOffering.availablePackages.filter(
      (pack) => pack.product.identifier === targetPackage.product.identifier,
    ),
    ...currentOffering.availablePackages.filter(
      (pack) => pack.identifier === targetPackage.identifier,
    ),
    ...currentOffering.availablePackages.filter(
      (pack) => pack.packageType === targetPackage.packageType,
    ),
  ];

  const firstComparable = comparableCandidates.find(Boolean) ?? null;

  if (!firstComparable) {
    return null;
  }

  if (
    targetOffering.identifier === currentOffering.identifier &&
    firstComparable.product.identifier === targetPackage.product.identifier
  ) {
    return firstComparable;
  }

  return firstComparable;
}

function resolveDiscountPercentage(
  targetPackage: PurchasesPackage,
  comparablePackage: PurchasesPackage | null,
) {
  if (!comparablePackage) {
    return null;
  }

  if (
    comparablePackage.product.currencyCode !== targetPackage.product.currencyCode ||
    comparablePackage.product.price <= targetPackage.product.price
  ) {
    return null;
  }

  const discountRatio =
    (comparablePackage.product.price - targetPackage.product.price) /
    comparablePackage.product.price;

  return Math.max(1, Math.round(discountRatio * 100));
}

function normalizeIntroEligibilityStatus(
  eligibility: IntroEligibility | null | undefined,
  hasOffer: boolean,
): IntroEligibilityStatus {
  if (!hasOffer) {
    return 'not_available';
  }

  const status = eligibility?.status;
  if (typeof status !== 'number') {
    return 'unknown';
  }

  switch (status) {
    case 1:
      return 'ineligible';
    case 2:
      return 'eligible';
    case 3:
      return 'not_available';
    default:
      return 'unknown';
  }
}

function resolveIOSIntroLabel(
  product: PurchasesStoreProduct,
  introEligibility: IntroEligibilityStatus,
) {
  const introPrice = product.introPrice;
  if (!introPrice) {
    return {
      introLabel: null,
      hasIntro: false,
    };
  }

  const durationLabel = formatDurationLabel(
    introPrice.cycles * introPrice.periodNumberOfUnits,
    introPrice.periodUnit,
  );

  if (introPrice.price === 0) {
    return {
      introLabel:
        introEligibility === 'eligible'
          ? String(
              i18n.t('entry_offer.intro.free_trial', {
                duration: durationLabel,
              }),
            )
          : null,
      hasIntro: introEligibility === 'eligible',
    };
  }

  return {
    introLabel:
      introEligibility === 'eligible'
        ? String(
            i18n.t('entry_offer.intro.discounted_period', {
              duration: durationLabel,
              price: introPrice.priceString,
            }),
          )
        : null,
    hasIntro: introEligibility === 'eligible',
  };
}

function resolveAndroidIntroLabel(product: PurchasesStoreProduct) {
  const subscriptionOption =
    product.defaultOption ?? product.subscriptionOptions?.[0] ?? null;

  if (!subscriptionOption) {
    return {
      introLabel: null,
      introEligibility: 'unknown' as IntroEligibilityStatus,
      hasIntro: false,
    };
  }

  if (subscriptionOption.freePhase) {
    const durationLabel = formatDurationLabel(
      subscriptionOption.freePhase.billingPeriod.value,
      subscriptionOption.freePhase.billingPeriod.unit,
    );

    return {
      introLabel: String(
        i18n.t('entry_offer.intro.free_trial_if_eligible', {
          duration: durationLabel,
        }),
      ),
      introEligibility: 'unknown' as IntroEligibilityStatus,
      hasIntro: true,
    };
  }

  if (subscriptionOption.introPhase) {
    const durationLabel = formatDurationLabel(
      subscriptionOption.introPhase.billingPeriod.value,
      subscriptionOption.introPhase.billingPeriod.unit,
    );

    return {
      introLabel: String(
        i18n.t('entry_offer.intro.discounted_period_if_eligible', {
          duration: durationLabel,
          price: subscriptionOption.introPhase.price.formatted,
        }),
      ),
      introEligibility: 'unknown' as IntroEligibilityStatus,
      hasIntro: true,
    };
  }

  return {
    introLabel: null,
    introEligibility: 'not_available' as IntroEligibilityStatus,
    hasIntro: false,
  };
}

function buildResolvedOfferingBase(
  overrides: Partial<ResolvedEntryOfferOffering> = {},
): ResolvedEntryOfferOffering {
  return {
    offering: null,
    selectedPackage: null,
    comparablePackage: null,
    metadata: {},
    headline: null,
    subheadline: null,
    badge: null,
    revealLabel: null,
    claimLabel: null,
    displayPrice: null,
    billingLabel: null,
    introLabel: null,
    packageType: null,
    introEligibility: 'unknown',
    hasIntro: false,
    hasDiscount: false,
    discountPercentage: null,
    canShowPromo: false,
    shouldFallbackToPaywall: false,
    consumeOnFallback: false,
    fallbackReason: null,
    ...overrides,
  };
}

export async function resolveEntryOfferOffering(
  offeringId: string | null,
): Promise<ResolvedEntryOfferOffering | null> {
  if (!offeringId) {
    return buildResolvedOfferingBase({
      fallbackReason: 'missing_offering_id',
    });
  }

  const purchasesModule = await loadPurchasesModule();
  if (!purchasesModule) {
    return buildResolvedOfferingBase({
      fallbackReason: 'revenuecat_unavailable',
    });
  }

  let offerings;
  try {
    offerings = await purchasesModule.default.getOfferings();
  } catch (error) {
    logOperationalError('[EntryOffer] Failed to fetch RevenueCat offerings', error, {
      offering_id: offeringId ?? undefined,
    });
    return buildResolvedOfferingBase({
      fallbackReason: 'offerings_fetch_failed',
    });
  }

  const offering =
    offerings.all?.[offeringId] ??
    (offerings.current?.identifier === offeringId ? offerings.current : null);

  if (!offering) {
    return buildResolvedOfferingBase({
      fallbackReason: 'offering_not_found',
    });
  }

  const metadata = offering.metadata ?? {};
  const selectedPackage = resolvePreferredPackage(offering, metadata);
  if (!selectedPackage) {
    return buildResolvedOfferingBase({
      offering,
      metadata,
      headline: readMetadataString(metadata, 'entry_offer_headline'),
      subheadline: readMetadataString(metadata, 'entry_offer_subheadline'),
      badge: readMetadataString(metadata, 'entry_offer_badge'),
      revealLabel: readMetadataString(metadata, 'entry_offer_reveal_label'),
      claimLabel: readMetadataString(metadata, 'entry_offer_claim_label'),
      shouldFallbackToPaywall: true,
      consumeOnFallback: true,
      fallbackReason: 'no_available_package',
    });
  }

  const comparablePackage = findComparablePackage(
    offering,
    selectedPackage,
    offerings.current ?? null,
  );
  const discountPercentage = resolveDiscountPercentage(
    selectedPackage,
    comparablePackage,
  );
  const hasDiscount = discountPercentage !== null;

  const headline = readMetadataString(metadata, 'entry_offer_headline');
  const subheadline = readMetadataString(metadata, 'entry_offer_subheadline');
  const badge = readMetadataString(metadata, 'entry_offer_badge');
  const revealLabel = readMetadataString(metadata, 'entry_offer_reveal_label');
  const claimLabel = readMetadataString(metadata, 'entry_offer_claim_label');
  const packageType = selectedPackage.packageType.toLowerCase();
  const displayPrice = selectedPackage.product.priceString;
  const billingLabel = formatBillingLabel(selectedPackage);

  const hasIOSIntroOffer = selectedPackage.product.introPrice != null;
  let introEligibility: IntroEligibilityStatus = 'not_available';
  let introLabel: string | null = null;
  let hasIntro = false;

  if (Platform.OS === 'ios') {
    const trialEligibility =
      hasIOSIntroOffer
        ? await purchasesModule.default
            .checkTrialOrIntroductoryPriceEligibility([
              selectedPackage.product.identifier,
            ])
            .then(
              (eligibilityMap) => eligibilityMap?.[selectedPackage.product.identifier],
            )
            .catch((error) => {
              logOperationalError(
                '[EntryOffer] Failed to fetch iOS intro eligibility',
                error,
                {
                  product_id: selectedPackage.product.identifier,
                },
              );
              return null;
            })
        : null;

    introEligibility = normalizeIntroEligibilityStatus(
      trialEligibility,
      hasIOSIntroOffer,
    );

    const iosIntro = resolveIOSIntroLabel(
      selectedPackage.product,
      introEligibility,
    );
    introLabel = iosIntro.introLabel;
    hasIntro = iosIntro.hasIntro;
  } else if (Platform.OS === 'android') {
    const androidIntro = resolveAndroidIntroLabel(selectedPackage.product);
    introEligibility = androidIntro.introEligibility;
    introLabel = androidIntro.introLabel;
    hasIntro = androidIntro.hasIntro;
  } else {
    introEligibility = hasIOSIntroOffer ? 'unknown' : 'not_available';
  }

  const canShowPromo = hasIntro || hasDiscount;
  const fallbackReason =
    canShowPromo
      ? null
      : introEligibility === 'ineligible'
        ? 'intro_ineligible'
        : 'no_promotional_value';

  return buildResolvedOfferingBase({
    offering,
    selectedPackage,
    comparablePackage,
    metadata,
    headline,
    subheadline,
    badge,
    revealLabel,
    claimLabel,
    displayPrice,
    billingLabel,
    introLabel,
    packageType,
    introEligibility,
    hasIntro,
    hasDiscount,
    discountPercentage,
    canShowPromo,
    shouldFallbackToPaywall: !canShowPromo,
    consumeOnFallback: !canShowPromo,
    fallbackReason,
  });
}

export function hasPremiumEntitlement(customerInfo: CustomerInfo | null | undefined) {
  return typeof customerInfo?.entitlements?.active?.premium !== 'undefined';
}

export function shouldSkipEntryOfferForAccount(accountTier?: AccountTier | null) {
  return hasPremiumAccess(accountTier);
}

export async function fetchRevenueCatCustomerInfo() {
  const purchasesModule = await loadPurchasesModule();
  if (!purchasesModule) {
    return null;
  }

  try {
    return await purchasesModule.default.getCustomerInfo();
  } catch (error) {
    logOperationalError('[RevenueCat] Failed to fetch customer info', error);
    return null;
  }
}

export async function purchaseRevenueCatPackage(selectedPackage: PurchasesPackage) {
  const purchasesModule = await loadPurchasesModule();
  if (!purchasesModule) {
    throw new Error('RevenueCat is not available on this runtime');
  }

  return purchasesModule.default.purchasePackage(selectedPackage);
}

export async function restoreRevenueCatPurchases() {
  const purchasesModule = await loadPurchasesModule();
  if (!purchasesModule) {
    throw new Error('RevenueCat is not available on this runtime');
  }

  return purchasesModule.default.restorePurchases();
}

export async function isRevenueCatPurchaseCancelledError(error: unknown) {
  const purchasesModule = await loadPurchasesModule();
  if (!purchasesModule) {
    return false;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code ===
      purchasesModule.default.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}
