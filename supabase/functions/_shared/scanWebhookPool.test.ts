import { Phase2HttpError } from './phase2Errors.ts';
import {
  type ResolvedScanWebhookPool,
  N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL_ENV_NAME,
  N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS_ENV_NAME,
  N8N_SCAN_ANALYZE_WEBHOOK_URL_ENV_NAME,
  N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
  resolveScanWebhookPool,
  selectScanWebhookEndpoint,
} from './scanWebhookPool.ts';
import { sha256Hex } from './phase2Utils.ts';

const SCAN_WEBHOOK_ENV_NAMES = [
  N8N_SCAN_ANALYZE_WEBHOOK_URL_ENV_NAME,
  N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
  N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL_ENV_NAME,
  N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS_ENV_NAME,
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

function assertArrayEquals<T>(
  actual: T[],
  expected: T[],
  message: string,
) {
  assertEquals(
    JSON.stringify(actual),
    JSON.stringify(expected),
    message,
  );
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
    return;
  }

  throw new Error('Expected the action to throw');
}

async function withScanWebhookEnv(
  overrides: Partial<Record<(typeof SCAN_WEBHOOK_ENV_NAMES)[number], string>>,
  action: () => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();

  for (const envName of SCAN_WEBHOOK_ENV_NAMES) {
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
    for (const envName of SCAN_WEBHOOK_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

function assertResolvedPool(
  actual: ResolvedScanWebhookPool,
  expected: ResolvedScanWebhookPool,
) {
  assertEquals(actual.envName, expected.envName, 'Unexpected pool env name');
  assertArrayEquals(actual.urls, expected.urls, 'Unexpected pool urls');
}

Deno.test('resolveScanWebhookPool prefers plural default env over singular env', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://pool-a.example/webhook, https://pool-b.example/webhook',
    N8N_SCAN_ANALYZE_WEBHOOK_URL: 'https://single.example/webhook',
  }, () => {
    const pool = resolveScanWebhookPool('health');

    assertResolvedPool(pool, {
      envName: N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
      urls: [
        'https://pool-a.example/webhook',
        'https://pool-b.example/webhook',
      ],
    });
  });
});

Deno.test('resolveScanWebhookPool prefers plural super env over singular super env', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://default-a.example/webhook,https://default-b.example/webhook',
    N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS: 'https://super-a.example/webhook, https://super-b.example/webhook',
    N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL: 'https://single-super.example/webhook',
  }, () => {
    const pool = resolveScanWebhookPool('super');

    assertResolvedPool(pool, {
      envName: N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URLS_ENV_NAME,
      urls: [
        'https://super-a.example/webhook',
        'https://super-b.example/webhook',
      ],
    });
  });
});

Deno.test('resolveScanWebhookPool falls back to the default pool for super scans', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://default-a.example/webhook, https://default-b.example/webhook',
  }, () => {
    const pool = resolveScanWebhookPool('super');

    assertResolvedPool(pool, {
      envName: N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
      urls: [
        'https://default-a.example/webhook',
        'https://default-b.example/webhook',
      ],
    });
  });
});

Deno.test('selectScanWebhookEndpoint is deterministic for the same user and scan', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://pool-a.example/webhook, https://pool-b.example/webhook, https://pool-c.example/webhook',
  }, async () => {
    const first = await selectScanWebhookEndpoint({
      scanId: 'scan-123',
      scanType: 'health',
      userId: 'user-456',
    });
    const second = await selectScanWebhookEndpoint({
      scanId: 'scan-123',
      scanType: 'health',
      userId: 'user-456',
    });
    const expectedIndex =
      Number.parseInt((await sha256Hex('user-456:scan-123')).slice(0, 8), 16) % 3;

    assertEquals(first.selectionKey, 'user-456:scan-123', 'Unexpected selection key');
    assertEquals(first.selectedIndex, expectedIndex, 'Unexpected selected index');
    assertEquals(first.selectedIndex, second.selectedIndex, 'Selection should be stable');
    assertEquals(first.url, second.url, 'Selected url should be stable');
    assertEquals(first.url, first.urls[first.selectedIndex], 'Selected url should come from the pool');
  });
});

Deno.test('selectScanWebhookEndpoint applies modulo selection for the current pool size', async () => {
  const selectionKey = 'user-mod:scan-mod';

  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://pool-a.example/webhook, https://pool-b.example/webhook',
  }, async () => {
    const endpoint = await selectScanWebhookEndpoint({
      scanId: 'scan-mod',
      scanType: 'nutrition',
      userId: 'user-mod',
    });
    const expectedIndex =
      Number.parseInt((await sha256Hex(selectionKey)).slice(0, 8), 16) % 2;

    assertEquals(endpoint.selectedIndex, expectedIndex, 'Unexpected index for a 2-url pool');
  });

  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://pool-a.example/webhook, https://pool-b.example/webhook, https://pool-c.example/webhook, https://pool-d.example/webhook',
  }, async () => {
    const endpoint = await selectScanWebhookEndpoint({
      scanId: 'scan-mod',
      scanType: 'nutrition',
      userId: 'user-mod',
    });
    const expectedIndex =
      Number.parseInt((await sha256Hex(selectionKey)).slice(0, 8), 16) % 4;

    assertEquals(endpoint.selectedIndex, expectedIndex, 'Unexpected index for a 4-url pool');
  });
});

Deno.test('resolveScanWebhookPool trims comma-separated env values and ignores empty segments', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: ' https://pool-a.example/webhook , , https://pool-b.example/webhook  ,',
  }, () => {
    const pool = resolveScanWebhookPool('body');

    assertResolvedPool(pool, {
      envName: N8N_SCAN_ANALYZE_WEBHOOK_URLS_ENV_NAME,
      urls: [
        'https://pool-a.example/webhook',
        'https://pool-b.example/webhook',
      ],
    });
  });
});

Deno.test('resolveScanWebhookPool fails closed when the chosen env contains an invalid url', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: 'https://pool-a.example/webhook, not-a-valid-url',
  }, async () => {
    await assertRejectsPhase2HttpError(
      () => resolveScanWebhookPool('health'),
      'scan_webhook_not_configured',
      'Scan analysis provider is not configured',
    );
  });
});

Deno.test('resolveScanWebhookPool fails closed when the chosen env has no usable urls', async () => {
  await withScanWebhookEnv({
    N8N_SCAN_ANALYZE_WEBHOOK_URLS: ', ,',
  }, async () => {
    await assertRejectsPhase2HttpError(
      () => resolveScanWebhookPool('health'),
      'scan_webhook_not_configured',
      'Scan analysis provider is not configured',
    );
  });
});
