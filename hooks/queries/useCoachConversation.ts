import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { CoachServiceError } from '@/services/coach';
import { fetchCoachConversation } from '@/services/coachConversation';
import type { CoachConversation } from '@/shared/coachConversation';
import { getCoachConversationQueryKey } from './coachConversationQueryKeys';
import { shouldRetryCoachReadQuery } from './coachQueryRetry';

interface UseCoachConversationOptions {
  conversationId: string | null | undefined;
}

export function useCoachConversation(options: UseCoachConversationOptions) {
  const { user } = useAuth();
  const conversationId = options.conversationId ?? null;

  return useQuery<CoachConversation, CoachServiceError>({
    queryKey: getCoachConversationQueryKey(user?.id, conversationId),
    queryFn: () => fetchCoachConversation(conversationId!),
    enabled: !!user?.id && !!conversationId,
    staleTime: 10_000,
    placeholderData: (previousData) => previousData,
    retry: shouldRetryCoachReadQuery,
  });
}
