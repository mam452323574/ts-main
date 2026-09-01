import { Phase2HttpError } from './phase2Errors.ts';
import type { Phase2WebhookResult } from './phase2Webhook.ts';

export const SCAN_ANALYSIS_TOTAL_BUDGET_MS = 100_000;
export const SCAN_ANALYSIS_PRIMARY_BUDGET_MS = 65_000;

const RETRYABLE_PROVIDER_STATUSES = new Set([
  402,
  408,
  429,
  500,
  502,
  503,
  504,
]);

const RETRYABLE_NORMALIZATION_ERROR_CODES = new Set([
  'analysis_failed',
  'invalid_analysis_response',
  'analysis_type_mismatch',
]);

const NON_RETRYABLE_WEBHOOK_ERROR_CODES = new Set([
  'webhook_host_resolves_private',
  'webhook_response_invalid_signature',
  'webhook_response_secret_missing',
  'webhook_response_stale',
  'webhook_response_unsigned',
]);

interface ScanWebhookAttemptSuccess<T> {
  ok: true;
  analysisResult: T;
  durationMs: number;
  webhookResult: Phase2WebhookResult;
}

interface ScanWebhookAttemptFailure {
  ok: false;
  durationMs: number;
  error: unknown;
  errorCode: string;
  retryable: boolean;
  status: number | null;
  webhookResult: Phase2WebhookResult | null;
}

type ScanWebhookAttempt<T> =
  | ScanWebhookAttemptSuccess<T>
  | ScanWebhookAttemptFailure;

type WebhookInvocationOutcome =
  | { kind: 'result'; value: Phase2WebhookResult }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

function getAttemptStatus<T>(attempt: ScanWebhookAttempt<T>) {
  return attempt.webhookResult?.status ?? (attempt.ok ? null : attempt.status);
}

export interface ScanWebhookDispatchTelemetry {
  primaryStatus: number | null;
  primaryDurationMs: number;
  fallbackUsed: boolean;
  fallbackStatus: number | null;
  fallbackDurationMs: number | null;
  terminalError: string | null;
}

export interface ScanWebhookDispatchResult<T> {
  analysisResult: T;
  telemetry: ScanWebhookDispatchTelemetry;
  webhookResult: Phase2WebhookResult;
}

export interface DispatchScanWebhookOptions<T> {
  fallbackUrl?: string | null;
  invoke: (
    url: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
  ) => Promise<Phase2WebhookResult>;
  normalize: (
    result: Phase2WebhookResult,
    attempt: 'primary' | 'fallback',
  ) => T;
  now?: () => number;
  payload: Record<string, unknown>;
  primaryBudgetMs?: number;
  primaryUrl: string;
  totalBudgetMs?: number;
}

function clampDuration(value: number) {
  return Math.max(0, Math.round(value));
}

function isAbortOrNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (
      error instanceof Error &&
      (
        error.name === 'AbortError' ||
        /abort|network|fetch failed|timed out|timeout/i.test(error.message)
      )
    )
  );
}

function classifyThrownWebhookError(error: unknown) {
  if (error instanceof Phase2HttpError) {
    if (
      NON_RETRYABLE_WEBHOOK_ERROR_CODES.has(error.code) ||
      error.code.startsWith('webhook_url_')
    ) {
      return {
        errorCode: error.code,
        retryable: false,
        status: error.status,
      };
    }

    return {
      errorCode: error.code,
      retryable:
        error.code === 'webhook_dns_resolution_failed' ||
        RETRYABLE_PROVIDER_STATUSES.has(error.status),
      status: error.status,
    };
  }

  if (isAbortOrNetworkError(error)) {
    return {
      errorCode:
        error instanceof Error && error.name === 'AbortError'
          ? 'provider_timeout'
          : 'provider_network_error',
      retryable: true,
      status: null,
    };
  }

  return {
    errorCode: 'provider_unexpected_error',
    retryable: false,
    status: null,
  };
}

function classifyNormalizationError(error: unknown) {
  if (
    error instanceof Phase2HttpError &&
    RETRYABLE_NORMALIZATION_ERROR_CODES.has(error.code)
  ) {
    return {
      errorCode: error.code,
      retryable: true,
    };
  }

  return {
    errorCode:
      error instanceof Phase2HttpError
        ? error.code
        : 'provider_normalization_error',
    retryable: false,
  };
}

