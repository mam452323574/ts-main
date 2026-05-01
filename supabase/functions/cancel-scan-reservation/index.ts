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
  rollbackScanCharge,
  type PendingScanRollback,
  type SupportedScanType,
} from '../_shared/scanReservations.ts';
import {
  assertNoUnknownKeys,
  assertUuidLike,
  buildCanonicalScanImagePath,
  readJsonBody,
} from '../_shared/phase2Utils.ts';

const ALLOWED_SCAN_TYPES: readonly SupportedScanType[] = [
  'body',
  'health',
  'nutrition',
  'super',
] as const;

function requirePostMethod(req: Request) {
  if (req.method !== 'POST') {
    throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
  }
}

function readScanType(value: unknown): SupportedScanType {
  if (typeof value === 'string' && ALLOWED_SCAN_TYPES.includes(value as SupportedScanType)) {
    return value as SupportedScanType;
  }

  throw new Phase2HttpError(400, 'invalid_scan_type', 'scan_type is invalid');
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

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);
    const requestBody = await readJsonBody(req, { maxBytes: 4 * 1024 });
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
    }

    assertNoUnknownKeys(
      requestBody as Record<string, unknown>,
      ['scan_id', 'scan_type'],
      'Cancel scan reservation request',
    );

    const scanId = typeof requestBody.scan_id === 'string' ? requestBody.scan_id : null;
    assertUuidLike(scanId, 'scan_id');
    const scanType = readScanType(requestBody.scan_type);

    const { data: scanRow, error: scanError } = await client
      .from('scans')
      .select('id, user_id, scan_type, created_at, used_welcome_credit, status, analyzed_at')
      .eq('id', scanId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (scanError || !scanRow) {
      throw new Phase2HttpError(404, 'scan_not_found', 'Scan not found');
    }

    if (scanRow.scan_type !== scanType) {
      throw new Phase2HttpError(
        403,
        'scan_type_mismatch',
        'scan_type must match the existing scan record',
      );
    }

    // S-06 — transition atomique reserved → cancelled. Si une analyse est
    // en cours (status = 'analyzing'), on refuse l'annulation pour empêcher
    // la double facturation IA (rollback en parallèle d'un webhook payant).
    const { data: cancelResult, error: cancelError } = await client.rpc(
      'cancel_reserved_scan',
      { p_scan_id: scanRow.id, p_user_id: user.id },
    );

    if (cancelError || !cancelResult) {
      throw new Phase2HttpError(
        500,
        'scan_cancel_failed',
        'Failed to cancel scan reservation',
      );
    }

    const cancelStatus =
      typeof (cancelResult as Record<string, unknown>).status === 'string'
        ? ((cancelResult as Record<string, unknown>).status as string)
        : 'unknown';
    const cancelOk = (cancelResult as Record<string, unknown>).ok === true;

    if (!cancelOk) {
      if (cancelStatus === 'analyzing') {
        throw new Phase2HttpError(
          409,
          'scan_analysis_in_progress',
          'Scan analysis is in progress and cannot be cancelled',
        );
      }
      if (cancelStatus === 'analyzed' || scanRow.analyzed_at) {
        throw new Phase2HttpError(
          409,
          'scan_already_processed',
          'Processed scans can no longer be canceled',
        );
      }
      if (cancelStatus === 'cancelled') {
        // Déjà annulé : idempotent.
        return jsonResponse(req, {
          success: true,
          scan_id: scanRow.id,
          canceled: true,
          already_cancelled: true,
        });
      }
      if (cancelStatus === 'not_found') {
        throw new Phase2HttpError(404, 'scan_not_found', 'Scan not found');
      }
      throw new Phase2HttpError(
        409,
        'scan_invalid_state',
        'Scan is not in a state that allows cancellation',
        { current_status: cancelStatus },
      );
    }

    const pendingRollback: PendingScanRollback = {
      scanId: scanRow.id,
      userId: user.id,
      scanType,
      createdAt: scanRow.created_at,
      usedWelcomeCredit: scanRow.used_welcome_credit === true,
      canonicalPath: buildCanonicalScanImagePath(user.id, scanRow.id),
    };

    await rollbackScanCharge(client, pendingRollback);

    return jsonResponse(req, {
      success: true,
      scan_id: scanRow.id,
      canceled: true,
    });
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[cancel-scan-reservation] Request failed', error, {
        request_id: requestId,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[cancel-scan-reservation] Unexpected error', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
