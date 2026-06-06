import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversationsPage } from '@/services/coachConversation';
import type {
  CoachConversationInboxItem,
  CoachConversationListPage,
} from '@/shared/coachConversation';
import { type CoachPersonaKey } from '@/shared/coachPersonas';
import { getCoachConversationsInfiniteQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

interface UseInfiniteCoachConversationsOptions {
  includeArchived?: boolean;
  pageSize?: number;
  personaKey?: CoachPersonaKey | null;
  enabled?: boolean;
}

export function useInfiniteCoachConversations(
  options: UseInfiniteCoachConversationsOptions = {},
) {
  const { user } = useAuth();
  const includeArchived = options.includeArchived === true;
  const pageSize = Math.max(1, Math.min(50, options.pageSize ?? 20));
  const personaKey = options.personaKey ?? null;

  const query = useInfiniteQuery<
    CoachConversationListPage,
    CoachServiceError,
    { pages: CoachConversationListPage[]; pageParams: unknown[] },
    ReturnType<typeof getCoachConversationsInfiniteQueryKey>,
    CoachConversationListPage['next_cursor']
  >({
    queryKey: getCoachConversationsInfiniteQueryKey(user?.id, includeArchived, personaKey),
    queryFn: ({ pageParam }) =>
      fetchCoachConversationsPage({
        limit: pageSize,
        cursor: pageParam ?? null,
        include_archived: includeArchived,
        persona_key: personaKey,
      }),
    enabled: !!user?.id && options.enabled !== false,
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    retry: shouldRetryCoachReadQuery,
    staleTime: 30_000,
    // The global Coach inbox must recover from a previously cached empty page
    // as soon as the user comes back from chat or after a new thread is
    // created, even while the cache is still considered fresh.
    refetchOnMount: 'always',
  });

  const items = useMemo<CoachConversationInboxItem[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  return {
    ...query,
    items,
  };
}
