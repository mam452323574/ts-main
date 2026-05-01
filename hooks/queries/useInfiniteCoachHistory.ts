import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import {
  type CoachServiceError,
  fetchCoachHistoryPage,
  type CoachHistoryPage,
} from '@/services/coach';
import { flattenCoachHistoryPages } from '@/utils/coachHistory';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_HISTORY_INFINITE_QUERY_KEY = ['coachHistoryInfinite'] as const;

export const getCoachHistoryInfiniteQueryKey = (
  userId?: string | null,
  excludeEntryId?: string | null,
  pageSize = 10,
) =>
  [
    ...COACH_HISTORY_INFINITE_QUERY_KEY,
    userId ?? 'anonymous',
    excludeEntryId ?? null,
    pageSize,
  ] as const;

interface UseInfiniteCoachHistoryOptions {
  excludeEntryId?: string | null;
  pageSize?: number;
}

export function useInfiniteCoachHistory(
  options: UseInfiniteCoachHistoryOptions = {},
) {
  const excludeEntryId = options.excludeEntryId ?? null;
  const pageSize = options.pageSize ?? 10;
  const { user } = useAuth();

  const query = useInfiniteQuery<
    CoachHistoryPage,
    CoachServiceError,
    InfiniteData<CoachHistoryPage>,
    ReturnType<typeof getCoachHistoryInfiniteQueryKey>,
    string | null
  >({
    queryKey: getCoachHistoryInfiniteQueryKey(user?.id, excludeEntryId, pageSize),
    queryFn: ({ pageParam }) =>
      fetchCoachHistoryPage({
        limit: pageSize,
        cursor: pageParam,
        excludeEntryId,
      }),
    enabled: !!user?.id,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 1000 * 60,
    retry: shouldRetryCoachReadQuery,
  });

  return {
    ...query,
    items: flattenCoachHistoryPages(query.data?.pages),
  };
}
