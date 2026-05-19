import { createPhase2DatabaseError } from './phase2Errors.ts';
import type {
  Phase2ModerationActor,
  Phase2ModerationDecision,
  Phase2ModerationState,
  Phase2ModerationSubject,
  Phase2SocialModerationAction,
  Phase2SocialModerationEventAction,
  Phase2SocialModerationEventTargetType,
  Phase2SocialReportTargetType,
  Phase2SocialReportWorkflowStatus,
} from './phase2Types.ts';

const VALID_MODERATION_STATES: readonly Phase2ModerationState[] = [
  'pending',
  'approved',
  'rejected',
  'flagged',
  'hidden',
  'removed',
] as const;

const VALID_REPORT_WORKFLOW_STATUSES: readonly Phase2SocialReportWorkflowStatus[] = [
  'submitted',
  'reviewing',
  'resolved',
  'dismissed',
] as const;

const VALID_MODERATION_ACTIONS: readonly Phase2SocialModerationAction[] = [
  'approve',
  'flag',
  'hide',
  'remove',
  'restore',
  'reject',
  'dismiss_reports',
] as const;

export function normalizeModerationState(
  value: unknown,
  fallback: Phase2ModerationState = 'pending',
): Phase2ModerationState {
  return typeof value === 'string' &&
    VALID_MODERATION_STATES.includes(value as Phase2ModerationState)
    ? (value as Phase2ModerationState)
    : fallback;
}

export function readWebhookModerationState(
  payload: Record<string, unknown> | null,
) {
  return normalizeModerationState(payload?.moderation_state, 'pending');
}

export function normalizeReportWorkflowStatus(
  value: unknown,
  fallback: Phase2SocialReportWorkflowStatus = 'submitted',
): Phase2SocialReportWorkflowStatus {
  return typeof value === 'string' &&
    VALID_REPORT_WORKFLOW_STATUSES.includes(value as Phase2SocialReportWorkflowStatus)
    ? (value as Phase2SocialReportWorkflowStatus)
    : fallback;
}

export function normalizeModerationAction(
  value: unknown,
  fallback: Phase2SocialModerationAction = 'flag',
): Phase2SocialModerationAction {
  return typeof value === 'string' &&
    VALID_MODERATION_ACTIONS.includes(value as Phase2SocialModerationAction)
    ? (value as Phase2SocialModerationAction)
    : fallback;
}

export function resolveModerationStateForAction(
  action: Phase2SocialModerationAction,
  previousState: Phase2ModerationState,
): Phase2ModerationState | null {
  switch (action) {
    case 'approve':
      return 'approved';
    case 'flag':
      return 'flagged';
    case 'hide':
      return 'hidden';
    case 'remove':
      return 'removed';
    case 'restore':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'dismiss_reports':
      return previousState;
    default:
      return previousState;
  }
}

// S-08 — Seuil d'auto-hide hardcode. Le parametre `threshold` precedemment expose
// permettait a un caller fautif (ou compromis) de passer 0 (auto-hide immediat)
// ou Infinity (jamais d'auto-hide). Si la valeur doit varier dans le futur, lire
// d'une config table avec auth, pas d'un parametre passe par l'appelant.
export const SOCIAL_AUTO_HIDE_THRESHOLD = 3;

export function shouldAutoHideForReports(uniqueReportCount24h: number): boolean {
  // Validation defensive : compteur doit etre un entier positif.
  if (!Number.isFinite(uniqueReportCount24h) || uniqueReportCount24h < 0) {
    return false;
  }
  return uniqueReportCount24h >= SOCIAL_AUTO_HIDE_THRESHOLD;
}

export function buildInitialSocialModerationFields(
  moderationState: Phase2ModerationState,
  nowIso = new Date().toISOString(),
) {
  if (moderationState === 'pending') {
    return {
      moderation_queued_at: nowIso,
      moderation_claimed_at: null,
      moderation_completed_at: null,
      moderation_attempt_count: 0,
      moderation_last_error: null,
    };
  }

  return {
    moderation_queued_at: null,
    moderation_claimed_at: null,
    moderation_completed_at: nowIso,
    moderation_attempt_count: 0,
    moderation_last_error: null,
  };
}

