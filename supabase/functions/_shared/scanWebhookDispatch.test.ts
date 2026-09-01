import { Phase2HttpError } from './phase2Errors.ts';
import type { Phase2WebhookResult } from './phase2Webhook.ts';
import {
  dispatchScanWebhookWithFallback,
  SCAN_ANALYSIS_PRIMARY_BUDGET_MS,
  SCAN_ANALYSIS_TOTAL_BUDGET_MS,
} from './scanWebhookDispatch.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function webhookResult(
  status: number,
  payload: Record<string, unknown> | null = { scan_type: 'face' },
): Phase2WebhookResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    payload,
    bodyPresent: payload !== null,
    rawText: payload === null ? null : JSON.stringify(payload),
  };
}

function normalize(result: Phase2WebhookResult) {
  if (result.payload?.invalid === true) {
    throw new Phase2HttpError(
      502,
      'invalid_analysis_response',
      'Invalid analysis response',
    );
  }
  return result.payload;
}

Deno.test('dispatchScanWebhookWithFallback keeps the primary path when it succeeds', async () => {
  const calls: Array<{ url: string; timeoutMs: number }> = [];

  const result = await dispatchScanWebhookWithFallback({
    primaryUrl: 'https://primary.example/webhook',
    fallbackUrl: 'https://fallback.example/webhook',
    payload: { scanId: 'scan-1' },
    normalize,
    invoke: async (url, _payload, timeoutMs) => {
      calls.push({ url, timeoutMs });
      return webhookResult(200, { scan_type: 'face', provider: 'deepseek' });
    },
  });

  assertEquals(calls, [{
    url: 'https://primary.example/webhook',
    timeoutMs: SCAN_ANALYSIS_PRIMARY_BUDGET_MS,
  }], 'Primary should be invoked once');
  assertEquals(result.telemetry.fallbackUsed, false, 'Fallback should stay unused');
  assertEquals(result.telemetry.primaryStatus, 200, 'Primary status should be logged');
});

Deno.test('dispatchScanWebhookWithFallback retries once on HTTP 429', async () => {
  const calls: Array<{ url: string; timeoutMs: number }> = [];
  let clock = 0;

  const result = await dispatchScanWebhookWithFallback({
    primaryUrl: 'https://primary.example/webhook',
    fallbackUrl: 'https://fallback.example/webhook',
    payload: { scanId: 'scan-2' },
    normalize,
    now: () => clock,
    invoke: async (url, _payload, timeoutMs) => {
      calls.push({ url, timeoutMs });
      clock += url.includes('primary') ? 2_000 : 3_000;
      return url.includes('primary')
        ? webhookResult(429, { error: 'quota' })
        : webhookResult(200, { scan_type: 'face', provider: 'gemini' });
    },
  });

  assertEquals(calls[0]?.timeoutMs, 65_000, 'Primary budget should be 65 seconds');
  assertEquals(calls[1]?.timeoutMs, 98_000, 'Fallback should receive the remaining budget');
  assertEquals(result.telemetry, {
    primaryStatus: 429,
    primaryDurationMs: 2_000,
    fallbackUsed: true,
    fallbackStatus: 200,
    fallbackDurationMs: 3_000,
    terminalError: null,
  }, 'Fallback telemetry should be complete');
});

Deno.test('dispatchScanWebhookWithFallback retries DeepSeek billing exhaustion HTTP 402', async () => {
  let calls = 0;

  const result = await dispatchScanWebhookWithFallback({
    primaryUrl: 'https://primary.example/webhook',
    fallbackUrl: 'https://fallback.example/webhook',
    payload: { scanId: 'scan-deepseek-billing' },
    normalize,
    invoke: async () => {
      calls += 1;
      return calls === 1
        ? webhookResult(402, { error: 'billing_exhausted' })
        : webhookResult(200, { scan_type: 'face', provider: 'gemini' });
    },
  });

  assertEquals(calls, 2, 'Billing exhaustion should use the fallback once');
  assertEquals(result.telemetry.primaryStatus, 402, 'Primary status should be logged');
  assertEquals(result.telemetry.fallbackUsed, true, 'Fallback usage should be logged');
});

Deno.test('dispatchScanWebhookWithFallback retries an invalid primary response', async () => {
  const calledUrls: string[] = [];

  const result = await dispatchScanWebhookWithFallback({
    primaryUrl: 'https://primary.example/webhook',
    fallbackUrl: 'https://fallback.example/webhook',
    payload: { scanId: 'scan-3' },
    normalize,
    invoke: async (url) => {
      calledUrls.push(url);
      return url.includes('primary')
        ? webhookResult(200, { invalid: true })
        : webhookResult(200, { scan_type: 'nutrition' });
    },
  });

  assertEquals(calledUrls, [
    'https://primary.example/webhook',
    'https://fallback.example/webhook',
  ], 'Invalid response should use the fallback once');
  assertEquals(result.telemetry.fallbackUsed, true, 'Fallback usage should be logged');
});

