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
import { parseSocialRecordImpressionsRequest } from '../_shared/phase2Contracts.ts';
import { getPhase2ErrorStatus, Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import { getSocialRateLimit } from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody } from '../_shared/phase2Utils.ts';
import type { SocialRecordImpressionsResponse } from '../_shared/phase2Types.ts';

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
      'Social impressions are currently disabled',
    );

    const requestBody = parseSocialRecordImpressionsRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    const rateLimit = await getSocialRateLimit(supabase, 'impression', user.id);
    if (!rateLimit.allowed) {
      throw new Phase2HttpError(
        429,
        'impression_rate_limit_reached',
        'Impression rate limit reached',
        { rate_limit: rateLimit },
      );
    }

    const { data: visiblePosts, error: visiblePostsError } = await supabase
      .from('social_posts')
      .select('id, author_id, moderation_state, deleted_at')
      .in('id', requestBody.post_ids);

    if (visiblePostsError) {
      throw new Phase2HttpError(
        500,
        'social_impression_lookup_failed',
        'Failed to validate visible posts for impressions',
      );
    }

    const visiblePostIds = (Array.isArray(visiblePosts) ? visiblePosts : [])
      .filter(
        (post) =>
          post.deleted_at === null &&
          post.moderation_state === 'approved' &&
          post.author_id !== user.id,
      )
      .map((post) => post.id)
      .filter((postId): postId is string => typeof postId === 'string' && postId.length > 0);

    if (visiblePostIds.length === 0) {
      const responseBody: SocialRecordImpressionsResponse = {
        success: true,
        recorded_count: 0,
      };
      return jsonResponse(req, responseBody);
    }

    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const { data, error } = await supabase.rpc('record_social_impressions', {
      p_post_ids: visiblePostIds,
      p_viewer_id: user.id,
      p_source: requestBody.source ?? 'feed',
    });

    if (error) {
      throw new Phase2HttpError(
        500,
        'social_impression_record_failed',
        'Failed to record post impressions',
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const responseBody: SocialRecordImpressionsResponse = {
      success: true,
      recorded_count: Number(row?.recorded_count ?? 0),
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-record-impressions] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
