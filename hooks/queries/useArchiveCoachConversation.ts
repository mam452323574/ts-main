import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { archiveCoachConversation } from '@/services/coachConversation';
import {
  COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  getCoachConversationQueryKey,
} from './coachConversationQueryKeys';

interface UseArchiveCoachConversationVariables {
  conversationId: string;
}

export function useArchiveCoachConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<void, CoachServiceError, UseArchiveCoachConversationVariables>({
    mutationFn: ({ conversationId }) => archiveCoachConversation(conversationId),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getCoachConversationQueryKey(user?.id, variables.conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
      ]);
    },
  });
}
