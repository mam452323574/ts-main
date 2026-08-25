import { readFile } from 'node:fs/promises';

const appConfigUrl = new URL('../app.json', import.meta.url);
const appConfig = JSON.parse(await readFile(appConfigUrl, 'utf8'));
const supabaseAnonKey =
  appConfig?.expo?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (typeof supabaseAnonKey !== 'string' || supabaseAnonKey.length === 0) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY in app.json');
}

const requestTimeoutMs = 12_000;
const corsOrigin = 'https://selflens.org';

async function request(label, url, options, expectedStatuses) {
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      'user-agent': 'SelfLens-production-smoke/1.0',
      ...options?.headers,
    },
  });

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${label}: expected HTTP ${expectedStatuses.join(' or ')}, received ${response.status}`,
    );
  }

  return response;
}

function assertCors(label, response) {
  const allowedOrigin = response.headers.get('access-control-allow-origin');

  if (allowedOrigin !== '*' && allowedOrigin !== corsOrigin) {
    throw new Error(`${label}: missing expected CORS allow-origin header`);
  }
}

const checks = [
  {
    label: 'Privacy policy',
    run: async () => {
      const response = await request(
        'Privacy policy',
        'https://privacy.selflens.org/privacy-policy/',
        {},
        [200],
      );
      const body = await response.text();

      if (!/selflens/i.test(body)) {
        throw new Error('Privacy policy: response does not identify SelfLens');
      }

      return response.status;
    },
  },
  {
    label: 'Supabase Auth health',
    run: async () => {
      const response = await request(
        'Supabase Auth health',
        'https://supabase.basedjew.com/auth/v1/health',
        {
          headers: {
            apikey: supabaseAnonKey,
            authorization: `Bearer ${supabaseAnonKey}`,
          },
        },
        [200],
      );
      return response.status;
    },
  },
  ...['analyze-scan', 'fridge-scan-submit'].map((functionName) => ({
    label: `${functionName} preflight`,
    run: async () => {
      const response = await request(
        `${functionName} preflight`,
        `https://supabase.basedjew.com/functions/v1/${functionName}`,
        {
          method: 'OPTIONS',
          headers: {
            origin: corsOrigin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'authorization,apikey,content-type',
          },
        },
        [200, 204],
      );
      assertCors(`${functionName} preflight`, response);
      return response.status;
    },
  })),
  {
    label: 'Protected scan rejects missing JWT',
    run: async () => {
      const response = await request(
        'Protected scan rejects missing JWT',
        'https://supabase.basedjew.com/functions/v1/analyze-scan',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
        [401],
      );
      return response.status;
    },
  },
  {
    label: 'n8n health',
    run: async () => {
      const response = await request(
        'n8n health',
        'https://n8n.basedjew.com/healthz',
        {},
        [200],
      );
      return response.status;
    },
  },
];

try {
  for (const check of checks) {
    const status = await check.run();
    console.log(`[PASS] ${check.label} (HTTP ${status})`);
  }

  console.log(`Production smoke passed (${checks.length}/${checks.length}).`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
