import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError, fetchCoachEntries } from '@/services/coach';
import type { CoachEntry } from '@/types';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_ENTRIES_QUERY_KEY = ['coachEntries'] as const;
export const getCoachEntriesQueryKey = (
  userId?: string | null,
  limit?: number | null,
) => [
  ...COACH_ENTRIES_QUERY_KEY,
  userId ?? 'anonymous',
  typeof limit === 'number' ? limit : 'all',
] as const;
export const COACH_PENDING_ENTRY_POLL_INTERVAL_MS = 2000;
const SHOULD_DEBUG_COACH_ENTRIES =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.NODE_ENV !== 'test';

interface UseCoachEntriesOptions {
  trackedEntryId?: string | null;
  limit?: number;
}

export const useCoachEntries = (options: UseCoachEntriesOptions = {}) => {
  const trackedEntryId = options.trackedEntryId ?? null;
  const limit = options.limit;
  const { user } = useAuth();

  const query = useQuery<CoachEntry[], CoachServiceError>({
    queryKey: getCoachEntriesQueryKey(user?.id, limit),
    queryFn: () => fetchCoachEntries(limit),
    enabled: !!user?.id,
    staleTime: trackedEntryId ? 0 : 1000 * 60,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
    refetchInterval: (query) => {
      if (!trackedEntryId) {
        return false;
      }

      const entries = Array.isArray(query.state.data) ? query.state.data : [];
      const trackedEntry = entries.find((entry) => entry.id === trackedEntryId);
      const nextPollMs =
        !trackedEntry ||
        (trackedEntry.status ?? 'pending') === 'pending'
          ? COACH_PENDING_ENTRY_POLL_INTERVAL_MS
          : false;

      if (SHOULD_DEBUG_COACH_ENTRIES) {
        console.log('[CoachEntries] poll decision', {
          tracked_entry_id: trackedEntryId,
          tracked_status: trackedEntry?.status ?? (!trackedEntry ? 'missing' : 'unknown'),
          next_poll_ms: nextPollMs,
        });
      }

      return nextPollMs;
    },
  });

  useEffect(() => {
    if (!SHOULD_DEBUG_COACH_ENTRIES || !trackedEntryId) {
      return;
    }

    const entries = Array.isArray(query.data) ? query.data : [];
    const trackedEntry = entries.find((entry) => entry.id === trackedEntryId) ?? null;

    console.log('[CoachEntries] tracked entry snapshot', {
      tracked_entry_id: trackedEntryId,
      tracked_status: trackedEntry?.status ?? (!trackedEntry ? 'missing' : 'unknown'),
      is_fetching: query.isFetching,
      data_updated_at: query.dataUpdatedAt,
    });
  }, [query.data, query.dataUpdatedAt, query.isFetching, trackedEntryId]);

  return query;
};
