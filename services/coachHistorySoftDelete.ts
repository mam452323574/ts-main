// PROMPT 6 — service-layer bindings for the unified Coach history feed and
// the soft-delete / restore actions on coach_entries and coach_conversations.
//
// The unified feed RPC is SECURITY INVOKER (lives behind RLS) so we call it
// directly via supabase.rpc — matching the existing fetchCoachHistoryPage
// pattern. The delete/restore actions are SECURITY DEFINER server-side and
// require service-role mediation, so the client invokes the dedicated Edge
// Functions.

import { supabase } from './supabase';
import {
  getConfiguredSupabaseProjectLabel,
  invokeAuthedEdgeFunction,
} from './edgeFunctions';

import { CoachServiceError } from './coach';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type {
  CoachConversationAccountTier,
  CoachConversationEndedReason,
  CoachConversationStatus,
} from '@/shared/coachConversation';
import { parseCoachStructuredContent } from '@/shared/coachContentParser';
import {
  type CoachUnifiedHistoryConversationItem,
  type CoachUnifiedHistoryCursor,
  type CoachUnifiedHistoryEntryItem,
  type CoachUnifiedHistoryItem,
  type CoachUnifiedHistoryKind,
  type CoachUnifiedHistoryPage,
} from '@/shared/coachHistory';

const COACH_DELETE_ENTRY_FN = 'coach-delete-entry';
const COACH_RESTORE_ENTRY_FN = 'coach-restore-entry';
const COACH_DELETE_CONVERSATION_FN = 'coach-delete-conversation';
const COACH_RESTORE_CONVERSATION_FN = 'coach-restore-conversation';

const UNIFIED_HISTORY_RPC = 'get_coach_unified_history_page_v1';
const UNIFIED_HISTORY_DEFAULT_LIMIT = 20;
const UNIFIED_HISTORY_MAX_LIMIT = 50;

export const COACH_ENTRY_RESTORE_CACHE_KEY_CONFLICT_ERROR_CODE =
  'coach_entry_restore_cache_key_conflict';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readObject<T extends Record<string, unknown>>(value: unknown): T {
  return isRecord(value) ? (value as T) : ({} as T);
}

function createCoachHistorySoftDeleteError(
  message: string,
  options: {
    code?: string;
    status?: number;
    details?: unknown;
    requestId?: string;
    functionName?: string;
  } = {},
) {
  return new CoachServiceError(message, options);
}

