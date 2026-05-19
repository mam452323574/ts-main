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
  getDefaultCoachWelcomeMessage,
  parseCoachConversationStartRequest,
} from '../_shared/coachConversation.ts';
import {
  recordCoachConversationAttempt,
  startCoachConversation,
  COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE,
} from '../_shared/coachConversationQuota.ts';
import { loadCoachUserAccountTier } from '../_shared/coachTier.ts';

const REQUEST_MAX_BYTES = 8 * 1024;

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

Deno.serve(async (req) => {
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

    const accountTier = await loadCoachUserAccountTier(supabase, user.id);

    const body = await readJsonBody(req, { maxBytes: REQUEST_MAX_BYTES });
    const parsed = parseCoachConversationStartRequest(body);

    assertPersonaAccessible(parsed.persona_key, accountTier);

    const startResult = await startCoachConversation(supabase, {
      userId: user.id,
      personaKey: parsed.persona_key,
      locale: parsed.locale,
    });

    if (!startResult.allowed || !startResult.conversation_id) {
      if (startResult.code === COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE) {
        throw new Phase2HttpError(
          403,
          COACH_CONVERSATION_FREE_ALREADY_USED_ERROR_CODE,
          'Free Coach conversation already used',
          {
            quota_account_tier: startResult.quota.account_tier,
            quota_free_used: startResult.quota.free_used,
          },
        );
      }
      throw new Phase2HttpError(
        500,
        'coach_conversation_start_failed',
        'Coach conversation could not be created',
      );
    }

    const conversationId = startResult.conversation_id;

    // Welcome message inserted only on fresh creation (skip if resumed).
    let welcomeMessageId: string | null = null;
    if (!startResult.resumed) {
      const welcomeContent = getDefaultCoachWelcomeMessage(parsed.locale, accountTier);
      const { data: welcomeData, error: welcomeError } = await supabase
        .from('coach_conversation_messages')
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'system',
          content: welcomeContent,
          status: 'ready',
          metadata: { auto_generated: true, kind: 'welcome' },
        })
        .select('id')
        .single();

      if (welcomeError) {
        throw createPhase2DatabaseError(welcomeError, {
          contextLabel: 'Coach conversation welcome message insert',
          fallbackCode: 'coach_conversation_welcome_failed',
          fallbackMessage: 'Failed to insert Coach welcome message',
          relationName: 'coach_conversation_messages',
        });
      }

      welcomeMessageId = welcomeData?.id ?? null;

      await supabase
        .from('coach_conversations')
        .update({ message_count: 1 })
        .eq('id', conversationId)
        .eq('user_id', user.id);
    }

    return jsonResponse(req, {
      success: true,
      conversation_id: conversationId,
      welcome_message_id: welcomeMessageId,
      resumed: startResult.resumed,
      quota: startResult.quota,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-start-conversation] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
