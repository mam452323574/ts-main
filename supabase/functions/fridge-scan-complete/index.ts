import { handleCorsPreflightRequest, jsonResponse } from '../_shared/cors.ts';
import { createServiceRoleClient } from '../_shared/phase2Auth.ts';
import {
  Phase2HttpError,
  createPhase2DatabaseError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import { getPhase2WebhookAuthConfig } from '../_shared/phase2Env.ts';
import {
  createRequestId,
  logPhase2Info,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  PHASE2_WEBHOOK_SIGNATURE_HEADER,
  PHASE2_WEBHOOK_TIMESTAMP_HEADER,
  createPhase2WebhookSignature,
} from '../_shared/phase2Webhook.ts';
import {
  assertNoUnknownKeys,
  assertUuidLike,
} from '../_shared/phase2Utils.ts';
import {
  FRIDGE_SCAN_COMPLETE_REQUEST_KEYS,
  normalizeFridgeScanCompletionPayload,
  type FridgeMealErrorResult,
  type FridgeMealResult,
} from '../../../shared/fridgeScanContract.ts';

const FRIDGE_SCAN_COMPLETE_MAX_REQUEST_BYTES = 128 * 1024;
const FRIDGE_SCAN_ANALYSIS_FAILED_CODE = 'fridge_scan_analysis_failed';
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

async function readJsonBodyWithRawText(req: Request) {
  const rawBody = await req.text();

  if (new TextEncoder().encode(rawBody).length > FRIDGE_SCAN_COMPLETE_MAX_REQUEST_BYTES) {
    throw new Phase2HttpError(
      413,
      'payload_too_large',
      `Request body must be ${FRIDGE_SCAN_COMPLETE_MAX_REQUEST_BYTES} bytes or fewer`,
    );
  }

  try {
    return {
      rawBody,
      payload: JSON.parse(rawBody),
    };
  } catch {
    throw new Phase2HttpError(400, 'invalid_json', 'Request body must be valid JSON');
  }
}

async function assertAuthorizedFridgeScanCallback(req: Request, rawBody: string) {
  const authConfig = getPhase2WebhookAuthConfig();

  if (!authConfig.useHmac || !authConfig.hmacSecret) {
    throw new Phase2HttpError(
      500,
      'invalid_webhook_auth_configuration',
      'PHASE2_WEBHOOK_AUTH_MODE must include hmac for fridge scan callbacks',
    );
  }

  const timestamp = req.headers.get(PHASE2_WEBHOOK_TIMESTAMP_HEADER);
  const signature = req.headers.get(PHASE2_WEBHOOK_SIGNATURE_HEADER);

  if (!timestamp || !signature) {
    throw new Phase2HttpError(
      401,
      'missing_webhook_signature',
      'Missing webhook signature headers',
    );
  }

  const timestampMs = Date.parse(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > WEBHOOK_TIMESTAMP_TOLERANCE_MS
  ) {
    throw new Phase2HttpError(
      401,
      'stale_webhook_signature',
      'Webhook signature timestamp is outside the allowed window',
    );
  }

  const expectedSignature = await createPhase2WebhookSignature(
    timestamp,
    rawBody,
    authConfig.hmacSecret,
  );

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Phase2HttpError(
      401,
      'invalid_webhook_signature',
      'Invalid webhook signature',
    );
  }
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function getCompletionPayloadInvalidReason(body: Record<string, unknown>) {
  if (typeof body.fridge_scan_id !== 'string' || body.fridge_scan_id.trim().length === 0) {
    return 'missing_fridge_scan_id';
  }

  if (typeof body.callback_nonce !== 'string' || body.callback_nonce.trim().length === 0) {
    return 'missing_callback_nonce';
  }

  if (typeof body.success !== 'boolean') {
    return 'invalid_success_flag';
  }

  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return 'missing_data';
  }

  const data = body.data as Record<string, unknown>;
  if (body.success) {
    if (data.schema_version !== 1) return 'invalid_meal_schema_version';
    if (typeof data.mode_selected !== 'string') return 'invalid_meal_mode';
    if (!Array.isArray(data.ingredients_detected)) return 'invalid_detected_ingredients';
    if (!Array.isArray(data.ingredients_used)) return 'invalid_used_ingredients';
    if (!data.nutrition_estimate || typeof data.nutrition_estimate !== 'object') {
      return 'invalid_nutrition_estimate';
    }

    return 'invalid_meal_result';
  }

  if (data.scan_type !== 'error') return 'invalid_error_scan_type';
  if (typeof data.message !== 'string' || data.message.trim().length === 0) {
    return 'invalid_error_message';
  }

  return 'invalid_completion_payload';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const requestId = createRequestId();

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const { rawBody, payload } = await readJsonBodyWithRawText(req);
    await assertAuthorizedFridgeScanCallback(req, rawBody);

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
    }

    const body = payload as Record<string, unknown>;
    logPhase2Info('[fridge-scan-complete] Callback payload received', {
      request_id: requestId,
      upstream_request_id:
        typeof body.request_id === 'string' ? body.request_id : undefined,
      fridge_scan_id:
        typeof body.fridge_scan_id === 'string' ? body.fridge_scan_id : undefined,
      success: typeof body.success === 'boolean' ? body.success : undefined,
      data_kind:
        body.data && typeof body.data === 'object' && !Array.isArray(body.data)
          ? typeof (body.data as Record<string, unknown>).scan_type === 'string'
            ? String((body.data as Record<string, unknown>).scan_type)
            : typeof (body.data as Record<string, unknown>).schema_version === 'number'
              ? 'meal_result'
              : 'object'
          : undefined,
    });
    assertNoUnknownKeys(
      body,
      FRIDGE_SCAN_COMPLETE_REQUEST_KEYS,
      'Fridge scan completion payload',
    );

    const normalizedPayload = normalizeFridgeScanCompletionPayload(body);
    if (!normalizedPayload) {
      logPhase2Info('[fridge-scan-complete] Callback payload rejected', {
        request_id: requestId,
        upstream_request_id:
          typeof body.request_id === 'string' ? body.request_id : undefined,
        fridge_scan_id:
          typeof body.fridge_scan_id === 'string' ? body.fridge_scan_id : undefined,
        invalid_reason: getCompletionPayloadInvalidReason(body),
      });
      throw new Phase2HttpError(
        400,
        'invalid_fridge_scan_completion_payload',
        'Completion payload is invalid',
      );
    }

    assertUuidLike(normalizedPayload.fridge_scan_id, 'fridge_scan_id');
    const client = createServiceRoleClient();
    const processedAt = new Date().toISOString();

    const updateValues = normalizedPayload.success
      ? (() => {
          const mealResult = normalizedPayload.data as FridgeMealResult;

          return {
            status: 'processed',
            selected_mode: mealResult.mode_selected,
            meal_result: mealResult,
            error_code: null,
            error_message: null,
            processed_at: processedAt,
            updated_at: processedAt,
          };
        })()
      : (() => {
          const errorResult = normalizedPayload.data as FridgeMealErrorResult;

          return {
            status: 'failed',
            meal_result: null,
            error_code: FRIDGE_SCAN_ANALYSIS_FAILED_CODE,
            error_message: errorResult.message,
            processed_at: processedAt,
            updated_at: processedAt,
          };
        })();

    const { data: updatedRecord, error: updateError } = await client
      .from('fridge_scans')
      .update(updateValues)
      .eq('id', normalizedPayload.fridge_scan_id)
      .eq('callback_nonce', normalizedPayload.callback_nonce)
      .eq('status', 'queued')
      .select('id, status, selected_mode, processed_at')
      .maybeSingle();

    if (updateError) {
      throw createPhase2DatabaseError(updateError, {
        contextLabel: 'Fridge scan completion update',
        fallbackCode: 'fridge_scan_completion_update_failed',
        fallbackMessage: 'Failed to finalize fridge scan completion',
        relationName: 'fridge_scans',
      });
    }

    if (!updatedRecord?.id) {
      logPhase2Info('[fridge-scan-complete] Callback did not match queued scan', {
        request_id: requestId,
        upstream_request_id: normalizedPayload.request_id,
        fridge_scan_id: normalizedPayload.fridge_scan_id,
        success: normalizedPayload.success,
      });
      throw new Phase2HttpError(
        404,
        'fridge_scan_not_found',
        'Fridge scan record was not found',
      );
    }

    logPhase2Info('[fridge-scan-complete] Fridge scan completion persisted', {
      request_id: requestId,
      upstream_request_id: normalizedPayload.request_id,
      fridge_scan_id: updatedRecord.id,
      status: updatedRecord.status,
      success: normalizedPayload.success,
    });

    return jsonResponse(req, {
      success: true,
      fridge_scan_id: updatedRecord.id,
      status: updatedRecord.status,
      processed_at: updatedRecord.processed_at,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[fridge-scan-complete] Request failed', error, {
        request_id: requestId,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[fridge-scan-complete] Unexpected error', error, {
      request_id: requestId,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
