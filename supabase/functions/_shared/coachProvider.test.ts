import {
  COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS,
  COACH_GENERATE_FALLBACK_WEBHOOK_ENV_NAME,
  COACH_GENERATE_WEBHOOK_ENV_NAME,
  postCoachGenerateWebhook,
  requireCoachGenerateWebhookEndpoints,
} from './coachProvider.ts';
import { Phase2HttpError } from './phase2Errors.ts';

const TEST_ENV_NAMES = [
  COACH_GENERATE_WEBHOOK_ENV_NAME,
  COACH_GENERATE_FALLBACK_WEBHOOK_ENV_NAME,
  'PHASE2_WEBHOOK_AUTH_MODE',
  'PHASE2_WEBHOOK_BEARER_TOKEN',
  'PHASE2_WEBHOOK_SECRET_HEADER_NAME',
  'PHASE2_WEBHOOK_SECRET_HEADER_VALUE',
  'PHASE2_WEBHOOK_HMAC_SECRET',
] as const;

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message: string,
) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function assertRejectsPhase2HttpError(
  action: () => Promise<unknown> | unknown,
  expectedCode: string,
  expectedMessagePart: string,
) {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof Phase2HttpError,
      'Expected a Phase2HttpError to be thrown',
    );
    assertEquals(error.code, expectedCode, 'Unexpected Phase2HttpError code');
    assert(
      error.message.includes(expectedMessagePart),
      `Expected error message to include "${expectedMessagePart}"`,
    );
    return error;
  }

  throw new Error('Expected the action to throw');
}

