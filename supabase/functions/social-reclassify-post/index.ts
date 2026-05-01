import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAdminUserProfile,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import { parseSocialReclassifyPostRequest } from '../_shared/phase2Contracts.ts';
import {
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createSocialModerationEvent,
  normalizeModerationState,
} from '../_shared/phase2Moderation.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
  readOptionalString,
  validatePhase2SocialCategory,
} from '../_shared/phase2Utils.ts';
import type { SocialReclassifyPostResponse } from '../_shared/phase2Types.ts';

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
    await requireAdminUserProfile(supabase, user.id);

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const requestBody = parseSocialReclassifyPostRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    const { data: existingPost, error: existingPostError } = await supabase
      .from('social_posts')
      .select('id, author_id, category, moderation_state, deleted_at')
      .eq('id', requestBody.post_id)
      .maybeSingle();

    if (existingPostError || !existingPost || existingPost.deleted_at) {
      throw new Phase2HttpError(404, 'post_not_found', 'Social post not found');
    }

    const previousCategory = validatePhase2SocialCategory(
      readOptionalString(existingPost.category),
    );

    if (previousCategory === requestBody.category) {
      throw new Phase2HttpError(
        409,
        'post_category_unchanged',
        'Social post category already set to the requested value',
      );
    }

    const moderationState = normalizeModerationState(
      existingPost.moderation_state,
      'pending',
    );

    const { data: updatedPost, error: updateError } = await supabase
      .from('social_posts')
      .update({
        category: requestBody.category,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestBody.post_id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (updateError || !updatedPost) {
      throw new Phase2HttpError(
        500,
        'post_reclassify_failed',
        'Failed to reclassify the social post category',
      );
    }

    const eventId = await createSocialModerationEvent(supabase, {
      targetType: 'post',
      targetId: requestBody.post_id,
      actor: {
        actor_type: 'admin',
        actor_id: user.id,
        actor_label: null,
      },
      action: 'reclassify_category',
      previousState: moderationState,
      nextState: moderationState,
      linkedReportIds: [],
      metadata: {
        previous_category: previousCategory,
        next_category: requestBody.category,
        target_author_id: existingPost.author_id ?? null,
        source: 'social_reclassify_post',
        moderation_state_at_change: moderationState,
      },
    });

    const responseBody: SocialReclassifyPostResponse = {
      success: true,
      post_id: requestBody.post_id,
      previous_category: previousCategory,
      category: requestBody.category,
      event_id: eventId,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-reclassify-post] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
