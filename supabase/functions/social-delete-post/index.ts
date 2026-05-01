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
import { parseSocialDeletePostRequest } from '../_shared/phase2Contracts.ts';
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
import { assertDeletableSocialPost } from '../_shared/phase2Social.ts';
import {
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import type { SocialDeletePostResponse } from '../_shared/phase2Types.ts';

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
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
      'Social deletion is currently disabled',
    );

    const requestBody = parseSocialDeletePostRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const existingPost = await assertDeletableSocialPost(
      supabase,
      user.id,
      requestBody.post_id,
    );
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const deletedAt = new Date().toISOString();

    const { data: deletedPost, error: deleteError } = await supabase
      .from('social_posts')
      .update({
        deleted_at: deletedAt,
        moderation_state: 'removed',
        moderation_reason: 'author_deleted',
        moderation_provider: 'user_delete',
        moderation_summary_json: {
          source: 'social_delete_post',
          deleted_by: user.id,
          deleted_at: deletedAt,
          previous_moderation_state: existingPost.moderation_state ?? null,
          previous_moderation_reason: existingPost.moderation_reason ?? null,
          previous_moderation_provider: existingPost.moderation_provider ?? null,
          previous_moderation_summary: existingPost.moderation_summary_json ?? {},
        },
        moderation_queued_at: null,
        moderation_claimed_at: null,
        moderation_completed_at: deletedAt,
        moderation_last_error: null,
        updated_at: deletedAt,
      })
      .eq('id', requestBody.post_id)
      .eq('author_id', user.id)
      .is('deleted_at', null)
      .select('id, deleted_at, moderation_state')
      .maybeSingle();

    if (deleteError) {
      throw createPhase2DatabaseError(deleteError, {
        contextLabel: 'Social post delete',
        fallbackCode: 'social_post_delete_failed',
        fallbackMessage: 'Failed to delete social post',
        relationName: 'social_posts',
      });
    }

    if (!deletedPost?.id || typeof deletedPost.deleted_at !== 'string') {
      throw new Phase2HttpError(
        409,
        'post_already_deleted',
        'Social post already deleted',
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
        resolution_note: 'Resolved automatically after author deletion',
        updated_at: deletedAt,
      })
      .eq('target_type', 'post')
      .eq('target_post_id', requestBody.post_id)
      .in('workflow_status', ['submitted', 'reviewing']);

    if (reportsError) {
      throw createPhase2DatabaseError(reportsError, {
        contextLabel: 'Social report resolution after post delete',
        fallbackCode: 'social_report_resolution_failed',
        fallbackMessage: 'Failed to resolve linked social reports',
        relationName: 'social_reports',
      });
    }

    const responseBody: SocialDeletePostResponse = {
      success: true,
      post_id: deletedPost.id,
      moderation_state: 'removed',
      deleted_at: deletedPost.deleted_at,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-delete-post] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
