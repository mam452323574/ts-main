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
import { parseSocialAdminAdjustPostReactionsRequest } from '../_shared/phase2Contracts.ts';
import {
  createPhase2DatabaseError,
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
  isRecord,
  PHASE2_SOCIAL_REQUEST_MAX_BYTES,
  readJsonBody,
  readOptionalNumber,
  readOptionalString,
} from '../_shared/phase2Utils.ts';
import type {
  SocialAdminAdjustPostReactionsResponse,
} from '../_shared/phase2Types.ts';

interface AdjustPostReactionRpcRow {
  post_id: string;
  raw_like_count: number;
  raw_dislike_count: number;
  admin_like_adjustment: number;
  admin_dislike_adjustment: number;
  effective_like_count: number;
  effective_dislike_count: number;
}

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function computeEffectiveCount(rawCount: number, adminAdjustment: number) {
  return Math.max(0, rawCount + adminAdjustment);
}

function normalizeAdjustPostReactionRpcRow(payload: unknown): AdjustPostReactionRpcRow {
  const row = Array.isArray(payload) ? payload[0] : payload;

  if (!isRecord(row)) {
    throw new Phase2HttpError(
      500,
      'adjust_reactions_invalid_payload',
      'The reaction adjustment RPC returned an invalid payload',
    );
  }

  const postId = readOptionalString(row.post_id);
  if (!postId) {
    throw new Phase2HttpError(
      500,
      'adjust_reactions_invalid_payload',
      'The reaction adjustment RPC returned an incomplete payload',
    );
  }

  return {
    post_id: postId,
    raw_like_count: readOptionalNumber(row.raw_like_count) ?? 0,
    raw_dislike_count: readOptionalNumber(row.raw_dislike_count) ?? 0,
    admin_like_adjustment: readOptionalNumber(row.admin_like_adjustment) ?? 0,
    admin_dislike_adjustment: readOptionalNumber(row.admin_dislike_adjustment) ?? 0,
    effective_like_count: readOptionalNumber(row.effective_like_count) ?? 0,
    effective_dislike_count: readOptionalNumber(row.effective_dislike_count) ?? 0,
  };
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

    // S-04 — adjust reactions modifie un compteur visible publiquement.
    // Limite plus permissive (60/h) car non destructeur, mais previent
    // un admin compromis qui spammerait des manipulations de feed.
    // Fail-closed sur erreur DB.
    // S-09 — on compte uniquement les .intent rows pour ne pas doubler avec
    // les .outcome (best-effort).
    await enforceAdminRateLimit(supabase, {
      actorId: user.id,
      actionPattern: 'social_admin_adjust_post_reactions.intent',
      maxActions: 60,
      windowMs: 60 * 60 * 1000,
    });

    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const requestBody = parseSocialAdminAdjustPostReactionsRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    // S-09 — Idempotency-Key + audit log INSERT BEFORE l'action.
    const headerIdempotencyKey = req.headers.get('Idempotency-Key');
    const idempotencyKey =
      typeof headerIdempotencyKey === 'string' && headerIdempotencyKey.trim().length > 0
        ? headerIdempotencyKey.trim()
        : crypto.randomUUID();

    await logAdminAuditEvent(supabase, {
      actorId: user.id,
      action: 'social_admin_adjust_post_reactions.intent',
      requestId,
      idempotencyKey,
      metadata: {
        post_id: requestBody.post_id,
        admin_like_adjustment: requestBody.admin_like_adjustment,
        admin_dislike_adjustment: requestBody.admin_dislike_adjustment,
        note: requestBody.note ?? null,
        phase: 'intent',
      },
      critical: true,
    });

    const { data: existingPost, error: existingPostError } = await supabase
      .from('social_posts')
      .select(
        'id, author_id, moderation_state, deleted_at, like_count, dislike_count, admin_like_adjustment, admin_dislike_adjustment',
      )
      .eq('id', requestBody.post_id)
      .maybeSingle();

    if (existingPostError) {
      throw createPhase2DatabaseError(existingPostError, {
        contextLabel: 'Social post reaction adjustment lookup',
        fallbackCode: 'social_post_lookup_failed',
        fallbackMessage: 'Failed to load the social post before adjusting reactions',
        relationName: 'social_posts',
      });
    }

    if (!existingPost || existingPost.deleted_at) {
      throw new Phase2HttpError(404, 'post_not_found', 'Social post not found');
    }

    const previousRawLikeCount = readOptionalNumber(existingPost.like_count) ?? 0;
    const previousRawDislikeCount = readOptionalNumber(existingPost.dislike_count) ?? 0;
    const previousAdminLikeAdjustment =
      readOptionalNumber(existingPost.admin_like_adjustment) ?? 0;
    const previousAdminDislikeAdjustment =
      readOptionalNumber(existingPost.admin_dislike_adjustment) ?? 0;

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'set_social_post_admin_reaction_adjustments',
      {
        p_post_id: requestBody.post_id,
        p_admin_like_adjustment: requestBody.admin_like_adjustment,
        p_admin_dislike_adjustment: requestBody.admin_dislike_adjustment,
      },
    );

    if (rpcError) {
      throw createPhase2DatabaseError(rpcError, {
        contextLabel: 'Social post reaction adjustment',
        fallbackCode: 'social_post_adjust_reactions_failed',
        fallbackMessage: 'Failed to adjust social post reactions',
        rpcName: 'set_social_post_admin_reaction_adjustments',
      });
    }

    const updatedCounts = normalizeAdjustPostReactionRpcRow(rpcData);
    const moderationState = normalizeModerationState(
      existingPost.moderation_state,
      'pending',
    );

    const eventId = await createSocialModerationEvent(supabase, {
      targetType: 'post',
      targetId: requestBody.post_id,
      actor: {
        actor_type: 'admin',
        actor_id: user.id,
        actor_label: null,
      },
      action: 'adjust_reactions',
      previousState: moderationState,
      nextState: moderationState,
      note: requestBody.note ?? null,
      linkedReportIds: [],
      metadata: {
        source: 'social_admin_adjust_post_reactions',
        target_author_id: existingPost.author_id ?? null,
        previous: {
          raw_like_count: previousRawLikeCount,
          raw_dislike_count: previousRawDislikeCount,
          admin_like_adjustment: previousAdminLikeAdjustment,
          admin_dislike_adjustment: previousAdminDislikeAdjustment,
          effective_like_count: computeEffectiveCount(
            previousRawLikeCount,
            previousAdminLikeAdjustment,
          ),
          effective_dislike_count: computeEffectiveCount(
            previousRawDislikeCount,
            previousAdminDislikeAdjustment,
          ),
        },
        next: {
          raw_like_count: updatedCounts.raw_like_count,
          raw_dislike_count: updatedCounts.raw_dislike_count,
          admin_like_adjustment: updatedCounts.admin_like_adjustment,
          admin_dislike_adjustment: updatedCounts.admin_dislike_adjustment,
          effective_like_count: updatedCounts.effective_like_count,
          effective_dislike_count: updatedCounts.effective_dislike_count,
        },
      },
    });

    const responseBody: SocialAdminAdjustPostReactionsResponse = {
      success: true,
      post_id: updatedCounts.post_id,
      raw_like_count: updatedCounts.raw_like_count,
      raw_dislike_count: updatedCounts.raw_dislike_count,
      admin_like_adjustment: updatedCounts.admin_like_adjustment,
      admin_dislike_adjustment: updatedCounts.admin_dislike_adjustment,
      effective_like_count: updatedCounts.effective_like_count,
      effective_dislike_count: updatedCounts.effective_dislike_count,
      event_id: eventId,
    };

    // S-09 — Outcome log (best-effort). Pas d'idempotency_key ici (deja
    // consomme par le .intent log au debut).
    await logAdminAuditEvent(supabase, {
      actorId: user.id,
      action: 'social_admin_adjust_post_reactions.outcome',
      requestId,
      metadata: {
        post_id: updatedCounts.post_id,
        event_id: eventId,
        target_author_id: existingPost.author_id ?? null,
        admin_like_adjustment: updatedCounts.admin_like_adjustment,
        admin_dislike_adjustment: updatedCounts.admin_dislike_adjustment,
        phase: 'completed',
      },
      critical: false,
    });

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-admin-adjust-post-reactions] Request failed', error, {
      request_id: requestId,
    });

    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
