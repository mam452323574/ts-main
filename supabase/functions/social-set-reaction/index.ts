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
import { parseSocialSetReactionRequest } from '../_shared/phase2Contracts.ts';
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
import { assertReactableSocialPost } from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody } from '../_shared/phase2Utils.ts';
import type { SocialSetReactionResponse } from '../_shared/phase2Types.ts';

const rpcName = 'set_social_post_reaction';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidReactionState(
  value: unknown,
): value is SocialSetReactionResponse['viewer_reaction'] {
  return value === 'like' || value === 'dislike' || value === 'neutral';
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function buildSocialSetReactionResponse(
  row: unknown,
  expectedPostId: string,
): SocialSetReactionResponse {
  if (
    !isRecord(row) ||
    typeof row.post_id !== 'string' ||
    row.post_id.length === 0 ||
    row.post_id !== expectedPostId ||
    !isValidReactionState(row.viewer_reaction) ||
    !isNonNegativeFiniteNumber(row.like_count) ||
    !isNonNegativeFiniteNumber(row.dislike_count)
  ) {
    throw new Phase2HttpError(
      500,
      'social_reaction_schema_mismatch',
      'Social reaction update returned malformed data',
    );
  }

  return {
    success: true,
    post_id: row.post_id,
    viewer_reaction: row.viewer_reaction,
    like_count: row.like_count,
    dislike_count: row.dislike_count,
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
      'Social reactions are currently disabled',
    );

    const requestBody = parseSocialSetReactionRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    await assertReactableSocialPost(supabase, user.id, requestBody.post_id);
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);

    const { data, error } = await supabase.rpc(rpcName, {
      p_post_id: requestBody.post_id,
      p_user_id: user.id,
      p_reaction: requestBody.reaction,
    });

    if (error) {
      logPhase2Error('[social-set-reaction] RPC failed', error, {
        request_id: requestId,
        rpc_name: rpcName,
        ...(summarizeSupabaseError(error) ?? {}),
      });

      throw createPhase2DatabaseError(error, {
        contextLabel: 'Social reaction update',
        fallbackCode: 'social_reaction_update_failed',
        fallbackMessage: 'Failed to update the social reaction',
        rpcName,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responseBody = buildSocialSetReactionResponse(
      row,
      requestBody.post_id,
    );

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-set-reaction] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
