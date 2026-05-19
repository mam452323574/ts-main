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
import {
  createPhase2DatabaseError,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Info,
  logPhase2Error,
  summarizeWebhookResult,
} from '../_shared/phase2Observability.ts';
import { assertNoUnknownKeys, isRecord, readJsonBody, readOptionalString } from '../_shared/phase2Utils.ts';
import { assertImageWithinPixelBudget } from '../_shared/imageHardening.ts';
import { assertUserWithinStorageQuota } from '../_shared/userQuota.ts';
import {
  FRIDGE_SCAN_WEBHOOK_REQUEST_FAILED_CODE,
  FRIDGE_SCAN_WEBHOOK_UNREACHABLE_CODE,
  postFridgeScanWebhook,
} from '../_shared/fridgeScanWebhook.ts';
import {
  buildCanonicalFridgeScanImagePath,
  buildFridgeScanWebhookPayload,
  FRIDGE_SCAN_IMAGE_BUCKET,
  isFridgeMealMode,
  type FridgeMealMode,
  FRIDGE_SCAN_PREMIUM_DAILY_LIMIT,
  FRIDGE_SCAN_STORAGE_NAMESPACE,
  FRIDGE_SCAN_SUBMIT_REQUEST_KEYS,
  FRIDGE_SCAN_WINDOW_MS,
  isFridgeScanCaptureSource,
  type FridgeScanCaptureSource,
  type FridgeScanEligibilityResponse,
  type FridgeScanSubmissionResponse,
} from '../../../shared/fridgeScanContract.ts';

type AccountTier = 'free' | 'premium' | 'admin';

const FRIDGE_SCAN_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FRIDGE_SCAN_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const FRIDGE_SCAN_DEFAULT_LOCALE = 'fr';

// SC-01 — meme rate limit que check-and-record-scan (10/min, 60/h, 200/jour).
const SCAN_CREATION_RATE_LIMIT_PER_MINUTE = 10;
const SCAN_CREATION_RATE_LIMIT_PER_HOUR = 60;
const SCAN_CREATION_RATE_LIMIT_PER_DAY = 200;
const SCAN_CREATION_RATE_LIMIT_ERROR_CODE = 'scan_creation_rate_limit_exceeded';

async function enforceFridgeScanCreationRateLimit(
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

type ParsedFridgeScanRequest =
  | {
      checkOnly: true;
    }
  | {
      checkOnly: false;
      source: FridgeScanCaptureSource;
      selectedMode: FridgeMealMode;
      imageBase64: string;
      locale: string;
      clientMetadata: Record<string, unknown>;
    };

interface EdgeRuntimeLike {
  waitUntil(task: Promise<void>): void;
}

function normalizeAccountTier(value: unknown): AccountTier {
  return value === 'premium' || value === 'admin' ? value : 'free';
}

function decodeBase64ToUint8Array(base64: string) {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new Phase2HttpError(
      400,
      'invalid_image_base64',
      'image_base64 must contain a valid base64-encoded JPEG payload',
    );
  }
}

function normalizeImageBase64(value: unknown) {
  if (typeof value !== 'string') {
    throw new Phase2HttpError(
      400,
      'invalid_image_base64',
      'image_base64 is required',
    );
  }

  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.startsWith('data:')
    ? trimmedValue.split(',')[1]?.trim() ?? ''
    : trimmedValue;

  if (!normalizedValue) {
    throw new Phase2HttpError(
      400,
      'invalid_image_base64',
      'image_base64 is required',
    );
  }

  const approximateByteLength = Math.floor((normalizedValue.length * 3) / 4);
  if (approximateByteLength > FRIDGE_SCAN_MAX_IMAGE_BYTES) {
    throw new Phase2HttpError(
      413,
      'payload_too_large',
      'Fridge scan uploads must be 6 MB or fewer after normalization',
    );
  }

  return normalizedValue;
}

