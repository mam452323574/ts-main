import type { AccountTier } from '@/types';

function clampRolloutPercentage(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(value)));
}

export function getDeterministicRolloutBucket(userId: string) {
  let hash = 0;

  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }

  return hash % 100;
}

export function isRolloutEnabledForUser(options: {
  userId?: string | null;
  accountTier?: AccountTier | null;
  rolloutPercentage?: number | null;
}) {
  if (options.accountTier === 'admin') {
    return true;
  }

  if (!options.userId) {
    return false;
  }

  const rolloutPercentage = clampRolloutPercentage(options.rolloutPercentage);
  if (rolloutPercentage <= 0) {
    return false;
  }

  if (rolloutPercentage >= 100) {
    return true;
  }

  return getDeterministicRolloutBucket(options.userId) < rolloutPercentage;
}
