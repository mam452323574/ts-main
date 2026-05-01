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
import { parseSocialAdminModerateUserRequest } from '../_shared/phase2Contracts.ts';
import {
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createSocialModerationEvent,
} from '../_shared/phase2Moderation.ts';
import {
  appendSocialModerationEventMetadata,
  createUserBan,
  removeUserAvatar,
  revokeActiveUserBans,
} from '../_shared/phase2SocialAdminActions.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import type {
  SocialAdminModerateUserResponse,
} from '../_shared/phase2Types.ts';

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

    // S-03 — moderation user (ban/revoke/remove_avatar) : 30 par admin par
    // heure glissante. Plus permissif que eradicate car operation reversible
    // (sauf remove_avatar) et moins destructrice.
    await enforceAdminRateLimit(supabase, {
      actorId: user.id,
      actionPattern: 'social_admin_moderate_user%',
      maxActions: 30,
      windowMs: 60 * 60 * 1000,
    });

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const requestBody = parseSocialAdminModerateUserRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    const targetUserId = requestBody.target_user_id;
    let eventId: string | null = null;

    if (requestBody.action === 'ban_user') {
      let endsAt: string | null = null;
      if (requestBody.duration_hours && requestBody.duration_hours > 0) {
        const endsAtDate = new Date();
        endsAtDate.setHours(endsAtDate.getHours() + requestBody.duration_hours);
        endsAt = endsAtDate.toISOString();
      }

      const banId = await createUserBan(supabase, {
        userId: targetUserId,
        scope: requestBody.scope!,
        reason: requestBody.reason ?? null,
        issuedBy: user.id,
        endsAt,
      });

      eventId = await createSocialModerationEvent(supabase, {
        targetType: 'user',
        targetId: targetUserId,
        actor: {
          actor_type: 'admin',
          actor_id: user.id,
          actor_label: null,
        },
        action: 'ban_user',
        previousState: null,
        nextState: null,
        note: requestBody.reason ?? null,
        linkedReportIds: [],
        metadata: {
          source: 'social_admin_moderate_user',
          scope: requestBody.scope,
          duration_hours: requestBody.duration_hours ?? null,
          permanent: endsAt === null,
          ends_at: endsAt,
          ban_id: banId,
        },
      });
    } else if (requestBody.action === 'revoke_ban') {
      const revokedBanIds = await revokeActiveUserBans(supabase, {
        userId: targetUserId,
        revokedBy: user.id,
      });

      eventId = await createSocialModerationEvent(supabase, {
        targetType: 'user',
        targetId: targetUserId,
        actor: {
          actor_type: 'admin',
          actor_id: user.id,
          actor_label: null,
        },
        action: 'revoke_ban',
        previousState: null,
        nextState: null,
        note: requestBody.reason ?? null,
        linkedReportIds: [],
        metadata: {
          source: 'social_admin_moderate_user',
          revoked_count: revokedBanIds.length,
          revoked_ban_ids: revokedBanIds,
        },
      });
    } else {
      const avatarCleanup = await removeUserAvatar(supabase, targetUserId);

      eventId = await createSocialModerationEvent(supabase, {
        targetType: 'user',
        targetId: targetUserId,
        actor: {
          actor_type: 'admin',
          actor_id: user.id,
          actor_label: null,
        },
        action: 'remove_avatar',
        previousState: null,
        nextState: null,
        linkedReportIds: [],
        metadata: {
          source: 'social_admin_moderate_user',
          avatar_paths: avatarCleanup.avatarPaths,
          deleted_avatar_paths: avatarCleanup.deletedAvatarPaths,
          failed_avatar_paths: avatarCleanup.failedAvatarPaths,
        },
      });

      await appendSocialModerationEventMetadata(supabase, eventId, {
        storage_cleanup_status:
          avatarCleanup.failedAvatarPaths.length > 0
            ? avatarCleanup.deletedAvatarPaths.length > 0
              ? 'partial'
              : 'failed'
            : 'completed',
      });
    }

    const responseBody: SocialAdminModerateUserResponse = {
      success: true,
      action: requestBody.action,
      target_user_id: targetUserId,
      event_id: eventId,
    };

    await logAdminAuditEvent(supabase, {
      actorId: user.id,
      action: `social_admin_moderate_user_${requestBody.action}`,
      requestId,
      metadata: {
        target_user_id: targetUserId,
        event_id: eventId,
        scope: requestBody.scope ?? null,
        duration_hours: requestBody.duration_hours ?? null,
      },
    });

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-admin-moderate-user] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
