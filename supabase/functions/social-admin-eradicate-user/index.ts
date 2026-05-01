import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  enforceAdminRateLimit,
  logAdminAuditEvent,
  requireAdminUserProfile,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  loadPhase2FeatureFlags,
  requireFeatureEnabled,
} from '../_shared/phase2Config.ts';
import { parseSocialAdminEradicateUserRequest } from '../_shared/phase2Contracts.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  appendSocialModerationEventMetadata,
  removeStorageObjectsIndividually,
  removeUserAvatar,
} from '../_shared/phase2SocialAdminActions.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  isRecord,
  PHASE2_SOCIAL_BUCKET,
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
  readOptionalNumber,
  readOptionalString,
} from '../_shared/phase2Utils.ts';
import type {
  SocialAdminEradicateUserResponse,
} from '../_shared/phase2Types.ts';

interface EradicationRpcRow {
  operation_id: string;
  event_id: string;
  target_user_id: string;
  post_count: number;
  own_comment_count: number;
  cascaded_comment_count: number;
  resolved_report_count: number;
  ban_created: boolean;
  asset_paths: string[];
}

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeEradicationRpcRow(payload: unknown): EradicationRpcRow {
  const row = Array.isArray(payload) ? payload[0] : payload;

  if (!isRecord(row)) {
    throw new Phase2HttpError(
      500,
      'eradication_invalid_payload',
      'The eradication RPC returned an invalid payload',
    );
  }

  const operationId = readOptionalString(row.operation_id);
  const eventId = readOptionalString(row.event_id);
  const targetUserId = readOptionalString(row.target_user_id);

  if (!operationId || !eventId || !targetUserId) {
    throw new Phase2HttpError(
      500,
      'eradication_invalid_payload',
      'The eradication RPC returned an incomplete payload',
    );
  }

  return {
    operation_id: operationId,
    event_id: eventId,
    target_user_id: targetUserId,
    post_count: readOptionalNumber(row.post_count) ?? 0,
    own_comment_count: readOptionalNumber(row.own_comment_count) ?? 0,
    cascaded_comment_count: readOptionalNumber(row.cascaded_comment_count) ?? 0,
    resolved_report_count: readOptionalNumber(row.resolved_report_count) ?? 0,
    ban_created: readBoolean(row.ban_created),
    asset_paths: Array.isArray(row.asset_paths)
      ? row.asset_paths.filter(
          (path): path is string => typeof path === 'string' && path.trim().length > 0,
        )
      : [],
  };
}

function resolveStorageCleanupStatus(options: {
  failedAssetPaths: string[];
  failedAvatarPaths: string[];
  avatarCleanupError: string | null;
  deletedAssetPaths: string[];
  deletedAvatarPaths: string[];
}) {
  const hasFailures =
    options.failedAssetPaths.length > 0 ||
    options.failedAvatarPaths.length > 0 ||
    options.avatarCleanupError !== null;
  const hasDeletes =
    options.deletedAssetPaths.length > 0 || options.deletedAvatarPaths.length > 0;

  if (!hasFailures) {
    return 'completed' as const;
  }

  return hasDeletes ? 'partial' as const : 'failed' as const;
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

    // S-03 — eradication massive est l'action la plus destructrice du systeme :
    // 5 par admin par heure glissante. Au-dela, retour 429 et l'admin doit
    // attendre. En cas de campagne legitime, augmenter via PHASE2_ADMIN_RATE_*.
    await enforceAdminRateLimit(supabase, {
      actorId: user.id,
      actionPattern: 'social_admin_eradicate_user%',
      maxActions: 5,
      windowMs: 60 * 60 * 1000,
    });

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const requestBody = parseSocialAdminEradicateUserRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'admin_eradicate_social_user_content',
      {
        p_target_user_id: requestBody.target_user_id,
        p_actor_id: user.id,
        p_note: requestBody.note ?? null,
      },
    );

    if (rpcError) {
      throw createPhase2DatabaseError(rpcError, {
        contextLabel: 'Social user eradication',
        fallbackCode: 'social_user_eradication_failed',
        fallbackMessage: 'Failed to eradicate the social user content',
        rpcName: 'admin_eradicate_social_user_content',
      });
    }

    const eradicationResult = normalizeEradicationRpcRow(rpcData);
    const assetCleanup = await removeStorageObjectsIndividually(
      supabase,
      PHASE2_SOCIAL_BUCKET,
      eradicationResult.asset_paths,
    );

    let deletedAvatarPaths: string[] = [];
    let failedAvatarPaths: string[] = [];
    let avatarCleanupError: string | null = null;

    try {
      const avatarCleanup = await removeUserAvatar(
        supabase,
        eradicationResult.target_user_id,
      );
      deletedAvatarPaths = avatarCleanup.deletedAvatarPaths;
      failedAvatarPaths = avatarCleanup.failedAvatarPaths;
    } catch (error) {
      avatarCleanupError = error instanceof Error
        ? error.message
        : 'Avatar cleanup failed unexpectedly';
      logPhase2Error('[social-admin-eradicate-user] Avatar cleanup failed', error, {
        request_id: requestId,
        target_user_id: eradicationResult.target_user_id,
        operation_id: eradicationResult.operation_id,
      });
    }

    const storageCleanupStatus = resolveStorageCleanupStatus({
      failedAssetPaths: assetCleanup.failedPaths,
      failedAvatarPaths,
      avatarCleanupError,
      deletedAssetPaths: assetCleanup.deletedPaths,
      deletedAvatarPaths,
    });

    await appendSocialModerationEventMetadata(supabase, eradicationResult.event_id, {
      storage_cleanup_status: storageCleanupStatus,
      deleted_asset_paths: assetCleanup.deletedPaths,
      failed_asset_paths: assetCleanup.failedPaths,
      deleted_avatar_paths: deletedAvatarPaths,
      failed_avatar_paths: failedAvatarPaths,
      social_post_asset_cleanup: {
        bucket: PHASE2_SOCIAL_BUCKET,
        deleted_paths: assetCleanup.deletedPaths,
        failed_paths: assetCleanup.failedPaths,
      },
      avatar_cleanup: {
        bucket: 'avatars',
        deleted_paths: deletedAvatarPaths,
        failed_paths: failedAvatarPaths,
        error: avatarCleanupError,
      },
    });

    const responseBody: SocialAdminEradicateUserResponse = {
      success: true,
      target_user_id: eradicationResult.target_user_id,
      operation_id: eradicationResult.operation_id,
      event_id: eradicationResult.event_id,
      post_count: eradicationResult.post_count,
      own_comment_count: eradicationResult.own_comment_count,
      cascaded_comment_count: eradicationResult.cascaded_comment_count,
      resolved_report_count: eradicationResult.resolved_report_count,
      ban_created: eradicationResult.ban_created,
      storage_cleanup_status: storageCleanupStatus,
      deleted_asset_paths: assetCleanup.deletedPaths,
      failed_asset_paths: assetCleanup.failedPaths,
      deleted_avatar_paths: deletedAvatarPaths,
      failed_avatar_paths: failedAvatarPaths,
    };

    await logAdminAuditEvent(supabase, {
      actorId: user.id,
      action: 'social_admin_eradicate_user',
      requestId,
      metadata: {
        target_user_id: eradicationResult.target_user_id,
        operation_id: eradicationResult.operation_id,
        event_id: eradicationResult.event_id,
        post_count: eradicationResult.post_count,
        own_comment_count: eradicationResult.own_comment_count,
        cascaded_comment_count: eradicationResult.cascaded_comment_count,
        storage_cleanup_status: storageCleanupStatus,
      },
    });

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-admin-eradicate-user] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
