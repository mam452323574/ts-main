import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  ensureUserProfileExistsForAuthenticatedUser,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseSocialFollowAuthorRequest } from '../_shared/phase2Contracts.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
  summarizeSupabaseError,
} from '../_shared/phase2Observability.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody } from '../_shared/phase2Utils.ts';
import type { SocialFollowAuthorResponse } from '../_shared/phase2Types.ts';

const rpcName = 'set_social_follow';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildResponseBody(
  row: unknown,
  expectedAuthorId: string,
): SocialFollowAuthorResponse {
  if (
    !isRecord(row) ||
    typeof row.author_id !== 'string' ||
    row.author_id !== expectedAuthorId ||
    typeof row.following !== 'boolean'
  ) {
    throw new Phase2HttpError(
      500,
      'social_follow_schema_mismatch',
      'Social follow update returned malformed data',
    );
  }

  return {
    success: true,
    author_id: row.author_id,
    following: row.following,
  };
}

Deno.serve(async (req: Request) => {
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
      featureFlags.social_enabled,
      'social_disabled',
      'Social follows are currently disabled',
    );

    const requestBody = parseSocialFollowAuthorRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    if (requestBody.author_id === user.id) {
      throw new Phase2HttpError(
        400,
        'social_follow_self',
        'You cannot follow yourself',
      );
    }

    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);

    const { data, error } = await supabase.rpc(rpcName, {
      p_author_id: requestBody.author_id,
      p_action: requestBody.action ?? null,
    });

    if (error) {
      logPhase2Error('[social-follow-author] RPC failed', error, {
        request_id: requestId,
        rpc_name: rpcName,
        ...(summarizeSupabaseError(error) ?? {}),
      });

      throw createPhase2DatabaseError(error, {
        contextLabel: 'Social follow update',
        fallbackCode: 'social_follow_update_failed',
        fallbackMessage: 'Failed to update the social follow state',
        rpcName,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responseBody = buildResponseBody(row, requestBody.author_id);

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-follow-author] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
