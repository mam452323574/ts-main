import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import { readJsonBody } from '../_shared/phase2Utils.ts';
import {
  assertPersonaAccessible,
  buildSlidingWindowMessages,
  parseCoachSendMessageRequest,
  type CoachConversationStoredMessage,
} from '../_shared/coachConversation.ts';
import { getCachedOrFreshUserContext } from '../_shared/coachConversationContext.ts';
import {
  attachCoachConversationQuotaEvent,
  mapCoachConversationReservationToHttpError,
  recordCoachConversationAttempt,
  refundCoachConversationQuotaEvent,
  reserveCoachConversationMessageSlot,
  getCoachConversationQuotaStatus,
} from '../_shared/coachConversationQuota.ts';
import { loadCoachUserAccountTier } from '../_shared/coachTier.ts';
import {
  postCoachConversationWebhook,
  requireCoachConversationWebhookEndpoints,
  COACH_CONVERSATION_WEBHOOK_FAILED_CODE,
  COACH_CONVERSATION_WEBHOOK_UNREACHABLE_CODE,
  COACH_CONVERSATION_RESPONSE_INVALID_CODE,
  COACH_CONVERSATION_RESPONSE_TOO_LARGE_CODE,
} from '../_shared/coachConversationProvider.ts';
// SSE streaming helpers are no longer used in V1: React Native fetch can't
// expose response.body as a ReadableStream on iOS/Android, so the SSE wire
// turns into "response.body === null" client-side. We fall back to a single
// JSON response that contains both the `ready` and `complete` payloads. The
// "typing" effect can be re-introduced later via web-only streaming or a
// client-side simulated chunking.
import {
  getCoachPersona,
  type CoachPersonaKey,
} from '../../../shared/coachPersonas.ts';

const REQUEST_MAX_BYTES = 16 * 1024;
const HISTORY_LOAD_LIMIT = 60;
const REFUNDABLE_ERROR_CODES = new Set([
  COACH_CONVERSATION_WEBHOOK_FAILED_CODE,
  COACH_CONVERSATION_WEBHOOK_UNREACHABLE_CODE,
  COACH_CONVERSATION_RESPONSE_TOO_LARGE_CODE,
]);
const MAX_ASSISTANT_CONTENT_LENGTH = 8000;
const TRUNCATION_SUFFIX = '…';
const ASSISTANT_ERROR_PLACEHOLDER = '⚠ La réponse du coach n’a pas pu être générée.';

interface ConversationRow {
  id: string;
  user_id: string;
  persona_key: CoachPersonaKey;
  locale: string | null;
  status: string;
  message_count: number;
  user_message_count: number;
  account_tier_at_start: string | null;
}

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

async function loadConversation(
  client: any,
  conversationId: string,
  userId: string,
): Promise<ConversationRow> {
  const { data, error } = await client
    .from('coach_conversations')
    .select('id, user_id, persona_key, locale, status, message_count, user_message_count, account_tier_at_start')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation lookup',
      fallbackCode: 'coach_conversation_lookup_failed',
      fallbackMessage: 'Failed to load Coach conversation',
      relationName: 'coach_conversations',
    });
  }

  if (!data) {
    throw new Phase2HttpError(404, 'coach_conversation_not_found', 'Coach conversation not found');
  }

  if (data.status === 'ended' || data.status === 'archived') {
    throw new Phase2HttpError(409, 'coach_conversation_ended', 'Coach conversation already ended');
  }

  return data as ConversationRow;
}

async function loadConversationHistory(
  client: any,
  conversationId: string,
  userId: string,
  limit = HISTORY_LOAD_LIMIT,
): Promise<CoachConversationStoredMessage[]> {
  const { data, error } = await client
    .from('coach_conversation_messages')
    .select('id, role, content, created_at, status')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation history load',
      fallbackCode: 'coach_conversation_history_failed',
      fallbackMessage: 'Failed to load Coach conversation history',
      relationName: 'coach_conversation_messages',
    });
  }

  return Array.isArray(data) ? (data as CoachConversationStoredMessage[]) : [];
}

