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
import { logOperationalInfo } from '@/utils/observability';

const FRIDGE_SCAN_FUNCTION_NAME = 'fridge-scan-submit';
const FRIDGE_SCAN_MAX_DIMENSION = 1600;
const FRIDGE_SCAN_JPEG_QUALITY = 0.78;

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

async function getAuthenticatedSessionOrThrow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError('api_errors.unauthorized', 'AUTH');
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
  const session = await getAuthenticatedSessionOrThrow();
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
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      'NETWORK',
      error,
      { functionName: FRIDGE_SCAN_FUNCTION_NAME },
    );
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
    throw createFridgeScanApiError(
      errorPayload.error ||
        errorPayload.message ||
        `${FRIDGE_SCAN_FUNCTION_NAME} failed`,
      errorPayload.code,
      response.status,
      requestId,
      rawResponseBody,
    );
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
): Promise<NormalizedFridgeImage> {
  if (Platform.OS === 'web') {
    return normalizeWebImageToJpeg(imageUri);
  }

  return normalizeNativeImageToJpeg(imageUri);
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
  const normalizedImage = await normalizeImageForFridgeScan(input.imageUri);
  logOperationalInfo('[FridgeScanService] Fridge scan image normalized', {
    source: input.source,
    selected_mode: input.selectedMode,
    normalized_width: normalizedImage.width,
    normalized_height: normalizedImage.height,
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
