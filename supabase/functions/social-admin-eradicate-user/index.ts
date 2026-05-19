import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  enforceAdminRateLimit,
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

// S-09 — La RPC leve P0009 'idempotent_replay_already_processed' avec un HINT
// contenant le metadata JSON du precedent audit event. On parse pour rebuilder
// la reponse SocialAdminEradicateUserResponse. Si echec de parsing on retourne
// null → l'Edge Function renvoie 409 explicite.
function tryParseIdempotentReplayHint(
  hint: string | undefined | null,
): SocialAdminEradicateUserResponse | null {
  if (typeof hint !== 'string' || hint.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(hint);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const targetUserId = readOptionalString(parsed.target_user_id);
  const operationId = readOptionalString(parsed.operation_id);
  const eventId = readOptionalString(parsed.event_id);
  if (!targetUserId || !operationId || !eventId) return null;
  return {
    success: true,
    target_user_id: targetUserId,
    operation_id: operationId,
    event_id: eventId,
    post_count: readOptionalNumber(parsed.post_count) ?? 0,
    own_comment_count: readOptionalNumber(parsed.own_comment_count) ?? 0,
    cascaded_comment_count: readOptionalNumber(parsed.cascaded_comment_count) ?? 0,
    resolved_report_count: readOptionalNumber(parsed.resolved_report_count) ?? 0,
    ban_created: typeof parsed.ban_created === 'boolean' ? parsed.ban_created : false,
    // Le replay ne re-execute pas la cleanup storage : si l'asset n'a pas
    // ete supprime au 1er essai, il n'est pas re-tente. On marque
    // storage_cleanup_status='replayed' pour distinguer.
    storage_cleanup_status: 'completed',
    deleted_asset_paths: [],
    failed_asset_paths: [],
    deleted_avatar_paths: [],
    failed_avatar_paths: [],
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

    // S-04 / S-09 — eradication massive : 5 par admin par heure glissante.
    // Fail-closed (default) sur erreur DB ; idempotency_key cote RPC protege
    // contre le double-clic UI et les retries reseau.
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

    // S-09 — Idempotency-Key header propage cote RPC. Si l'admin clique deux
    // fois ou si le client retry sur erreur reseau, la 2e execution voit que
    // la cle a deja un audit event associe et leve P0009 → on replay
    // l'outcome de la 1re execution au lieu de re-eradiquer.
    const headerIdempotencyKey = req.headers.get('Idempotency-Key');
    const idempotencyKey =
      typeof headerIdempotencyKey === 'string' && headerIdempotencyKey.trim().length > 0
        ? headerIdempotencyKey.trim()
        : crypto.randomUUID();

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'admin_eradicate_social_user_content',
      {
        p_target_user_id: requestBody.target_user_id,
        p_actor_id: user.id,
        p_note: requestBody.note ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
      },
    );

    if (rpcError) {
      // S-09 — replay-detected : la RPC leve P0009 avec un HINT contenant le
      // metadata du precedent audit event. On reconstruit la reponse
      // precedente plutot que de re-executer.
      if (rpcError.code === 'P0009') {
        const replayedOutcome = tryParseIdempotentReplayHint(rpcError.hint);
        if (replayedOutcome) {
          return jsonResponse(req, replayedOutcome);
        }
        // Si le hint n'est pas parsable, on retourne 409 explicite : le client
        // sait qu'il a deja envoye cette operation et peut la considerer
        // comme reussie sans details.
        throw new Phase2HttpError(
          409,
          'idempotent_request_already_processed',
          'This operation was already processed with the same idempotency key',
        );
      }

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

    // S-09 — l'audit event a deja ete insere par la RPC dans la meme
    // transaction que l'eradication. On ne re-loggue pas ici pour eviter le
    // double comptage par enforceAdminRateLimit. Le storage cleanup status
    // (best-effort, hors transaction) est journalise dans le moderation event
    // via appendSocialModerationEventMetadata plus haut.

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
