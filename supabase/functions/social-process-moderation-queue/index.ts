import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireSocialModerationWorkerOrAdmin,
} from '../_shared/phase2Auth.ts';
import { loadPhase2FeatureFlags, requireFeatureEnabled } from '../_shared/phase2Config.ts';
import { parseSocialProcessModerationQueueRequest } from '../_shared/phase2Contracts.ts';
import { getPhase2ErrorStatus, Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  applySocialModerationDecisionToTarget,
  createSocialModerationEvent,
  createSocialModerationProvider,
  markSocialModerationProcessingError,
  resolveSocialReportWorkflowStatusForDecision,
  updateLinkedSocialReportsForModerationDecision,
} from '../_shared/phase2Moderation.ts';
import {
  claimSocialModerationBatch,
  fetchSocialModerationQueueForDryRun,
} from '../_shared/phase2Social.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES } from '../_shared/phase2Utils.ts';
import type {
  Phase2ModerationActor,
  Phase2ModerationDecision,
  Phase2ModerationSubject,
  SocialProcessModerationQueueResponse,
  SocialProcessModerationQueueResultItem,
} from '../_shared/phase2Types.ts';

const SOCIAL_MODERATION_WORKER_ACTOR: Phase2ModerationActor = {
  actor_type: 'system',
  actor_id: null,
  actor_label: 'social-moderation-worker',
};

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

async function readQueueRequestRawBody(req: Request) {
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredContentLength = Number(contentLengthHeader);
    if (
      Number.isFinite(declaredContentLength) &&
      declaredContentLength > PHASE2_SOCIAL_REQUEST_MAX_BYTES
    ) {
      throw new Phase2HttpError(
        413,
        'payload_too_large',
        `Request body must be ${PHASE2_SOCIAL_REQUEST_MAX_BYTES} bytes or fewer`,
      );
    }
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > PHASE2_SOCIAL_REQUEST_MAX_BYTES) {
    throw new Phase2HttpError(
      413,
      'payload_too_large',
      `Request body must be ${PHASE2_SOCIAL_REQUEST_MAX_BYTES} bytes or fewer`,
    );
  }

  return rawBody;
}

