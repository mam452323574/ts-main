import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient, requireAdminUserProfile, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseSocialModerateContentRequest } from '../_shared/phase2Contracts.ts';
import { getPhase2ErrorStatus, Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  applySocialModerationDecisionToTarget,
  createSocialModerationEvent,
  resolveModerationStateForAction,
  resolveSocialReportWorkflowStatusForDecision,
  updateLinkedSocialReportsForModerationDecision,
} from '../_shared/phase2Moderation.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody } from '../_shared/phase2Utils.ts';
import type {
  Phase2ModerationState,
  SocialModerateContentResponse,
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
    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );

    const requestBody = parseSocialModerateContentRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );

    const targetTable =
      requestBody.target_type === 'post' ? 'social_posts' : 'social_comments';
    const targetId =
      requestBody.target_type === 'post'
        ? requestBody.target_post_id!
        : requestBody.target_comment_id!;

    const { data: existingTarget, error: existingTargetError } = await supabase
      .from(targetTable)
      .select('id, author_id, moderation_state, moderation_reason, deleted_at')
      .eq('id', targetId)
      .maybeSingle();

    if (existingTargetError || !existingTarget) {
      throw new Phase2HttpError(404, 'moderation_target_not_found', 'Moderation target not found');
    }

    const previousState =
      typeof existingTarget.moderation_state === 'string'
        ? (existingTarget.moderation_state as Phase2ModerationState)
        : 'pending';
    const nextState = resolveModerationStateForAction(
      requestBody.action,
      previousState,
    );

    let appliedState: Phase2ModerationState | null = nextState;
    if (requestBody.action !== 'dismiss_reports') {
      const nextReason =
        requestBody.action === 'approve' || requestBody.action === 'restore'
          ? null
          : requestBody.reason_code ?? null;
      const updatedTarget = await applySocialModerationDecisionToTarget(
        supabase,
        {
          targetType: requestBody.target_type,
          targetId,
          nextState: nextState ?? previousState,
          reasonCode: nextReason,
          provider: 'admin',
          summary: {
            moderated_by: user.id,
            moderation_action: requestBody.action,
            moderation_note: requestBody.note ?? null,
            moderated_at: new Date().toISOString(),
            source: 'social_moderate_content',
          },
        },
      );

      appliedState = updatedTarget.moderation_state;
    }

    const linkedReportIds = await updateLinkedSocialReportsForModerationDecision(
      supabase,
      {
        targetType: requestBody.target_type,
        targetId,
        workflowStatus: resolveSocialReportWorkflowStatusForDecision({
          action: requestBody.action,
          nextState: appliedState,
        }),
        moderationState: appliedState ?? previousState,
        reasonCode: requestBody.reason_code ?? null,
        provider: 'admin',
        reviewedBy: user.id,
        resolutionAction: requestBody.action,
        resolutionNote: requestBody.note ?? null,
        reportIds: requestBody.report_ids,
      },
    );

    const moderationEventId = await createSocialModerationEvent(supabase, {
      targetType: requestBody.target_type,
      targetId,
      actor: {
        actor_type: 'admin',
        actor_id: user.id,
        actor_label: null,
      },
      action: requestBody.action,
      previousState,
      nextState: appliedState,
      reasonCode: requestBody.reason_code ?? null,
      note: requestBody.note ?? null,
      linkedReportIds,
      metadata: {
        target_author_id: existingTarget.author_id ?? null,
        affected_reports: linkedReportIds.length,
        target_table: targetTable,
      },
    });

    const responseBody: SocialModerateContentResponse = {
      success: true,
      target_type: requestBody.target_type,
      target_id: targetId,
      action: requestBody.action,
      moderation_state: appliedState,
      affected_reports: linkedReportIds.length,
      event_id: moderationEventId,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-moderate-content] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
