import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachUnifiedHistoryPage } from '@/services/coachHistorySoftDelete';
import type {
  CoachUnifiedHistoryCursor,
  CoachUnifiedHistoryItem,
  CoachUnifiedHistoryPage,
} from '@/shared/coachHistory';
import { getCoachUnifiedHistoryItemKey } from '@/shared/coachHistory';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

export const COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY = [
  'coachUnifiedHistoryInfinite',
] as const;

export const getCoachUnifiedHistoryInfiniteQueryKey = (
  userId?: string | null,
  includeHidden?: boolean,
  pageSize = 20,
) =>
  [
    ...COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY,
    userId ?? 'anonymous',
    includeHidden ? 'with_hidden' : 'visible_only',
    pageSize,
  ] as const;

interface UseInfiniteCoachUnifiedHistoryOptions {
  includeHidden?: boolean;
  pageSize?: number;
}

export function useInfiniteCoachUnifiedHistory(
  options: UseInfiniteCoachUnifiedHistoryOptions = {},
) {
  const includeHidden = options.includeHidden === true;
  const pageSize = Math.max(1, Math.min(50, options.pageSize ?? 20));
  const { user } = useAuth();

  const query = useInfiniteQuery<
    CoachUnifiedHistoryPage,
    CoachServiceError,
    InfiniteData<CoachUnifiedHistoryPage>,
    ReturnType<typeof getCoachUnifiedHistoryInfiniteQueryKey>,
    CoachUnifiedHistoryCursor | null
  >({
    queryKey: getCoachUnifiedHistoryInfiniteQueryKey(user?.id, includeHidden, pageSize),
    queryFn: ({ pageParam }) =>
      fetchCoachUnifiedHistoryPage({
        limit: pageSize,
        cursor: pageParam ?? null,
        includeHidden,
      }),
    enabled: !!user?.id,
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    staleTime: 30_000,
    retry: shouldRetryCoachReadQuery,
  });

  const items = useMemo<CoachUnifiedHistoryItem[]>(() => {
    if (!query.data) return [];
    const seen = new Set<string>();
    const flat: CoachUnifiedHistoryItem[] = [];
    for (const page of query.data.pages) {
      for (const item of page.items) {
        const key = getCoachUnifiedHistoryItemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        flat.push(item);
      }
    }
    return flat;
  }, [query.data]);

  return {
    ...query,
    items,
  };
}
