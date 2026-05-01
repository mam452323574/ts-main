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
import { parseSocialSetCommentLikeRequest } from '../_shared/phase2Contracts.ts';
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
import { assertLikeableSocialComment } from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody } from '../_shared/phase2Utils.ts';
import type { SocialSetCommentLikeResponse } from '../_shared/phase2Types.ts';

const rpcName = 'set_social_comment_like';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function buildSocialSetCommentLikeResponse(
  row: unknown,
  expectedCommentId: string,
  requestId: string,
): SocialSetCommentLikeResponse {
  if (
    !isRecord(row) ||
    typeof row.comment_id !== 'string' ||
    row.comment_id.length === 0 ||
    row.comment_id !== expectedCommentId ||
    typeof row.viewer_has_liked !== 'boolean' ||
    !isNonNegativeFiniteNumber(row.like_count)
  ) {
    throw new Phase2HttpError(
      500,
      'social_comment_like_schema_mismatch',
      'Social comment like update returned malformed data',
    );
  }

  return {
    success: true,
    comment_id: row.comment_id,
    viewer_has_liked: row.viewer_has_liked,
    like_count: row.like_count,
    request_id: requestId,
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
  let commentIdForLog: string | undefined;

  try {
    requirePostMethod(req);

    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social comments are currently disabled',
    );
    requireFeatureEnabled(
      featureFlags.social_comments_enabled,
      'social_comments_disabled',
      'Social comments are currently disabled',
    );

    const requestBody = parseSocialSetCommentLikeRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    commentIdForLog = requestBody.comment_id;
    await assertLikeableSocialComment(supabase, user.id, requestBody.comment_id);
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);

    const { data, error } = await supabase.rpc(rpcName, {
      p_comment_id: requestBody.comment_id,
      p_user_id: user.id,
      p_liked: requestBody.liked,
    });

    if (error) {
      logPhase2Error('[social-set-comment-like] RPC failed', error, {
        request_id: requestId,
        comment_id: requestBody.comment_id,
        rpc_name: rpcName,
        ...(summarizeSupabaseError(error) ?? {}),
      });

      throw createPhase2DatabaseError(error, {
        contextLabel: 'Social comment like update',
        fallbackCode: 'social_comment_like_update_failed',
        fallbackMessage: 'Failed to update the social comment like',
        rpcName,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responseBody = buildSocialSetCommentLikeResponse(
      row,
      requestBody.comment_id,
      requestId,
    );

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-set-comment-like] Request failed', error, {
      request_id: requestId,
      comment_id: commentIdForLog,
      error_message: error instanceof Error ? error.message : undefined,
      ...(summarizeSupabaseError(error) ?? {}),
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
