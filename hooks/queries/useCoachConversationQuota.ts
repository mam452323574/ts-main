import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversationQuotaStatus } from '@/services/coachConversation';
import type { CoachConversationQuotaStatus } from '@/shared/coachConversation';
import { getCoachConversationQuotaQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

function pickNextRechargeAt(quota: CoachConversationQuotaStatus | undefined) {
  if (!quota) return null;
  // The free rolling window has its own recharge timestamp now. Premium keeps
  // the daily one. Whichever is sooner — and not null — is what we want to
  // wake up on so the counter / banner stays fresh without a manual refresh.
  const candidates: (string | null)[] = [
    quota.free_next_recharge_at ?? null,
    quota.next_recharge_at ?? null,
  ];
  const parsed = candidates
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value)) as number[];
  if (parsed.length === 0) return null;
  return Math.min(...parsed);
}

function getNextRechargeRefetchDelayMs(quota: CoachConversationQuotaStatus | undefined) {
  const nextRechargeMs = pickNextRechargeAt(quota);
  if (nextRechargeMs === null) {
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
