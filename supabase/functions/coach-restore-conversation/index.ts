// PROMPT 6 — coach-restore-conversation: clear hidden_at on a previously
// soft-hidden coach_conversations row. If the legacy archive path had set
// status='archived', the RPC also rolls that back to 'ended'.

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
import { restoreCoachConversation } from '../_shared/coachHistorySoftDelete.ts';

const REQUEST_MAX_BYTES = 1 * 1024;
const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

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
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'conversation_id must be a UUID');
    }

    const result = await restoreCoachConversation(supabase, {
      conversationId,
      userId: user.id,
    });

    return jsonResponse(req, {
      success: true,
      result,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-restore-conversation] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
