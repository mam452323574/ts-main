import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  CoachServiceError,
  fetchCoachEntryErrorSummary,
  type CoachEntryErrorSummary,
} from '@/services/coach';

export const COACH_ENTRY_ERROR_SUMMARY_QUERY_KEY = [
  'coachEntryErrorSummary',
] as const;
export const getCoachEntryErrorSummaryQueryKey = (
  userId: string | null | undefined,
  entryId: string | null | undefined,
) =>
  [
    ...COACH_ENTRY_ERROR_SUMMARY_QUERY_KEY,
    userId ?? 'anonymous',
    entryId ?? 'none',
  ] as const;

interface UseCoachEntryErrorSummaryOptions {
  entryId: string | null;
  enabled?: boolean;
}

export const useCoachEntryErrorSummary = (
  options: UseCoachEntryErrorSummaryOptions,
) => {
  const { user } = useAuth();
  const entryId = options.entryId;
  const userEnabled = !!user?.id;
  const callerEnabled = options.enabled ?? true;

  return useQuery<CoachEntryErrorSummary | null, CoachServiceError>({
    queryKey: getCoachEntryErrorSummaryQueryKey(user?.id, entryId),
    queryFn: () => fetchCoachEntryErrorSummary(entryId!),
    enabled: userEnabled && callerEnabled && !!entryId,
    staleTime: 30_000,
    retry: false,
  });
};
