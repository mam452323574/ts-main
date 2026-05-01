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
import { parseSocialUpdateCommentRequest } from '../_shared/phase2Contracts.ts';
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
import { buildInitialSocialModerationFields } from '../_shared/phase2Moderation.ts';
import {
  assertEditableSocialComment,
  assertNoRecentDuplicateCommentExcluding,
  getSocialCommentSnapshotForUser,
  getSocialRejectionCooldown,
} from '../_shared/phase2Social.ts';
import {
  normalizeSocialText,
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
  sha256Hex,
} from '../_shared/phase2Utils.ts';
import type {
  Phase2ModerationState,
  SocialUpdateCommentResponse,
} from '../_shared/phase2Types.ts';

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

    const requestBody = parseSocialUpdateCommentRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const existingComment = await assertEditableSocialComment(
      supabase,
      user.id,
      requestBody.comment_id,
    );
    const normalizedContentText = normalizeSocialText(requestBody.content_text);

    if (normalizedContentText === existingComment.content_text) {
      const responseBody: SocialUpdateCommentResponse = {
        success: true,
        comment: await getSocialCommentSnapshotForUser(
          supabase,
          user.id,
          requestBody.comment_id,
        ),
      };

      return jsonResponse(req, responseBody);
    }

    const cooldown = await getSocialRejectionCooldown(supabase, user.id);
    if (cooldown.active) {
      throw new Phase2HttpError(
        429,
        'rejected_content_cooldown_active',
        'Comment editing is temporarily unavailable after repeated rejected content',
        { cooldown },
      );
    }

    const contentHash = await sha256Hex(normalizedContentText);
    await assertNoRecentDuplicateCommentExcluding(
      supabase,
      user.id,
      contentHash,
      requestBody.comment_id,
    );
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);

    const nextModerationState: Phase2ModerationState = featureFlags.moderation_enabled
      ? 'pending'
      : 'approved';
    const moderationFields = buildInitialSocialModerationFields(
      nextModerationState,
    );
    const previousSummary = isRecord(existingComment.moderation_summary_json)
      ? existingComment.moderation_summary_json
      : {};
    const previousEditCount = (() => {
      const rawValue = previousSummary.edit_count;
      return typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? Math.max(0, Math.floor(rawValue))
        : 0;
    })();
    const editedAt = new Date().toISOString();
    const nextModerationSummary = {
      ...previousSummary,
      edit_count: previousEditCount + 1,
      edited_at: editedAt,
      last_edit: {
        source: 'social_update_comment',
        edited_by: user.id,
        edited_at: editedAt,
        previous_moderation_state: existingComment.moderation_state ?? null,
        previous_moderation_reason: existingComment.moderation_reason ?? null,
        previous_moderation_provider: existingComment.moderation_provider ?? null,
        previous_content_hash: existingComment.content_hash ?? null,
        resubmitted_for_moderation: nextModerationState === 'pending',
      },
    };

    const { data: updatedComment, error: updateError } = await supabase
      .from('social_comments')
      .update({
        content_text: normalizedContentText,
        content_hash: contentHash,
        moderation_state: nextModerationState,
        moderation_reason: null,
        moderation_provider: null,
        moderation_summary_json: nextModerationSummary,
        updated_at: editedAt,
        ...moderationFields,
      })
      .eq('id', requestBody.comment_id)
      .eq('author_id', user.id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw createPhase2DatabaseError(updateError, {
        contextLabel: 'Social comment update',
        fallbackCode: 'social_comment_update_failed',
        fallbackMessage: 'Failed to update social comment',
        relationName: 'social_comments',
      });
    }

    if (!updatedComment?.id) {
      throw new Phase2HttpError(
        409,
        'comment_update_conflict',
        'Social comment could not be updated',
      );
    }

    const responseBody: SocialUpdateCommentResponse = {
      success: true,
      comment: await getSocialCommentSnapshotForUser(
        supabase,
        user.id,
        requestBody.comment_id,
      ),
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-update-comment] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