export interface Phase2ModerationProvider {
  name: string;
  reviewSubject(
    subject: Phase2ModerationSubject,
  ): Promise<Phase2ModerationDecision> | Phase2ModerationDecision;
}

export function createManualReviewModerationProvider(): Phase2ModerationProvider {
  return {
    name: 'manual_review',
    reviewSubject(subject) {
      const decisionAt = new Date().toISOString();

      return {
        action: 'flag',
        next_state: 'flagged',
        reason_code: 'manual_review_required',
        provider: 'manual_review',
        labels: subject.asset_path || subject.asset_url ? ['asset_present'] : ['text_only'],
        confidence: null,
        summary: {
          source: 'social_process_moderation_queue',
          result: 'manual_review_required',
          moderation_state: 'flagged',
          moderation_reason: 'manual_review_required',
          moderation_provider: 'manual_review',
          decision_at: decisionAt,
          review_required: true,
          asset_present: Boolean(subject.asset_path || subject.asset_url),
          open_reports: subject.open_reports,
          total_reports_24h: subject.total_reports_24h,
          unique_reporters_24h: subject.unique_reporters_24h,
        },
      };
    },
  };
}

export function createSocialModerationProvider(): Phase2ModerationProvider {
  return createManualReviewModerationProvider();
}

function getSocialModerationTargetTable(
  targetType: Phase2SocialReportTargetType,
) {
  return targetType === 'post' ? 'social_posts' : 'social_comments';
}

function buildTargetScope(
  query: any,
  targetType: Phase2SocialReportTargetType,
  targetId: string,
) {
  return targetType === 'post'
    ? query.eq('target_post_id', targetId)
    : query.eq('target_comment_id', targetId);
}

export function resolveSocialReportWorkflowStatusForDecision(options: {
  action: Phase2SocialModerationAction;
  nextState: Phase2ModerationState | null;
  flaggedWorkflowStatus?: Extract<
    Phase2SocialReportWorkflowStatus,
    'reviewing' | 'resolved'
  >;
}): Phase2SocialReportWorkflowStatus {
  if (options.action === 'dismiss_reports') {
    return 'dismissed';
  }

  if (options.action === 'flag') {
    return options.flaggedWorkflowStatus ?? 'resolved';
  }

  if (
    options.nextState === 'approved' ||
    options.nextState === 'rejected' ||
    options.nextState === 'hidden' ||
    options.nextState === 'removed'
  ) {
    return 'resolved';
  }

  return 'reviewing';
}

export async function applySocialModerationDecisionToTarget(
  client: any,
  options: {
    targetType: Phase2SocialReportTargetType;
    targetId: string;
    nextState: Phase2ModerationState;
    reasonCode?: string | null;
    provider: string;
    summary: Record<string, unknown>;
  },
) {
  const targetTable = getSocialModerationTargetTable(options.targetType);
  const { data, error } = await client
    .from(targetTable)
    .update({
      moderation_state: options.nextState,
      moderation_reason: options.reasonCode ?? null,
      moderation_provider: options.provider,
      moderation_summary_json: options.summary,
      moderation_claimed_at: null,
      moderation_completed_at: new Date().toISOString(),
      moderation_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.targetId)
    .select('id, moderation_state')
    .single();

  if (error || !data) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation target update',
      fallbackCode: 'moderation_target_update_failed',
      fallbackMessage: 'Failed to update the moderation target',
      relationName: targetTable,
    });
  }

  return {
    id: data.id,
    moderation_state: normalizeModerationState(
      data.moderation_state,
      options.nextState,
    ),
  };
}

export async function markSocialModerationProcessingError(
  client: any,
  options: {
    targetType: Phase2SocialReportTargetType;
    targetId: string;
    message: string;
  },
) {
  const targetTable = getSocialModerationTargetTable(options.targetType);
  const { error } = await client
    .from(targetTable)
    .update({
      moderation_claimed_at: null,
      moderation_last_error: options.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.targetId);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation error update',
      fallbackCode: 'moderation_target_error_update_failed',
      fallbackMessage: 'Failed to record the moderation processing error',
      relationName: targetTable,
    });
  }
}

