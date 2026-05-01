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
import { parseSocialCreateCommentRequest } from '../_shared/phase2Contracts.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import { createRequestId, logPhase2Error } from '../_shared/phase2Observability.ts';
import {
  buildInitialSocialModerationFields,
  resolveSocialPublishModerationResult,
} from '../_shared/phase2Moderation.ts';
import {
  assertCommentableSocialPost,
  assertNoRecentDuplicateComment,
  fetchViewerProfileSnapshot,
  getSocialRateLimit,
  getSocialRejectionCooldown,
} from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, normalizeSocialText, readJsonBody, sha256Hex } from '../_shared/phase2Utils.ts';
import type { Phase2ModerationState, SocialCreateCommentResponse } from '../_shared/phase2Types.ts';

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
      'Social comments are currently disabled',
    );
    requireFeatureEnabled(
      featureFlags.social_comments_enabled,
      'social_comments_disabled',
      'Social comments are currently disabled',
    );

    const { data: isBanned, error: banCheckError } = await supabase.rpc('is_user_banned', {
      p_user_id: user.id,
      p_scope: 'comments',
    });

    if (banCheckError) {
      throw createPhase2DatabaseError(banCheckError, {
        contextLabel: 'User ban check',
        fallbackCode: 'user_ban_check_failed',
        fallbackMessage: 'Failed to verify user moderation status',
        relationName: 'user_bans',
      });
    }

    if (isBanned === true) {
      throw new Phase2HttpError(
        403,
        'user_banned_comments',
        'You are banned from creating comments',
      );
    }

    const requestBody = parseSocialCreateCommentRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    await assertCommentableSocialPost(supabase, user.id, requestBody.post_id);

    const rateLimit = await getSocialRateLimit(supabase, 'comment', user.id);
    if (!rateLimit.allowed) {
      throw new Phase2HttpError(
        429,
        'comment_rate_limit_reached',
        'Comment rate limit reached',
        { rate_limit: rateLimit },
      );
    }

    const cooldown = await getSocialRejectionCooldown(supabase, user.id);
    if (cooldown.active) {
      throw new Phase2HttpError(
        429,
        'rejected_content_cooldown_active',
        'Commenting is temporarily unavailable after repeated rejected content',
        { cooldown },
      );
    }

    const moderationPlan = resolveSocialPublishModerationResult({
      moderationEnabled: featureFlags.moderation_enabled,
    });
    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const profileSnapshot = await fetchViewerProfileSnapshot(supabase, user.id);
    const normalizedContentText = normalizeSocialText(requestBody.content_text);
    const contentHash = await sha256Hex(normalizedContentText);
    const initialModerationFields = buildInitialSocialModerationFields(
      moderationPlan.moderation_state,
    );

    await assertNoRecentDuplicateComment(
      supabase,
      user.id,
      requestBody.post_id,
      contentHash,
    );
    const { data: createdComment, error: createError } = await supabase
      .from('social_comments')
      .insert({
        post_id: requestBody.post_id,
        author_id: user.id,
        author_username: profileSnapshot.username,
        author_avatar_url: profileSnapshot.avatar_url,
        content_text: normalizedContentText,
        content_hash: contentHash,
        moderation_state: moderationPlan.moderation_state,
        ...initialModerationFields,
      })
      .select('id, moderation_state, post_id')
      .single();

    if (createError || !createdComment) {
      throw createPhase2DatabaseError(createError, {
        contextLabel: 'Social comment publish',
        fallbackCode: 'social_comment_create_failed',
        fallbackMessage: 'Failed to create social comment',
        relationName: 'social_comments',
      });
    }

    const moderationState = createdComment.moderation_state as Phase2ModerationState;

    const responseBody: SocialCreateCommentResponse = {
      success: true,
      comment_id: createdComment.id,
      post_id: createdComment.post_id,
      moderation_state: moderationState,
      published: moderationState === 'approved',
      rate_limit: rateLimit,
      cooldown,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-create-comment] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
