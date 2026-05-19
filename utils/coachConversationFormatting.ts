import {
  buildCoachConversationFallbackTitle,
  type CoachConversation,
  type CoachConversationStatus,
} from '@/shared/coachConversation';

export interface CoachConversationStatusLabels {
  active: string;
  ended: string;
  quota_reached: string;
  archived: string;
  free_consumed: string;
  conversation_full: string;
}

export interface CoachConversationCounterLabels {
  // (count, limit) => "3/20 messages"
  perConversation: (count: number, limit: number) => string;
  freePerConversation: (count: number, limit: number) => string;
}

export function formatCoachConversationStatusLabel(
  conversation: Pick<
    CoachConversation,
    | 'status'
    | 'user_message_count'
    | 'account_tier_at_start'
  >,
  labels: CoachConversationStatusLabels,
): string | null {
  if (conversation.status === 'archived') return labels.archived;
  if (conversation.status === 'ended') return labels.ended;
  if (conversation.status === 'quota_reached') {
    if (conversation.account_tier_at_start === 'free') {
      return labels.free_consumed;
    }
    return labels.conversation_full;
  }
  return null;
}

export function formatCoachConversationCounter(
  conversation: Pick<
    CoachConversation,
    'user_message_count' | 'account_tier_at_start'
  >,
  labels: CoachConversationCounterLabels,
  premiumLimit = 20,
  freeLimit = 4,
): string {
  const used = conversation.user_message_count ?? 0;
  if (conversation.account_tier_at_start === 'free') {
    return labels.freePerConversation(used, freeLimit);
  }
  return labels.perConversation(used, premiumLimit);
}

export function buildCoachConversationDisplayTitle(
  conversation: Pick<CoachConversation, 'title'>,
  firstUserMessage: string | null | undefined,
  fallback: string,
): string {
  if (conversation.title && conversation.title.trim()) {
    return conversation.title.trim();
  }
  return buildCoachConversationFallbackTitle(firstUserMessage ?? null, fallback);
}

export function isCoachConversationInteractive(status: CoachConversationStatus): boolean {
  return status === 'active';
}
