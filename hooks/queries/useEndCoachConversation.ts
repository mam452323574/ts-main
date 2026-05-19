import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { endCoachConversation } from '@/services/coachConversation';
import {
  COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  getCoachConversationMessagesQueryKey,
  getCoachConversationQueryKey,
} from './coachConversationQueryKeys';

interface UseEndCoachConversationVariables {
  conversationId: string;
  reason?: 'user_ended' | 'admin' | 'timeout';
}

export function useEndCoachConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<void, CoachServiceError, UseEndCoachConversationVariables>({
    mutationFn: ({ conversationId, reason }) =>
      endCoachConversation(conversationId, reason ?? 'user_ended'),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getCoachConversationQueryKey(user?.id, variables.conversationId),
        }),
        queryClient.invalidateQueries({
          queryKey: getCoachConversationMessagesQueryKey(user?.id, variables.conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
      ]);
    },
  });
}
