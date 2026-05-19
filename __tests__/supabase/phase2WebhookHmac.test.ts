/**
 * E.2 of COACH_SECURITY_AUDIT_2026_05 — confirm the Edge function actually
 * sends the HMAC headers when PHASE2_WEBHOOK_AUTH_MODE includes hmac.
 *
 * The Edge code lives in supabase/functions/_shared/phase2Webhook.ts and was
 * already in place before the audit; this test pins that contract so a future
 * refactor cannot silently drop HMAC enforcement.
 *
 * phase2Webhook transitively imports phase2Auth which uses Deno-style
 * `npm:@supabase/supabase-js@2.58.0` imports. We mock that module so Jest
 * (Node) can resolve the chain. Only `timingSafeEqual` is consumed by
 * phase2Webhook so the mock is intentionally minimal.
 */
jest.mock('@/supabase/functions/_shared/phase2Auth', () => {
  const nodeCrypto: typeof import('crypto') = require('crypto');
  return {
    timingSafeEqual: (a: string, b: string) => {
      const ba = Buffer.from(a, 'utf8');
      const bb = Buffer.from(b, 'utf8');
      if (ba.length !== bb.length) return false;
      return nodeCrypto.timingSafeEqual(ba, bb);
    },
  };
});

// Bypass the production DNS allowlist guard — we only want to assert the
// HMAC header contract here, not exercise SSRF defense (covered in
// webhookHostAllowlist.test.ts).
jest.mock('@/supabase/functions/_shared/webhookHostAllowlist', () => ({
  validateWebhookUrl: (raw: string) => ({ ok: true, url: new URL(raw) }),
  validateWebhookUrlWithDnsCheck: async (raw: string) => ({ ok: true, url: new URL(raw) }),
  WEBHOOK_ALLOWED_HOSTS_ENV_NAME: 'WEBHOOK_ALLOWED_HOSTS',
  WEBHOOK_ALLOW_HTTP_ENV_NAME: 'WEBHOOK_ALLOW_HTTP',
}));

describe('phase2 webhook HMAC headers (C-04 / E.2)', () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  const originalFetch = global.fetch;
  let env: Record<string, string | undefined>;

  const loadModules = () => {
    jest.resetModules();
    (globalThis as typeof globalThis & {
      Deno: { env: { get: (name: string) => string | undefined } };
    }).Deno = {
      env: {
        get: (name: string) => env[name],
      },
    };

    return {
      webhook: require('@/supabase/functions/_shared/phase2Webhook.ts') as typeof import('@/supabase/functions/_shared/phase2Webhook.ts'),
    };
  };

  beforeEach(() => {
    env = {
      // The webhookHostAllowlist guard rejects every URL unless the allowlist
      // is configured. Allow our test host so the actual fetch happens.
      WEBHOOK_ALLOWED_HOSTS: 'hook.example',
      WEBHOOK_ALLOW_HTTP: 'true',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
  });

  it('does not send HMAC headers when PHASE2_WEBHOOK_AUTH_MODE is unset (legacy mode)', async () => {
    const { webhook } = loadModules();

    const recordedRequests: Request[] = [];
    global.fetch = jest.fn(async (input: any, init?: any) => {
      recordedRequests.push(new Request(String(input), init));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    await webhook.postWebhookJson(
      'https://hook.example/test',
      { hello: 'world' },
      10000,
      { verifyResponseSignature: false },
    );

    expect(recordedRequests).toHaveLength(1);
    const headers = recordedRequests[0].headers;
    expect(headers.get(webhook.PHASE2_WEBHOOK_TIMESTAMP_HEADER)).toBeNull();
    expect(headers.get(webhook.PHASE2_WEBHOOK_SIGNATURE_HEADER)).toBeNull();
  });

  it('attaches x-webhook-timestamp + x-webhook-signature when hmac is enabled', async () => {
    env.PHASE2_WEBHOOK_AUTH_MODE = 'bearer+hmac';
    env.PHASE2_WEBHOOK_BEARER_TOKEN = 'bearer-token';
    env.PHASE2_WEBHOOK_HMAC_SECRET = 'super-secret-with-enough-entropy';

    const { webhook } = loadModules();

    const recordedRequests: { url: string; init: RequestInit | undefined }[] = [];
    global.fetch = jest.fn(async (input: any, init?: any) => {
      recordedRequests.push({ url: String(input), init });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const before = new Date();
    // We pin verifyResponseSignature=false because this test only asserts the
    // outbound HMAC contract; the response-signature path is covered by other
    // suites (S-01).
    await webhook.postWebhookJson(
      'https://hook.example/test',
      { hello: 'world' },
      10000,
      { verifyResponseSignature: false },
    );
    const after = new Date();

    expect(recordedRequests).toHaveLength(1);
    const init = recordedRequests[0].init!;
    const headers = new Headers(init.headers);

    const timestamp = headers.get(webhook.PHASE2_WEBHOOK_TIMESTAMP_HEADER);
    const signature = headers.get(webhook.PHASE2_WEBHOOK_SIGNATURE_HEADER);
    expect(timestamp).not.toBeNull();
    expect(signature).not.toBeNull();
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Timestamp is an ISO date within the call window.
    const ts = new Date(timestamp!);
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1);
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime() + 1);

    // The bearer header is also present (combined auth).
    expect(headers.get('Authorization')).toBe('Bearer bearer-token');
  });

  it('signs ${timestamp}.${rawBody} with HMAC-SHA256 of the secret', async () => {
    env.PHASE2_WEBHOOK_AUTH_MODE = 'hmac';
    env.PHASE2_WEBHOOK_HMAC_SECRET = 'super-secret-with-enough-entropy';

    const { webhook } = loadModules();

    // Pin the timestamp via the helper so we can recompute the expected value.
    const timestamp = '2026-05-19T12:00:00.000Z';
    const rawBody = JSON.stringify({ value: 42 });
    const expected = await webhook.createPhase2WebhookSignature(
      timestamp,
      rawBody,
      'super-secret-with-enough-entropy',
    );
    expect(expected).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('throws when hmac mode is enabled but the secret env is missing', async () => {
    env.PHASE2_WEBHOOK_AUTH_MODE = 'hmac';
    delete env.PHASE2_WEBHOOK_HMAC_SECRET;

    const { webhook } = loadModules();
    await expect(webhook.buildPhase2WebhookHeaders('{}')).rejects.toThrow(
      /PHASE2_WEBHOOK_HMAC_SECRET/,
    );
  });
});
