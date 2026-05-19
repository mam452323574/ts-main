import type { CoachPersonaKey } from './coachPersonas';

export type CoachConversationStatus = 'active' | 'ended' | 'quota_reached' | 'archived';
export type CoachConversationEndedReason = 'user_ended' | 'quota_reached' | 'admin' | 'timeout';
export type CoachConversationMessageRole = 'user' | 'assistant' | 'system';
export type CoachConversationMessageStatus = 'pending' | 'streaming' | 'ready' | 'error';
export type CoachConversationAccountTier = 'free' | 'premium' | 'admin';

export const COACH_CONVERSATION_USER_MESSAGE_MAX_LENGTH = 2000;
export const COACH_CONVERSATION_FREE_USER_LIMIT = 4;
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
  free_remaining_messages: number | null;
  free_conversation_id: string | null;
  as_of: string;
}

export interface CoachConversationListPage {
  items: CoachConversation[];
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
    return !quota.free_used && (quota.free_remaining_messages ?? 0) > 0;
  }
  return (quota.premium_today_available ?? 0) > 0;
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
