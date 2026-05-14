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
import { isAppScanType } from '../../../shared/scanContract.ts';

const DEFAULT_SCAN_TYPES = ['body', 'health', 'nutrition', 'super'] as const;

type AppScanType = (typeof DEFAULT_SCAN_TYPES)[number];

function parseBatchRequest(payload: unknown): AppScanType[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  const requestBody = payload as Record<string, unknown>;
  assertNoUnknownKeys(
    requestBody,
    ['scan_types', 'scanTypes'],
    'Scan eligibility batch request',
  );

  const rawScanTypes = requestBody.scan_types ?? requestBody.scanTypes;
  if (rawScanTypes === undefined) {
    return [...DEFAULT_SCAN_TYPES];
  }

  if (!Array.isArray(rawScanTypes)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'scan_types must be an array');
  }

  const scanTypes = rawScanTypes.filter(isAppScanType) as AppScanType[];
  if (scanTypes.length !== rawScanTypes.length || scanTypes.length === 0) {
    throw new Phase2HttpError(400, 'invalid_scan_type', 'scan_types contains invalid values');
  }

  return Array.from(new Set(scanTypes));
}

function buildEligibilityError(scanType: AppScanType, error: unknown, requestId: string) {
  const errorRecord =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown; status?: unknown })
      : {};

  return {
    success: false,
    allowed: false,
    scanType,
    message: 'Scan eligibility unavailable',
    error:
      typeof errorRecord.message === 'string'
        ? errorRecord.message
        : 'Scan eligibility unavailable',
    code:
      typeof errorRecord.code === 'string'
        ? errorRecord.code
        : 'scan_eligibility_failed',
    status:
      typeof errorRecord.status === 'number'
        ? errorRecord.status
        : 500,
    request_id: requestId,
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
    const scanTypes = parseBatchRequest(
      await readJsonBody(req, { maxBytes: 4 * 1024 }),
    );
    const eligibility: Record<string, unknown> = {};
    const errors: Record<string, unknown> = {};

    await Promise.all(
      scanTypes.map(async (scanType) => {
        try {
          const { data, error } = await client.rpc('reserve_scan_quota', {
            p_user_id: user.id,
            p_scan_type: scanType,
            p_check_only: true,
          });

          if (error || !data) {
            throw error ?? new Error('reserve_scan_quota returned no data');
          }

          eligibility[scanType] = data;
        } catch (error) {
          logPhase2Error('[check-scan-eligibility-batch] Scan type failed', error, {
            request_id: requestId,
            scan_type: scanType,
          });
          errors[scanType] = buildEligibilityError(scanType, error, requestId);
        }
      }),
    );

    return jsonResponse(req, {
      success: true,
      eligibility,
      errors,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[check-scan-eligibility-batch] Request failed', error, {
        request_id: requestId,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[check-scan-eligibility-batch] Unexpected error', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
