import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversationMessagesPage } from '@/services/coachConversation';
import type { CoachConversationMessage } from '@/shared/coachConversation';
import { getCoachConversationMessagesQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

interface UseCoachConversationMessagesOptions {
  conversationId: string | null | undefined;
  pageSize?: number;
}

interface MessagesPage {
  items: CoachConversationMessage[];
  has_more: boolean;
  next_cursor: { created_at: string; id: string } | null;
}

export function useCoachConversationMessages(
  options: UseCoachConversationMessagesOptions,
) {
  const { user } = useAuth();
  const conversationId = options.conversationId ?? null;
  const pageSize = Math.max(1, Math.min(100, options.pageSize ?? 50));

  const query = useInfiniteQuery<
    MessagesPage,
    CoachServiceError,
    { pages: MessagesPage[]; pageParams: unknown[] },
    ReturnType<typeof getCoachConversationMessagesQueryKey>,
    MessagesPage['next_cursor']
  >({
    queryKey: getCoachConversationMessagesQueryKey(user?.id, conversationId),
    queryFn: ({ pageParam }) =>
      fetchCoachConversationMessagesPage({
        conversationId: conversationId!,
        limit: pageSize,
        cursor: pageParam ?? null,
      }),
    enabled: !!user?.id && !!conversationId,
    initialPageParam: null,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    retry: shouldRetryCoachReadQuery,
    staleTime: 5_000,
  });

  const items = useMemo<CoachConversationMessage[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.items);
  }, [query.data]);

  return {
    ...query,
    items,
  };
}