async function lookupExistingClientRequest(
  client: any,
  userId: string,
  clientRequestId: string,
): Promise<{ user_message: any; assistant_message: any } | null> {
  const { data: userMessage, error: userError } = await client
    .from('coach_conversation_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('client_request_id', clientRequestId)
    .eq('role', 'user')
    .maybeSingle();

  if (userError) {
    throw createPhase2DatabaseError(userError, {
      contextLabel: 'Coach conversation idempotency lookup',
      fallbackCode: 'coach_conversation_idempotency_failed',
      fallbackMessage: 'Idempotency check failed',
      relationName: 'coach_conversation_messages',
    });
  }

  if (!userMessage) {
    return null;
  }

  const { data: assistantMessage, error: assistantError } = await client
    .from('coach_conversation_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('conversation_id', userMessage.conversation_id)
    .eq('role', 'assistant')
    .gt('created_at', userMessage.created_at)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (assistantError) {
    throw createPhase2DatabaseError(assistantError, {
      contextLabel: 'Coach conversation idempotency assistant lookup',
      fallbackCode: 'coach_conversation_idempotency_failed',
      fallbackMessage: 'Idempotency check failed',
      relationName: 'coach_conversation_messages',
    });
  }

  return { user_message: userMessage, assistant_message: assistantMessage };
}

async function insertUserMessage(
  client: any,
  options: {
    conversationId: string;
    userId: string;
    content: string;
    clientRequestId: string | null;
  },
): Promise<{ id: string; created_at: string }> {
  const { data, error } = await client
    .from('coach_conversation_messages')
    .insert({
      conversation_id: options.conversationId,
      user_id: options.userId,
      role: 'user',
      content: options.content,
      status: 'ready',
      client_request_id: options.clientRequestId,
    })
    .select('id, created_at')
    .single();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation user message insert',
      fallbackCode: 'coach_conversation_user_message_failed',
      fallbackMessage: 'Failed to insert Coach user message',
      relationName: 'coach_conversation_messages',
    });
  }

  return data as { id: string; created_at: string };
}

async function insertAssistantPendingMessage(
  client: any,
  options: {
    conversationId: string;
    userId: string;
  },
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('coach_conversation_messages')
    .insert({
      conversation_id: options.conversationId,
      user_id: options.userId,
      role: 'assistant',
      content: '...',
      status: 'streaming',
    })
    .select('id')
    .single();

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation assistant placeholder insert',
      fallbackCode: 'coach_conversation_assistant_message_failed',
      fallbackMessage: 'Failed to insert Coach assistant placeholder',
      relationName: 'coach_conversation_messages',
    });
  }

  return data as { id: string };
}

async function updateAssistantMessage(
  client: any,
  options: {
    messageId: string;
    userId: string;
    status: 'ready' | 'error';
    content?: string;
    model?: string | null;
    provider?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    generationMs?: number | null;
    errorCode?: string | null;
  },
) {
  const patch: Record<string, unknown> = {
    status: options.status,
  };
  if (options.content !== undefined) patch.content = options.content;
  if (options.model !== undefined) patch.model = options.model;
  if (options.provider !== undefined) patch.provider = options.provider;
  if (options.promptTokens !== undefined) patch.prompt_tokens = options.promptTokens;
  if (options.completionTokens !== undefined) patch.completion_tokens = options.completionTokens;
  if (options.generationMs !== undefined) patch.generation_ms = options.generationMs;
  if (options.errorCode !== undefined) patch.error_code = options.errorCode;

  const { error } = await client
    .from('coach_conversation_messages')
    .update(patch)
    .eq('id', options.messageId)
    .eq('user_id', options.userId);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation assistant update',
      fallbackCode: 'coach_conversation_assistant_update_failed',
      fallbackMessage: 'Failed to update Coach assistant message',
      relationName: 'coach_conversation_messages',
    });
  }
}

