import { shouldPresentEntryOffer } from '@/services/growthExperience';

describe('growth experience helpers', () => {
  const baseFlags = {
    entry_offer_enabled: true,
    entry_offer_offering_id: 'entry-offer',
    rollout_percentage: 100,
  };

  const baseGrowthExperience = {
    user_id: 'user-1',
    growth_state: 'entry_offer_ready' as const,
    entry_offer_eligible: true,
    entry_offer_shown_at: null,
    entry_offer_dismissed_at: null,
    entry_offer_claimed_at: null,
    entry_offer_offering_id: 'entry-offer',
    coach_seen_at: null,
    coach_cooldown_until: null,
    growth_state_updated_at: '2026-04-06T08:00:00.000Z',
    updated_at: '2026-04-06T08:00:00.000Z',
  };

  it('returns true only once before the entry offer has been shown', () => {
    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: baseGrowthExperience,
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
      }),
    ).toBe(true);

    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: {
          ...baseGrowthExperience,
          entry_offer_shown_at: '2026-04-06T09:00:00.000Z',
        },
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
      }),
    ).toBe(false);
  });

  it('skips premium users even when the growth row is eligible', () => {
    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: baseGrowthExperience,
        userProfile: {
          id: 'user-1',
          account_tier: 'premium',
        },
      }),
    ).toBe(false);
  });

  it('skips users with an active premium entitlement even if their profile is still free', () => {
    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: baseGrowthExperience,
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
        hasActiveEntitlement: true,
      }),
    ).toBe(false);
  });

  it('fails closed when the RevenueCat offering id is missing', () => {
    expect(
      shouldPresentEntryOffer({
        featureFlags: {
          ...baseFlags,
          entry_offer_offering_id: null,
        },
        growthExperience: baseGrowthExperience,
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
      }),
    ).toBe(false);
  });

  it('does not present the offer after dismissal or claim', () => {
    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: {
          ...baseGrowthExperience,
          entry_offer_dismissed_at: '2026-04-06T09:00:00.000Z',
        },
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
      }),
    ).toBe(false);

    expect(
      shouldPresentEntryOffer({
        featureFlags: baseFlags,
        growthExperience: {
          ...baseGrowthExperience,
          entry_offer_claimed_at: '2026-04-06T09:00:00.000Z',
        },
        userProfile: {
          id: 'user-1',
          account_tier: 'free',
        },
      }),
    ).toBe(false);
  });
});
