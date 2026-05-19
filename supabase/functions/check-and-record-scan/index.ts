import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  assertNoUnknownKeys,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import {
  CHECK_AND_RECORD_SCAN_REQUEST_KEYS,
  LEGACY_CHECK_AND_RECORD_SCAN_REQUEST_KEYS,
  isAppScanType,
} from '../../../shared/scanContract.ts';
import { isRecord } from '../_shared/phase2Utils.ts';

// SC-01 (cf. SCANNER_COACH_AUDIT_2026_05.md §4) — defaults 10/min, 60/h, 200/jour.
const SCAN_CREATION_RATE_LIMIT_PER_MINUTE = 10;
const SCAN_CREATION_RATE_LIMIT_PER_HOUR = 60;
const SCAN_CREATION_RATE_LIMIT_PER_DAY = 200;
const SCAN_CREATION_RATE_LIMIT_ERROR_CODE = 'scan_creation_rate_limit_exceeded';

async function enforceScanCreationRateLimit(
  client: ReturnType<typeof createServiceRoleClient>,
  userId: string,
) {
  const { data, error } = await client.rpc('record_scan_creation_attempt', {
    p_user_id: userId,
    p_per_minute: SCAN_CREATION_RATE_LIMIT_PER_MINUTE,
    p_per_hour: SCAN_CREATION_RATE_LIMIT_PER_HOUR,
    p_per_day: SCAN_CREATION_RATE_LIMIT_PER_DAY,
  });

  if (error) {
    throw new Phase2HttpError(
      500,
      'scan_creation_rate_limit_check_failed',
      'Failed to evaluate scan creation rate limit',
    );
  }

  if (isRecord(data) && data.allowed === false) {
    const windowExceeded =
      typeof data.window_exceeded === 'string' ? data.window_exceeded : 'unknown';
    throw new Phase2HttpError(
      429,
      SCAN_CREATION_RATE_LIMIT_ERROR_CODE,
      `Scan creation rate limit exceeded for window: ${windowExceeded}`,
      { window_exceeded: windowExceeded },
    );
  }
}

function parseScanCheckRequest(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  const requestBody = payload as Record<string, unknown>;
  assertNoUnknownKeys(
    requestBody,
    [
      ...CHECK_AND_RECORD_SCAN_REQUEST_KEYS,
      ...LEGACY_CHECK_AND_RECORD_SCAN_REQUEST_KEYS,
    ],
    'Scan reservation request',
  );

  const rawScanType = requestBody.scan_type ?? requestBody.scanType;
  if (!isAppScanType(rawScanType)) {
    throw new Phase2HttpError(400, 'invalid_scan_type', 'scan_type is invalid');
  }

  const rawCheckOnly = requestBody.check_only ?? requestBody.checkOnly;
  if (rawCheckOnly !== undefined && typeof rawCheckOnly !== 'boolean') {
    throw new Phase2HttpError(400, 'invalid_payload', 'check_only must be a boolean');
  }

  return {
    scanType: rawScanType,
    checkOnly: rawCheckOnly === true,
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

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);
    const { scanType, checkOnly } = parseScanCheckRequest(
      await readJsonBody(req, { maxBytes: 4 * 1024 }),
    );

    // SC-01 — applique le rate limit AVANT le RPC quota afin de ne pas faturer
    // une RPC pour chaque burst attaquant. `check_only` est tout aussi rate-limite
    // (un attaquant pourrait sonder le quota sans creer le scan).
    await enforceScanCreationRateLimit(client, user.id);

    const { data: reservedScan, error: reservationError } = await client.rpc(
      'reserve_scan_quota',
      {
        p_user_id: user.id,
        p_scan_type: scanType,
        p_check_only: checkOnly,
      },
    );

    if (reservationError || !reservedScan) {
      throw new Phase2HttpError(
        500,
        'scan_reservation_failed',
        'Failed to reserve scan quota',
      );
    }

    return jsonResponse(req, reservedScan);
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[check-and-record-scan] Request failed', error, {
        request_id: requestId,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[check-and-record-scan] Unexpected error', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
