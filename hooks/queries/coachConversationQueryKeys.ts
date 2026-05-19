export const COACH_CONVERSATIONS_INFINITE_QUERY_KEY = ['coachConversationsInfinite'] as const;
export const COACH_CONVERSATION_QUERY_KEY = ['coachConversation'] as const;
export const COACH_CONVERSATION_MESSAGES_QUERY_KEY = ['coachConversationMessages'] as const;
export const COACH_CONVERSATION_QUOTA_QUERY_KEY = ['coachConversationQuota'] as const;

export const getCoachConversationsInfiniteQueryKey = (
  userId?: string | null,
  includeArchived?: boolean,
) => [
  ...COACH_CONVERSATIONS_INFINITE_QUERY_KEY,
  userId ?? 'anonymous',
  includeArchived ? 'with_archived' : 'active_only',
] as const;

export const getCoachConversationQueryKey = (
  userId?: string | null,
  conversationId?: string | null,
) => [
  ...COACH_CONVERSATION_QUERY_KEY,
  userId ?? 'anonymous',
  conversationId ?? 'none',
] as const;

export const getCoachConversationMessagesQueryKey = (
  userId?: string | null,
  conversationId?: string | null,
) => [
  ...COACH_CONVERSATION_MESSAGES_QUERY_KEY,
  userId ?? 'anonymous',
  conversationId ?? 'none',
] as const;

export const getCoachConversationQuotaQueryKey = (userId?: string | null) => [
  ...COACH_CONVERSATION_QUOTA_QUERY_KEY,
  userId ?? 'anonymous',
] as const;
