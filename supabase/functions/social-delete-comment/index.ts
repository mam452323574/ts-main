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
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import { parseSocialDeleteCommentRequest } from '../_shared/phase2Contracts.ts';
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
import { assertDeletableSocialComment } from '../_shared/phase2Social.ts';
import {
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import type { SocialDeleteCommentResponse } from '../_shared/phase2Types.ts';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
      'Social comments are currently disabled',
    );
    requireFeatureEnabled(
      featureFlags.social_comments_enabled,
      'social_comments_disabled',
      'Social comments are currently disabled',
    );

    const requestBody = parseSocialDeleteCommentRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const existingComment = await assertDeletableSocialComment(
      supabase,
      user.id,
      requestBody.comment_id,
    );
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const deletedAt = new Date().toISOString();
    const previousSummary = isRecord(existingComment.moderation_summary_json)
      ? existingComment.moderation_summary_json
      : {};

    const { data: deletedComment, error: deleteError } = await supabase
      .from('social_comments')
      .update({
        deleted_at: deletedAt,
        moderation_state: 'removed',
        moderation_reason: 'author_deleted',
        moderation_provider: 'user_delete',
        moderation_summary_json: {
          ...previousSummary,
          source: 'social_delete_comment',
          deleted_by: user.id,
          deleted_at: deletedAt,
          previous_moderation_state: existingComment.moderation_state ?? null,
          previous_moderation_reason: existingComment.moderation_reason ?? null,
          previous_moderation_provider: existingComment.moderation_provider ?? null,
          previous_moderation_summary: previousSummary,
        },
        moderation_queued_at: null,
        moderation_claimed_at: null,
        moderation_completed_at: deletedAt,
        moderation_last_error: null,
        updated_at: deletedAt,
      })
      .eq('id', requestBody.comment_id)
      .eq('author_id', user.id)
      .is('deleted_at', null)
      .select('id, post_id, deleted_at')
      .maybeSingle();

    if (deleteError) {
      throw createPhase2DatabaseError(deleteError, {
        contextLabel: 'Social comment delete',
        fallbackCode: 'social_comment_delete_failed',
        fallbackMessage: 'Failed to delete social comment',
        relationName: 'social_comments',
      });
    }

    if (
      !deletedComment?.id ||
      typeof deletedComment.post_id !== 'string' ||
      typeof deletedComment.deleted_at !== 'string'
    ) {
      throw new Phase2HttpError(
        409,
        'comment_already_deleted',
        'Social comment already deleted',
      );
    }

    const { error: reportsError } = await supabase
      .from('social_reports')
      .update({
        workflow_status: 'resolved',
        moderation_state: 'removed',
        moderation_reason: 'author_deleted',
        moderation_provider: 'user_delete',
        reviewed_at: deletedAt,
        reviewed_by: null,
        resolution_action: 'remove',
        resolution_note: 'Resolved automatically after author comment deletion',
        updated_at: deletedAt,
      })
      .eq('target_type', 'comment')
      .eq('target_comment_id', requestBody.comment_id)
      .in('workflow_status', ['submitted', 'reviewing']);

    if (reportsError) {
      throw createPhase2DatabaseError(reportsError, {
        contextLabel: 'Social report resolution after comment delete',
        fallbackCode: 'social_report_resolution_failed',
        fallbackMessage: 'Failed to resolve linked social reports',
        relationName: 'social_reports',
      });
    }

    const responseBody: SocialDeleteCommentResponse = {
      success: true,
      comment_id: deletedComment.id,
      post_id: deletedComment.post_id,
      deleted_at: deletedComment.deleted_at,
      moderation_state: 'removed',
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-delete-comment] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
