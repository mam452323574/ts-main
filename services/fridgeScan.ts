import { Platform, Image as RNImage } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError } from '@/services/api';
import { supabase } from '@/services/supabase';
import { getSupabaseFunctionUrl } from '@/services/runtimeConfig';
import {
  buildFridgeScanSubmitRequest,
  normalizeFridgeScanRecordState,
  type FridgeScanEligibilityResponse,
  type FridgeScanSubmissionResponse,
} from '@/shared/fridgeScanContract';
import type {
  FridgeScanRecordState,
  FridgeScanSubmission,
  SubmitFridgeScanCaptureInput,
} from '@/types/fridgeScan';
import { logOperationalError, logOperationalInfo } from '@/utils/observability';

const FRIDGE_SCAN_FUNCTION_NAME = 'fridge-scan-submit';
const FRIDGE_SCAN_MAX_DIMENSION = 1600;
const FRIDGE_SCAN_JPEG_QUALITY = 0.78;
const FRIDGE_SCAN_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const FRIDGE_SCAN_MAX_IMAGE_PIXELS = 16_000_000;

type FridgeScanFunctionErrorPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  code?: string;
  request_id?: string;
  status?: number;
  message_key?: string;
};

type NormalizedFridgeImage = {
  base64: string;
  width: number;
  height: number;
  usedPreEncodedFallback?: boolean;
  fallbackSource?: SubmitFridgeScanCaptureInput['source'];
};

type PreEncodedFridgeScanImage = NonNullable<
  SubmitFridgeScanCaptureInput['preEncodedJpeg']
>;

type PreEncodedFallbackResult =
  | {
      ok: true;
      image: NormalizedFridgeImage;
      byteLength: number;
    }
  | {
      ok: false;
      reason: string;
      byteLength?: number;
      width?: number;
      height?: number;
    };

function summarizeFridgeScanFunctionRequest(payload: Record<string, unknown>) {
  return {
    check_only: payload.check_only === true,
    source: typeof payload.source === 'string' ? payload.source : undefined,
    selected_mode:
      typeof payload.selected_mode === 'string'
        ? payload.selected_mode
        : undefined,
    locale: typeof payload.locale === 'string' ? payload.locale : undefined,
    upload_present: typeof payload.image_base64 === 'string',
    has_client_metadata:
      payload.client_metadata !== null &&
      typeof payload.client_metadata === 'object' &&
      !Array.isArray(payload.client_metadata),
  };
}

function summarizeFridgeScanFunctionResponse(
  responsePayload: unknown,
  fallbackRequestId?: string,
) {
  const payload =
    responsePayload && typeof responsePayload === 'object' && !Array.isArray(responsePayload)
      ? (responsePayload as Record<string, unknown>)
      : {};

  return {
    success: typeof payload.success === 'boolean' ? payload.success : undefined,
    allowed: typeof payload.allowed === 'boolean' ? payload.allowed : undefined,
    status: typeof payload.status === 'string' ? payload.status : undefined,
    code: typeof payload.code === 'string' ? payload.code : undefined,
    request_id:
      typeof payload.request_id === 'string'
        ? payload.request_id
        : fallbackRequestId,
    has_fridge_scan_id: typeof payload.fridge_scan_id === 'string',
    has_image_path: typeof payload.image_path === 'string',
    remaining: typeof payload.remaining === 'number' ? payload.remaining : undefined,
    limit: typeof payload.limit === 'number' ? payload.limit : undefined,
  };
}

function readFridgeScanFunctionErrorPayload(
  value: unknown,
): FridgeScanFunctionErrorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  return {
    success:
      typeof payload.success === 'boolean' ? payload.success : undefined,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    message: typeof payload.message === 'string' ? payload.message : undefined,
    code: typeof payload.code === 'string' ? payload.code : undefined,
    request_id:
      typeof payload.request_id === 'string' ? payload.request_id : undefined,
    status: typeof payload.status === 'number' ? payload.status : undefined,
    message_key:
      typeof payload.message_key === 'string' ? payload.message_key : undefined,
  };
}

