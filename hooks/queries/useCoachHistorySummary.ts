import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  type CoachServiceError,
  fetchCoachHistorySummary,
  type CoachHistorySummary,
} from '@/services/coach';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_HISTORY_SUMMARY_QUERY_KEY = ['coachHistorySummary'] as const;

export const getCoachHistorySummaryQueryKey = (
  userId?: string | null,
  excludeEntryId?: string | null,
) => [...COACH_HISTORY_SUMMARY_QUERY_KEY, userId ?? 'anonymous', excludeEntryId ?? null] as const;

interface UseCoachHistorySummaryOptions {
  excludeEntryId?: string | null;
}

export function useCoachHistorySummary(
  options: UseCoachHistorySummaryOptions = {},
) {
  const excludeEntryId = options.excludeEntryId ?? null;
  const { user } = useAuth();

  return useQuery<CoachHistorySummary, CoachServiceError>({
    queryKey: getCoachHistorySummaryQueryKey(user?.id, excludeEntryId),
    queryFn: () => fetchCoachHistorySummary({ excludeEntryId }),
    enabled: !!user?.id,
    staleTime: 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
  });
}