function parseQueueRequestBody(rawBody: string) {
  if (rawBody.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Phase2HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

function buildBaseResult(
  subject: Phase2ModerationSubject,
  options: {
    status: SocialProcessModerationQueueResultItem['status'];
    dryRun: boolean;
  },
): SocialProcessModerationQueueResultItem {
  return {
    content_type: subject.content_type,
    content_id: subject.content_id,
    previous_moderation_state: subject.moderation_state,
    moderation_state: null,
    action: null,
    provider: null,
    status: options.status,
    reason_code: null,
    event_id: null,
    affected_reports: 0,
    error_code: null,
    error_message: null,
    dry_run: options.dryRun,
  };
}

function buildProcessingErrorMessage(error: unknown) {
  if (error instanceof Phase2HttpError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown moderation processing error';
}

function buildPersistedModerationSummary(
  subject: Phase2ModerationSubject,
  decision: Phase2ModerationDecision,
  requestedByActor: Phase2ModerationActor,
  processedAt: string,
) {
  return {
    ...decision.summary,
    moderation_action: decision.action,
    moderation_state: decision.next_state,
    moderation_reason: decision.reason_code,
    moderation_provider: decision.provider,
    moderation_labels: decision.labels ?? [],
    moderation_confidence: decision.confidence ?? null,
    queue_subject: {
      content_type: subject.content_type,
      content_id: subject.content_id,
      asset_path: subject.asset_path,
      asset_url: subject.asset_url,
      open_reports: subject.open_reports,
      total_reports_24h: subject.total_reports_24h,
      unique_reporters_24h: subject.unique_reporters_24h,
      reason_codes: subject.reason_codes,
      moderation_attempt_count: subject.moderation_attempt_count,
      moderation_claimed_at: subject.moderation_claimed_at,
    },
    requested_by_actor_type: requestedByActor.actor_type,
    requested_by_actor_id: requestedByActor.actor_id,
    requested_by_actor_label: requestedByActor.actor_label,
    processed_by_actor_type: SOCIAL_MODERATION_WORKER_ACTOR.actor_type,
    processed_by_actor_label: SOCIAL_MODERATION_WORKER_ACTOR.actor_label,
    processed_at: processedAt,
  };
}

function buildDryRunResult(
  subject: Phase2ModerationSubject,
  decision: Phase2ModerationDecision,
): SocialProcessModerationQueueResultItem {
  return {
    ...buildBaseResult(subject, { status: 'selected', dryRun: true }),
    moderation_state: decision.next_state,
    action: decision.action,
    provider: decision.provider,
    reason_code: decision.reason_code,
    affected_reports: subject.open_reports,
  };
}

function buildProcessedResult(
  subject: Phase2ModerationSubject,
  decision: Phase2ModerationDecision,
  nextState: Phase2ModerationSubject['moderation_state'],
  eventId: string,
  affectedReports: number,
): SocialProcessModerationQueueResultItem {
  return {
    ...buildBaseResult(subject, { status: 'processed', dryRun: false }),
    moderation_state: nextState,
    action: decision.action,
    provider: decision.provider,
    reason_code: decision.reason_code,
    event_id: eventId,
    affected_reports: affectedReports,
  };
}

function buildFailedResult(
  subject: Phase2ModerationSubject,
  decision: Phase2ModerationDecision | null,
  error: unknown,
): SocialProcessModerationQueueResultItem {
  const errorCode =
    error instanceof Phase2HttpError ? error.code : 'social_moderation_processing_failed';

  return {
    ...buildBaseResult(subject, { status: 'failed', dryRun: false }),
    moderation_state: decision?.next_state ?? null,
    action: decision?.action ?? null,
    provider: decision?.provider ?? null,
    reason_code: decision?.reason_code ?? null,
    error_code: errorCode,
    error_message: buildProcessingErrorMessage(error),
  };
}

function buildWorkerEventNote(decision: Phase2ModerationDecision) {
  if (
    decision.action === 'flag' &&
    decision.reason_code === 'manual_review_required'
  ) {
    return 'Queued content routed to manual review by the async moderation worker';
  }

  return 'Asynchronous moderation worker decision';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const requestId = createRequestId();

  try {
    requirePostMethod(req);

    const rawBody = await readQueueRequestRawBody(req);
    const supabase = createServiceRoleClient();
    const requestedByActor = await requireSocialModerationWorkerOrAdmin(
      supabase,
      req,
      { rawBody },
    );
    const featureFlags = await loadPhase2FeatureFlags(supabase);
    requireFeatureEnabled(
      featureFlags.social_enabled,
      'social_disabled',
      'Social moderation is currently disabled',
    );
    requireFeatureEnabled(
      featureFlags.moderation_enabled,
      'moderation_disabled',
      'Social moderation worker is currently disabled',
    );

    const requestBody = parseSocialProcessModerationQueueRequest(
      parseQueueRequestBody(rawBody),
    );
    const moderationProvider = createSocialModerationProvider();

    if (requestBody.dry_run) {
      const selectedSubjects = await fetchSocialModerationQueueForDryRun(supabase, {
        contentType: requestBody.content_type,
        limit: requestBody.limit,
        staleAfterMinutes: requestBody.stale_after_minutes,
      });

      const results: SocialProcessModerationQueueResultItem[] = [];
      for (const subject of selectedSubjects) {
        const decision = await moderationProvider.reviewSubject(subject);
        results.push(buildDryRunResult(subject, decision));
      }

      const responseBody: SocialProcessModerationQueueResponse = {
        success: true,
        dry_run: true,
        selected_count: results.length,
        claimed_count: 0,
        processed_count: 0,
        failed_count: 0,
        results,
      };

      return jsonResponse(req, responseBody);
    }

    const claimedSubjects = await claimSocialModerationBatch(supabase, {
      contentType: requestBody.content_type,
      limit: requestBody.limit,
      staleAfterMinutes: requestBody.stale_after_minutes,
    });

    const results: SocialProcessModerationQueueResultItem[] = [];
    for (const subject of claimedSubjects) {
      let decision: Phase2ModerationDecision | null = null;

      try {
        decision = await moderationProvider.reviewSubject(subject);
        const processedAt = new Date().toISOString();
        const moderationSummary = buildPersistedModerationSummary(
          subject,
          decision,
          requestedByActor,
          processedAt,
        );

        const updatedTarget = await applySocialModerationDecisionToTarget(
          supabase,
          {
            targetType: subject.content_type,
            targetId: subject.content_id,
            nextState: decision.next_state,
            reasonCode: decision.reason_code,
            provider: decision.provider,
            summary: moderationSummary,
          },
        );

        const linkedReportIds = await updateLinkedSocialReportsForModerationDecision(
          supabase,
          {
            targetType: subject.content_type,
            targetId: subject.content_id,
            workflowStatus: resolveSocialReportWorkflowStatusForDecision({
              action: decision.action,
              nextState: updatedTarget.moderation_state,
              flaggedWorkflowStatus: 'reviewing',
            }),
            moderationState: updatedTarget.moderation_state,
            reasonCode: decision.reason_code,
            provider: decision.provider,
            reviewedBy: null,
            resolutionAction: decision.action,
            resolutionNote: buildWorkerEventNote(decision),
          },
        );

        const eventId = await createSocialModerationEvent(supabase, {
          targetType: subject.content_type,
          targetId: subject.content_id,
          actor: SOCIAL_MODERATION_WORKER_ACTOR,
          action: decision.action,
          previousState: subject.moderation_state,
          nextState: updatedTarget.moderation_state,
          reasonCode: decision.reason_code,
          note: buildWorkerEventNote(decision),
          linkedReportIds,
          metadata: {
            provider: decision.provider,
            labels: decision.labels ?? [],
            confidence: decision.confidence ?? null,
            summary: moderationSummary,
            requested_by_actor_type: requestedByActor.actor_type,
            requested_by_actor_id: requestedByActor.actor_id,
            requested_by_actor_label: requestedByActor.actor_label,
          },
        });

        results.push(
          buildProcessedResult(
            subject,
            decision,
            updatedTarget.moderation_state,
            eventId,
            linkedReportIds.length,
          ),
        );
      } catch (error) {
        try {
          await markSocialModerationProcessingError(supabase, {
            targetType: subject.content_type,
            targetId: subject.content_id,
            message: buildProcessingErrorMessage(error),
          });
        } catch (recordError) {
          logPhase2Error(
            '[social-process-moderation-queue] Failed to record moderation processing error',
            recordError,
            {
              request_id: requestId,
              content_type: subject.content_type,
              content_id: subject.content_id,
            },
          );
        }

        results.push(buildFailedResult(subject, decision, error));
      }
    }

    const responseBody: SocialProcessModerationQueueResponse = {
      success: true,
      dry_run: false,
      selected_count: 0,
      claimed_count: claimedSubjects.length,
      processed_count: results.filter((result) => result.status === 'processed').length,
      failed_count: results.filter((result) => result.status === 'failed').length,
      results,
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-process-moderation-queue] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
