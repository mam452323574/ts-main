import { getPhase2WebhookAuthConfig } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import { isRecord } from './phase2Utils.ts';

export interface Phase2WebhookResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown> | null;
  bodyPresent: boolean;
  rawText: string | null;
}

export interface Phase2WebhookRequestOptions {
  maxResponseBytes?: number;
}

export const PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE =
  'webhook_response_too_large';

export const PHASE2_WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const PHASE2_WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

const PHASE2_WEBHOOK_SIGNATURE_PREFIX = 'sha256=';
const textEncoder = new TextEncoder();

function arrayBufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function createPhase2WebhookSignature(
  timestamp: string,
  rawBody: string,
  secret: string,
) {
  const signingKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    textEncoder.encode(`${timestamp}.${rawBody}`),
  );

  return `${PHASE2_WEBHOOK_SIGNATURE_PREFIX}${arrayBufferToHex(signature)}`;
}

export async function buildPhase2WebhookHeaders(
  rawBody: string,
  options: {
    timestamp?: string;
  } = {},
) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json; charset=utf-8',
  });
  const authConfig = getPhase2WebhookAuthConfig();

  if (authConfig.useBearer) {
    headers.set('Authorization', `Bearer ${authConfig.bearerToken!}`);
  }

  if (authConfig.useHeader) {
    headers.set(authConfig.secretHeaderName!, authConfig.secretHeaderValue!);
  }

  if (authConfig.useHmac) {
    const timestamp = options.timestamp ?? new Date().toISOString();
    headers.set(PHASE2_WEBHOOK_TIMESTAMP_HEADER, timestamp);
    headers.set(
      PHASE2_WEBHOOK_SIGNATURE_HEADER,
      await createPhase2WebhookSignature(
        timestamp,
        rawBody,
        authConfig.hmacSecret!,
      ),
    );
  }

  return headers;
}

export async function postWebhookJson(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
  options: Phase2WebhookRequestOptions = {},
): Promise<Phase2WebhookResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const rawBody = JSON.stringify(payload);
  const maxResponseBytes = options.maxResponseBytes;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: await buildPhase2WebhookHeaders(rawBody),
      body: rawBody,
      signal: controller.signal,
    });

    if (typeof maxResponseBytes === 'number' && maxResponseBytes > 0) {
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredContentLength = Number(contentLengthHeader);
        if (
          Number.isFinite(declaredContentLength) &&
          declaredContentLength > maxResponseBytes
        ) {
          throw new Phase2HttpError(
            502,
            PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
            `Webhook response must be ${maxResponseBytes} bytes or fewer`,
          );
        }
      }
    }

    const text = await response.text();
    if (
      typeof maxResponseBytes === 'number' &&
      maxResponseBytes > 0 &&
      new TextEncoder().encode(text).length > maxResponseBytes
    ) {
      throw new Phase2HttpError(
        502,
        PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
        `Webhook response must be ${maxResponseBytes} bytes or fewer`,
      );
    }
    const trimmedText = text.trim();
    let parsedPayload: Record<string, unknown> | null = null;

    if (trimmedText.length > 0) {
      try {
        const parsed = JSON.parse(text);
        parsedPayload = isRecord(parsed) ? parsed : null;
      } catch {
        parsedPayload = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload: parsedPayload,
      bodyPresent: trimmedText.length > 0,
      rawText: trimmedText.length > 0 ? text : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