async function invokeCoachHistorySoftDeleteFunction<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
) {
  return invokeAuthedEdgeFunction<TResponse, CoachServiceError>({
    scopeLabel: 'Coach history',
    functionName,
    payload,
    createError: (message, options) =>
      createCoachHistorySoftDeleteError(message, {
        code: options.code,
        status: options.status,
        details: options.details,
        requestId: options.requestId,
        functionName: options.functionName,
      }),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function deleteCoachEntry(entryId: string): Promise<void> {
  await invokeCoachHistorySoftDeleteFunction<{ success: boolean }>(
    COACH_DELETE_ENTRY_FN,
    { entry_id: entryId },
  );
}

export async function restoreCoachEntry(entryId: string): Promise<void> {
  await invokeCoachHistorySoftDeleteFunction<{ success: boolean }>(
    COACH_RESTORE_ENTRY_FN,
    { entry_id: entryId },
  );
}

export async function deleteCoachConversation(conversationId: string): Promise<void> {
  await invokeCoachHistorySoftDeleteFunction<{ success: boolean }>(
    COACH_DELETE_CONVERSATION_FN,
    { conversation_id: conversationId },
  );
}

export async function restoreCoachConversation(conversationId: string): Promise<void> {
  await invokeCoachHistorySoftDeleteFunction<{ success: boolean }>(
    COACH_RESTORE_CONVERSATION_FN,
    { conversation_id: conversationId },
  );
}

// ---------------------------------------------------------------------------
// Unified history fetch
// ---------------------------------------------------------------------------

export interface FetchCoachUnifiedHistoryPageOptions {
  limit?: number;
  cursor?: CoachUnifiedHistoryCursor | null;
  includeHidden?: boolean;
}

function normaliseLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return UNIFIED_HISTORY_DEFAULT_LIMIT;
  const trimmed = Math.trunc(limit as number);
  return Math.max(1, Math.min(UNIFIED_HISTORY_MAX_LIMIT, trimmed));
}

function parseEntryItem(row: Record<string, unknown>): CoachUnifiedHistoryEntryItem | null {
  const id = readString(row.id);
  const userId = readString(row.user_id);
  const sortAt = readString(row.sort_at);
  const createdAt = readString(row.created_at);
  const personaKey = readString(row.persona_key) as CoachPersonaKey | null;
  const title = readString(row.title);
  const body = readString(row.body);
  if (!id || !userId || !sortAt || !createdAt || !personaKey || !body) {
    return null;
  }
  return {
    kind: 'entry',
    id,
    user_id: userId,
    sort_at: sortAt,
    title,
    persona_key: personaKey,
    locale: readString(row.locale),
    status: readString(row.status) ?? 'ready',
    created_at: createdAt,
    updated_at: readString(row.updated_at),
    body,
    disclaimer: readString(row.disclaimer),
    source: readString(row.source),
    generated_at: readString(row.generated_at),
    prompt_type: readString(row.prompt_type),
    question_key: readString(row.question_key),
    question_text: readString(row.question_text),
    response_version:
      readNumber(row.response_version) !== null
        ? Math.trunc(readNumber(row.response_version) as number)
        : null,
    content_json: isRecord(row.content_json)
      ? parseCoachStructuredContent(row.content_json, {
          fallbackTitle: title,
        }).content
      : null,
    cta_label: readString(row.cta_label),
    cta_route: readString(row.cta_route),
    expires_at: readString(row.expires_at),
    deleted_at: readString(row.deleted_at),
  };
}

function parseConversationItem(
  row: Record<string, unknown>,
): CoachUnifiedHistoryConversationItem | null {
  const id = readString(row.id);
  const userId = readString(row.user_id);
  const sortAt = readString(row.sort_at);
  const createdAt = readString(row.created_at);
  const personaKey = readString(row.persona_key) as CoachPersonaKey | null;
  const status = readString(row.status);
  if (!id || !userId || !sortAt || !createdAt || !personaKey || !status) {
    return null;
  }
  return {
    kind: 'conversation',
    id,
    user_id: userId,
    sort_at: sortAt,
    title: readString(row.title),
    persona_key: personaKey,
    locale: readString(row.locale),
    status,
    created_at: createdAt,
    updated_at: readString(row.updated_at),
    message_count: Math.max(0, Math.trunc(readNumber(row.message_count) ?? 0)),
    user_message_count: Math.max(0, Math.trunc(readNumber(row.user_message_count) ?? 0)),
    account_tier_at_start: (readString(row.account_tier_at_start) as
      | CoachConversationAccountTier
      | null) ?? null,
    last_user_message_at: readString(row.last_user_message_at),
    last_assistant_message_at: readString(row.last_assistant_message_at),
    ended_at: readString(row.ended_at),
    ended_reason: (readString(row.ended_reason) as
      | CoachConversationEndedReason
      | null) ?? null,
    archived_at: readString(row.archived_at),
    hidden_at: readString(row.hidden_at),
    metadata: readObject(row.metadata),
    conversation_status: status as CoachConversationStatus,
  };
}

function parseUnifiedHistoryRow(row: unknown): CoachUnifiedHistoryItem | null {
  if (!isRecord(row)) return null;
  const kind = readString(row.kind) as CoachUnifiedHistoryKind | null;
  if (kind === 'entry') return parseEntryItem(row);
  if (kind === 'conversation') return parseConversationItem(row);
  return null;
}

export async function fetchCoachUnifiedHistoryPage(
  options: FetchCoachUnifiedHistoryPageOptions = {},
): Promise<CoachUnifiedHistoryPage> {
  const limit = normaliseLimit(options.limit);
  const cursor = options.cursor ?? null;
  const includeHidden = options.includeHidden === true;

  const { data, error } = await supabase.rpc(UNIFIED_HISTORY_RPC, {
    p_limit: limit + 1,
    p_cursor_sort_at: cursor?.sort_at ?? null,
    p_cursor_kind: cursor?.kind ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_include_hidden: includeHidden,
  });

  if (error) {
    throw createCoachHistorySoftDeleteError(
      `Coach unified history page failed on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
      {
        code: 'coach_unified_history_page_load_failed',
        status: 502,
        details: error,
      },
    );
  }

  const rawRows = Array.isArray(data) ? data : [];
  const parsed = rawRows
    .map(parseUnifiedHistoryRow)
    .filter((item): item is CoachUnifiedHistoryItem => item !== null);

  const hasMore = parsed.length > limit;
  const pageItems = hasMore ? parsed.slice(0, limit) : parsed;
  const last = pageItems[pageItems.length - 1] ?? null;
  const nextCursor: CoachUnifiedHistoryCursor | null =
    hasMore && last
      ? { sort_at: last.sort_at, kind: last.kind, id: last.id }
      : null;

  return {
    items: pageItems,
    has_more: hasMore,
    next_cursor: nextCursor,
  };
}