async function runScanWebhookAttempt<T>(options: {
  invoke: DispatchScanWebhookOptions<T>['invoke'];
  normalize: DispatchScanWebhookOptions<T>['normalize'];
  now: () => number;
  payload: Record<string, unknown>;
  attempt: 'primary' | 'fallback';
  timeoutMs: number;
  url: string;
}): Promise<ScanWebhookAttempt<T>> {
  const startedAt = options.now();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    // postWebhookJson aborts the actual fetch. This outer deadline also covers
    // work that happens before fetch (notably DNS validation), so a slow
    // resolver cannot make the Edge function exceed its provider budget.
    const invocation = options.invoke(
      options.url,
      options.payload,
      options.timeoutMs,
    ).then<WebhookInvocationOutcome, WebhookInvocationOutcome>(
      (value) => ({ kind: 'result', value }),
      (error) => ({ kind: 'error', error }),
    );
    const deadline = new Promise<WebhookInvocationOutcome>((resolve) => {
      timeoutHandle = setTimeout(
        () => resolve({ kind: 'timeout' }),
        options.timeoutMs,
      );
    });
    const outcome = await Promise.race([invocation, deadline]);
    if (outcome.kind === 'timeout') {
      const timeoutError = new Error('provider request timed out');
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }
    if (outcome.kind === 'error') {
      throw outcome.error;
    }

    const webhookResult = outcome.value;
    const durationMs = clampDuration(options.now() - startedAt);

    if (!webhookResult.ok) {
      return {
        ok: false,
        durationMs,
        error: new Error(`provider_http_${webhookResult.status}`),
        errorCode: `provider_http_${webhookResult.status}`,
        retryable: RETRYABLE_PROVIDER_STATUSES.has(webhookResult.status),
        status: webhookResult.status,
        webhookResult,
      };
    }

    try {
      return {
        ok: true,
        analysisResult: options.normalize(webhookResult, options.attempt),
        durationMs,
        webhookResult,
      };
    } catch (error) {
      const classification = classifyNormalizationError(error);
      return {
        ok: false,
        durationMs,
        error,
        errorCode: classification.errorCode,
        retryable: classification.retryable,
        status: webhookResult.status,
        webhookResult,
      };
    }
  } catch (error) {
    const classification = classifyThrownWebhookError(error);
    const measuredDurationMs = clampDuration(options.now() - startedAt);
    return {
      ok: false,
      durationMs:
        classification.errorCode === 'provider_timeout'
          ? Math.max(measuredDurationMs, options.timeoutMs)
          : measuredDurationMs,
      error,
      errorCode: classification.errorCode,
      retryable: classification.retryable,
      status: classification.status,
      webhookResult: null,
    };
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

function createProviderFailure(
  primary: ScanWebhookAttemptFailure,
  telemetry: ScanWebhookDispatchTelemetry,
  fallback?: ScanWebhookAttemptFailure,
) {
  return new Phase2HttpError(
    502,
    'analysis_provider_failed',
    'Scan analysis provider returned an error',
    {
      primary_status: telemetry.primaryStatus ?? undefined,
      primary_duration_ms: telemetry.primaryDurationMs,
      primary_error: primary.errorCode,
      fallback_used: telemetry.fallbackUsed,
      fallback_status: telemetry.fallbackStatus ?? undefined,
      fallback_duration_ms: telemetry.fallbackDurationMs ?? undefined,
      fallback_error: fallback?.errorCode,
      terminal_error: telemetry.terminalError ?? undefined,
    },
  );
}

export async function dispatchScanWebhookWithFallback<T>(
  options: DispatchScanWebhookOptions<T>,
): Promise<ScanWebhookDispatchResult<T>> {
  const now = options.now ?? Date.now;
  const totalBudgetMs = Math.max(
    1,
    options.totalBudgetMs ?? SCAN_ANALYSIS_TOTAL_BUDGET_MS,
  );
  const primaryBudgetMs = Math.min(
    totalBudgetMs,
    Math.max(
      1,
      options.primaryBudgetMs ?? SCAN_ANALYSIS_PRIMARY_BUDGET_MS,
    ),
  );
  const dispatchStartedAt = now();
  const primary = await runScanWebhookAttempt({
    attempt: 'primary',
    invoke: options.invoke,
    normalize: options.normalize,
    now,
    payload: options.payload,
    timeoutMs: primaryBudgetMs,
    url: options.primaryUrl,
  });

  const baseTelemetry: ScanWebhookDispatchTelemetry = {
    primaryStatus: getAttemptStatus(primary),
    primaryDurationMs: primary.durationMs,
    fallbackUsed: false,
    fallbackStatus: null,
    fallbackDurationMs: null,
    terminalError: null,
  };

  if (primary.ok) {
    return {
      analysisResult: primary.analysisResult,
      telemetry: baseTelemetry,
      webhookResult: primary.webhookResult,
    };
  }

  const elapsedMs = Math.max(
    primary.durationMs,
    clampDuration(now() - dispatchStartedAt),
  );
  const fallbackBudgetMs = totalBudgetMs - elapsedMs;
  if (
    !primary.retryable ||
    !options.fallbackUrl ||
    fallbackBudgetMs <= 0
  ) {
    const telemetry = {
      ...baseTelemetry,
      terminalError:
        fallbackBudgetMs <= 0
          ? 'analysis_budget_exhausted'
          : primary.errorCode,
    };
    throw createProviderFailure(primary, telemetry);
  }

  const fallback = await runScanWebhookAttempt({
    attempt: 'fallback',
    invoke: options.invoke,
    normalize: options.normalize,
    now,
    payload: options.payload,
    timeoutMs: fallbackBudgetMs,
    url: options.fallbackUrl,
  });
  const fallbackTelemetry: ScanWebhookDispatchTelemetry = {
    ...baseTelemetry,
    fallbackUsed: true,
    fallbackStatus: getAttemptStatus(fallback),
    fallbackDurationMs: fallback.durationMs,
    terminalError: fallback.ok ? null : fallback.errorCode,
  };

  if (fallback.ok) {
    return {
      analysisResult: fallback.analysisResult,
      telemetry: fallbackTelemetry,
      webhookResult: fallback.webhookResult,
    };
  }

  throw createProviderFailure(primary, fallbackTelemetry, fallback);
}

export function toScanWebhookDispatchLogFields(
  telemetry: ScanWebhookDispatchTelemetry,
) {
  return {
    primary_status: telemetry.primaryStatus ?? undefined,
    primary_duration_ms: telemetry.primaryDurationMs,
    fallback_used: telemetry.fallbackUsed,
    fallback_status: telemetry.fallbackStatus ?? undefined,
    fallback_duration_ms: telemetry.fallbackDurationMs ?? undefined,
    terminal_error: telemetry.terminalError ?? undefined,
  };
}
