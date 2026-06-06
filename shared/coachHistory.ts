// PROMPT 6 — shared types for the unified Coach history feed.
//
// A unified-history item is either a "ready" coach_entries row (kind='entry')
// or a coach_conversations row (kind='conversation'). Both kinds expose a
// common sort_at timestamp + ids so the client can paginate and render them
// in a single list without an N+1 round trip.

import type { CoachStructuredContent } from './coachContent';
import type {
  CoachConversationAccountTier,
  CoachConversationEndedReason,
  CoachConversationStatus,
} from './coachConversation';
import type { CoachPersonaKey } from './coachPersonas';

export type CoachUnifiedHistoryKind = 'entry' | 'conversation';

export interface CoachUnifiedHistoryItemBase {
  kind: CoachUnifiedHistoryKind;
  id: string;
  user_id: string;
  sort_at: string;
  title: string | null;
  persona_key: CoachPersonaKey;
  locale: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export interface CoachUnifiedHistoryEntryItem extends CoachUnifiedHistoryItemBase {
  kind: 'entry';
  body: string;
  disclaimer: string | null;
  source: string | null;
  generated_at: string | null;
  prompt_type: string | null;
  question_key: string | null;
  question_text: string | null;
  response_version: number | null;
  content_json: CoachStructuredContent | null;
  cta_label: string | null;
  cta_route: string | null;
  expires_at: string | null;
  deleted_at: string | null;
}

export interface CoachUnifiedHistoryConversationItem
  extends CoachUnifiedHistoryItemBase {
  kind: 'conversation';
  message_count: number;
  user_message_count: number;
  account_tier_at_start: CoachConversationAccountTier | null;
  last_user_message_at: string | null;
  last_assistant_message_at: string | null;
  ended_at: string | null;
  ended_reason: CoachConversationEndedReason | null;
  archived_at: string | null;
  hidden_at: string | null;
  metadata: Record<string, unknown>;
  conversation_status: CoachConversationStatus;
}

export type CoachUnifiedHistoryItem =
  | CoachUnifiedHistoryEntryItem
  | CoachUnifiedHistoryConversationItem;

export interface CoachUnifiedHistoryCursor {
  sort_at: string;
  kind: CoachUnifiedHistoryKind;
  id: string;
}

export interface CoachUnifiedHistoryPage {
  items: CoachUnifiedHistoryItem[];
  has_more: boolean;
  next_cursor: CoachUnifiedHistoryCursor | null;
}

export function isCoachUnifiedHistoryEntryItem(
  item: CoachUnifiedHistoryItem,
): item is CoachUnifiedHistoryEntryItem {
  return item.kind === 'entry';
}

export function isCoachUnifiedHistoryConversationItem(
  item: CoachUnifiedHistoryItem,
): item is CoachUnifiedHistoryConversationItem {
  return item.kind === 'conversation';
}

export function getCoachUnifiedHistoryItemKey(item: CoachUnifiedHistoryItem): string {
  return `${item.kind}:${item.id}`;
}