function parseFridgeScanSubmitRequest(payload: unknown): ParsedFridgeScanRequest {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  const requestBody = payload as Record<string, unknown>;
  assertNoUnknownKeys(
    requestBody,
    FRIDGE_SCAN_SUBMIT_REQUEST_KEYS,
    'Fridge scan request',
  );

  const rawCheckOnly = requestBody.check_only;
  if (rawCheckOnly !== undefined && typeof rawCheckOnly !== 'boolean') {
    throw new Phase2HttpError(400, 'invalid_payload', 'check_only must be a boolean');
  }

  if (rawCheckOnly === true) {
    return { checkOnly: true };
  }

  const source = requestBody.source;
  if (!isFridgeScanCaptureSource(source)) {
    throw new Phase2HttpError(
      400,
      'invalid_fridge_scan_source',
      'source must be camera or gallery',
    );
  }

  const selectedMode = requestBody.selected_mode;
  if (!isFridgeMealMode(selectedMode)) {
    throw new Phase2HttpError(
      400,
      'invalid_fridge_meal_mode',
      'selected_mode must be diet, muscle_gain, or gourmand',
    );
  }

  const locale = readOptionalString(requestBody.locale) ?? FRIDGE_SCAN_DEFAULT_LOCALE;
  const clientMetadataValue = requestBody.client_metadata;
  if (clientMetadataValue !== undefined && !isRecord(clientMetadataValue)) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      'client_metadata must be an object when provided',
    );
  }

  return {
    checkOnly: false,
    source,
    selectedMode,
    imageBase64: normalizeImageBase64(requestBody.image_base64),
    locale,
    clientMetadata: isRecord(clientMetadataValue) ? clientMetadataValue : {},
  };
}

function buildEligibilityPayload(options: {
  requestId: string;
  allowed: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  accountTier: AccountTier;
  code?: string;
  message?: string;
  messageKey?: string;
  nextAvailableDate?: number;
  quotaBypassed?: boolean;
}): FridgeScanEligibilityResponse {
  return {
    success: true,
    allowed: options.allowed,
    message:
      options.message ??
      (options.allowed ? 'Fridge scan available' : 'Fridge scan unavailable'),
    ...(options.messageKey ? { message_key: options.messageKey } : {}),
    ...(options.code ? { code: options.code } : {}),
    request_id: options.requestId,
    remaining: options.remaining,
    ...(options.nextAvailableDate
      ? { next_available_date: options.nextAvailableDate }
      : {}),
    current_count: options.currentCount,
    limit: options.limit,
    is_premium_required: options.accountTier === 'free',
    ...(options.quotaBypassed ? { quota_bypassed: true } : {}),
  };
}

async function listRecentFridgeScans(
  client: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  cutoffIso: string,
) {
  const { data, error } = await client
    .from('fridge_scans')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: true });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Fridge scan quota lookup',
      fallbackCode: 'fridge_scan_quota_lookup_failed',
      fallbackMessage: 'Failed to read fridge scan quota usage',
      relationName: 'fridge_scans',
    });
  }

  return Array.isArray(data) ? data : [];
}

function resolveFridgeScanQuotaState(options: {
  accountTier: AccountTier;
  recentScans: Array<{ created_at: string | null }>;
  requestId: string;
}) {
  const currentCount = options.recentScans.length;
  const quotaBypassed = options.accountTier === 'admin';
  const remaining = Math.max(0, FRIDGE_SCAN_PREMIUM_DAILY_LIMIT - currentCount);

  if (options.accountTier === 'free') {
    return buildEligibilityPayload({
      requestId: options.requestId,
      allowed: false,
      currentCount,
      limit: FRIDGE_SCAN_PREMIUM_DAILY_LIMIT,
      remaining: 0,
      accountTier: options.accountTier,
      code: 'fridge_scan_premium_required',
      message: 'Fridge scan is a premium feature',
      messageKey: 'fridge_scan.premium_required_message',
    });
  }

  if (!quotaBypassed && currentCount >= FRIDGE_SCAN_PREMIUM_DAILY_LIMIT) {
    const oldestTimestamp = options.recentScans[0]?.created_at;
    const nextAvailableDate =
      typeof oldestTimestamp === 'string'
        ? new Date(oldestTimestamp).getTime() + FRIDGE_SCAN_WINDOW_MS
        : undefined;

    return buildEligibilityPayload({
      requestId: options.requestId,
      allowed: false,
      currentCount,
      limit: FRIDGE_SCAN_PREMIUM_DAILY_LIMIT,
      remaining: 0,
      accountTier: options.accountTier,
      code: 'fridge_scan_limit_reached',
      message: 'Fridge scan daily limit reached',
      messageKey: 'fridge_scan.limit_reached_with_time',
      nextAvailableDate,
    });
  }

  return buildEligibilityPayload({
    requestId: options.requestId,
    allowed: true,
    currentCount,
    limit: FRIDGE_SCAN_PREMIUM_DAILY_LIMIT,
    remaining,
    accountTier: options.accountTier,
    message: 'Fridge scan available',
    messageKey: 'fridge_scan.available_message',
    quotaBypassed,
  });
}

