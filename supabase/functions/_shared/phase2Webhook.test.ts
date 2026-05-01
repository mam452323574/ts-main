import { getPhase2WebhookAuthConfig } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import {
  buildPhase2WebhookHeaders,
  createPhase2WebhookSignature,
  PHASE2_WEBHOOK_SIGNATURE_HEADER,
  PHASE2_WEBHOOK_TIMESTAMP_HEADER,
  postWebhookJson,
} from './phase2Webhook.ts';

const PHASE2_WEBHOOK_ENV_NAMES = [
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
  action: () => Promise<unknown>,
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
    return;
  }

  throw new Error('Expected the action to throw');
}

async function withWebhookEnv(
  overrides: Partial<Record<(typeof PHASE2_WEBHOOK_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();

  for (const envName of PHASE2_WEBHOOK_ENV_NAMES) {
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
    for (const envName of PHASE2_WEBHOOK_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

function installFetchSpy(
  responseBody = '{"success":true}',
  status = 200,
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: string | URL | Request;
    init: RequestInit | undefined;
  }> = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(responseBody, {
      status,
      headers: {
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

Deno.test('getPhase2WebhookAuthConfig normalizes auth mode case-insensitively', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'Bearer + HMAC',
    PHASE2_WEBHOOK_BEARER_TOKEN: 'phase2-bearer-token',
    PHASE2_WEBHOOK_HMAC_SECRET: 'phase2-hmac-secret',
  }, () => {
    const config = getPhase2WebhookAuthConfig();

    assertEquals(config.mode, 'bearer+hmac', 'Auth mode should be normalized');
    assert(config.useBearer, 'Bearer auth should be enabled');
    assert(!config.useHeader, 'Header auth should be disabled');
    assert(config.useHmac, 'HMAC auth should be enabled');
    assertEquals(
      config.bearerToken,
      'phase2-bearer-token',
      'Bearer token should be loaded from env',
    );
    assertEquals(
      config.hmacSecret,
      'phase2-hmac-secret',
      'HMAC secret should be loaded from env',
    );
  });
});

Deno.test('postWebhookJson preserves default JSON headers when auth mode is none', async () => {
  await withWebhookEnv({}, async () => {
    const fetchSpy = installFetchSpy();

    try {
      const payload = { hello: 'world' };
      await postWebhookJson('https://example.com/webhook', payload);

      assertEquals(fetchSpy.calls.length, 1, 'Fetch should be called exactly once');
      const init = fetchSpy.calls[0]?.init;
      assertEquals(
        readHeader(init, 'Content-Type'),
        'application/json; charset=utf-8',
        'Content-Type header should remain unchanged',
      );
      assertEquals(
        readHeader(init, 'Accept'),
        'application/json; charset=utf-8',
        'Accept header should remain unchanged',
      );
      assertEquals(
        readHeader(init, 'Authorization'),
        null,
        'Authorization header should be omitted in none mode',
      );
      assertEquals(
        init?.body as string,
        JSON.stringify(payload),
        'Raw JSON body should be sent unchanged',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postWebhookJson adds only the bearer authorization header in bearer mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'bearer',
    PHASE2_WEBHOOK_BEARER_TOKEN: 'phase2-bearer-token',
  }, async () => {
    const fetchSpy = installFetchSpy();

    try {
      await postWebhookJson('https://example.com/webhook', { ok: true });

      const init = fetchSpy.calls[0]?.init;
      assertEquals(
        readHeader(init, 'Authorization'),
        'Bearer phase2-bearer-token',
        'Authorization header should include the bearer token',
      );
      assertEquals(
        readHeader(init, PHASE2_WEBHOOK_TIMESTAMP_HEADER),
        null,
        'Timestamp header should be omitted when HMAC is disabled',
      );
      assertEquals(
        readHeader(init, PHASE2_WEBHOOK_SIGNATURE_HEADER),
        null,
        'Signature header should be omitted when HMAC is disabled',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postWebhookJson adds the configured static secret header in header mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'header',
    PHASE2_WEBHOOK_SECRET_HEADER_NAME: 'x-webhook-secret',
    PHASE2_WEBHOOK_SECRET_HEADER_VALUE: 'phase2-shared-secret',
  }, async () => {
    const fetchSpy = installFetchSpy();

    try {
      await postWebhookJson('https://example.com/webhook', { ok: true });

      const init = fetchSpy.calls[0]?.init;
      assertEquals(
        readHeader(init, 'x-webhook-secret'),
        'phase2-shared-secret',
        'Custom secret header should be sent in header mode',
      );
      assertEquals(
        readHeader(init, 'Authorization'),
        null,
        'Authorization header should be omitted in header mode',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('buildPhase2WebhookHeaders adds deterministic HMAC headers', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    const timestamp = '2026-04-09T12:34:56.000Z';
    const rawBody = JSON.stringify({ hello: 'world', value: 42 });
    const headers = await buildPhase2WebhookHeaders(rawBody, { timestamp });

    assertEquals(
      headers.get(PHASE2_WEBHOOK_TIMESTAMP_HEADER),
      timestamp,
      'Timestamp header should match the provided test timestamp',
    );
    assertEquals(
      headers.get(PHASE2_WEBHOOK_SIGNATURE_HEADER),
      'sha256=c1867c1516555f06bb9fb1653e44ce120367a8a665faa04db5981258a799c748',
      'Signature header should match the expected HMAC test vector',
    );
  });
});

Deno.test('createPhase2WebhookSignature changes when the body changes', async () => {
  const timestamp = '2026-04-09T12:34:56.000Z';
  const secret = 'test-hmac-secret';
  const originalSignature = await createPhase2WebhookSignature(
    timestamp,
    JSON.stringify({ hello: 'world', value: 42 }),
    secret,
  );
  const updatedSignature = await createPhase2WebhookSignature(
    timestamp,
    JSON.stringify({ hello: 'world', value: 43 }),
    secret,
  );

  assert(
    originalSignature !== updatedSignature,
    'HMAC signature should change when the raw request body changes',
  );
});

Deno.test('buildPhase2WebhookHeaders supports bearer plus hmac mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'bearer+hmac',
    PHASE2_WEBHOOK_BEARER_TOKEN: 'phase2-bearer-token',
    PHASE2_WEBHOOK_HMAC_SECRET: 'phase2-hmac-secret',
  }, async () => {
    const headers = await buildPhase2WebhookHeaders('{"ok":true}', {
      timestamp: '2026-04-09T12:34:56.000Z',
    });

    assertEquals(
      headers.get('Authorization'),
      'Bearer phase2-bearer-token',
      'Bearer header should be present in bearer+hmac mode',
    );
    assert(
      typeof headers.get(PHASE2_WEBHOOK_SIGNATURE_HEADER) === 'string',
      'Signature header should be present in bearer+hmac mode',
    );
  });
});

Deno.test('buildPhase2WebhookHeaders supports header plus hmac mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'header+hmac',
    PHASE2_WEBHOOK_SECRET_HEADER_NAME: 'x-webhook-secret',
    PHASE2_WEBHOOK_SECRET_HEADER_VALUE: 'phase2-shared-secret',
    PHASE2_WEBHOOK_HMAC_SECRET: 'phase2-hmac-secret',
  }, async () => {
    const headers = await buildPhase2WebhookHeaders('{"ok":true}', {
      timestamp: '2026-04-09T12:34:56.000Z',
    });

    assertEquals(
      headers.get('x-webhook-secret'),
      'phase2-shared-secret',
      'Custom secret header should be present in header+hmac mode',
    );
    assert(
      typeof headers.get(PHASE2_WEBHOOK_SIGNATURE_HEADER) === 'string',
      'Signature header should be present in header+hmac mode',
    );
  });
});

Deno.test('postWebhookJson fails before fetch for an invalid auth mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'invalid-mode',
  }, async () => {
    const fetchSpy = installFetchSpy();

    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'invalid_webhook_auth_configuration',
        'PHASE2_WEBHOOK_AUTH_MODE',
      );
      assertEquals(fetchSpy.calls.length, 0, 'Fetch should not be called');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postWebhookJson fails before fetch when bearer mode is missing its token', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'bearer',
  }, async () => {
    const fetchSpy = installFetchSpy();

    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'invalid_webhook_auth_configuration',
        'PHASE2_WEBHOOK_BEARER_TOKEN',
      );
      assertEquals(fetchSpy.calls.length, 0, 'Fetch should not be called');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('getPhase2WebhookAuthConfig rejects invalid custom header names', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'header',
    PHASE2_WEBHOOK_SECRET_HEADER_NAME: 'invalid header name',
    PHASE2_WEBHOOK_SECRET_HEADER_VALUE: 'phase2-shared-secret',
  }, async () => {
    await assertRejectsPhase2HttpError(
      async () => {
        getPhase2WebhookAuthConfig();
      },
      'invalid_webhook_auth_configuration',
      'PHASE2_WEBHOOK_SECRET_HEADER_NAME',
    );
  });
});

Deno.test('postWebhookJson keeps the raw JSON body text alongside the parsed payload', async () => {
  await withWebhookEnv({}, async () => {
    const fetchSpy = installFetchSpy('{"analysis":"Detailed webhook text"}', 200);

    try {
      const result = await postWebhookJson(
        'https://example.com/webhook',
        { ok: true },
      );

      assertEquals(
        result.payload?.analysis,
        'Detailed webhook text',
        'Parsed payload should expose the JSON response body',
      );
      assertEquals(
        result.rawText,
        '{"analysis":"Detailed webhook text"}',
        'Raw response text should be preserved for downstream fallback parsing',
      );
      assert(result.bodyPresent, 'A non-empty JSON body should be reported as present');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('postWebhookJson keeps non-JSON response text for fallback SuperScan parsing', async () => {
  await withWebhookEnv({}, async () => {
    const fetchSpy = installFetchSpy('Detailed fallback text from the provider', 200);

    try {
      const result = await postWebhookJson(
        'https://example.com/webhook',
        { ok: true },
      );

      assertEquals(result.payload, null, 'Plain-text responses should not parse as JSON objects');
      assertEquals(
        result.rawText,
        'Detailed fallback text from the provider',
        'Plain-text responses should still preserve the raw body text',
      );
      assert(result.bodyPresent, 'A non-empty plain-text body should be reported as present');
    } finally {
      fetchSpy.restore();
    }
  });
});
