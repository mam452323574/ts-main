import { AccountTier, UserProfile } from '@/types';

type UserProfileWithTier = Pick<UserProfile, 'account_tier'>;
export type PremiumRenderState = 'loading' | 'locked' | 'unlocked';

export function hasPremiumAccess(
  accountTier?: AccountTier | null,
): boolean {
  return accountTier === 'premium' || accountTier === 'admin';
}

export function resolvePremiumRenderState(
  accountTier?: AccountTier | null,
  loading?: boolean,
): PremiumRenderState {
  if (loading || !accountTier) {
    return 'loading';
  }

  return hasPremiumAccess(accountTier) ? 'unlocked' : 'locked';
}

export function hasPremiumAccessFromProfile(
  userProfile?: UserProfileWithTier | null,
  loading?: boolean,
): boolean {
  return resolvePremiumRenderState(userProfile?.account_tier ?? null, loading) === 'unlocked';
}

export function resolvePremiumRenderStateFromProfile(
  userProfile?: UserProfileWithTier | null,
  loading?: boolean,
): PremiumRenderState {
  return resolvePremiumRenderState(userProfile?.account_tier ?? null, loading);
}
