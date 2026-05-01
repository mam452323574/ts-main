import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import PremiumUpgradeScreen from '@/screens/PremiumUpgradeScreen';
import { i18n, loadLocalesForTests } from '@/i18n/translations';
import { LIGHT_COLORS, getAndroidLightSurface } from '@/constants/theme';

const mockBack = jest.fn();
const mockDismiss = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockLoadPurchasesModule = jest.fn();
const mockResolveEntryOfferOffering = jest.fn();
const mockPurchaseRevenueCatPackage = jest.fn();
const mockRestoreRevenueCatPurchases = jest.fn();
const mockMarkEntryOfferClaimed = jest.fn();
const mockTrackEvent = jest.fn();
const mockTrackFailureEvent = jest.fn();
const mockRefreshUserProfile = jest.fn();
const mockShowAlert = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));
const getStyles = (style: any) => (Array.isArray(style) ? style : [style]);
const originalPlatform = Platform.OS;

jest.mock('lucide-react-native', () => ({
  ChartNoAxesCombined: 'ChartNoAxesCombined',
  ChefHat: 'ChefHat',
  Crown: 'Crown',
  Check: 'Check',
  X: 'X',
  Star: 'Star',
  RefreshCw: 'RefreshCw',
  Compass: 'Compass',
  ShieldCheck: 'ShieldCheck',
  Sparkles: 'Sparkles',
}));

jest.mock('@/components/ModalHandle', () => ({
  ModalHandle: () => 'ModalHandle',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    dismiss: mockDismiss,
    replace: mockReplace,
    push: mockPush,
    canDismiss: mockCanDismiss,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: { id: 'user-1', account_tier: 'free' },
    refreshUserProfile: (...args: unknown[]) => mockRefreshUserProfile(...args),
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => {
    const { i18n: mockI18n } = require('@/i18n/translations');
    return {
      locale: mockI18n.locale,
      t: (key: string, options?: Record<string, unknown>) => String(mockI18n.t(key, options)),
    };
  },
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: unknown[]) => mockShowAlert(...args),
  }),
}));

jest.mock('@/services/purchasesRuntime', () => ({
  loadPurchasesModule: (...args: unknown[]) => mockLoadPurchasesModule(...args),
}));

jest.mock('@/services/growthExperience', () => ({
  markEntryOfferClaimed: (...args: unknown[]) => mockMarkEntryOfferClaimed(...args),
}));

jest.mock('@/services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  trackFailureEvent: (...args: unknown[]) => mockTrackFailureEvent(...args),
}));

jest.mock('@/services/revenueCatOfferings', () => ({
  resolveEntryOfferOffering: (...args: unknown[]) =>
    mockResolveEntryOfferOffering(...args),
  purchaseRevenueCatPackage: (...args: unknown[]) =>
    mockPurchaseRevenueCatPackage(...args),
  restoreRevenueCatPurchases: (...args: unknown[]) =>
    mockRestoreRevenueCatPurchases(...args),
  hasPremiumEntitlement: jest.fn(
    (customerInfo?: { entitlements?: { active?: { premium?: unknown } } }) =>
      Boolean(customerInfo?.entitlements?.active?.premium),
  ),
  isRevenueCatPurchaseCancelledError: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/utils/runtimeCapabilities', () => ({
  getRuntimeCapabilities: () => ({
    canUseNativePurchases: true,
  }),
}));

function buildPackage(
  identifier: string,
  packageType: string,
  price: number,
  priceString: string,
  currencyCode = 'USD',
) {
  return {
    identifier,
    packageType,
    product: {
      identifier: `${identifier}-product`,
      title: `${packageType} Premium`,
      price,
      priceString,
      currencyCode,
    },
  };
}