async function bumpAssistantConversationCounters(
  client: any,
  options: { conversationId: string; userId: string },
) {
  // Increment message_count for the assistant reply (user message was already
  // counted inside reserve_coach_conversation_message_slot). We also stamp
  // last_assistant_message_at so the history list sort stays accurate.
  const { data, error } = await client
    .from('coach_conversations')
    .select('message_count')
    .eq('id', options.conversationId)
    .eq('user_id', options.userId)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  await client
    .from('coach_conversations')
    .update({
      message_count: Number(data.message_count ?? 0) + 1,
      last_assistant_message_at: new Date().toISOString(),
    })
    .eq('id', options.conversationId)
    .eq('user_id', options.userId);
}

export async function runCoachSendMessageHandler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  const requestId = createRequestId();

  try {
    requirePostMethod(req);

    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.coach_chat_enabled === true,
      'coach_chat_disabled',
      'Coach chat is currently disabled',
    );

    await recordCoachConversationAttempt(supabase, { userId: user.id });

    const body = await readJsonBody(req, { maxBytes: REQUEST_MAX_BYTES });
    const parsed = parseCoachSendMessageRequest(body);

    // Idempotency: re-use a previous successful call when the client retries
    // with the same client_request_id.
    if (parsed.client_request_id) {
      const existing = await lookupExistingClientRequest(
        supabase,
        user.id,
        parsed.client_request_id,
      );
      if (existing) {
        const quota = await getCoachConversationQuotaStatus(supabase, user.id);
        return jsonResponse(req, {
          success: true,
          idempotent_hit: true,
          conversation_id: existing.user_message.conversation_id,
          user_message: existing.user_message,
          assistant_message: existing.assistant_message ?? null,
          quota,
          request_id: requestId,
        });
      }
    }

    const conversation = await loadConversation(supabase, parsed.conversation_id, user.id);
    const accountTier = await loadCoachUserAccountTier(supabase, user.id);
    assertPersonaAccessible(conversation.persona_key, accountTier);

    const webhookEndpoints = requireCoachConversationWebhookEndpoints();
    const persona = getCoachPersona(conversation.persona_key);

    const reservation = await reserveCoachConversationMessageSlot(supabase, {
      userId: user.id,
      conversationId: conversation.id,
    });
    if (!reservation.allowed) {
      throw mapCoachConversationReservationToHttpError(reservation);
    }

    const userMessage = await insertUserMessage(supabase, {
      conversationId: conversation.id,
      userId: user.id,
      content: parsed.content,
      clientRequestId: parsed.client_request_id,
    });

    await attachCoachConversationQuotaEvent(supabase, {
      usageEventId: reservation.usage_event_id,
      userId: user.id,
      messageId: userMessage.id,
    });

    const history = await loadConversationHistory(supabase, conversation.id, user.id);
    // Drop the just-inserted user message from history because we feed it as
    // the new user text.
    const historyWithoutLatest = history.filter((message) => message.id !== userMessage.id);
    const slidingWindow = buildSlidingWindowMessages(historyWithoutLatest, parsed.content);

    const userContext = await getCachedOrFreshUserContext(
      supabase,
      user.id,
      conversation.id,
      requestId,
    );

    const assistantMessage = await insertAssistantPendingMessage(supabase, {
      conversationId: conversation.id,
      userId: user.id,
    });

    const generationStartedAt = Date.now();

    try {
      const webhookPayload = {
        conversation_id: conversation.id,
        user_id: user.id,
        persona_key: conversation.persona_key,
        locale: conversation.locale,
        output_contract_version: 1,
        persona: {
          key: persona.key,
          requires_premium: persona.requiresPremium,
          tone_instructions: persona.toneInstructions,
          style_guide: persona.styleGuide,
        },
        messages: slidingWindow,
        ...(userContext ? { user_context: userContext } : {}),
      } satisfies Record<string, unknown>;

      const webhookResult = await postCoachConversationWebhook({
        endpoints: webhookEndpoints,
        payload: webhookPayload,
      });

      // The DB CHECK constraint caps assistant content at 8000 chars
      // (coach_conversation_messages_content_length_check). DeepSeek can exceed
      // that — truncate with an ellipsis suffix rather than 23514-failing.
      const rawContent = webhookResult.content;
      const safeContent =
        rawContent.length > MAX_ASSISTANT_CONTENT_LENGTH
          ? rawContent.slice(0, MAX_ASSISTANT_CONTENT_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
          : rawContent;

      const generationMs = Date.now() - generationStartedAt;
      await updateAssistantMessage(supabase, {
        messageId: assistantMessage.id,
        userId: user.id,
        status: 'ready',
        content: safeContent,
        model: webhookResult.model,
        provider: webhookResult.provider,
        promptTokens: webhookResult.promptTokens,
        completionTokens: webhookResult.completionTokens,
        generationMs,
        errorCode: null,
      });

      await bumpAssistantConversationCounters(supabase, {
        conversationId: conversation.id,
        userId: user.id,
      });

      const quotaAfter = await getCoachConversationQuotaStatus(supabase, user.id);

      return jsonResponse(req, {
        success: true,
        idempotent_hit: false,
        conversation_id: conversation.id,
        user_message: {
          id: userMessage.id,
          conversation_id: conversation.id,
          user_id: user.id,
          role: 'user',
          content: parsed.content,
          status: 'ready',
          created_at: userMessage.created_at,
          model: null,
          provider: null,
          prompt_tokens: null,
          completion_tokens: null,
          generation_ms: null,
          error_code: null,
          metadata: {},
        },
        assistant_message: {
          id: assistantMessage.id,
          conversation_id: conversation.id,
          user_id: user.id,
          role: 'assistant',
          content: safeContent,
          status: 'ready',
          created_at: new Date(generationStartedAt).toISOString(),
          model: webhookResult.model,
          provider: webhookResult.provider,
          prompt_tokens: webhookResult.promptTokens,
          completion_tokens: webhookResult.completionTokens,
          generation_ms: generationMs,
          error_code: null,
          metadata: { persona_key: conversation.persona_key },
        },
        ready: {
          conversation_id: conversation.id,
          user_message_id: userMessage.id,
          assistant_message_id: assistantMessage.id,
          persona_key: conversation.persona_key,
          quota: reservation.quota,
        },
        complete: {
          conversation_id: conversation.id,
          user_message_id: userMessage.id,
          assistant_message_id: assistantMessage.id,
          assistant_content: safeContent,
          model: webhookResult.model,
          provider: webhookResult.provider,
          generation_ms: generationMs,
          quota: quotaAfter,
        },
        quota: quotaAfter,
        request_id: requestId,
      });
    } catch (innerError) {
      const isPhase2 = innerError instanceof Phase2HttpError;
      const errorCode = isPhase2 ? innerError.code : 'coach_conversation_internal_error';

      await updateAssistantMessage(supabase, {
        messageId: assistantMessage.id,
        userId: user.id,
        status: 'error',
        errorCode,
        // Non-empty placeholder: the DB CHECK requires char_length(btrim(content)) >= 1,
        // so '' would also 23514-fail and leave the row stuck at status='streaming'.
        content: ASSISTANT_ERROR_PLACEHOLDER,
      });

      if (REFUNDABLE_ERROR_CODES.has(errorCode)) {
        await refundCoachConversationQuotaEvent(supabase, {
          usageEventId: reservation.usage_event_id,
          userId: user.id,
          reason: errorCode,
        });
      }

      throw innerError;
    }
  } catch (error) {
    logPhase2Error('[coach-send-message] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
}
