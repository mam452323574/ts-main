import {
  hasPremiumAccess,
  hasPremiumAccessFromProfile,
} from '@/utils/subscription';

describe('subscription helpers', () => {
  it('treats premium and admin tiers as premium access', () => {
    expect(hasPremiumAccess('premium')).toBe(true);
    expect(hasPremiumAccess('admin')).toBe(true);
  });

  it('treats free and missing tiers as non-premium access', () => {
    expect(hasPremiumAccess('free')).toBe(false);
    expect(hasPremiumAccess()).toBe(false);
    expect(hasPremiumAccess(null)).toBe(false);
  });

  it('reads premium access from a user profile safely', () => {
    expect(
      hasPremiumAccessFromProfile({ account_tier: 'premium' }),
    ).toBe(true);
    expect(hasPremiumAccessFromProfile({ account_tier: 'admin' })).toBe(true);
    expect(hasPremiumAccessFromProfile({ account_tier: 'free' })).toBe(false);
    expect(hasPremiumAccessFromProfile(null)).toBe(false);
  });
});
