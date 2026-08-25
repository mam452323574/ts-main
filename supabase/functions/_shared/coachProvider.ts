import { readOptionalServerEnv, requireWebhookUrl } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import { summarizeProviderPayload } from './phase2Observability.ts';
import {
  PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
  type Phase2WebhookResult,
  postWebhookJson,
} from './phase2Webhook.ts';

export const COACH_GENERATE_WEBHOOK_ENV_NAME =
  'N8N_COACH_GENERATE_WEBHOOK_URL';
export const COACH_GENERATE_FALLBACK_WEBHOOK_ENV_NAME =
  'N8N_COACH_GENERATE_FALLBACK_WEBHOOK_URL';
export const DEFAULT_COACH_GENERATE_WEBHOOK_TIMEOUT_MS = 10_000;
// Coach generation runs inline against n8n + the LLM provider and can take
// longer than the generic webhook timeout before a final answer is ready.
export const COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS = 75_000;
// Cap the webhook response so a misconfigured/compromised provider can't bloat
// coach_entries.response_payload_json or starve Edge Runtime memory (C-03).
export const COACH_GENERATE_RESPONSE_MAX_BYTES = 32 * 1024;
export const COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE =
  'coach_webhook_not_configured';
export const COACH_PROVIDER_NOT_CONFIGURED_MESSAGE =
  'Coach generation provider is not configured';
export const COACH_RESPONSE_TOO_LARGE_ERROR_CODE = 'coach_response_too_large';

export interface CoachGenerateWebhookEndpoints {
  primaryUrl: string;
  fallbackUrl: string | null;
}

export type CoachWebhookFallbackReason =
  | 'network_error'
  | 'server_error'
  | 'invalid_json';

export interface CoachGenerateWebhookCallResult {
  webhookResult: Phase2WebhookResult;
  usedFallback: boolean;
  fallbackReason: CoachWebhookFallbackReason | null;
}

export async function markCoachProviderUnavailable(
  client: any,
  entryId: string,
  requestId?: string,
) {
  await client
    .from('coach_entries')
    .update({
      status: 'error',
      error_code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
      response_payload_json: summarizeProviderPayload(null, {
        error_code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
        provider: 'n8n',
        request_id: requestId,
        source: 'coach_generation',
      }),
    })
    .eq('id', entryId);
}

export async function requireCoachGenerateWebhookEndpoints(
  client: any,
  entryId: string | null,
  requestId?: string,
): Promise<CoachGenerateWebhookEndpoints> {
  try {
    return {
      primaryUrl: requireWebhookUrl(COACH_GENERATE_WEBHOOK_ENV_NAME, {
        code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
        message: COACH_PROVIDER_NOT_CONFIGURED_MESSAGE,
      }),
      fallbackUrl: readOptionalServerEnv(
        COACH_GENERATE_FALLBACK_WEBHOOK_ENV_NAME,
      ),
    };
  } catch (error) {
    if (
      error instanceof Phase2HttpError &&
      error.code === COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE &&
      entryId
    ) {
      await markCoachProviderUnavailable(client, entryId, requestId);
    }

    throw error;
  }
}

function resolveCoachWebhookFallbackReason(
  result: Phase2WebhookResult,
): CoachWebhookFallbackReason | null {
  if (result.status >= 500) {
    return 'server_error';
  }

  if (result.ok && result.payload === null) {
    return 'invalid_json';
  }

  return null;
}

function rethrowAsCoachResponseTooLargeIfApplicable(error: unknown): never {
  if (
    error instanceof Phase2HttpError &&
    error.code === PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE
  ) {
    throw new Phase2HttpError(
      502,
      COACH_RESPONSE_TOO_LARGE_ERROR_CODE,
      `Coach webhook response must be ${COACH_GENERATE_RESPONSE_MAX_BYTES} bytes or fewer`,
    );
  }

  throw error;
}

async function postCoachWebhookJson(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<Phase2WebhookResult> {
  try {
    return await postWebhookJson(url, payload, timeoutMs, {
      maxResponseBytes: COACH_GENERATE_RESPONSE_MAX_BYTES,
    });
  } catch (error) {
    rethrowAsCoachResponseTooLargeIfApplicable(error);
  }
}

export async function postCoachGenerateWebhook(options: {
  endpoints: CoachGenerateWebhookEndpoints;
  payload: Record<string, unknown>;
  timeoutMs?: number;
  onFallback?: (details: {
    reason: CoachWebhookFallbackReason;
    primaryStatus: number | null;
  }) => void | Promise<void>;
}): Promise<CoachGenerateWebhookCallResult> {
  const timeoutMs =
    options.timeoutMs ?? DEFAULT_COACH_GENERATE_WEBHOOK_TIMEOUT_MS;

  try {
    const primaryResult = await postCoachWebhookJson(
      options.endpoints.primaryUrl,
      options.payload,
      timeoutMs,
    );
    const fallbackReason = options.endpoints.fallbackUrl
      ? resolveCoachWebhookFallbackReason(primaryResult)
      : null;

    if (!fallbackReason || !options.endpoints.fallbackUrl) {
      return {
        webhookResult: primaryResult,
        usedFallback: false,
        fallbackReason: null,
      };
    }

    await options.onFallback?.({
      reason: fallbackReason,
      primaryStatus: primaryResult.status,
    });

    return {
      webhookResult: await postCoachWebhookJson(
        options.endpoints.fallbackUrl,
        options.payload,
        timeoutMs,
      ),
      usedFallback: true,
      fallbackReason,
    };
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      throw error;
    }

    if (!options.endpoints.fallbackUrl) {
      throw error;
    }

    await options.onFallback?.({
      reason: 'network_error',
      primaryStatus: null,
    });

    return {
      webhookResult: await postCoachWebhookJson(
        options.endpoints.fallbackUrl,
        options.payload,
        timeoutMs,
      ),
      usedFallback: true,
      fallbackReason: 'network_error',
    };
  }
}
