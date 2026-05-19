import { supabase } from './supabase';
import {
  getConfiguredSupabaseProjectLabel,
  invokeAuthedEdgeFunction,
} from './edgeFunctions';
import { getSupabaseFunctionUrl } from './runtimeConfig';

import { CoachServiceError } from './coach';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import type {
  CoachConversation,
  CoachConversationListPage,
  CoachConversationMessage,
  CoachConversationQuotaStatus,
} from '@/shared/coachConversation';

const COACH_START_CONVERSATION_FN = 'coach-start-conversation';
const COACH_SEND_MESSAGE_FN = 'coach-send-message';
const COACH_END_CONVERSATION_FN = 'coach-end-conversation';
const COACH_ARCHIVE_CONVERSATION_FN = 'coach-archive-conversation';
const COACH_CONVERSATION_QUOTA_STATUS_FN = 'coach-conversation-quota-status';
const COACH_CONVERSATIONS_LIST_FN = 'coach-conversations-list';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function createCoachConversationError(
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

async function invokeCoachConversationFunction<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
) {
  return invokeAuthedEdgeFunction<TResponse, CoachServiceError>({
    scopeLabel: 'Coach conversation',
    functionName,
    payload,
    createError: (message, options) =>
      createCoachConversationError(message, {
        code: options.code,
        status: options.status,
        details: options.details,
        requestId: options.requestId,
        functionName: options.functionName,
      }),
  });
}

export interface StartCoachConversationInput {
  personaKey: CoachPersonaKey;
  locale?: string | null;
  firstMessage?: { content: string; clientRequestId?: string | null };
}

export interface StartCoachConversationResult {
  conversation_id: string;
  welcome_message_id: string | null;
  resumed: boolean;
  quota: CoachConversationQuotaStatus;
}

export async function startCoachConversation(
  input: StartCoachConversationInput,
): Promise<StartCoachConversationResult> {
  const payload: Record<string, unknown> = {
    persona_key: input.personaKey,
    locale: input.locale ?? null,
  };
  if (input.firstMessage) {
    payload.first_message = {
      content: input.firstMessage.content,
      client_request_id: input.firstMessage.clientRequestId ?? null,
    };
  }

  const response = await invokeCoachConversationFunction<{
    success: boolean;
    conversation_id: string;
    welcome_message_id: string | null;
    resumed: boolean;
    quota: CoachConversationQuotaStatus;
  }>(COACH_START_CONVERSATION_FN, payload);

  if (!isRecord(response) || !response.conversation_id) {
    throw createCoachConversationError(
      'Coach start-conversation returned an invalid payload',
      { code: 'coach_conversation_invalid_response', status: 502 },
    );
  }

  return {
    conversation_id: String(response.conversation_id),
    welcome_message_id: readOptionalString(response.welcome_message_id),
    resumed: response.resumed === true,
    quota: response.quota as CoachConversationQuotaStatus,
  };
}

export async function fetchCoachConversationQuotaStatus(): Promise<CoachConversationQuotaStatus> {
  const response = await invokeCoachConversationFunction<{
    success: boolean;
    quota: CoachConversationQuotaStatus;
  }>(COACH_CONVERSATION_QUOTA_STATUS_FN, {});

  if (!isRecord(response) || !isRecord(response.quota)) {
    throw createCoachConversationError(
      'Coach conversation quota returned an invalid payload',
      { code: 'coach_conversation_quota_invalid', status: 502 },
    );
  }

  return response.quota as CoachConversationQuotaStatus;
}

export interface FetchCoachConversationsPageInput {
  limit?: number;
  cursor?: { updated_at: string; id: string } | null;
  include_archived?: boolean;
}

export async function fetchCoachConversationsPage(
  input: FetchCoachConversationsPageInput = {},
): Promise<CoachConversationListPage> {
  const response = await invokeCoachConversationFunction<{
    success: boolean;
    items: CoachConversation[];
    has_more: boolean;
    next_cursor: { updated_at: string; id: string } | null;
  }>(COACH_CONVERSATIONS_LIST_FN, {
    limit: input.limit ?? 20,
    cursor: input.cursor ?? null,
    include_archived: input.include_archived ?? false,
  });

  if (!isRecord(response) || !Array.isArray(response.items)) {
    throw createCoachConversationError(
      'Coach conversations list returned an invalid payload',
      { code: 'coach_conversations_list_invalid', status: 502 },
    );
  }

  return {
    items: response.items as CoachConversation[],
    has_more: response.has_more === true,
    next_cursor: (response.next_cursor as CoachConversationListPage['next_cursor']) ?? null,
  };
}

export interface FetchCoachConversationMessagesInput {
  conversationId: string;
  limit?: number;
  cursor?: { created_at: string; id: string } | null;
}

export async function fetchCoachConversationMessagesPage(
  input: FetchCoachConversationMessagesInput,
): Promise<{ items: CoachConversationMessage[]; has_more: boolean; next_cursor: { created_at: string; id: string } | null }> {
  // The messages page is served by a RPC, called through supabase-js directly
  // since it's a SELECT on the user's own rows (SECURITY INVOKER).
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const { data, error } = await supabase.rpc('get_coach_conversation_messages_page', {
    p_conversation_id: input.conversationId,
    p_limit: limit + 1,
    p_cursor_created_at: input.cursor?.created_at ?? null,
    p_cursor_id: input.cursor?.id ?? null,
  });

  if (error) {
    throw createCoachConversationError(
      `Coach conversation messages page failed on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
      {
        code: 'coach_conversation_messages_load_failed',
        status: 502,
        details: error,
      },
    );
  }

  const rows = Array.isArray(data) ? (data as CoachConversationMessage[]) : [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? { created_at: last.created_at, id: last.id }
    : null;

  return { items, has_more: hasMore, next_cursor: nextCursor };
}

export async function fetchCoachConversation(conversationId: string): Promise<CoachConversation> {
  const { data, error } = await supabase
    .from('coach_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    throw createCoachConversationError(
      `Coach conversation lookup failed on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
      {
        code: 'coach_conversation_lookup_failed',
        status: 502,
        details: error,
      },
    );
  }

  if (!data) {
    throw createCoachConversationError('Coach conversation not found', {
      code: 'coach_conversation_not_found',
      status: 404,
    });
  }

  return data as CoachConversation;
}

