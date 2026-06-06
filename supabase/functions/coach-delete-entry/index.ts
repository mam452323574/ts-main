// PROMPT 6 — coach-delete-entry: soft-delete a coach_entries row from the
// authenticated user's history. The row is preserved (deleted_at = now()) so
// the original cache_key can be re-issued for an identical regeneration and
// so the user can restore it from the trash if needed.

import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
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
import { deleteCoachEntry } from '../_shared/coachHistorySoftDelete.ts';

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

    const body = await readJsonBody(req, { maxBytes: REQUEST_MAX_BYTES });
    if (!isRecord(body)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be a JSON object');
    }

    const entryId = readOptionalString(body.entry_id);
    if (!entryId || !UUID_REGEX.test(entryId)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'entry_id must be a UUID');
    }

    const result = await deleteCoachEntry(supabase, {
      entryId,
      userId: user.id,
    });

    return jsonResponse(req, {
      success: true,
      result,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-delete-entry] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
