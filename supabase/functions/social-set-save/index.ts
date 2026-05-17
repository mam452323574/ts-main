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
import { parseSocialSetSaveRequest } from '../_shared/phase2Contracts.ts';
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
import type { SocialSetSaveResponse } from '../_shared/phase2Types.ts';

const rpcName = 'set_social_post_save';

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
  expectedPostId: string,
): SocialSetSaveResponse {
  if (
    !isRecord(row) ||
    typeof row.post_id !== 'string' ||
    row.post_id !== expectedPostId ||
    typeof row.saved !== 'boolean'
  ) {
    throw new Phase2HttpError(
      500,
      'social_save_schema_mismatch',
      'Social save update returned malformed data',
    );
  }

  return {
    success: true,
    post_id: row.post_id,
    saved: row.saved,
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
      'Social saves are currently disabled',
    );

    const requestBody = parseSocialSetSaveRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);

    const { data, error } = await supabase.rpc(rpcName, {
      p_post_id: requestBody.post_id,
      p_action: requestBody.action ?? null,
    });

    if (error) {
      logPhase2Error('[social-set-save] RPC failed', error, {
        request_id: requestId,
        rpc_name: rpcName,
        ...(summarizeSupabaseError(error) ?? {}),
      });

      throw createPhase2DatabaseError(error, {
        contextLabel: 'Social save update',
        fallbackCode: 'social_save_update_failed',
        fallbackMessage: 'Failed to update the social save state',
        rpcName,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responseBody = buildResponseBody(row, requestBody.post_id);

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-set-save] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
