import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import {
  createAuthenticatedRequestClient,
  createServiceRoleClient,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
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
import {
  isRecord,
  readJsonBody,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
} from '../_shared/phase2Utils.ts';
import { isCoachPersonaKey } from '../../../shared/coachPersonas.ts';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const REQUEST_MAX_BYTES = 2 * 1024;

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

interface CoachConversationsListRequest {
  limit: number;
  cursor: { updated_at: string; id: string } | null;
  include_archived: boolean;
  persona_key: string | null;
}

function parseRequest(payload: unknown): CoachConversationsListRequest {
  if (payload === null || payload === undefined) {
    return {
      limit: DEFAULT_LIMIT,
      cursor: null,
      include_archived: false,
      persona_key: null,
    };
  }
  if (!isRecord(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be a JSON object');
  }

  let limit = readOptionalNumber(payload.limit);
  if (limit === null || !Number.isFinite(limit)) limit = DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));

  let cursor: { updated_at: string; id: string } | null = null;
  if (payload.cursor !== undefined && payload.cursor !== null) {
    if (!isRecord(payload.cursor)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'cursor must be an object');
    }
    const updatedAt = readOptionalString(payload.cursor.updated_at);
    const id = readOptionalString(payload.cursor.id);
    if (!updatedAt || !id) {
      throw new Phase2HttpError(400, 'invalid_payload', 'cursor.updated_at and cursor.id are required');
    }
    cursor = { updated_at: updatedAt, id };
  }

  const rawPersonaKey = readOptionalString(payload.persona_key);
  let personaKey: string | null = null;
  if (rawPersonaKey !== null) {
    if (!isCoachPersonaKey(rawPersonaKey)) {
      throw new Phase2HttpError(
        400,
        'invalid_payload',
        'persona_key must be a known coach persona',
      );
    }
    personaKey = rawPersonaKey;
  }

  return {
    limit,
    cursor,
    include_archived: readOptionalBoolean(payload.include_archived) === true,
    persona_key: personaKey,
  };
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

    const serviceRole = createServiceRoleClient();
    const user = await requireAuthenticatedUser(serviceRole, req);

    const featureFlags = await loadPhase2FeatureFlags(serviceRole);
    requireFeatureEnabled(
      featureFlags.coach_chat_enabled === true,
      'coach_chat_disabled',
      'Coach chat is currently disabled',
    );

    const body = await readJsonBody(req, { maxBytes: REQUEST_MAX_BYTES }).catch(() => null);
    const params = parseRequest(body);

    const authenticatedClient = createAuthenticatedRequestClient(req);
    const { data, error } = await authenticatedClient.rpc('get_coach_conversations_page', {
      p_limit: params.limit + 1,
      p_cursor_updated_at: params.cursor?.updated_at ?? null,
      p_cursor_id: params.cursor?.id ?? null,
      p_include_archived: params.include_archived,
      p_include_hidden: false,
      p_persona_key: params.persona_key,
    });

    if (error) {
      throw createPhase2DatabaseError(error, {
        contextLabel: 'Coach conversation listing',
        fallbackCode: 'coach_conversations_list_failed',
        fallbackMessage: 'Failed to load Coach conversations',
        relationName: 'coach_conversations',
        rpcName: 'get_coach_conversations_page',
      });
    }

    const rows = Array.isArray(data) ? data.slice() : [];
    let hasMore = false;
    if (rows.length > params.limit) {
      rows.length = params.limit;
      hasMore = true;
    }

    const nextCursor =
      hasMore && rows.length > 0
        ? {
            updated_at: String(rows[rows.length - 1]?.updated_at ?? ''),
            id: String(rows[rows.length - 1]?.id ?? ''),
          }
        : null;

    // Sanity filter: even though RLS already restricts to the caller, double
    // check the user_id to keep the API contract clean.
    const filtered = rows.filter((row) => row && (row.user_id === user.id));

    return jsonResponse(req, {
      success: true,
      items: filtered,
      has_more: hasMore && nextCursor !== null,
      next_cursor: nextCursor,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-conversations-list] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