export async function endCoachConversation(
  conversationId: string,
  reason: 'user_ended' | 'admin' | 'timeout' = 'user_ended',
): Promise<void> {
  await invokeCoachConversationFunction<{ success: boolean }>(
    COACH_END_CONVERSATION_FN,
    {
      conversation_id: conversationId,
      reason,
    },
  );
}

export async function archiveCoachConversation(conversationId: string): Promise<void> {
  await invokeCoachConversationFunction<{ success: boolean }>(
    COACH_ARCHIVE_CONVERSATION_FN,
    {
      conversation_id: conversationId,
    },
  );
}

// ---------------------------------------------------------------------------
// Streaming send-message — bypasses invokeAuthedEdgeFunction so we can read
// Server-Sent Events incrementally.
// ---------------------------------------------------------------------------

export interface SendCoachMessageInput {
  conversationId: string;
  content: string;
  clientRequestId: string;
  onReady?: (event: SendCoachMessageReadyEvent) => void;
  onChunk?: (delta: string) => void;
  onAssistantUpdate?: (assistantContent: string) => void;
  onComplete?: (event: SendCoachMessageCompleteEvent) => void;
  signal?: AbortSignal;
}

export interface SendCoachMessageReadyEvent {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  persona_key: CoachPersonaKey;
  quota: CoachConversationQuotaStatus;
}

export interface SendCoachMessageCompleteEvent {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  assistant_content: string;
  model: string | null;
  provider: string | null;
  generation_ms: number | null;
  quota: CoachConversationQuotaStatus;
}

export interface SendCoachMessageResult {
  ready: SendCoachMessageReadyEvent;
  complete: SendCoachMessageCompleteEvent;
  idempotent_hit: boolean;
  user_message: CoachConversationMessage | null;
  assistant_message: CoachConversationMessage | null;
}

/**
 * V1 implementation note: we deliberately use a synchronous JSON response
 * instead of Server-Sent Events. React Native's `fetch` doesn't expose
 * `response.body` as a `ReadableStream` on iOS/Android, which broke the
 * streaming path for the mobile target. A web-only streaming variant can be
 * reintroduced later behind a `Platform.OS === 'web'` guard.
 */
export async function sendCoachConversationMessage(
  input: SendCoachMessageInput,
): Promise<SendCoachMessageResult> {
  const response = await invokeCoachConversationFunction<{
    success: boolean;
    idempotent_hit: boolean;
    conversation_id: string;
    user_message: CoachConversationMessage | null;
    assistant_message: CoachConversationMessage | null;
    ready?: SendCoachMessageReadyEvent;
    complete?: SendCoachMessageCompleteEvent;
    quota: CoachConversationQuotaStatus;
  }>(COACH_SEND_MESSAGE_FN, {
    conversation_id: input.conversationId,
    content: input.content,
    client_request_id: input.clientRequestId,
  });

  if (!isRecord(response)) {
    throw createCoachConversationError(
      'Coach send-message returned an invalid payload',
      { code: 'coach_conversation_invalid_response', status: 502 },
    );
  }

  const assistantMessage = (response.assistant_message as CoachConversationMessage | null) ?? null;
  const userMessage = (response.user_message as CoachConversationMessage | null) ?? null;
  const quota = response.quota as CoachConversationQuotaStatus;

  const personaKey: CoachPersonaKey = (() => {
    if (
      assistantMessage &&
      isRecord(assistantMessage.metadata) &&
      typeof assistantMessage.metadata.persona_key === 'string'
    ) {
      return assistantMessage.metadata.persona_key as CoachPersonaKey;
    }
    return 'gentle_supportive';
  })();

  const ready: SendCoachMessageReadyEvent = response.ready ?? {
    conversation_id: String(response.conversation_id ?? input.conversationId),
    user_message_id: userMessage?.id ?? '',
    assistant_message_id: assistantMessage?.id ?? '',
    persona_key: personaKey,
    quota,
  };

  const complete: SendCoachMessageCompleteEvent = response.complete ?? {
    conversation_id: ready.conversation_id,
    user_message_id: ready.user_message_id,
    assistant_message_id: ready.assistant_message_id,
    assistant_content: assistantMessage?.content ?? '',
    model: assistantMessage?.model ?? null,
    provider: assistantMessage?.provider ?? null,
    generation_ms: assistantMessage?.generation_ms ?? null,
    quota,
  };

  input.onReady?.(ready);
  if (assistantMessage?.content) {
    input.onChunk?.(assistantMessage.content);
    input.onAssistantUpdate?.(assistantMessage.content);
  } else if (complete.assistant_content) {
    input.onAssistantUpdate?.(complete.assistant_content);
  }
  input.onComplete?.(complete);

  return {
    ready,
    complete,
    idempotent_hit: response.idempotent_hit === true,
    user_message: userMessage,
    assistant_message: assistantMessage,
  };
}

export function generateCoachConversationClientRequestId(): string {
  // Lightweight UUIDv4-like generator (good enough for idempotency). Uses
  // crypto if available, otherwise falls back to Math.random.
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