describe('PremiumUpgradeScreen', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    i18n.locale = 'en';
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    mockUseLocalSearchParams.mockReturnValue({});
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        getOfferings: jest.fn().mockResolvedValue({
          current: {
            identifier: 'default',
            availablePackages: [
              buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99'),
              buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99'),
            ],
          },
          all: {
            default: {
              identifier: 'default',
              availablePackages: [
                buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99'),
                buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99'),
              ],
            },
          },
        }),
      },
    });
    mockResolveEntryOfferOffering.mockResolvedValue(null);
    mockPurchaseRevenueCatPackage.mockResolvedValue({
      customerInfo: {
        entitlements: {
          active: {
            premium: {},
          },
        },
      },
    });
    mockRestoreRevenueCatPurchases.mockResolvedValue({
      entitlements: { active: {} },
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('renders RevenueCat-backed package prices and an honestly derived annual comparison', async () => {
    render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(screen.getByText('$9.99')).toBeTruthy();
      expect(screen.getByText('$79.99')).toBeTruthy();
      expect(screen.getByTestId('premium-card-annual-compared-price')).toBeTruthy();
    });

    expect(screen.getByText('$119.88')).toBeTruthy();
    expect(screen.getByText(String(i18n.t('premium.subscription_page.free_title')))).toBeTruthy();
  });

  it('renders the current Premium benefits without promising unlimited scans', async () => {
    render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(screen.getAllByText(String(i18n.t('premium.subscription_page.prem_feat_coach_quota'))).length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText(String(i18n.t('premium.subscription_page.prem_feat_coach_modes'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(i18n.t('premium.subscription_page.prem_feat_super'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(i18n.t('premium.subscription_page.prem_feat_chef'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(i18n.t('premium.subscription_page.prem_feat_complete_analysis'))).length).toBeGreaterThan(0);
    expect(screen.queryByText(/unlimited scans/i)).toBeNull();
  });

  it('uses Android light shell styling on the highlighted annual package card', async () => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    const annualSurface = getAndroidLightSurface(LIGHT_COLORS, {
      accentColor: LIGHT_COLORS.primary,
      shadowColor: LIGHT_COLORS.primary,
      backgroundAlpha: 0.07,
      borderAlpha: 0.22,
      overlayAlpha: 0.1,
      shadowOpacity: 0.12,
      shadowRadius: 18,
      shadowOffsetY: 8,
      elevation: 4,
    });

    const { getByTestId } = render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(getByTestId('premium-card-annual-shell')).toBeTruthy();
    });

    const annualShellStyles = getStyles(getByTestId('premium-card-annual-shell').props.style);
    const annualSurfaceStyles = getStyles(getByTestId('premium-card-annual-surface').props.style);

    expect(annualShellStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          elevation: 4,
          shadowColor: annualSurface.shadowStyle.shadowColor,
        }),
      ]),
    );
    expect(annualSurfaceStyles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: annualSurface.backgroundColor,
          borderColor: annualSurface.borderColor,
          borderWidth: 2.5,
        }),
      ]),
    );
  });

  it('highlights the routed entry-offer package and tracks purchase analytics on success', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      source: 'entry_offer',
      offeringId: 'entry-offer',
      packageId: '$rc_monthly',
      returnTo: '/(tabs)',
    });
    mockResolveEntryOfferOffering.mockResolvedValue({
      offering: {
        identifier: 'entry-offer',
      },
      selectedPackage: buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99'),
      comparablePackage: null,
      metadata: {},
      headline: 'Private welcome offer',
      subheadline: 'Real store-backed intro',
      badge: 'Welcome offer',
      revealLabel: null,
      claimLabel: null,
      displayPrice: '$9.99',
      billingLabel: 'Billed monthly',
      introLabel: '3 days free trial',
      packageType: 'monthly',
      introEligibility: 'eligible',
      hasIntro: true,
      hasDiscount: false,
      discountPercentage: null,
      canShowPromo: true,
      shouldFallbackToPaywall: false,
      consumeOnFallback: false,
      fallbackReason: null,
    });
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        getOfferings: jest.fn().mockResolvedValue({
          current: {
            identifier: 'default',
            availablePackages: [
              buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99'),
              buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99'),
            ],
          },
          all: {
            'entry-offer': {
              identifier: 'entry-offer',
              availablePackages: [
                buildPackage('$rc_monthly', 'MONTHLY', 9.99, '$9.99'),
                buildPackage('$rc_annual', 'ANNUAL', 79.99, '$79.99'),
              ],
            },
          },
        }),
      },
    });

    render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(screen.getByText('Welcome offer')).toBeTruthy();
      expect(screen.getAllByText('3 days free trial').length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(String(i18n.t('premium.subscription_page.entry_offer_cta'))).length,
      ).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByTestId('premium-card-monthly-cta'));

    await waitFor(() => {
      expect(mockPurchaseRevenueCatPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '$rc_monthly',
        }),
      );
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_purchase_attempt',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
          source: 'entry_offer',
        }),
      );
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_purchase_completed',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
        }),
      );
      expect(mockMarkEntryOfferClaimed).toHaveBeenCalledWith('entry-offer');
      expect(mockInvalidateQueries).toHaveBeenCalled();
      expect(mockRefreshUserProfile).toHaveBeenCalled();
    });
  });

  it('falls back to neutral paywall copy when the routed promo package is unavailable', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      source: 'entry_offer',
      offeringId: 'entry-offer',
      packageId: '$rc_missing',
    });
    mockResolveEntryOfferOffering.mockResolvedValue({
      offering: {
        identifier: 'entry-offer',
      },
      selectedPackage: buildPackage('$rc_missing', 'MONTHLY', 9.99, '$9.99'),
      comparablePackage: null,
      metadata: {},
      headline: null,
      subheadline: 'Stale promo copy',
      badge: 'Welcome offer',
      revealLabel: null,
      claimLabel: null,
      displayPrice: '$9.99',
      billingLabel: 'Billed monthly',
      introLabel: '3 days free trial',
      packageType: 'monthly',
      introEligibility: 'eligible',
      hasIntro: true,
      hasDiscount: false,
      discountPercentage: null,
      canShowPromo: true,
      shouldFallbackToPaywall: false,
      consumeOnFallback: false,
      fallbackReason: null,
    });

    render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(screen.getByText(String(i18n.t('premium.subscription_page.hero_subtitle')))).toBeTruthy();
    });

    expect(screen.queryByText('Welcome offer')).toBeNull();
  });

  it('tracks a sanitized subscription purchase failure', async () => {
    mockPurchaseRevenueCatPackage.mockRejectedValueOnce({
      code: 'purchase_failed',
      status: 502,
      message: 'Internal provider message',
    });

    render(<PremiumUpgradeScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('premium-card-monthly-cta')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('premium-card-monthly-cta'));

    await waitFor(() => {
      expect(mockTrackFailureEvent).toHaveBeenCalledWith(
        'subscription_purchase_failed',
        expect.objectContaining({
          code: 'purchase_failed',
          status: 502,
        }),
        expect.objectContaining({
          package_id: '$rc_monthly',
          package_type: 'MONTHLY',
          source: 'premium_upgrade',
        }),
      );
      expect(mockShowAlert).toHaveBeenCalledWith(
        String(i18n.t('common.error')),
        String(i18n.t('premium.purchase_error_generic')),
      );
    });
  });
});
