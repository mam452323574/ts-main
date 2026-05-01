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
import { parseSocialReportContentRequest } from '../_shared/phase2Contracts.ts';
import { getOptionalWebhookUrl } from '../_shared/phase2Env.ts';
import { getPhase2ErrorStatus, Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
  summarizeProviderPayload,
  summarizeWebhookResult,
} from '../_shared/phase2Observability.ts';
import { shouldAutoHideForReports } from '../_shared/phase2Moderation.ts';
import {
  assertReportableTargetNotOwnedByUser,
  fetchViewerProfileSnapshot,
  getRecentReportCount24h,
  getReportableTarget,
  getSocialRateLimit,
} from '../_shared/phase2Social.ts';
import { postWebhookJson } from '../_shared/phase2Webhook.ts';
import { PHASE2_SOCIAL_REQUEST_MAX_BYTES, readJsonBody, readOptionalString } from '../_shared/phase2Utils.ts';
import type { SocialReportContentResponse } from '../_shared/phase2Types.ts';

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
      'Social reporting is currently disabled',
    );

    const requestBody = parseSocialReportContentRequest(
      await readJsonBody(req, { maxBytes: PHASE2_SOCIAL_REQUEST_MAX_BYTES }),
    );
    const rateLimit = await getSocialRateLimit(supabase, 'report', user.id);
    if (!rateLimit.allowed) {
      throw new Phase2HttpError(
        429,
        'report_rate_limit_reached',
        'Report rate limit reached',
        { rate_limit: rateLimit },
      );
    }

    await ensureUserProfileExistsForAuthenticatedUser(supabase, user);
    const reporterSnapshot = await fetchViewerProfileSnapshot(supabase, user.id);
    const reportableTarget = await getReportableTarget(
      supabase,
      user.id,
      requestBody.target_type,
      requestBody.target_type === 'post'
        ? requestBody.target_post_id!
        : requestBody.target_comment_id!,
    );
    assertReportableTargetNotOwnedByUser(reportableTarget, user.id);

    const { data: createdReport, error: createError } = await supabase
      .from('social_reports')
      .insert({
        reporter_id: user.id,
        target_type: requestBody.target_type,
        target_post_id: requestBody.target_post_id ?? null,
        target_comment_id: requestBody.target_comment_id ?? null,
        target_author_id:
          typeof reportableTarget.author_id === 'string'
            ? reportableTarget.author_id
            : null,
        reason_code: requestBody.reason_code,
        details: requestBody.details ?? null,
        workflow_status: 'submitted',
        moderation_state: 'pending',
        reporter_snapshot_json: {
          id: user.id,
          username: reporterSnapshot.username,
          account_tier: reporterSnapshot.account_tier,
        },
        target_snapshot_json: {
          id:
            requestBody.target_type === 'post'
              ? requestBody.target_post_id
              : requestBody.target_comment_id,
          post_id:
            requestBody.target_type === 'comment'
              ? reportableTarget.post_id ?? null
              : null,
          author_id:
            typeof reportableTarget.author_id === 'string'
              ? reportableTarget.author_id
              : null,
          author_username:
            typeof reportableTarget.author_username === 'string'
              ? reportableTarget.author_username
              : null,
          category:
            requestBody.target_type === 'post' &&
            typeof reportableTarget.category === 'string'
              ? reportableTarget.category
              : null,
          content_text:
            typeof reportableTarget.content_text === 'string'
              ? reportableTarget.content_text
              : null,
          moderation_state:
            typeof reportableTarget.moderation_state === 'string'
              ? reportableTarget.moderation_state
              : null,
          created_at:
            typeof reportableTarget.created_at === 'string'
              ? reportableTarget.created_at
              : null,
        },
      })
      .select('id, workflow_status')
      .single();

    if (createError?.code === '23505') {
      throw new Phase2HttpError(
        409,
        'duplicate_report',
        'This content has already been reported by the current user',
      );
    }

    if (createError || !createdReport) {
      throw new Phase2HttpError(
        500,
        'social_report_create_failed',
        'Failed to create social report',
      );
    }

    let workflowStatus = createdReport.workflow_status;
    const reportCount24h = await getRecentReportCount24h(
      supabase,
      requestBody.target_type,
      requestBody.target_type === 'post'
        ? requestBody.target_post_id!
        : requestBody.target_comment_id!,
    );
    const reportWebhookUrl = getOptionalWebhookUrl(
      'N8N_SOCIAL_REPORT_WEBHOOK_URL',
    );

    if (reportWebhookUrl) {
      const webhookResult = await postWebhookJson(reportWebhookUrl, {
        report_id: createdReport.id,
        reporter_id: user.id,
        target_type: requestBody.target_type,
        target_post_id: requestBody.target_post_id ?? null,
        target_comment_id: requestBody.target_comment_id ?? null,
        reason_code: requestBody.reason_code,
        details: requestBody.details ?? null,
        report_count_24h: reportCount24h,
        auto_hidden: shouldAutoHideForReports(reportCount24h, 3),
      });

      if (webhookResult.ok) {
        workflowStatus =
          readOptionalString(webhookResult.payload?.workflow_status) ?? 'reviewing';

        await supabase
          .from('social_reports')
          .update({
            workflow_status: workflowStatus,
            moderation_provider:
              readOptionalString(webhookResult.payload?.moderation_provider) ?? 'n8n',
            moderation_reason:
              readOptionalString(webhookResult.payload?.moderation_reason) ?? null,
            moderation_summary_json: summarizeProviderPayload(webhookResult.payload, {
              provider: 'n8n',
              report_count_24h: reportCount24h,
            }),
          })
          .eq('id', createdReport.id);
      } else {
        await supabase
          .from('social_reports')
          .update({
            moderation_reason: 'moderation_timeout',
            moderation_summary_json: summarizeWebhookResult(webhookResult, {
              provider: 'n8n',
              report_count_24h: reportCount24h,
            }),
          })
          .eq('id', createdReport.id);
      }
    }

    const responseBody: SocialReportContentResponse = {
      success: true,
      report_id: createdReport.id,
      workflow_status:
        workflowStatus === 'submitted' ||
        workflowStatus === 'reviewing' ||
        workflowStatus === 'resolved' ||
        workflowStatus === 'dismissed'
          ? workflowStatus
          : 'submitted',
    };

    return jsonResponse(req, responseBody);
  } catch (error) {
    logPhase2Error('[social-report-content] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
