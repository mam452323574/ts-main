import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseSocialReserveUploadRequest } from '../_shared/phase2Contracts.ts';
import {
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  PHASE2_SOCIAL_BUCKET,
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  buildReservedSocialUploadPath,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import { assertUserWithinStorageQuota } from '../_shared/userQuota.ts';
import type { SocialReserveUploadResponse } from '../_shared/phase2Types.ts';

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
      'Social posting is currently disabled',
    );

    const requestBody = parseSocialReserveUploadRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const uploadId = crypto.randomUUID();
    const assetPath = buildReservedSocialUploadPath(
      user.id,
      uploadId,
      requestBody.mime_type,
    );

    const { count: recentReservationCount, error: countError } = await supabase
      .from('social_upload_reservations')
      .select('upload_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (countError) {
      throw new Phase2HttpError(
        500,
        'social_upload_reservation_lookup_failed',
        'Failed to check upload reservation rate limit',
      );
    }

    if ((recentReservationCount ?? 0) >= 20) {
      throw new Phase2HttpError(
        429,
        'social_upload_reservation_rate_limited',
        'Too many upload reservations',
      );
    }

    // Per-user storage quota check before reserving a slot. We don't know
    // the exact incoming size yet (client uploads after this call), so we
    // assume the worst case (10 MB, the bucket file_size_limit).
    await assertUserWithinStorageQuota(supabase, user.id, 10 * 1024 * 1024);

    const { error: reservationError } = await supabase
      .from('social_upload_reservations')
      .insert({
        upload_id: uploadId,
        user_id: user.id,
        asset_path: assetPath,
        mime_type: requestBody.mime_type,
        status: 'reserved',
      });

    if (reservationError) {
      throw new Phase2HttpError(
        500,
        'social_upload_reservation_failed',
        'Failed to reserve social upload',
      );
    }

    const responseBody: SocialReserveUploadResponse = {
      success: true,
      upload_id: uploadId,
      asset_path: assetPath,
      bucket: PHASE2_SOCIAL_BUCKET,
      mime_type: requestBody.mime_type,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-reserve-upload] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
