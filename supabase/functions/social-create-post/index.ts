import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  ensureUserProfileExistsForAuthenticatedUser,
  getSupabaseUrlOrThrow,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseSocialCreatePostRequest } from '../_shared/phase2Contracts.ts';
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
import {
  buildInitialSocialModerationFields,
  resolveSocialPublishModerationResult,
} from '../_shared/phase2Moderation.ts';
import { assertNoRecentDuplicatePost, assertOwnedScan, fetchViewerProfileSnapshot, getSocialRateLimit, getSocialRejectionCooldown, resolveReservedSocialUpload } from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_BUCKET, PHASE2_SOCIAL_REQUEST_MAX_BYTES, buildPublicStorageUrl, normalizeSocialText, readJsonBody, sha256Hex } from '../_shared/phase2Utils.ts';
import type { Phase2ModerationState, SocialCreatePostResponse } from '../_shared/phase2Types.ts';
import { assertImageWithinPixelBudget, stripImageMetadata } from '../_shared/imageHardening.ts';
import { assertUserWithinStorageQuota } from '../_shared/userQuota.ts';

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
    const supabaseUrl = getSupabaseUrlOrThrow();
    const user = await requireAuthenticatedUser(supabase, req);
    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social posting is currently disabled',
    );

    const { data: isBanned, error: banCheckError } = await supabase.rpc('is_user_banned', {
      p_user_id: user.id,
      p_scope: 'posts',
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
        'user_banned_posts',
        'You are banned from creating posts',
      );
    }

    const requestBody = parseSocialCreatePostRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const rateLimit = await getSocialRateLimit(supabase, 'post', user.id);
    if (!rateLimit.allowed) {
      throw new Phase2HttpError(
        429,
        'post_rate_limit_reached',
        'Post rate limit reached',
        { rate_limit: rateLimit },
      );
    }

    const cooldown = await getSocialRejectionCooldown(supabase, user.id);
    if (cooldown.active) {
      throw new Phase2HttpError(
        429,
        'rejected_content_cooldown_active',
        'Posting is temporarily unavailable after repeated rejected content',
        { cooldown },
      );
    }

    if (requestBody.scan_id) {
      await assertOwnedScan(supabase, user.id, requestBody.scan_id);
    }

    const moderationPlan = resolveSocialPublishModerationResult({
      moderationEnabled: featureFlags.moderation_enabled,
    });
    const reservedUpload = requestBody.upload_id
      ? await resolveReservedSocialUpload(supabase, {
        userId: user.id,
        uploadId: requestBody.upload_id,
        reservedAssetPath: requestBody.reserved_asset_path,
      })
      : null;

    if (requestBody.upload_id && reservedUpload) {
      const { data: reservation, error: reservationError } = await supabase
        .from('social_upload_reservations')
        .select('upload_id, asset_path, mime_type, status, expires_at')
        .eq('upload_id', requestBody.upload_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (reservationError || !reservation) {
        throw new Phase2HttpError(
          400,
          'social_upload_reservation_not_found',
          'Upload reservation was not found',
        );
      }

      if (
        reservation.status !== 'reserved' ||
        reservation.asset_path !== reservedUpload.asset_path ||
        new Date(reservation.expires_at).getTime() <= Date.now()
      ) {
        throw new Phase2HttpError(
          400,
          'social_upload_reservation_invalid',
          'Upload reservation is no longer valid',
        );
      }

      // Sanitize the uploaded asset : enforce a pixel budget against
      // decompression bombs and strip metadata (EXIF / XMP) to prevent
      // GPS / device fingerprint leaks via the public social-posts bucket.
      const { data: blob, error: downloadError } = await supabase.storage
        .from(PHASE2_SOCIAL_BUCKET)
        .download(reservedUpload.asset_path);
      if (downloadError || !blob) {
        throw new Phase2HttpError(
          500,
          'social_upload_download_failed',
          downloadError?.message ?? 'Failed to download reserved upload',
        );
      }
      const originalBytes = new Uint8Array(await blob.arrayBuffer());
      assertImageWithinPixelBudget(originalBytes, reservation.mime_type);
      const sanitizedBytes = stripImageMetadata(originalBytes, reservation.mime_type);
      await assertUserWithinStorageQuota(supabase, user.id, sanitizedBytes.byteLength);
      const { error: reuploadError } = await supabase.storage
        .from(PHASE2_SOCIAL_BUCKET)
        .upload(reservedUpload.asset_path, sanitizedBytes, {
          contentType: reservation.mime_type,
          upsert: true,
        });
      if (reuploadError) {
        throw new Phase2HttpError(
          500,
          'social_upload_sanitize_failed',
          reuploadError.message ?? 'Failed to re-upload sanitized asset',
        );
      }
    }

    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const profileSnapshot = await fetchViewerProfileSnapshot(supabase, user.id);
    const assetPath = reservedUpload?.asset_path ?? null;
    const assetUrl = assetPath
      ? buildPublicStorageUrl(supabaseUrl, PHASE2_SOCIAL_BUCKET, assetPath)
      : null;
    const normalizedContentText = requestBody.content_text
      ? normalizeSocialText(requestBody.content_text)
      : null;
    const contentHash = normalizedContentText
      ? await sha256Hex(normalizedContentText)
      : null;
    const assetHash = assetPath
      ? await sha256Hex(assetPath)
      : null;
    const initialModerationFields = buildInitialSocialModerationFields(
      moderationPlan.moderation_state,
    );

    await assertNoRecentDuplicatePost(supabase, user.id, {
      contentHash,
      assetHash,
    });

    const { data: createdPost, error: createError } = await supabase
      .from('social_posts')
      .insert({
        author_id: user.id,
        author_username: profileSnapshot.username,
        author_avatar_url: profileSnapshot.avatar_url,
        category: requestBody.category,
        scan_id: requestBody.scan_id ?? null,
        content_text: normalizedContentText,
        share_payload_snapshot: requestBody.share_payload_snapshot ?? null,
        asset_path: assetPath,
        asset_url: assetUrl,
        content_hash: contentHash,
        asset_hash: assetHash,
        language_code: requestBody.language_code ?? null,
        country_code: profileSnapshot.country_code ?? null,
        moderation_state: moderationPlan.moderation_state,
        ...initialModerationFields,
      })
      .select('id, moderation_state, asset_url')
      .single();

    if (createError || !createdPost) {
      throw createPhase2DatabaseError(createError, {
        contextLabel: 'Social publish',
        fallbackCode: 'social_post_create_failed',
        fallbackMessage: 'Failed to create social post',
        relationName: 'social_posts',
      });
    }

    if (requestBody.upload_id && assetPath) {
      const { data: consumedReservation, error: consumeReservationError } = await supabase
        .from('social_upload_reservations')
        .update({
          status: 'consumed',
          consumed_post_id: createdPost.id,
          consumed_at: new Date().toISOString(),
        })
        .select('upload_id')
        .eq('upload_id', requestBody.upload_id)
        .eq('user_id', user.id)
        .eq('asset_path', assetPath)
        .eq('status', 'reserved')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (consumeReservationError || !consumedReservation) {
        await supabase
          .from('social_posts')
          .delete()
          .eq('id', createdPost.id)
          .eq('author_id', user.id);

        throw new Phase2HttpError(
          409,
          'social_upload_reservation_consumed',
          'Upload reservation has already been consumed or expired',
        );
      }
    }

    const moderationState = createdPost.moderation_state as Phase2ModerationState;

    const responseBody: SocialCreatePostResponse = {
      success: true,
      post_id: createdPost.id,
      moderation_state: moderationState,
      published: moderationState === 'approved',
      asset_url: createdPost.asset_url ?? null,
      rate_limit: rateLimit,
      cooldown,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-create-post] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
