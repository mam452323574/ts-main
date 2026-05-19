// S-18 — Edge Function de purge des assets storage apres rétention DB.
//
// Appelle la RPC public.purge_old_soft_deleted_social_content(retention_days)
// qui hard-delete les social_posts/social_comments soft-deletes depuis
// > retention_days jours, puis supprime les `asset_paths_to_cleanup` retournes
// du bucket social-posts.
//
// L'endpoint est protege par signature worker (meme mecanisme que
// social-process-moderation-queue) ou par un admin authentifie (fallback
// pour invocation manuelle). En prod, le caller normal est un scheduler
// externe ou la routine pg_cron (qui appelle directement la RPC, sans
// passer par cette Edge Function — auquel cas les assets ne seront pas
// purges et c'est la TTL du bucket qui prend le relais).
import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireSocialModerationWorkerOrAdmin,
} from '../_shared/phase2Auth.ts';
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
import { removeStorageObjectsIndividually } from '../_shared/phase2SocialAdminActions.ts';
import {
  isRecord,
  PHASE2_SOCIAL_BUCKET,
  readOptionalNumber,
} from '../_shared/phase2Utils.ts';

interface PurgeRpcRow {
  purged_post_count: number;
  purged_comment_count: number;
  asset_paths_to_cleanup: string[];
}

function normalizePurgeRpcRow(payload: unknown): PurgeRpcRow {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!isRecord(row)) {
    throw new Phase2HttpError(
      500,
      'social_purge_invalid_payload',
      'purge_old_soft_deleted_social_content returned an invalid payload',
    );
  }
  const assetPaths = Array.isArray(row.asset_paths_to_cleanup)
    ? row.asset_paths_to_cleanup.filter(
        (path): path is string => typeof path === 'string' && path.trim().length > 0,
      )
    : [];
  return {
    purged_post_count: readOptionalNumber(row.purged_post_count) ?? 0,
    purged_comment_count: readOptionalNumber(row.purged_comment_count) ?? 0,
    asset_paths_to_cleanup: assetPaths,
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
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const supabase = createServiceRoleClient();
    const rawBody = await req.text();

    // Auth : worker signature OU admin authentifie. requireSocialModerationWorkerOrAdmin
    // gere les deux cas en interne.
    const reconstructedReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: rawBody,
    });
    const actor = await requireSocialModerationWorkerOrAdmin(supabase, reconstructedReq, {
      rawBody,
    });

    // Parse optional body { retention_days?: number }. Defaut : 30 jours.
    let retentionDays = 30;
    if (rawBody.trim().length > 0) {
      const parsedBody = isRecord(JSON.parse(rawBody)) ? JSON.parse(rawBody) : {};
      const overrideDays = readOptionalNumber((parsedBody as Record<string, unknown>).retention_days);
      if (overrideDays !== null && overrideDays >= 7 && overrideDays <= 365) {
        retentionDays = overrideDays;
      }
    }

    // Step 1 — Appelle la RPC qui hard-delete les rows DB et retourne les asset_paths.
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'purge_old_soft_deleted_social_content',
      { p_retention_days: retentionDays },
    );

    if (rpcError) {
      throw createPhase2DatabaseError(rpcError, {
        contextLabel: 'Social soft-delete purge',
        fallbackCode: 'social_purge_failed',
        fallbackMessage: 'Failed to purge soft-deleted social content',
        rpcName: 'purge_old_soft_deleted_social_content',
      });
    }

    const purgeResult = normalizePurgeRpcRow(rpcData);

    // Step 2 — Cleanup storage en batch (best-effort). Les assets non
    // supprimables seront ramasses par la TTL du bucket.
    const storageCleanup = await removeStorageObjectsIndividually(
      supabase,
      PHASE2_SOCIAL_BUCKET,
      purgeResult.asset_paths_to_cleanup,
    );

    return jsonResponse(req, {
      success: true,
      retention_days: retentionDays,
      purged_post_count: purgeResult.purged_post_count,
      purged_comment_count: purgeResult.purged_comment_count,
      asset_paths_requested: purgeResult.asset_paths_to_cleanup.length,
      asset_paths_deleted: storageCleanup.deletedPaths.length,
      asset_paths_failed: storageCleanup.failedPaths.length,
      actor_type: actor.actor_type,
    });
  } catch (error) {
    logPhase2Error('[purge-soft-deleted-social-assets] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
