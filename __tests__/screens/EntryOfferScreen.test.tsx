import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import EntryOfferScreen from '@/screens/EntryOfferScreen';

const mockResolveEntryOfferOffering = jest.fn();
const mockFetchRevenueCatCustomerInfo = jest.fn();
const mockMarkEntryOfferShown = jest.fn();
const mockMarkEntryOfferDismissed = jest.fn();
const mockEnsureGrowthExperience = jest.fn();
const mockTrackEvent = jest.fn();
const mockShowAlert = jest.fn();
const mockShouldPresentEntryOffer = jest.fn<any, [any]>(() => true);
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

jest.mock('@/components/Button', () => ({
  Button: ({ title, onPress, disabled, loading }: any) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      { onPress, disabled, accessibilityRole: 'button' },
      ReactLocal.createElement(Text, null, loading ? 'loading' : title),
    );
  },
}));

jest.mock('@/hooks/queries', () => ({
  useFeatureFlags: () => ({
    data: {
      social_enabled: false,
      coach_enabled: false,
      entry_offer_enabled: true,
      social_comments_enabled: false,
      entry_offer_offering_id: 'entry-offer',
      rollout_percentage: 100,
    },
  }),
  useGrowthExperience: () => ({
    data: {
      user_id: 'user-1',
      growth_state: 'entry_offer_ready',
      entry_offer_eligible: true,
      entry_offer_shown_at: null,
      entry_offer_dismissed_at: null,
      entry_offer_claimed_at: null,
      entry_offer_offering_id: 'entry-offer',
      coach_seen_at: null,
      coach_cooldown_until: null,
      growth_state_updated_at: '2026-04-06T08:00:00.000Z',
      updated_at: '2026-04-06T08:00:00.000Z',
    },
  }),
  GROWTH_EXPERIENCE_QUERY_KEY: (userId?: string | null) => [
    'growthExperience',
    userId ?? 'anonymous',
  ],
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    userProfile: {
      id: 'user-1',
      account_tier: 'free',
    },
  }),
}));

jest.mock('@/hooks/useCustomAlert', () => ({
  useCustomAlert: () => ({
    alertElement: null,
    showAlert: (...args: any[]) => mockShowAlert(...args),
  }),
}));

jest.mock('@/components/entryOffer/EntryOfferWheel', () => ({
  EntryOfferWheel: ({
    onSpinStart,
    onSpinEnd,
    testID,
  }: {
    onSpinStart?: () => void;
    onSpinEnd: () => void;
    testID?: string;
  }) => {
    const ReactLocal = require('react');
    const { Pressable, Text } = require('react-native');
    return ReactLocal.createElement(
      Pressable,
      {
        onPress: () => {
          onSpinStart?.();
          onSpinEnd();
        },
        testID: testID ?? 'mock-entry-offer-wheel',
      },
      ReactLocal.createElement(Text, null, 'wheel'),
    );
  },
}));

jest.mock('@/services/analytics', () => ({
  trackEvent: (...args: any[]) => mockTrackEvent(...args),
}));

jest.mock('@/services/growthExperience', () => ({
  ensureGrowthExperience: (...args: any[]) => mockEnsureGrowthExperience(...args),
  markEntryOfferShown: (...args: any[]) => mockMarkEntryOfferShown(...args),
  markEntryOfferDismissed: (...args: any[]) => mockMarkEntryOfferDismissed(...args),
  shouldPresentEntryOffer: (input: any) => mockShouldPresentEntryOffer(input),
}));

jest.mock('@/services/revenueCatOfferings', () => ({
  resolveEntryOfferOffering: (...args: any[]) =>
    mockResolveEntryOfferOffering(...args),
  fetchRevenueCatCustomerInfo: (...args: any[]) =>
    mockFetchRevenueCatCustomerInfo(...args),
  hasPremiumEntitlement: jest.fn(
    (customerInfo?: { entitlements?: { active?: { premium?: unknown } } }) =>
      Boolean(customerInfo?.entitlements?.active?.premium),
  ),
}));

describe('EntryOfferScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldPresentEntryOffer.mockReturnValue(true);
    mockEnsureGrowthExperience.mockResolvedValue({
      entry_offer_shown_at: null,
    });
    mockFetchRevenueCatCustomerInfo.mockResolvedValue({
      entitlements: { active: {} },
    });
  });

  it('reveals the offer, tracks analytics, and hands off to the premium paywall', async () => {
    mockResolveEntryOfferOffering.mockResolvedValue({
      offering: {
        identifier: 'entry-offer',
      },
      selectedPackage: {
        identifier: '$rc_monthly',
        packageType: 'MONTHLY',
        product: {
          priceString: '$9.99',
        },
      },
      metadata: {},
      headline: 'Private welcome offer',
      subheadline: 'Live RevenueCat copy',
      badge: 'Secret offer',
      revealLabel: null,
      claimLabel: 'See this plan',
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

    const screen = render(<EntryOfferScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('entry-offer-wheel')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockMarkEntryOfferShown).toHaveBeenCalledWith('entry-offer');
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_shown',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
          source: 'entry_offer',
        }),
      );
    });

    fireEvent.press(screen.getByTestId('entry-offer-wheel'));
    fireEvent.press(screen.getByText('See this plan'));

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_spin',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
        }),
      );
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_result',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
          has_intro: true,
        }),
      );
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_paywall_open',
        expect.objectContaining({
          offering_id: 'entry-offer',
          package_id: '$rc_monthly',
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/premium-upgrade',
        params: {
          source: 'entry_offer',
          offeringId: 'entry-offer',
          packageId: '$rc_monthly',
          returnTo: '/(tabs)',
        },
      });
    });
  });

  it('auto-falls back to the standard paywall when the promo cannot be represented honestly', async () => {
    mockResolveEntryOfferOffering.mockResolvedValue({
      offering: {
        identifier: 'entry-offer',
      },
      selectedPackage: {
        identifier: '$rc_monthly',
        packageType: 'MONTHLY',
        product: {
          priceString: '$9.99',
        },
      },
      metadata: {},
      headline: null,
      subheadline: null,
      badge: null,
      revealLabel: null,
      claimLabel: null,
      displayPrice: '$9.99',
      billingLabel: null,
      introLabel: null,
      packageType: 'monthly',
      introEligibility: 'ineligible',
      hasIntro: false,
      hasDiscount: false,
      discountPercentage: null,
      canShowPromo: false,
      shouldFallbackToPaywall: true,
      consumeOnFallback: true,
      fallbackReason: 'intro_ineligible',
    });

    render(<EntryOfferScreen />);

    await waitFor(() => {
      expect(mockMarkEntryOfferShown).toHaveBeenCalledWith('entry-offer');
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_paywall_open',
        expect.objectContaining({
          fallback_reason: 'intro_ineligible',
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/premium-upgrade',
        params: {
          source: 'entry_offer',
          offeringId: 'entry-offer',
          packageId: '$rc_monthly',
          returnTo: '/(tabs)',
        },
      });
    });
  });

  it('shows a safe fallback state when the offering cannot be resolved', async () => {
    mockResolveEntryOfferOffering.mockResolvedValue(null);

    const screen = render(<EntryOfferScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('entry-offer-fallback-state')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Ouvrir les formules premium'));

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'entry_offer_paywall_open',
        expect.objectContaining({
          source: 'entry_offer',
        }),
      );
      expect(mockReplace).toHaveBeenCalled();
    });
  });
});
