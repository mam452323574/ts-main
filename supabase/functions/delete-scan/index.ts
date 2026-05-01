import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import { Phase2HttpError, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  assertNoUnknownKeys,
  assertUuidLike,
  buildCanonicalScanImagePath,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import {
  DELETE_SCAN_REQUEST_KEYS,
  SCAN_IMAGE_BUCKET,
} from '../../../shared/scanContract.ts';

// S-07 — Endpoint user-facing pour supprimer un scan individuel (RGPD art. 17,
// droit à l'effacement). Supprime la ligne `scans` ET l'objet Storage
// associé (canonical path) ET la ligne scan_metrics si présente. Best-effort
// sur les ressources annexes : un échec partiel logge mais ne bloque pas la
// confirmation utilisateur si la ligne `scans` a été supprimée.

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

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);
    const requestBody = await readJsonBody(req, { maxBytes: 1024 });
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
    }

    assertNoUnknownKeys(
      requestBody as Record<string, unknown>,
      DELETE_SCAN_REQUEST_KEYS,
      'Delete scan request',
    );

    const scanId = typeof (requestBody as Record<string, unknown>).scan_id === 'string'
      ? ((requestBody as Record<string, unknown>).scan_id as string)
      : null;
    assertUuidLike(scanId, 'scan_id');

    // RLS impose user_id = auth.uid(), mais on filtre explicitement aussi ici
    // pour l'audit log et la lecture du image_path avant DELETE.
    const { data: scanRow, error: lookupError } = await client
      .from('scans')
      .select('id, user_id, image_path')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (lookupError) {
      throw new Phase2HttpError(
        500,
        'scan_lookup_failed',
        'Failed to lookup scan for deletion',
      );
    }

    if (!scanRow) {
      // Idempotent : déjà supprimé ou n'a jamais existé pour ce user.
      return jsonResponse(req, {
        success: true,
        scan_id: scanId,
        deleted: false,
        already_absent: true,
      });
    }

    const canonicalPath = buildCanonicalScanImagePath(user.id, scanRow.id);

    // Best-effort : retirer scan_metrics si présent (FK ON DELETE CASCADE
    // peut le couvrir selon la migration, mais on n'en dépend pas).
    const { error: metricsDeleteError } = await client
      .from('scan_metrics')
      .delete()
      .eq('scan_id', scanRow.id);
    if (metricsDeleteError) {
      logPhase2Error(
        '[delete-scan] Failed to delete scan_metrics row (best-effort)',
        metricsDeleteError,
        { request_id: requestId, scan_id: scanRow.id, user_id: user.id },
      );
    }

    // DELETE scan : autoritatif. Si échec, on remonte une erreur et l'image
    // reste dans Storage (sera nettoyée par le cron orphelins).
    const { error: scanDeleteError } = await client
      .from('scans')
      .delete()
      .eq('id', scanRow.id)
      .eq('user_id', user.id);

    if (scanDeleteError) {
      throw new Phase2HttpError(
        500,
        'scan_delete_failed',
        'Failed to delete scan record',
      );
    }

    // Best-effort : supprimer les objets Storage. Si remove() échoue, le
    // cron pg_cron des orphelins (cf. migration cleanup_orphan_scan_images)
    // récupère les objets sans ligne scans correspondante.
    const candidatePaths = [canonicalPath];
    if (
      typeof scanRow.image_path === 'string' &&
      scanRow.image_path.length > 0 &&
      scanRow.image_path !== canonicalPath
    ) {
      candidatePaths.push(scanRow.image_path);
    }

    const { error: storageError } = await client.storage
      .from(SCAN_IMAGE_BUCKET)
      .remove(candidatePaths);

    if (storageError) {
      logPhase2Error(
        '[delete-scan] Failed to delete scan image objects (best-effort)',
        storageError,
        {
          request_id: requestId,
          scan_id: scanRow.id,
          user_id: user.id,
          path_count: candidatePaths.length,
        },
      );
    }

    return jsonResponse(req, {
      success: true,
      scan_id: scanRow.id,
      deleted: true,
    });
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[delete-scan] Request failed', error, {
        request_id: requestId,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[delete-scan] Unexpected error', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
