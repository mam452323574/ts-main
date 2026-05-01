import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  CoachServiceError,
  fetchCoachQuotaStatus,
} from '@/services/coach';
import type { CoachQuotaStatus } from '@/types';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_QUOTA_QUERY_KEY = ['coachQuota'] as const;

export const getCoachQuotaQueryKey = (userId?: string | null) => [
  ...COACH_QUOTA_QUERY_KEY,
  userId ?? 'anonymous',
] as const;

function getNextRechargeRefetchDelayMs(quota: CoachQuotaStatus | undefined) {
  if (!quota?.next_recharge_at) {
    return false;
  }

  const nextRechargeMs = Date.parse(quota.next_recharge_at);
  if (!Number.isFinite(nextRechargeMs)) {
    return false;
  }

  const delayMs = nextRechargeMs - Date.now() + 1000;
  if (delayMs <= 0) {
    return 1000;
  }

  return Math.min(delayMs, 2_147_483_647);
}

export function useCoachQuota() {
  const { user } = useAuth();

  return useQuery<CoachQuotaStatus, CoachServiceError>({
    queryKey: getCoachQuotaQueryKey(user?.id),
    queryFn: fetchCoachQuotaStatus,
    enabled: !!user?.id,
    staleTime: 15_000,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
    refetchInterval: (query) =>
      getNextRechargeRefetchDelayMs(query.state.data),
  });
}
