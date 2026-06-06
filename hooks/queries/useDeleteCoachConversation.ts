import { InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import {
  deleteCoachConversation,
  restoreCoachConversation,
} from '@/services/coachHistorySoftDelete';
import type { CoachConversationListPage } from '@/shared/coachConversation';
import type { CoachUnifiedHistoryPage } from '@/shared/coachHistory';
import {
  COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  getCoachConversationQueryKey,
} from './coachConversationQueryKeys';
import { COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY } from './useInfiniteCoachUnifiedHistory';

interface UseDeleteCoachConversationVariables {
  conversationId: string;
}

interface DeleteConversationMutationContext {
  unifiedSnapshots: Array<[readonly unknown[], InfiniteData<CoachUnifiedHistoryPage> | undefined]>;
  conversationsSnapshots: Array<[readonly unknown[], InfiniteData<CoachConversationListPage> | undefined]>;
}

function removeConversationFromUnifiedPages(
  data: InfiniteData<CoachUnifiedHistoryPage> | undefined,
  conversationId: string,
): InfiniteData<CoachUnifiedHistoryPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter(
        (item) => !(item.kind === 'conversation' && item.id === conversationId),
      ),
    })),
  };
}

function removeConversationFromConversationsPages(
  data: InfiniteData<CoachConversationListPage> | undefined,
  conversationId: string,
): InfiniteData<CoachConversationListPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== conversationId),
    })),
  };
}

export function useDeleteCoachConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<
    void,
    CoachServiceError,
    UseDeleteCoachConversationVariables,
    DeleteConversationMutationContext
  >({
    mutationFn: ({ conversationId }) => deleteCoachConversation(conversationId),
    onMutate: async ({ conversationId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.cancelQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
      ]);

      const unifiedSnapshots = queryClient.getQueriesData<
        InfiniteData<CoachUnifiedHistoryPage>
      >({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY });
      const conversationsSnapshots = queryClient.getQueriesData<
        InfiniteData<CoachConversationListPage>
      >({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY });

      queryClient.setQueriesData<InfiniteData<CoachUnifiedHistoryPage>>(
        { queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY },
        (data) => removeConversationFromUnifiedPages(data, conversationId),
      );
      queryClient.setQueriesData<InfiniteData<CoachConversationListPage>>(
        { queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY },
        (data) => removeConversationFromConversationsPages(data, conversationId),
      );

      return { unifiedSnapshots, conversationsSnapshots };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      for (const [key, value] of context.unifiedSnapshots) {
        queryClient.setQueryData(key, value);
      }
      for (const [key, value] of context.conversationsSnapshots) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: getCoachConversationQueryKey(user?.id, variables.conversationId),
        }),
      ]);
    },
  });
}

export function useRestoreCoachConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<void, CoachServiceError, UseDeleteCoachConversationVariables>({
    mutationFn: ({ conversationId }) => restoreCoachConversation(conversationId),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COACH_UNIFIED_HISTORY_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: getCoachConversationQueryKey(user?.id, variables.conversationId),
        }),
      ]);
    },
  });
}