function scheduleFridgeScanBackgroundTask(task: Promise<void>) {
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: EdgeRuntimeLike;
  }).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

async function markFridgeScanDispatchFailure(options: {
  fridgeScanId: string;
  errorCode: string;
  errorMessage: string;
  requestId: string;
  webhookStatus?: number;
}) {
  const client = createServiceRoleClient();
  const processedAt = new Date().toISOString();
  const { error } = await client
    .from('fridge_scans')
    .update({
      status: 'failed',
      error_code: options.errorCode,
      error_message: options.errorMessage,
      processed_at: processedAt,
      updated_at: processedAt,
      ...(typeof options.webhookStatus === 'number'
        ? { webhook_status: options.webhookStatus }
        : {}),
    })
    .eq('id', options.fridgeScanId);

  if (error) {
    logPhase2Error('[fridge-scan-submit] Failed to persist webhook dispatch failure', error, {
      request_id: options.requestId,
      fridge_scan_id: options.fridgeScanId,
      error_code: options.errorCode,
      webhook_status:
        typeof options.webhookStatus === 'number' ? options.webhookStatus : undefined,
    });
  }
}

async function dispatchQueuedFridgeScan(options: {
  fridgeScanId: string;
  requestId: string;
  payload: ReturnType<typeof buildFridgeScanWebhookPayload>;
}) {
  try {
    logPhase2Info('[fridge-scan-submit] Dispatching queued fridge scan', {
      request_id: options.requestId,
      fridge_scan_id: options.fridgeScanId,
      selected_mode: options.payload.selected_mode,
      source: options.payload.source,
      locale: options.payload.locale,
      image_base64_present: options.payload.image_base64.length > 0,
      image_path_present: Boolean(options.payload.image.path),
    });
    const { endpoint, webhookResult } = await postFridgeScanWebhook({
      payload: options.payload,
    });
    const updateTimestamp = new Date().toISOString();
    const client = createServiceRoleClient();

    const { error: webhookStatusError } = await client
      .from('fridge_scans')
      .update({
        webhook_status: webhookResult.status,
        updated_at: updateTimestamp,
      })
      .eq('id', options.fridgeScanId);

    if (webhookStatusError) {
      logPhase2Error('[fridge-scan-submit] Failed to persist webhook dispatch status', webhookStatusError, {
        request_id: options.requestId,
        fridge_scan_id: options.fridgeScanId,
        endpoint_index: endpoint.selectedIndex,
      });
    }

    logPhase2Info('[fridge-scan-submit] Fridge scan webhook dispatch completed', {
      request_id: options.requestId,
      fridge_scan_id: options.fridgeScanId,
      endpoint_env: endpoint.envName,
      endpoint_index: endpoint.selectedIndex,
      webhook_status: webhookResult.status,
      webhook_ok: webhookResult.ok,
      response_body_present: webhookResult.bodyPresent,
    });

    if (!webhookResult.ok) {
      const failureMessage =
        readOptionalString(webhookResult.payload?.error) ??
        readOptionalString(webhookResult.payload?.message) ??
        `Fridge scan webhook failed (${webhookResult.status})`;
      const failureCode =
        readOptionalString(webhookResult.payload?.code) ??
        FRIDGE_SCAN_WEBHOOK_REQUEST_FAILED_CODE;

      await markFridgeScanDispatchFailure({
        fridgeScanId: options.fridgeScanId,
        requestId: options.requestId,
        errorCode: failureCode,
        errorMessage: failureMessage,
        webhookStatus: webhookResult.status,
      });

      logPhase2Error(
        '[fridge-scan-submit] Fridge scan webhook returned a failing status',
        new Phase2HttpError(
          502,
          FRIDGE_SCAN_WEBHOOK_REQUEST_FAILED_CODE,
          failureMessage,
        ),
        {
          request_id: options.requestId,
          fridge_scan_id: options.fridgeScanId,
          endpoint_index: endpoint.selectedIndex,
          ...summarizeWebhookResult(webhookResult, {
            endpoint_env: endpoint.envName,
          }),
        },
      );
    }
  } catch (error) {
    const errorCode =
      error instanceof Phase2HttpError
        ? error.code
        : FRIDGE_SCAN_WEBHOOK_UNREACHABLE_CODE;
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Fridge scan webhook could not be reached';

    await markFridgeScanDispatchFailure({
      fridgeScanId: options.fridgeScanId,
      requestId: options.requestId,
      errorCode,
      errorMessage,
    });

    logPhase2Error('[fridge-scan-submit] Fridge scan webhook dispatch failed', error, {
      request_id: options.requestId,
      fridge_scan_id: options.fridgeScanId,
      error_code: errorCode,
    });
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
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);

    // SC-01 — partage la table scan_creation_attempts avec check-and-record-scan.
    await enforceFridgeScanCreationRateLimit(client, user.id);

    const requestBody = parseFridgeScanSubmitRequest(
      await readJsonBody(req, { maxBytes: FRIDGE_SCAN_MAX_REQUEST_BYTES }),
    );
    logPhase2Info('[fridge-scan-submit] Request parsed', {
      request_id: requestId,
      check_only: requestBody.checkOnly,
      source: requestBody.checkOnly ? undefined : requestBody.source,
      selected_mode: requestBody.checkOnly ? undefined : requestBody.selectedMode,
      locale: requestBody.checkOnly ? undefined : requestBody.locale,
      upload_present: !requestBody.checkOnly,
    });
    await ensureUserProfileExistsForAuthenticatedUser(client, user);
    const callbackNonce = requestBody.checkOnly ? null : crypto.randomUUID();
    const { data: reservationPayload, error: reservationError } = await client.rpc(
      'reserve_fridge_scan_quota',
      {
        p_user_id: user.id,
        p_check_only: requestBody.checkOnly,
        p_source: requestBody.checkOnly ? null : requestBody.source,
        p_selected_mode: requestBody.checkOnly ? null : requestBody.selectedMode,
        p_locale: requestBody.checkOnly ? null : requestBody.locale,
        p_client_metadata: requestBody.checkOnly ? null : requestBody.clientMetadata,
        p_callback_nonce: callbackNonce,
        p_request_id: requestId,
      },
    );

    if (reservationError || !reservationPayload) {
      throw createPhase2DatabaseError(reservationError, {
        contextLabel: 'Fridge scan quota reservation',
        fallbackCode: 'fridge_scan_quota_reservation_failed',
        fallbackMessage: 'Failed to reserve fridge scan quota',
        relationName: 'fridge_scans',
      });
    }

    const eligibility = reservationPayload as FridgeScanSubmissionResponse & {
      callback_nonce?: string;
    };

    if (requestBody.checkOnly || !eligibility.allowed || !eligibility.fridge_scan_id) {
      logPhase2Info('[fridge-scan-submit] Returning eligibility response', {
        request_id: requestId,
        check_only: requestBody.checkOnly,
        allowed: eligibility.allowed,
        code: eligibility.code,
        remaining: eligibility.remaining,
        limit: eligibility.limit,
      });
      return jsonResponse(req, eligibility);
    }

    const imageBytes = decodeBase64ToUint8Array(requestBody.imageBase64);
    assertImageWithinPixelBudget(imageBytes, 'image/jpeg');
    await assertUserWithinStorageQuota(client, user.id, imageBytes.byteLength);
    const createdAt = new Date().toISOString();
    const fridgeScanId = eligibility.fridge_scan_id;
    const reservedCallbackNonce = eligibility.callback_nonce;
    if (!reservedCallbackNonce) {
      throw new Phase2HttpError(
        500,
        'fridge_scan_callback_nonce_missing',
        'Fridge scan callback nonce was not reserved',
      );
    }

    const imagePath = buildCanonicalFridgeScanImagePath(user.id, fridgeScanId);
    const { error: uploadError } = await client.storage
      .from(FRIDGE_SCAN_IMAGE_BUCKET)
      .upload(imagePath, imageBytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      await client.from('fridge_scans').delete().eq('id', fridgeScanId);
      throw new Phase2HttpError(
        500,
        'fridge_scan_upload_failed',
        'Failed to store fridge scan image',
      );
    }

    const webhookPayload = buildFridgeScanWebhookPayload({
      requestId,
      fridgeScanId,
      callbackNonce: reservedCallbackNonce,
      userId: user.id,
      locale: requestBody.locale,
      source: requestBody.source,
      selectedMode: requestBody.selectedMode,
      queuedAt: createdAt,
      imageBase64: requestBody.imageBase64,
      imagePath,
      clientMetadata: requestBody.clientMetadata,
    });
    const { image_base64: _omittedImageBase64, ...persistedWebhookPayload } = webhookPayload;
    logPhase2Info('[fridge-scan-submit] Built fridge scan webhook payload', {
      request_id: requestId,
      fridge_scan_id: fridgeScanId,
      selected_mode: webhookPayload.selected_mode,
      source: webhookPayload.source,
      locale: webhookPayload.locale,
      image_base64_present: webhookPayload.image_base64.length > 0,
      image_bucket: webhookPayload.image.bucket,
      image_path_present: Boolean(webhookPayload.image.path),
      has_client_metadata: Object.keys(webhookPayload.client_metadata).length > 0,
    });

    const { error: updateError } = await client
      .from('fridge_scans')
      .update({
        image_path: imagePath,
        webhook_payload: persistedWebhookPayload,
        updated_at: createdAt,
      })
      .eq('id', fridgeScanId);

    if (updateError) {
      throw createPhase2DatabaseError(updateError, {
        contextLabel: 'Fridge scan queue update',
        fallbackCode: 'fridge_scan_update_failed',
        fallbackMessage: 'Failed to persist fridge scan payload',
        relationName: 'fridge_scans',
      });
    }

    const responsePayload: FridgeScanSubmissionResponse = {
      ...eligibility,
      fridge_scan_id: fridgeScanId,
      status: 'queued',
      image_path: imagePath,
      selected_mode: requestBody.selectedMode,
      message: 'Fridge scan queued',
      message_key: 'fridge_scan.submission_queued_message',
      code: undefined,
    };

    scheduleFridgeScanBackgroundTask(
      dispatchQueuedFridgeScan({
        fridgeScanId,
        requestId,
        payload: webhookPayload,
      }),
    );

    logPhase2Info('[fridge-scan-submit] Fridge scan queued response returned', {
      request_id: requestId,
      fridge_scan_id: fridgeScanId,
      status: responsePayload.status,
      selected_mode: responsePayload.selected_mode,
      remaining: responsePayload.remaining,
      limit: responsePayload.limit,
    });

    return jsonResponse(req, responsePayload);
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      logPhase2Error('[fridge-scan-submit] Request failed', error, {
        request_id: requestId,
        storage_namespace: FRIDGE_SCAN_STORAGE_NAMESPACE,
      });
      return jsonResponse(
        req,
        toPhase2ErrorPayload(error, { requestId }),
        { status: error.status },
      );
    }

    logPhase2Error('[fridge-scan-submit] Unexpected error', error, {
      request_id: requestId,
      storage_namespace: FRIDGE_SCAN_STORAGE_NAMESPACE,
    });
    return jsonResponse(
      req,
      toPhase2ErrorPayload(error, { requestId }),
      { status: 500 },
    );
  }
});
