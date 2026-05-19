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
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  isRecord,
  readJsonBody,
  readOptionalString,
} from '../_shared/phase2Utils.ts';
import { endCoachConversation } from '../_shared/coachConversationQuota.ts';

const REQUEST_MAX_BYTES = 1 * 1024;
const ALLOWED_REASONS = new Set(['user_ended', 'admin', 'timeout']);

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

    const body = await readJsonBody(req, { maxBytes: REQUEST_MAX_BYTES });
    if (!isRecord(body)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be a JSON object');
    }

    const conversationId = readOptionalString(body.conversation_id);
    if (!conversationId || !/^[0-9a-fA-F-]{36}$/.test(conversationId)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'conversation_id must be a UUID');
    }

    const reasonRaw = readOptionalString(body.reason);
    const reason = reasonRaw && ALLOWED_REASONS.has(reasonRaw)
      ? (reasonRaw as 'user_ended' | 'admin' | 'timeout')
      : 'user_ended';

    const result = await endCoachConversation(supabase, {
      conversationId,
      userId: user.id,
      reason,
    });

    return jsonResponse(req, {
      success: true,
      result,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-end-conversation] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
