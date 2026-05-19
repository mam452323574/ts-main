import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversationsPage } from '@/services/coachConversation';
import type {
  CoachConversation,
  CoachConversationListPage,
} from '@/shared/coachConversation';
import { getCoachConversationsInfiniteQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

interface UseInfiniteCoachConversationsOptions {
  includeArchived?: boolean;
  pageSize?: number;
}

export function useInfiniteCoachConversations(
  options: UseInfiniteCoachConversationsOptions = {},
) {
  const { user } = useAuth();
  const includeArchived = options.includeArchived === true;
  const pageSize = Math.max(1, Math.min(50, options.pageSize ?? 20));

  const query = useInfiniteQuery<
    CoachConversationListPage,
    CoachServiceError,
    { pages: CoachConversationListPage[]; pageParams: unknown[] },
    ReturnType<typeof getCoachConversationsInfiniteQueryKey>,
    CoachConversationListPage['next_cursor']
  >({
    queryKey: getCoachConversationsInfiniteQueryKey(user?.id, includeArchived),
    queryFn: ({ pageParam }) =>
      fetchCoachConversationsPage({
        limit: pageSize,
        cursor: pageParam ?? null,
        include_archived: includeArchived,
      }),
    enabled: !!user?.id,
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    retry: shouldRetryCoachReadQuery,
    staleTime: 30_000,
  });

  const items = useMemo<CoachConversation[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  return {
    ...query,
    items,
  };
}
