import type { CoachPersonaKey } from './coachPersonas';

export type CoachConversationStatus = 'active' | 'ended' | 'quota_reached' | 'archived';
export type CoachConversationEndedReason = 'user_ended' | 'quota_reached' | 'admin' | 'timeout';
export type CoachConversationMessageRole = 'user' | 'assistant' | 'system';
export type CoachConversationMessageStatus = 'pending' | 'streaming' | 'ready' | 'error';
export type CoachConversationAccountTier = 'free' | 'premium' | 'admin';

export const COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH = 2000;
export const COACH_CONVERSATION_FREE_USER_LIMIT = 4;
export const COACH_CONVERSATION_FREE_WINDOW_SECONDS = 72 * 60 * 60;
export const COACH_CONVERSATION_PREMIUM_DAILY_LIMIT = 40;
export const COACH_CONVERSATION_PER_CONVERSATION_LIMIT = 20;
export const COACH_CONVERSATION_TITLE_MAX_LENGTH = 80;

export interface CoachConversation {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  persona_key: CoachPersonaKey;
  locale: string | null;
  status: CoachConversationStatus;
  message_count: number;
  user_message_count: number;
  account_tier_at_start: CoachConversationAccountTier | null;
  last_user_message_at: string | null;
  last_assistant_message_at: string | null;
  ended_at: string | null;
  ended_reason: CoachConversationEndedReason | null;
  archived_at: string | null;
  metadata: Record<string, unknown>;
}

export interface CoachConversationInboxItem extends CoachConversation {
  first_user_message_preview: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
}

export interface CoachConversationMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: CoachConversationMessageRole;
  content: string;
  created_at: string;
  updated_at?: string | null;
  model: string | null;
  provider: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  generation_ms: number | null;
  status: CoachConversationMessageStatus;
  error_code: string | null;
  metadata: Record<string, unknown>;
}

export interface CoachConversationPersonaLastSnapshot {
  id: string;
  updated_at: string;
  last_user_message_at: string | null;
}

export interface CoachConversationQuotaStatus {
  tier: CoachConversationAccountTier;
  account_tier: CoachConversationAccountTier;
  unlimited: boolean;
  window_seconds: number;
  premium_today_used: number;
  premium_today_limit: number | null;
  premium_today_available: number | null;
  next_recharge_at: string | null;
  per_conversation_limit: number;
  free_used: boolean;
  free_message_limit: number | null;
  free_used_count: number | null;
  free_remaining_messages: number | null;
  free_next_recharge_at: string | null;
  free_window_seconds: number | null;
  free_conversation_id: string | null;
  quota_exceeded: boolean;
  as_of: string;
  last_conversation_by_persona: Partial<
    Record<CoachPersonaKey, CoachConversationPersonaLastSnapshot | null>
  >;
  conversation_count_by_persona: Partial<Record<CoachPersonaKey, number>>;
}

export interface CoachConversationListPage {
  items: CoachConversationInboxItem[];
  has_more: boolean;
  next_cursor: { updated_at: string; id: string } | null;
}

export function isCoachConversationActive(
  conversation: Pick<CoachConversation, 'status'>,
): boolean {
  return conversation.status === 'active';
}

export function canResumeCoachConversation(
  conversation: Pick<CoachConversation, 'status'>,
): boolean {
  // The user can re-open ended / quota_reached / archived to read history, but
  // cannot send new messages (the UI is responsible for disabling the input).
  return conversation.status !== 'archived' || conversation.status === 'archived';
}

export function canSendMessageInCoachConversation(
  conversation: Pick<CoachConversation, 'status'>,
  quota: CoachConversationQuotaStatus,
): boolean {
  if (conversation.status !== 'active') return false;
  if (quota.tier === 'admin') return true;
  if (quota.tier === 'free') {
    return !isCoachConversationFreeQuotaExhausted(quota);
  }
  return (quota.premium_today_available ?? 0) > 0;
}

export function isCoachConversationFreeQuotaExhausted(
  quota: CoachConversationQuotaStatus,
): boolean {
  if (quota.tier !== 'free') return false;
  if (quota.quota_exceeded) return true;
  if (quota.free_used) return true;
  // free_remaining_messages is the rolling 72h counter — when it is 0
  // (or null/unknown but free_used is already true above), the user can
  // no longer send until the next recharge.
  return (quota.free_remaining_messages ?? 0) <= 0;
}

export function getCoachConversationFreeRemainingMessages(
  quota: CoachConversationQuotaStatus,
): number {
  if (quota.tier !== 'free') return 0;
  return Math.max(0, quota.free_remaining_messages ?? 0);
}

export function getCoachConversationFreeNextRechargeAt(
  quota: CoachConversationQuotaStatus,
): string | null {
  if (quota.tier !== 'free') return null;
  return quota.free_next_recharge_at ?? quota.next_recharge_at ?? null;
}

export function isCoachConversationFreeConversationAllowed(
  quota: CoachConversationQuotaStatus,
): boolean {
  if (quota.tier !== 'free') return true;
  return !isCoachConversationFreeQuotaExhausted(quota);
}

export function buildCoachConversationFallbackTitle(
  firstUserMessage: string | null,
  fallback: string,
): string {
  if (!firstUserMessage) return fallback;
  const normalized = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= COACH_CONVERSATION_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, COACH_CONVERSATION_TITLE_MAX_LENGTH - 1)}…`;
}

export function getCoachConversationPersonaState(
  quota: CoachConversationQuotaStatus | null | undefined,
  personaKey: CoachPersonaKey,
): {
  lastConversation: CoachConversationPersonaLastSnapshot | null;
  count: number;
} {
  if (!quota) {
    return { lastConversation: null, count: 0 };
  }
  const last = quota.last_conversation_by_persona?.[personaKey] ?? null;
  const count = quota.conversation_count_by_persona?.[personaKey] ?? 0;
  return { lastConversation: last, count };
}
