import { getPhase2WebhookAuthConfig } from './phase2Env.ts';
import { Phase2HttpError } from './phase2Errors.ts';
import {
  buildPhase2WebhookHeaders,
  createPhase2WebhookSignature,
  PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER,
  PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER,
  PHASE2_WEBHOOK_SIGNATURE_HEADER,
  PHASE2_WEBHOOK_TIMESTAMP_HEADER,
  postWebhookJson,
  verifyPhase2WebhookResponseSignature,
} from './phase2Webhook.ts';

const PHASE2_WEBHOOK_ENV_NAMES = [
  'PHASE2_WEBHOOK_AUTH_MODE',
  'PHASE2_WEBHOOK_BEARER_TOKEN',
  'PHASE2_WEBHOOK_SECRET_HEADER_NAME',
  'PHASE2_WEBHOOK_SECRET_HEADER_VALUE',
  'PHASE2_WEBHOOK_HMAC_SECRET',
  // S-01 / S-02 — env vars utilisees par les helpers d'allowlist et DNS check
  'WEBHOOK_ALLOWED_HOSTS',
  'WEBHOOK_ALLOW_PRIVATE_IPS',
  'WEBHOOK_ALLOW_HTTP',
  'WEBHOOK_VERIFY_RESPONSE',
  'N8N_RESPONSE_HMAC_SECRET',
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

// S-02 — Pour ne pas casser les tests existants qui utilisent example.com en
// dur, on configure par defaut une allowlist permissive et le bypass DNS prive.
// Les tests qui veulent un comportement plus strict surchargent ces defauts
// dans `overrides`.
const PHASE2_WEBHOOK_TEST_DEFAULTS: Partial<
  Record<(typeof PHASE2_WEBHOOK_ENV_NAMES)[number], string>
> = {
  WEBHOOK_ALLOWED_HOSTS: 'example.com,*.example.com',
  WEBHOOK_ALLOW_PRIVATE_IPS: 'true',
};

async function withWebhookEnv(
  overrides: Partial<Record<(typeof PHASE2_WEBHOOK_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();

  for (const envName of PHASE2_WEBHOOK_ENV_NAMES) {
    originalValues.set(envName, Deno.env.get(envName));
    if (Object.prototype.hasOwnProperty.call(overrides, envName)) {
      Deno.env.set(envName, overrides[envName] ?? '');
    } else if (Object.prototype.hasOwnProperty.call(PHASE2_WEBHOOK_TEST_DEFAULTS, envName)) {
      Deno.env.set(envName, PHASE2_WEBHOOK_TEST_DEFAULTS[envName] ?? '');
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
  extraHeaders: Record<string, string> = {},
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
        ...extraHeaders,
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

// S-01 — Construit une reponse webhook signee comme le ferait n8n.
async function buildSignedResponseHeaders(
  rawBody: string,
  secret: string,
  options: { timestamp?: string } = {},
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const signature = await createPhase2WebhookSignature(timestamp, rawBody, secret);
  return {
    [PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER]: timestamp,
    [PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER]: signature,
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

// =============================================================================
// S-01 — Verification HMAC de la reponse webhook
// =============================================================================

Deno.test('S-01: postWebhookJson rejects unsigned webhook response in HMAC mode', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    // Response sans header de signature → doit etre rejetee.
    const fetchSpy = installFetchSpy('{"workflow_status":"dismissed"}', 200);
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'webhook_response_unsigned',
        'Webhook response is missing signature headers',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: postWebhookJson rejects stale signature timestamp', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    const rawBody = '{"workflow_status":"reviewing"}';
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const headers = await buildSignedResponseHeaders(rawBody, 'test-hmac-secret', {
      timestamp: staleTimestamp,
    });
    const fetchSpy = installFetchSpy(rawBody, 200, headers);
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'webhook_response_stale',
        'outside the allowed window',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: postWebhookJson rejects signature mismatch (tampered body)', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    // Signe un body, sert un autre body : la signature ne correspond plus.
    const honestBody = '{"workflow_status":"reviewing"}';
    const tamperedBody = '{"workflow_status":"dismissed"}';
    const headers = await buildSignedResponseHeaders(honestBody, 'test-hmac-secret');
    const fetchSpy = installFetchSpy(tamperedBody, 200, headers);
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'webhook_response_invalid_signature',
        'signature mismatch',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: postWebhookJson accepts a valid signed response', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    const rawBody = '{"workflow_status":"reviewing","moderation_provider":"n8n"}';
    const headers = await buildSignedResponseHeaders(rawBody, 'test-hmac-secret');
    const fetchSpy = installFetchSpy(rawBody, 200, headers);
    try {
      const result = await postWebhookJson('https://example.com/webhook', { ok: true });
      assertEquals(result.payload?.workflow_status, 'reviewing', 'Workflow status should be exposed');
      assertEquals(fetchSpy.calls.length, 1, 'Fetch should have been called once');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: postWebhookJson uses dedicated N8N_RESPONSE_HMAC_SECRET when set', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'outbound-secret',
    N8N_RESPONSE_HMAC_SECRET: 'inbound-secret',
  }, async () => {
    // Signe avec le secret inbound dedie. Le secret outbound est different.
    const rawBody = '{"ok":true}';
    const headers = await buildSignedResponseHeaders(rawBody, 'inbound-secret');
    const fetchSpy = installFetchSpy(rawBody, 200, headers);
    try {
      const result = await postWebhookJson('https://example.com/webhook', { ok: true });
      assertEquals(result.status, 200, 'Should succeed with inbound secret signature');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: postWebhookJson skips response signature when verifyResponseSignature=false', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    // Migration en cours : on opt-out explicitement pour un caller specifique.
    const fetchSpy = installFetchSpy('{"workflow_status":"dismissed"}', 200);
    try {
      const result = await postWebhookJson(
        'https://example.com/webhook',
        { ok: true },
        10000,
        { verifyResponseSignature: false },
      );
      assertEquals(result.payload?.workflow_status, 'dismissed',
        'Unsigned response should be accepted when verifyResponseSignature=false');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: WEBHOOK_VERIFY_RESPONSE=false acts as global kill-switch', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'hmac',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
    WEBHOOK_VERIFY_RESPONSE: 'false',
  }, async () => {
    // Meme avec HMAC active, le kill-switch global desactive la verif.
    // Permet un rollback urgent si n8n n'est pas encore configure.
    const fetchSpy = installFetchSpy('{"workflow_status":"dismissed"}', 200);
    try {
      const result = await postWebhookJson('https://example.com/webhook', { ok: true });
      assertEquals(result.payload?.workflow_status, 'dismissed',
        'Unsigned response should be accepted when kill-switch is on');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: WEBHOOK_VERIFY_RESPONSE=true forces check even without outbound HMAC', async () => {
  await withWebhookEnv({
    PHASE2_WEBHOOK_AUTH_MODE: 'bearer',
    PHASE2_WEBHOOK_BEARER_TOKEN: 'phase2-bearer',
    WEBHOOK_VERIFY_RESPONSE: 'true',
    PHASE2_WEBHOOK_HMAC_SECRET: 'test-hmac-secret',
  }, async () => {
    // Bearer mode (pas de HMAC outbound) mais on force la verif inbound.
    const fetchSpy = installFetchSpy('{"ok":true}', 200);
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://example.com/webhook', { ok: true }),
        'webhook_response_unsigned',
        'missing signature headers',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-01: verifyPhase2WebhookResponseSignature reports missing timestamp', async () => {
  const response = new Response('{}', {
    status: 200,
    headers: { [PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER]: 'sha256=abc' },
  });
  try {
    await verifyPhase2WebhookResponseSignature(response, '{}', 'secret');
    throw new Error('Expected an error');
  } catch (error) {
    assert(error instanceof Phase2HttpError, 'Expected Phase2HttpError');
    assertEquals(error.code, 'webhook_response_unsigned', 'Should flag unsigned response');
    assertEquals(
      (error.details as Record<string, unknown>)?.timestamp_header_present,
      false,
      'Should report timestamp_header_present=false',
    );
  }
});

// =============================================================================
// S-02 — Validation DNS / blocage des IPs privees
// =============================================================================

Deno.test('S-02: postWebhookJson rejects URL not in allowlist', async () => {
  await withWebhookEnv({
    WEBHOOK_ALLOWED_HOSTS: 'allowed.example.com',
    WEBHOOK_ALLOW_PRIVATE_IPS: 'true',
  }, async () => {
    const fetchSpy = installFetchSpy();
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://attacker.evil.com/webhook', { ok: true }),
        'webhook_url_host_not_allowed',
        'rejected by host validation',
      );
      assertEquals(fetchSpy.calls.length, 0, 'Fetch should never be called for rejected host');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-02: postWebhookJson rejects URL with forbidden protocol', async () => {
  await withWebhookEnv({
    WEBHOOK_ALLOWED_HOSTS: 'example.com',
    WEBHOOK_ALLOW_PRIVATE_IPS: 'true',
  }, async () => {
    const fetchSpy = installFetchSpy();
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('http://example.com/webhook', { ok: true }),
        'webhook_url_forbidden_protocol',
        'forbidden_protocol',
      );
      assertEquals(fetchSpy.calls.length, 0, 'Fetch should never be called');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-02: postWebhookJson rejects IPv4-literal URL pointing to loopback', async () => {
  await withWebhookEnv({
    WEBHOOK_ALLOWED_HOSTS: '127.0.0.1',
    WEBHOOK_ALLOW_PRIVATE_IPS: '', // explicit OFF
  }, async () => {
    const fetchSpy = installFetchSpy();
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://127.0.0.1/webhook', { ok: true }),
        'webhook_host_resolves_private',
        'host validation',
      );
      assertEquals(fetchSpy.calls.length, 0, 'Fetch should never be called');
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-02: postWebhookJson rejects AWS metadata literal (169.254.169.254)', async () => {
  await withWebhookEnv({
    WEBHOOK_ALLOWED_HOSTS: '169.254.169.254',
    WEBHOOK_ALLOW_PRIVATE_IPS: '',
  }, async () => {
    const fetchSpy = installFetchSpy();
    try {
      await assertRejectsPhase2HttpError(
        () => postWebhookJson('https://169.254.169.254/latest/meta-data', { ok: true }),
        'webhook_host_resolves_private',
        'host validation',
      );
    } finally {
      fetchSpy.restore();
    }
  });
});

Deno.test('S-02: WEBHOOK_ALLOW_PRIVATE_IPS=true bypasses the DNS resolution check', async () => {
  await withWebhookEnv({
    WEBHOOK_ALLOWED_HOSTS: '127.0.0.1',
    WEBHOOK_ALLOW_PRIVATE_IPS: 'true',
  }, async () => {
    const fetchSpy = installFetchSpy();
    try {
      const result = await postWebhookJson('https://127.0.0.1/webhook', { ok: true });
      assertEquals(result.status, 200, 'Should reach fetch when private IPs are allowed');
      assertEquals(fetchSpy.calls.length, 1, 'Fetch should be called once');
    } finally {
      fetchSpy.restore();
    }
  });
});
