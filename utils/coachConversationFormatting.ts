import {
  buildCoachConversationFallbackTitle,
  type CoachConversation,
  type CoachConversationStatus,
} from '@/shared/coachConversation';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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

export function formatCoachConversationQuotaDuration(remainingMs: number): string {
  const safeRemainingMs = Number.isFinite(remainingMs)
    ? Math.max(0, remainingMs)
    : 0;

  if (safeRemainingMs >= DAY_MS) {
    const days = Math.ceil(safeRemainingMs / DAY_MS);
    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  if (safeRemainingMs >= HOUR_MS) {
    return `${Math.ceil(safeRemainingMs / HOUR_MS)}h`;
  }

  return `${Math.ceil(safeRemainingMs / MINUTE_MS)}min`;
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
