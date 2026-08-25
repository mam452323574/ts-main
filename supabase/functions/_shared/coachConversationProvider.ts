import { readOptionalServerEnv, requireWebhookUrl } from './phase2Env.ts';
import { validateWebhookUrl } from './webhookHostAllowlist.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import {
  isRecord,
  readOptionalNumber,
  readOptionalString,
} from './phase2Utils.ts';
import {
  PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE,
  type Phase2WebhookResult,
  postWebhookJson,
} from './phase2Webhook.ts';

export const COACH_CONVERSATION_WEBHOOK_ENV_NAME =
  'N8N_COACH_CONVERSATION_WEBHOOK_URL';
export const COACH_CONVERSATION_FALLBACK_WEBHOOK_ENV_NAME =
  'N8N_COACH_CONVERSATION_FALLBACK_WEBHOOK_URL';
export const COACH_CONVERSATION_WEBHOOK_TIMEOUT_MS = 75_000;
export const COACH_CONVERSATION_WEBHOOK_MAX_BYTES = 32 * 1024;
export const COACH_CONVERSATION_WEBHOOK_NOT_CONFIGURED_CODE =
  'coach_conversation_webhook_not_configured';
export const COACH_CONVERSATION_WEBHOOK_FAILED_CODE =
  'coach_conversation_webhook_failed';
export const COACH_CONVERSATION_WEBHOOK_UNREACHABLE_CODE =
  'coach_conversation_webhook_unreachable';
export const COACH_CONVERSATION_RESPONSE_INVALID_CODE =
  'coach_conversation_invalid_response';
export const COACH_CONVERSATION_RESPONSE_TOO_LARGE_CODE =
  'coach_conversation_response_too_large';

export interface CoachConversationWebhookEndpoints {
  primaryUrl: string;
  fallbackUrl: string | null;
}

export interface CoachConversationWebhookCallResult {
  content: string;
  model: string | null;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  generationMs: number | null;
  rawPayload: Record<string, unknown> | null;
  usedFallback: boolean;
}

const COACH_GENERATE_WEBHOOK_ENV_NAME = 'N8N_COACH_GENERATE_WEBHOOK_URL';

/**
 * Derive a coach-conversation webhook URL from the coach-generate one when
 * the dedicated env var is not configured yet. The heuristic replaces the
 * trailing `/coach` (or `/webhook/coach`) segment by `/coach-conversation`.
 * Returns null when the source URL doesn't end with a recognisable Coach path.
 */
function deriveConversationUrlFromCoachGenerate(): string | null {
  const generateUrl = readOptionalServerEnv(COACH_GENERATE_WEBHOOK_ENV_NAME);
  if (!generateUrl) return null;
  let derived: string | null = null;
  if (/\/coach\/?$/.test(generateUrl)) {
    derived = generateUrl.replace(/\/coach\/?$/, '/coach-conversation');
  }
  if (!derived) return null;
  const validation = validateWebhookUrl(derived);
  return validation.ok ? derived : null;
}

export function requireCoachConversationWebhookEndpoints():
  CoachConversationWebhookEndpoints {
  const explicitUrl = readOptionalServerEnv(COACH_CONVERSATION_WEBHOOK_ENV_NAME);
  if (explicitUrl) {
    return {
      primaryUrl: requireWebhookUrl(COACH_CONVERSATION_WEBHOOK_ENV_NAME, {
        code: COACH_CONVERSATION_WEBHOOK_NOT_CONFIGURED_CODE,
        message: 'Coach conversation provider is not configured',
      }),
      fallbackUrl: readOptionalServerEnv(COACH_CONVERSATION_FALLBACK_WEBHOOK_ENV_NAME),
    };
  }

  const derived = deriveConversationUrlFromCoachGenerate();
  if (derived) {
    return {
      primaryUrl: derived,
      fallbackUrl: readOptionalServerEnv(COACH_CONVERSATION_FALLBACK_WEBHOOK_ENV_NAME),
    };
  }

  throw new Phase2HttpError(
    503,
    COACH_CONVERSATION_WEBHOOK_NOT_CONFIGURED_CODE,
    'Coach conversation provider is not configured',
  );
}