function createFridgeScanAuthError() {
  const apiError = new ApiError(
    'api_errors.unauthorized',
    'AUTH',
    undefined,
    {
      functionName: FRIDGE_SCAN_FUNCTION_NAME,
      stage: 'authentication',
    },
  );
  apiError.code = 'auth_session_missing';
  apiError.status = 401;
  return apiError;
}

function normalizeFridgeScanImageError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  if (error instanceof ApiError) {
    error.context = {
      ...(error.context ?? {}),
      ...context,
      stage: 'image_normalization',
    };
    error.code = error.code ?? 'fridge_scan_image_normalization_failed';
    return error;
  }

  const apiError = new ApiError(
    error instanceof Error
      ? error.message
      : 'Unable to normalize fridge scan image',
    'VALIDATION',
    error,
    {
      ...context,
      stage: 'image_normalization',
    },
  );
  apiError.code = 'fridge_scan_image_normalization_failed';
  return apiError;
}

async function getAuthenticatedSessionOrThrow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw createFridgeScanAuthError();
  }

  return session;
}

function createFridgeScanApiError(
  message: string,
  code: string | undefined,
  status: number | undefined,
  requestId?: string,
  responsePayload?: unknown,
) {
  const apiError = new ApiError(
    message,
    status === 401
      ? 'AUTH'
      : status === 400 || status === 403 || status === 409 || status === 429
        ? 'VALIDATION'
        : status === 404 || (status && status >= 500)
          ? 'EDGE_FUNCTION'
          : 'UNKNOWN',
    undefined,
    {
      functionName: FRIDGE_SCAN_FUNCTION_NAME,
      status,
      code,
      request_id: requestId,
      response_payload: responsePayload,
      ...(responsePayload && typeof responsePayload === 'object' && !Array.isArray(responsePayload)
        ? { eligibility: responsePayload }
        : {}),
    },
  );
  apiError.code = code;
  apiError.status = status;
  apiError.requestId = requestId;
  return apiError;
}