export async function updateLinkedSocialReportsForModerationDecision(
  client: any,
  options: {
    targetType: Phase2SocialReportTargetType;
    targetId: string;
    workflowStatus: Phase2SocialReportWorkflowStatus;
    moderationState: Phase2ModerationState;
    reasonCode?: string | null;
    provider: string;
    reviewedBy?: string | null;
    resolutionAction?: Phase2SocialModerationAction | null;
    resolutionNote?: string | null;
    reportIds?: string[];
  },
) {
  const nowIso = new Date().toISOString();
  let query = client
    .from('social_reports')
    .update({
      workflow_status: options.workflowStatus,
      moderation_state: options.moderationState,
      moderation_reason: options.reasonCode ?? null,
      moderation_provider: options.provider,
      reviewed_by:
        options.workflowStatus === 'resolved' || options.workflowStatus === 'dismissed'
          ? options.reviewedBy ?? null
          : null,
      reviewed_at:
        options.workflowStatus === 'resolved' || options.workflowStatus === 'dismissed'
          ? nowIso
          : null,
      resolution_action:
        options.workflowStatus === 'resolved' || options.workflowStatus === 'dismissed'
          ? options.resolutionAction ?? null
          : null,
      resolution_note:
        options.workflowStatus === 'resolved' || options.workflowStatus === 'dismissed'
          ? options.resolutionNote ?? null
          : null,
    })
    .eq('target_type', options.targetType)
    .in('workflow_status', ['submitted', 'reviewing']);

  query = buildTargetScope(query, options.targetType, options.targetId);

  if (options.reportIds && options.reportIds.length > 0) {
    query = query.in('id', options.reportIds);
  }

  const { data, error } = await query.select('id');

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation report update',
      fallbackCode: 'moderation_report_update_failed',
      fallbackMessage: 'Failed to update linked reports',
      relationName: 'social_reports',
    });
  }

  return (Array.isArray(data) ? data : [])
    .map((report) => report.id)
    .filter((reportId): reportId is string => typeof reportId === 'string' && reportId.length > 0);
}

export async function createSocialModerationEvent(
  client: any,
  options: {
    targetType: Phase2SocialModerationEventTargetType;
    targetId: string;
    actor: Phase2ModerationActor;
    action: Phase2SocialModerationEventAction;
    previousState?: Phase2ModerationState | null;
    nextState: Phase2ModerationState | null;
    reasonCode?: string | null;
    note?: string | null;
    linkedReportIds?: string[];
    metadata?: Record<string, unknown>;
  },
) {
  const { data, error } = await client
    .from('social_moderation_events')
    .insert({
      target_type: options.targetType,
      target_post_id: options.targetType === 'post' ? options.targetId : null,
      target_comment_id: options.targetType === 'comment' ? options.targetId : null,
      target_user_id: options.targetType === 'user' ? options.targetId : null,
      actor_id: options.actor.actor_id,
      actor_type: options.actor.actor_type,
      actor_label: options.actor.actor_label,
      action: options.action,
      previous_moderation_state: options.previousState ?? null,
      next_moderation_state: options.nextState,
      reason_code: options.reasonCode ?? null,
      note: options.note ?? null,
      linked_report_ids: options.linkedReportIds ?? [],
      metadata_json: options.metadata ?? {},
    })
    .select('id')
    .single();

  if (error || !data) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Social moderation audit event',
      fallbackCode: 'moderation_audit_create_failed',
      fallbackMessage: 'Failed to create moderation audit event',
      relationName: 'social_moderation_events',
    });
  }

  return data.id as string;
}

export function resolveSocialPublishModerationResult(options: {
  moderationEnabled: boolean;
}) {
  if (!options.moderationEnabled) {
    return {
      moderation_state: 'approved' as Phase2ModerationState,
      published: true,
    };
  }

  return {
    moderation_state: 'pending' as Phase2ModerationState,
    published: false,
  };
}