function rethrowAsTooLargeIfApplicable(error: unknown): never {
  if (
    error instanceof Phase2HttpError &&
    error.code === PHASE2_WEBHOOK_RESPONSE_TOO_LARGE_ERROR_CODE
  ) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_RESPONSE_TOO_LARGE_CODE,
      `Coach conversation webhook response must be ${COACH_CONVERSATION_WEBHOOK_MAX_BYTES} bytes or fewer`,
    );
  }
  throw error;
}

async function postConversationWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<Phase2WebhookResult> {
  try {
    return await postWebhookJson(
      url,
      payload,
      COACH_CONVERSATION_WEBHOOK_TIMEOUT_MS,
      { maxResponseBytes: COACH_CONVERSATION_WEBHOOK_MAX_BYTES },
    );
  } catch (error) {
    rethrowAsTooLargeIfApplicable(error);
  }
}

function extractContentFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const direct = readOptionalString(payload.content);
  if (direct) return direct;

  const text = readOptionalString(payload.text);
  if (text) return text;

  if (Array.isArray(payload.choices) && payload.choices.length > 0) {
    const first = payload.choices[0];
    if (isRecord(first)) {
      const messageContent =
        isRecord(first.message)
          ? readOptionalString(first.message.content)
          : null;
      if (messageContent) return messageContent;
      const fallback = readOptionalString(first.text);
      if (fallback) return fallback;
    }
  }

  if (isRecord(payload.message)) {
    const messageContent = readOptionalString(payload.message.content);
    if (messageContent) return messageContent;
  }

  return '';
}

function buildCallResult(
  webhookResult: Phase2WebhookResult,
  usedFallback: boolean,
): CoachConversationWebhookCallResult {
  if (!webhookResult.ok) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_WEBHOOK_FAILED_CODE,
      `Coach conversation webhook returned HTTP ${webhookResult.status}`,
    );
  }

  if (!webhookResult.payload) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_RESPONSE_INVALID_CODE,
      'Coach conversation webhook response is not valid JSON',
    );
  }

  const payload = webhookResult.payload;
  const content = extractContentFromPayload(payload);
  if (!content.trim()) {
    throw new Phase2HttpError(
      502,
      COACH_CONVERSATION_RESPONSE_INVALID_CODE,
      'Coach conversation response is missing assistant content',
    );
  }

  const usage = isRecord(payload.usage) ? payload.usage : null;

  return {
    content,
    model: readOptionalString(payload.model),
    provider: readOptionalString(payload.provider) ?? 'n8n',
    promptTokens: usage
      ? readOptionalNumber(
          usage.prompt_tokens ?? (usage as Record<string, unknown>).input_tokens,
        )
      : null,
    completionTokens: usage
      ? readOptionalNumber(
          usage.completion_tokens ??
            (usage as Record<string, unknown>).output_tokens,
        )
      : null,
    generationMs: readOptionalNumber(payload.generation_ms),
    rawPayload: payload,
    usedFallback,
  };
}

export async function postCoachConversationWebhook(options: {
  endpoints: CoachConversationWebhookEndpoints;
  payload: Record<string, unknown>;
  onFallback?: (details: { reason: 'network' | 'server_error' | 'invalid_json'; primaryStatus: number | null }) => void | Promise<void>;
}): Promise<CoachConversationWebhookCallResult> {
  const { endpoints, payload, onFallback } = options;

  try {
    const primary = await postConversationWebhook(endpoints.primaryUrl, payload);
    const reason =
      primary.status >= 500
        ? 'server_error'
        : primary.ok && !primary.payload
          ? 'invalid_json'
          : null;

    if (!reason || !endpoints.fallbackUrl) {
      return buildCallResult(primary, false);
    }

    await onFallback?.({ reason, primaryStatus: primary.status });
    const fallback = await postConversationWebhook(endpoints.fallbackUrl, payload);
    return buildCallResult(fallback, true);
  } catch (error) {
    if (error instanceof Phase2HttpError) {
      throw error;
    }

    if (!endpoints.fallbackUrl) {
      throw new Phase2HttpError(
        502,
        COACH_CONVERSATION_WEBHOOK_UNREACHABLE_CODE,
        'Coach conversation webhook is unreachable',
      );
    }

    await onFallback?.({ reason: 'network', primaryStatus: null });
    const fallback = await postConversationWebhook(endpoints.fallbackUrl, payload);
    return buildCallResult(fallback, true);
  }
}