Deno.test('dispatchScanWebhookWithFallback does not retry HTTP 400, 401, or 403', async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    try {
      await dispatchScanWebhookWithFallback({
        primaryUrl: 'https://primary.example/webhook',
        fallbackUrl: 'https://fallback.example/webhook',
        payload: { scanId: `scan-${status}` },
        normalize,
        invoke: async () => {
          calls += 1;
          return webhookResult(status, { error: 'non_retryable' });
        },
      });
      throw new Error(`Expected status ${status} to fail`);
    } catch (error) {
      assert(error instanceof Phase2HttpError, 'Expected a Phase2HttpError');
      assertEquals(error.code, 'analysis_provider_failed', 'Unexpected error code');
      assertEquals(error.status, 502, 'Unexpected public status');
      assertEquals(error.details?.fallback_used, false, 'Fallback must stay unused');
      assertEquals(calls, 1, 'Only the primary should be called');
    }
  }
});

Deno.test('dispatchScanWebhookWithFallback reports a double provider failure', async () => {
  let calls = 0;

  try {
    await dispatchScanWebhookWithFallback({
      primaryUrl: 'https://primary.example/webhook',
      fallbackUrl: 'https://fallback.example/webhook',
      payload: { scanId: 'scan-double-failure' },
      normalize,
      invoke: async () => {
        calls += 1;
        return calls === 1
          ? webhookResult(500, { error: 'primary' })
          : webhookResult(503, { error: 'fallback' });
      },
    });
    throw new Error('Expected both providers to fail');
  } catch (error) {
    assert(error instanceof Phase2HttpError, 'Expected a Phase2HttpError');
    assertEquals(error.status, 502, 'Double failure should remain HTTP 502');
    assertEquals(error.code, 'analysis_provider_failed', 'Error code must stay stable');
    assertEquals(error.details?.primary_status, 500, 'Primary status should be present');
    assertEquals(error.details?.fallback_status, 503, 'Fallback status should be present');
    assertEquals(error.details?.fallback_used, true, 'Fallback usage should be present');
  }
});

Deno.test('dispatchScanWebhookWithFallback never allocates more than the total 100 second budget', async () => {
  const timeouts: number[] = [];
  let clock = 0;

  try {
    await dispatchScanWebhookWithFallback({
      primaryUrl: 'https://primary.example/webhook',
      fallbackUrl: 'https://fallback.example/webhook',
      payload: { scanId: 'scan-budget' },
      normalize,
      now: () => clock,
      invoke: async (_url, _payload, timeoutMs) => {
        timeouts.push(timeoutMs);
        clock += timeoutMs;
        const error = new Error('request timed out');
        error.name = 'AbortError';
        throw error;
      },
    });
    throw new Error('Expected the budget test to fail');
  } catch (error) {
    assert(error instanceof Phase2HttpError, 'Expected a Phase2HttpError');
    assertEquals(timeouts, [
      SCAN_ANALYSIS_PRIMARY_BUDGET_MS,
      SCAN_ANALYSIS_TOTAL_BUDGET_MS - SCAN_ANALYSIS_PRIMARY_BUDGET_MS,
    ], 'Primary plus fallback budgets must equal 100 seconds');
    assertEquals(
      timeouts.reduce((total, value) => total + value, 0),
      SCAN_ANALYSIS_TOTAL_BUDGET_MS,
      'Combined timeout budget must not exceed 100 seconds',
    );
  }
});

Deno.test('dispatchScanWebhookWithFallback enforces the primary deadline around a hung invocation', async () => {
  const timeouts: number[] = [];

  const result = await dispatchScanWebhookWithFallback({
    primaryUrl: 'https://primary.example/webhook',
    fallbackUrl: 'https://fallback.example/webhook',
    payload: { scanId: 'scan-hung-provider' },
    normalize,
    now: () => 0,
    primaryBudgetMs: 5,
    totalBudgetMs: 15,
    invoke: async (url, _payload, timeoutMs) => {
      timeouts.push(timeoutMs);
      if (url.includes('primary')) {
        return await new Promise<Phase2WebhookResult>(() => undefined);
      }
      return webhookResult(200, { scan_type: 'face', provider: 'gemini' });
    },
  });

  assertEquals(
    timeouts,
    [5, 10],
    'The fallback should receive only the remaining total budget',
  );
  assertEquals(
    result.telemetry.fallbackUsed,
    true,
    'A hung primary should switch to the fallback once',
  );
});
