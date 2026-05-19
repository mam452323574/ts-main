// S-10 / S-11 — Tests pour CORS handling :
//  - Allow-Origin: null pour les requetes sans header Origin (au lieu de '*')
//  - Case-insensitive origin matching (RFC 6454)

import { getCorsHeaders, handleCorsPreflightRequest } from './cors.ts';

const CORS_ENV_NAMES = ['ALLOWED_ORIGINS', 'SUPABASE_ENV', 'APP_ENV'] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

// Note: les env vars sont lues au load du module cors.ts, donc on ne peut pas
// les surcharger dynamiquement par test classique. Pour ces tests, on construit
// les fixtures avec une env preconfiguree avant chaque suite et on reimporte
// le module via dynamic import. Limitation : Deno cache les modules ; on peut
// utiliser une "+timestamp" pour bust le cache.

async function withCorsEnv(
  overrides: Partial<Record<(typeof CORS_ENV_NAMES)[number], string>>,
  action: (mod: typeof import('./cors.ts')) => Promise<void> | void,
) {
  const originalValues = new Map<string, string | undefined>();
  for (const envName of CORS_ENV_NAMES) {
    originalValues.set(envName, Deno.env.get(envName));
    if (Object.prototype.hasOwnProperty.call(overrides, envName)) {
      Deno.env.set(envName, overrides[envName] ?? '');
    } else {
      Deno.env.set(envName, '');
    }
  }
  try {
    // Re-import avec un cache-bust pour s'assurer que le module relit l'env.
    const cacheBust = `?t=${Date.now()}_${Math.random()}`;
    const mod = await import(`./cors.ts${cacheBust}`);
    await action(mod);
  } finally {
    for (const envName of CORS_ENV_NAMES) {
      const originalValue = originalValues.get(envName);
      Deno.env.set(envName, originalValue ?? '');
    }
  }
}

// =============================================================================
// S-10 — Allow-Origin: null pour requetes sans Origin
// =============================================================================

Deno.test('S-10: getCorsHeaders returns null for missing Origin (not *)', () => {
  const req = new Request('https://api.example.com/edge', { method: 'POST' });
  const headers = getCorsHeaders(req);
  assertEquals(
    headers['Access-Control-Allow-Origin'],
    'null',
    'Missing Origin should return literal "null" not "*"',
  );
  assert(
    !('Access-Control-Allow-Credentials' in headers),
    'Allow-Credentials should NOT be set when Origin is missing',
  );
});

Deno.test('S-10: handleCorsPreflightRequest returns null for missing Origin', async () => {
  const req = new Request('https://api.example.com/edge', { method: 'OPTIONS' });
  const response = handleCorsPreflightRequest(req);
  assertEquals(response.status, 200, 'OPTIONS should return 200');
  assertEquals(
    response.headers.get('Access-Control-Allow-Origin'),
    'null',
    'OPTIONS without Origin should return null',
  );
});

// =============================================================================
// S-11 — Case-insensitive origin matching
// =============================================================================

Deno.test('S-11: lowercase env + uppercase Origin matches', async () => {
  await withCorsEnv({ ALLOWED_ORIGINS: 'https://myapp.com' }, async (mod) => {
    const req = new Request('https://api.example.com/edge', {
      method: 'POST',
      headers: { Origin: 'https://MYAPP.com' },
    });
    const headers = mod.getCorsHeaders(req);
    assertEquals(
      headers['Access-Control-Allow-Origin'],
      'https://MYAPP.com',
      'Uppercase Origin should match lowercase allowlist entry',
    );
  });
});

Deno.test('S-11: uppercase env + lowercase Origin matches', async () => {
  await withCorsEnv({ ALLOWED_ORIGINS: 'https://MYAPP.COM' }, async (mod) => {
    const req = new Request('https://api.example.com/edge', {
      method: 'POST',
      headers: { Origin: 'https://myapp.com' },
    });
    const headers = mod.getCorsHeaders(req);
    assertEquals(
      headers['Access-Control-Allow-Origin'],
      'https://myapp.com',
      'Lowercase Origin should match uppercase allowlist entry',
    );
  });
});

Deno.test('S-11: mixed-case env + mixed-case Origin matches', async () => {
  await withCorsEnv({ ALLOWED_ORIGINS: 'https://MyApp.Com' }, async (mod) => {
    const req = new Request('https://api.example.com/edge', {
      method: 'POST',
      headers: { Origin: 'https://mYaPp.cOm' },
    });
    const headers = mod.getCorsHeaders(req);
    assert(
      headers['Access-Control-Allow-Origin'] === 'https://mYaPp.cOm',
      'Mixed-case Origin should match mixed-case allowlist (RFC 6454)',
    );
  });
});

Deno.test('S-11: non-allowlisted Origin remains blocked', async () => {
  await withCorsEnv({ ALLOWED_ORIGINS: 'https://myapp.com' }, async (mod) => {
    const req = new Request('https://api.example.com/edge', {
      method: 'POST',
      headers: { Origin: 'https://evil.com' },
    });
    const headers = mod.getCorsHeaders(req);
    assertEquals(
      headers['Access-Control-Allow-Origin'],
      '',
      'Non-allowlisted Origin should result in empty Allow-Origin',
    );
  });
});
