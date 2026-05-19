import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import {
  sendCoachConversationMessage,
  type SendCoachMessageInput,
  type SendCoachMessageResult,
} from '@/services/coachConversation';
import {
  COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  COACH_CONVERSATION_QUERY_KEY,
  getCoachConversationMessagesQueryKey,
  getCoachConversationQuotaQueryKey,
} from './coachConversationQueryKeys';

interface UseSendCoachMessageVariables extends Omit<SendCoachMessageInput, 'onAssistantUpdate'> {
  onAssistantUpdate?: SendCoachMessageInput['onAssistantUpdate'];
}

export function useSendCoachMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<
    SendCoachMessageResult,
    CoachServiceError,
    UseSendCoachMessageVariables
  >({
    mutationFn: (variables) =>
      sendCoachConversationMessage({
        conversationId: variables.conversationId,
        content: variables.content,
        clientRequestId: variables.clientRequestId,
        onReady: variables.onReady,
        onChunk: variables.onChunk,
        onAssistantUpdate: variables.onAssistantUpdate,
        onComplete: variables.onComplete,
        signal: variables.signal,
      }),
    onSuccess: (data, variables) => {
      if (user?.id && data.complete.quota) {
        queryClient.setQueryData(
          getCoachConversationQuotaQueryKey(user.id),
          data.complete.quota,
        );
      }
      queryClient.invalidateQueries({
        queryKey: getCoachConversationMessagesQueryKey(user?.id, variables.conversationId),
      });
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getCoachConversationMessagesQueryKey(user?.id, variables.conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATION_QUERY_KEY }),
      ]);
    },
  });
}
