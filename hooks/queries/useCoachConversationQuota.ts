import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversationQuotaStatus } from '@/services/coachConversation';
import type { CoachConversationQuotaStatus } from '@/shared/coachConversation';
import { getCoachConversationQuotaQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

function getNextRechargeRefetchDelayMs(quota: CoachConversationQuotaStatus | undefined) {
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

export function useCoachConversationQuota() {
  const { user } = useAuth();

  return useQuery<CoachConversationQuotaStatus, CoachServiceError>({
    queryKey: getCoachConversationQuotaQueryKey(user?.id),
    queryFn: fetchCoachConversationQuotaStatus,
    enabled: !!user?.id,
    staleTime: 15_000,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
    refetchInterval: (query) => getNextRechargeRefetchDelayMs(query.state.data),
  });
}