async function withCoachProviderEnv(
  overrides: Partial<Record<(typeof TEST_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();

  for (const envName of TEST_ENV_NAMES) {
    originalValues.set(envName, Deno.env.get(envName));
    if (Object.prototype.hasOwnProperty.call(overrides, envName)) {
      Deno.env.set(envName, overrides[envName] ?? '');
    } else {
      Deno.env.set(envName, '');
    }
  }

  try {
    await action();
  } finally {
    for (const envName of TEST_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

type MockFetchResponse =
  | Error
  | {
    body?: string;
    status?: number;
    headers?: HeadersInit;
  };

function installFetchSequenceSpy(sequence: MockFetchResponse[]) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: string | URL | Request;
    init: RequestInit | undefined;
  }> = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    const nextResponse = sequence[calls.length - 1];

    if (!nextResponse) {
      throw new Error('No mock fetch response configured for this call');
    }

    if (nextResponse instanceof Error) {
      throw nextResponse;
    }

    return new Response(nextResponse.body ?? '{"success":true}', {
      status: nextResponse.status ?? 200,
      headers: nextResponse.headers ?? {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function readHeader(init: RequestInit | undefined, name: string) {
  return new Headers(init?.headers).get(name);
}

function createCoachEntryClientSpy() {
  const updates: Array<Record<string, unknown>> = [];

  return {
    client: {
      from(tableName: string) {
        assertEquals(tableName, 'coach_entries', 'Unexpected table name');

        return {
          update(payload: Record<string, unknown>) {
            updates.push(payload);

            return {
              eq(columnName: string, value: string) {
                updates[updates.length - 1] = {
                  ...updates[updates.length - 1],
                  columnName,
                  value,
                };

                return { data: null, error: null };
              },
            };
          },
        };
      },
    },
    updates,
  };
}

Deno.test('requireCoachGenerateWebhookEndpoints keeps the primary env mandatory', async () => {
  await withCoachProviderEnv({
    [COACH_GENERATE_FALLBACK_WEBHOOK_ENV_NAME]: 'https://fallback.example/webhook',
  }, async () => {
    const { client, updates } = createCoachEntryClientSpy();

    await assertRejectsPhase2HttpError(
      () => requireCoachGenerateWebhookEndpoints(client, 'entry-1'),
      'coach_webhook_not_configured',
      'Coach generation provider is not configured',
    );

    assertEquals(updates.length, 1, 'The pending coach entry should be marked unavailable');
    assertEquals(
      updates[0]?.error_code,
      'coach_webhook_not_configured',
      'Missing primary env should record the provider-not-configured error',
    );
  });
});

Deno.test('coach response generation exposes the extended webhook timeout', () => {
  assertEquals(
    COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS,
    45_000,
    'Coach response generation should allow long-running webhook calls',
  );
});

Deno.test('postCoachGenerateWebhook returns the primary result when it succeeds', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 200,
        body: JSON.stringify({
          title: 'Coach title',
          body: 'Coach body',
        }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
      });

      assertEquals(fetchSpy.calls.length, 1, 'Only the primary webhook should be called');
      assert(!result.usedFallback, 'Fallback should not be used when the primary succeeds');
      assertEquals(result.webhookResult.status, 200, 'Unexpected primary response status');
      assertEquals(
        result.webhookResult.payload?.title,
        'Coach title',
        'Unexpected primary response payload',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook retries once after a network failure and keeps shared auth headers', async () => {
  await withCoachProviderEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'bearer',
    PHASE2_WEBHOOK_BEARER_TOKEN: 'phase2-bearer-token',
  }, async () => {
    const fetchSpy = installFetchSequenceSpy([
      new TypeError('network down'),
      {
        status: 200,
        body: JSON.stringify({
          title: 'Fallback title',
          body: 'Fallback body',
        }),
      },
    ]);
    const fallbackEvents: Array<{
      reason: string;
      primaryStatus: number | null;
    }> = [];

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
        onFallback: (details) => {
          fallbackEvents.push(details);
        },
      });

      assertEquals(fetchSpy.calls.length, 2, 'The fallback should be called exactly once');
      assert(result.usedFallback, 'Fallback should be reported as used');
      assertEquals(result.fallbackReason, 'network_error', 'Unexpected fallback reason');
      assertEquals(fallbackEvents.length, 1, 'Fallback should be announced exactly once');
      assertEquals(fallbackEvents[0]?.reason, 'network_error', 'Unexpected fallback callback reason');
      assertEquals(
        fallbackEvents[0]?.primaryStatus,
        null,
        'Network failures should not report a primary status',
      );
      assertEquals(
        readHeader(fetchSpy.calls[0]?.init, 'Authorization'),
        'Bearer phase2-bearer-token',
        'The primary attempt should use the shared bearer auth header',
      );
      assertEquals(
        readHeader(fetchSpy.calls[1]?.init, 'Authorization'),
        'Bearer phase2-bearer-token',
        'The fallback attempt should use the shared bearer auth header',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook retries once after a 5xx response', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 503,
        body: JSON.stringify({ error: 'temporary outage' }),
      },
      {
        status: 200,
        body: JSON.stringify({
          title: 'Recovered title',
          body: 'Recovered body',
        }),
      },
    ]);
    const fallbackEvents: Array<{
      reason: string;
      primaryStatus: number | null;
    }> = [];

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
        onFallback: (details) => {
          fallbackEvents.push(details);
        },
      });

      assertEquals(fetchSpy.calls.length, 2, 'The fallback should be attempted after a 5xx response');
      assert(result.usedFallback, 'Fallback should be reported as used after a 5xx response');
      assertEquals(result.fallbackReason, 'server_error', 'Unexpected fallback reason');
      assertEquals(fallbackEvents[0]?.reason, 'server_error', 'Unexpected fallback callback reason');
      assertEquals(fallbackEvents[0]?.primaryStatus, 503, 'Unexpected primary status');
      assertEquals(result.webhookResult.status, 200, 'Unexpected fallback response status');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook retries once after invalid JSON', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 200,
        body: 'not-json',
      },
      {
        status: 200,
        body: JSON.stringify({
          title: 'Fallback title',
          body: 'Fallback body',
        }),
      },
    ]);
    const fallbackEvents: Array<{
      reason: string;
      primaryStatus: number | null;
    }> = [];

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
        onFallback: (details) => {
          fallbackEvents.push(details);
        },
      });

      assertEquals(fetchSpy.calls.length, 2, 'The fallback should be attempted after invalid JSON');
      assert(result.usedFallback, 'Fallback should be reported as used after invalid JSON');
      assertEquals(result.fallbackReason, 'invalid_json', 'Unexpected fallback reason');
      assertEquals(fallbackEvents[0]?.reason, 'invalid_json', 'Unexpected fallback callback reason');
      assertEquals(fallbackEvents[0]?.primaryStatus, 200, 'Unexpected primary status');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook retries once after an empty response body', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 200,
        body: '',
      },
      {
        status: 200,
        body: JSON.stringify({
          title: 'Fallback title',
          body: 'Fallback body',
        }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
      });

      assertEquals(fetchSpy.calls.length, 2, 'The fallback should be attempted after an empty body');
      assert(result.usedFallback, 'Fallback should be reported as used after an empty body');
      assertEquals(result.fallbackReason, 'invalid_json', 'Unexpected fallback reason');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook does not retry on 4xx responses', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 400,
        body: JSON.stringify({ error: 'bad request' }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
      });

      assertEquals(fetchSpy.calls.length, 1, '4xx responses should not trigger the fallback');
      assert(!result.usedFallback, 'Fallback should not be reported as used for 4xx responses');
      assertEquals(result.webhookResult.status, 400, 'Unexpected primary response status');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook does not retry parsed objects missing the required coach fields', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 200,
        body: JSON.stringify({ body: 'Missing title' }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
      });

      assertEquals(
        fetchSpy.calls.length,
        1,
        'Parsed objects should be left to downstream coach validation instead of triggering fallback',
      );
      assert(!result.usedFallback, 'Fallback should not be reported as used');
      assertEquals(
        result.webhookResult.payload?.body,
        'Missing title',
        'Unexpected response payload',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook does not retry when no fallback endpoint is configured', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 503,
        body: JSON.stringify({ error: 'temporary outage' }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
        payload: { hello: 'world' },
      });

      assertEquals(fetchSpy.calls.length, 1, 'The primary should not be retried without a fallback endpoint');
      assert(!result.usedFallback, 'Fallback should not be reported as used');
      assertEquals(result.webhookResult.status, 503, 'Unexpected primary response status');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook stops after one fallback attempt when both attempts fail', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      {
        status: 503,
        body: JSON.stringify({ error: 'primary down' }),
      },
      {
        status: 502,
        body: JSON.stringify({ error: 'fallback down' }),
      },
    ]);

    try {
      const result = await postCoachGenerateWebhook({
        endpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: 'https://fallback.example/webhook',
        },
        payload: { hello: 'world' },
      });

      assertEquals(fetchSpy.calls.length, 2, 'Only the primary and fallback attempts should run');
      assert(result.usedFallback, 'Fallback should be reported as used');
      assertEquals(result.webhookResult.status, 502, 'Unexpected final response status');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postCoachGenerateWebhook stops after one fallback attempt when both attempts are unreachable', async () => {
  await withCoachProviderEnv({}, async () => {
    const fetchSpy = installFetchSequenceSpy([
      new TypeError('primary down'),
      new TypeError('fallback down'),
    ]);

    try {
      await assertRejectsPhase2HttpError(
        async () => {
          try {
            await postCoachGenerateWebhook({
              endpoints: {
                primaryUrl: 'https://primary.example/webhook',
                fallbackUrl: 'https://fallback.example/webhook',
              },
              payload: { hello: 'world' },
            });
          } catch (error) {
            if (error instanceof Phase2HttpError) {
              throw error;
            }

            throw new Phase2HttpError(
              502,
              'coach_webhook_failed',
              'Coach generation provider could not be reached',
            );
          }
        },
        'coach_webhook_failed',
        'could not be reached',
      );
      assertEquals(fetchSpy.calls.length, 2, 'Only the primary and fallback attempts should run');
    } finally {
      fetchSpy.restore();
    }
  });
});