async function invokeAuthedFridgeScanFunction<TResponse>(
  payload: Record<string, unknown>,
): Promise<TResponse> {
  const session = await getAuthenticatedSessionOrThrow().catch((error) => {
    logOperationalError(
      '[FridgeScanService] Fridge scan authentication unavailable',
      error,
      {
        function_name: FRIDGE_SCAN_FUNCTION_NAME,
      },
    );
    throw error;
  });
  let response: Response;

  logOperationalInfo(
    '[FridgeScanService] Calling fridge scan function',
    summarizeFridgeScanFunctionRequest(payload),
  );

  try {
    response = await fetch(getSupabaseFunctionUrl(FRIDGE_SCAN_FUNCTION_NAME), {
      method: 'POST',
      headers: {
        Accept: 'application/json; charset=utf-8',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const apiError = new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      'NETWORK',
      error,
      { functionName: FRIDGE_SCAN_FUNCTION_NAME },
    );
    apiError.code = 'edge_function_network_error';
    logOperationalError(
      '[FridgeScanService] Fridge scan function network failure',
      apiError,
      {
        function_name: FRIDGE_SCAN_FUNCTION_NAME,
      },
    );
    throw apiError;
  }

  const rawResponseBody = await response.json().catch(() => ({}));
  const errorPayload = readFridgeScanFunctionErrorPayload(rawResponseBody);
  const requestId =
    errorPayload.request_id ??
    response.headers.get('sb-request-id') ??
    response.headers.get('x-request-id') ??
    undefined;

  logOperationalInfo('[FridgeScanService] Fridge scan function responded', {
    function_name: FRIDGE_SCAN_FUNCTION_NAME,
    http_status: response.status,
    ok: response.ok,
    ...summarizeFridgeScanFunctionResponse(rawResponseBody, requestId),
  });

  if (!response.ok) {
    const apiError = createFridgeScanApiError(
      errorPayload.error ||
        errorPayload.message ||
        `${FRIDGE_SCAN_FUNCTION_NAME} failed`,
      errorPayload.code,
      response.status,
      requestId,
      rawResponseBody,
    );
    logOperationalError(
      '[FridgeScanService] Fridge scan function returned error',
      apiError,
      {
        function_name: FRIDGE_SCAN_FUNCTION_NAME,
        http_status: response.status,
      },
    );
    throw apiError;
  }

  return rawResponseBody as TResponse;
}

function getBoundedDimensions(width: number, height: number) {
  if (width <= FRIDGE_SCAN_MAX_DIMENSION && height <= FRIDGE_SCAN_MAX_DIMENSION) {
    return null;
  }

  if (width >= height) {
    return {
      width: FRIDGE_SCAN_MAX_DIMENSION,
      height: Math.round((height / width) * FRIDGE_SCAN_MAX_DIMENSION),
    };
  }

  return {
    width: Math.round((width / height) * FRIDGE_SCAN_MAX_DIMENSION),
    height: FRIDGE_SCAN_MAX_DIMENSION,
  };
}

function getImageDimensions(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function readErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const originalMessage =
      error.originalError instanceof Error ? error.originalError.message : '';
    return `${error.message}\n${originalMessage}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : '';
}

function isImageContextLostError(error: unknown) {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('image context has been lost') ||
    (message.includes('renderasync') && message.includes('context'))
  );
}

function normalizeBase64Payload(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  const payload = trimmedValue.startsWith('data:')
    ? trimmedValue.split(',')[1]?.trim()
    : trimmedValue;

  return payload ? payload.replace(/\s/g, '') : null;
}

function estimateBase64ByteLength(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

function readPositiveDimension(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function readPreEncodedJpegFallback(
  fallback?: PreEncodedFridgeScanImage,
): PreEncodedFallbackResult {
  const base64 = normalizeBase64Payload(fallback?.base64);
  const width = readPositiveDimension(fallback?.width);
  const height = readPositiveDimension(fallback?.height);

  if (!base64) {
    return {
      ok: false,
      reason: 'missing_base64',
      width: width ?? undefined,
      height: height ?? undefined,
    };
  }

  const byteLength = estimateBase64ByteLength(base64);
  if (byteLength > FRIDGE_SCAN_MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: 'payload_too_large',
      byteLength,
      width: width ?? undefined,
      height: height ?? undefined,
    };
  }

  if (!width || !height) {
    return {
      ok: false,
      reason: 'missing_dimensions',
      byteLength,
      width: width ?? undefined,
      height: height ?? undefined,
    };
  }

  if (width * height > FRIDGE_SCAN_MAX_IMAGE_PIXELS) {
    return {
      ok: false,
      reason: 'pixel_budget_exceeded',
      byteLength,
      width,
      height,
    };
  }

  return {
    ok: true,
    byteLength,
    image: {
      base64,
      width,
      height,
      usedPreEncodedFallback: true,
      fallbackSource: fallback?.source,
    },
  };
}

async function normalizeNativeImageToJpeg(
  imageUri: string,
): Promise<NormalizedFridgeImage> {
  const dimensions = await getImageDimensions(imageUri).catch(() => null);
  const resizeAction = dimensions
    ? getBoundedDimensions(dimensions.width, dimensions.height)
    : null;

  const manipulatedImage = await ImageManipulator.manipulateAsync(
    imageUri,
    resizeAction ? [{ resize: resizeAction }] : [],
    {
      compress: FRIDGE_SCAN_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!manipulatedImage.base64) {
    throw new ApiError(
      'Unable to normalize fridge scan image',
      'VALIDATION',
      undefined,
      { stage: 'image_normalization' },
    );
  }

  return {
    base64: manipulatedImage.base64,
    width: manipulatedImage.width,
    height: manipulatedImage.height,
  };
}

async function normalizeWebImageToJpeg(
  imageUri: string,
): Promise<NormalizedFridgeImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const bounded = getBoundedDimensions(image.width, image.height) ?? {
          width: image.width,
          height: image.height,
        };
        const canvas = document.createElement('canvas');
        canvas.width = bounded.width;
        canvas.height = bounded.height;

        const context = canvas.getContext('2d');
        if (!context) {
          reject(
            new ApiError(
              'Unable to normalize fridge scan image',
              'VALIDATION',
              undefined,
              { stage: 'image_normalization' },
            ),
          );
          return;
        }

        context.drawImage(image, 0, 0, bounded.width, bounded.height);
        const dataUrl = canvas.toDataURL('image/jpeg', FRIDGE_SCAN_JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1];

        if (!base64) {
          reject(
            new ApiError(
              'Unable to normalize fridge scan image',
              'VALIDATION',
              undefined,
              { stage: 'image_normalization' },
            ),
          );
          return;
        }

        resolve({
          base64,
          width: bounded.width,
          height: bounded.height,
        });
      } catch (error) {
        reject(
          error instanceof ApiError
            ? error
            : new ApiError(
                error instanceof Error
                  ? error.message
                  : 'Unable to normalize fridge scan image',
                'VALIDATION',
                error,
                { stage: 'image_normalization' },
              ),
        );
      }
    };

    image.onerror = (error) => {
      reject(
        new ApiError(
          'Unable to load fridge scan image',
          'VALIDATION',
          error,
          { stage: 'image_normalization' },
        ),
      );
    };

    image.src = imageUri;
  });
}

async function normalizeImageForFridgeScan(
  imageUri: string,
  preEncodedJpeg?: PreEncodedFridgeScanImage,
): Promise<NormalizedFridgeImage> {
  try {
    if (Platform.OS === 'web') {
      return await normalizeWebImageToJpeg(imageUri);
    }

    try {
      return await normalizeNativeImageToJpeg(imageUri);
    } catch (error) {
      if (!isImageContextLostError(error)) {
        throw error;
      }

      const fallbackResult = readPreEncodedJpegFallback(preEncodedJpeg);
      if (fallbackResult.ok) {
        logOperationalInfo(
          '[FridgeScanService] Fridge scan pre-encoded fallback used',
          {
            source: preEncodedJpeg?.source,
            fallback_width: fallbackResult.image.width,
            fallback_height: fallbackResult.image.height,
            fallback_byte_length: fallbackResult.byteLength,
          },
        );
        return fallbackResult.image;
      }

      logOperationalInfo(
        '[FridgeScanService] Fridge scan pre-encoded fallback rejected',
        {
          source: preEncodedJpeg?.source,
          reason: fallbackResult.reason,
          fallback_width: fallbackResult.width,
          fallback_height: fallbackResult.height,
          fallback_byte_length: fallbackResult.byteLength,
          max_image_bytes: FRIDGE_SCAN_MAX_IMAGE_BYTES,
          max_image_pixels: FRIDGE_SCAN_MAX_IMAGE_PIXELS,
        },
      );
      throw error;
    }
  } catch (error) {
    throw normalizeFridgeScanImageError(error, {
      platform: Platform.OS,
    });
  }
}

function mapEligibilityFailureToApiError(
  response: FridgeScanSubmissionResponse,
): ApiError {
  return createFridgeScanApiError(
    response.message || 'Fridge scan unavailable',
    response.code,
    response.code === 'fridge_scan_premium_required' ? 403 : 429,
    response.request_id,
    response,
  );
}

function createFridgeScanReadError(message: string, code?: string) {
  const apiError = new ApiError(message, 'UNKNOWN');
  apiError.code = code;
  return apiError;
}

export async function checkFridgeScanEligibility() {
  return invokeAuthedFridgeScanFunction<FridgeScanEligibilityResponse>(
    buildFridgeScanSubmitRequest({ checkOnly: true }),
  );
}

export async function submitFridgeScanCapture(
  input: SubmitFridgeScanCaptureInput,
): Promise<FridgeScanSubmission> {
  logOperationalInfo('[FridgeScanService] Preparing fridge scan capture', {
    source: input.source,
    selected_mode: input.selectedMode,
    locale: input.locale,
  });
  logOperationalInfo('[FridgeScanService] Fridge scan image normalization started', {
    source: input.source,
    selected_mode: input.selectedMode,
    locale: input.locale,
    platform: Platform.OS,
  });

  const normalizedImage = await normalizeImageForFridgeScan(
    input.imageUri,
    input.preEncodedJpeg,
  ).catch((error) => {
    logOperationalError(
      '[FridgeScanService] Fridge scan image normalization failed',
      error,
      {
        source: input.source,
        selected_mode: input.selectedMode,
        locale: input.locale,
        stage: 'image_normalization',
      },
    );
    throw error;
  });
  logOperationalInfo('[FridgeScanService] Fridge scan image normalized', {
    source: input.source,
    selected_mode: input.selectedMode,
    normalized_width: normalizedImage.width,
    normalized_height: normalizedImage.height,
    normalization_fallback: normalizedImage.usedPreEncodedFallback
      ? 'pre_encoded_jpeg'
      : undefined,
  });
  const response =
    await invokeAuthedFridgeScanFunction<FridgeScanSubmissionResponse>(
      buildFridgeScanSubmitRequest({
        source: input.source,
        selectedMode: input.selectedMode,
        imageBase64: normalizedImage.base64,
        locale: input.locale,
        clientMetadata: {
          normalized_width: normalizedImage.width,
          normalized_height: normalizedImage.height,
          ...(normalizedImage.usedPreEncodedFallback
            ? {
                normalization_fallback: 'pre_encoded_jpeg',
                normalization_fallback_source:
                  normalizedImage.fallbackSource ?? input.source,
              }
            : {}),
          ...input.clientMetadata,
        },
      }),
    );

  if (!response.allowed || !response.fridge_scan_id || !response.image_path) {
    throw mapEligibilityFailureToApiError(response);
  }

  logOperationalInfo('[FridgeScanService] Fridge scan queued', {
    request_id: response.request_id,
    fridge_scan_id: response.fridge_scan_id,
    status: response.status ?? 'queued',
    selected_mode: response.selected_mode ?? input.selectedMode,
    remaining: response.remaining,
    limit: response.limit,
  });

  return {
    fridgeScanId: response.fridge_scan_id,
    status: response.status ?? 'queued',
    imagePath: response.image_path,
    remaining: response.remaining,
    limit: response.limit,
    queuedAt: new Date().toISOString(),
    source: input.source,
    selectedMode: response.selected_mode ?? input.selectedMode,
  };
}

export async function fetchFridgeScanRecord(
  fridgeScanId: string,
): Promise<FridgeScanRecordState> {
  const trimmedId = fridgeScanId.trim();

  if (!trimmedId) {
    throw createFridgeScanReadError(
      'Fridge scan id is required',
      'invalid_fridge_scan_id',
    );
  }

  const { data, error } = await supabase
    .from('fridge_scans')
    .select('status, selected_mode, meal_result, error_code, error_message, processed_at')
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    throw new ApiError(
      error.message || 'Failed to read fridge scan',
      'DATABASE',
      error,
    );
  }

  if (!data) {
    throw createFridgeScanReadError('Fridge scan not found', 'fridge_scan_not_found');
  }

  const normalizedRecord = normalizeFridgeScanRecordState(data);
  if (!normalizedRecord) {
    throw createFridgeScanReadError(
      'Fridge scan payload is invalid',
      'invalid_fridge_scan_record',
    );
  }

  logOperationalInfo('[FridgeScanService] Fridge scan record loaded', {
    fridge_scan_id: trimmedId,
    status: normalizedRecord.status,
    selected_mode: normalizedRecord.selected_mode ?? undefined,
    has_meal_result: !!normalizedRecord.meal_result,
    error_code: normalizedRecord.error_code ?? undefined,
  });

  return normalizedRecord;
}

export const FridgeScanService = {
  checkFridgeScanEligibility,
  submitFridgeScanCapture,
  fetchFridgeScanRecord,
};
