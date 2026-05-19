import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { CoachServiceError } from '@/services/coach';
import {
  startCoachConversation,
  type StartCoachConversationInput,
  type StartCoachConversationResult,
} from '@/services/coachConversation';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import {
  COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  COACH_CONVERSATION_QUERY_KEY,
  COACH_CONVERSATION_QUOTA_QUERY_KEY,
  getCoachConversationQuotaQueryKey,
} from './coachConversationQueryKeys';

interface UseStartCoachConversationVariables {
  personaKey: CoachPersonaKey;
  firstMessage?: StartCoachConversationInput['firstMessage'];
}

export function useStartCoachConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale } = useLanguage();

  return useMutation<
    StartCoachConversationResult,
    CoachServiceError,
    UseStartCoachConversationVariables
  >({
    mutationFn: ({ personaKey, firstMessage }) =>
      startCoachConversation({
        personaKey,
        locale,
        firstMessage,
      }),
    onSuccess: (data) => {
      if (data.quota && user?.id) {
        queryClient.setQueryData(getCoachConversationQuotaQueryKey(user.id), data.quota);
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATIONS_INFINITE_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATION_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: COACH_CONVERSATION_QUOTA_QUERY_KEY }),
      ]);
    },
  });
}
