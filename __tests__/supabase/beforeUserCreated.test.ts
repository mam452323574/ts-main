// Tests for the F-01 HIBP password check Edge Function.
// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
//   prefix (5):  "5BAA6"
//   suffix (35): "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
const KNOWN_LEAKED_PASSWORD = 'password';
const KNOWN_LEAKED_PREFIX = '5BAA6';
const KNOWN_LEAKED_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

type ServeHandler = (req: Request) => Promise<Response>;

interface LoadedModule {
  checkPasswordBreachedCount: typeof import('@/supabase/functions/before-user-created/index').checkPasswordBreachedCount;
  handler: ServeHandler;
}

function loadBeforeUserCreated(
  env: Record<string, string | undefined> = {
    ALLOWED_ORIGINS: 'https://app.example',
  },
): LoadedModule {
  jest.resetModules();
  let capturedHandler: ServeHandler | null = null;
  (global as any).Deno = {
    env: {
      get: jest.fn((name: string) => env[name]),
    },
    serve: jest.fn((handler: ServeHandler) => {
      capturedHandler = handler;
    }),
  };
  const module = require('@/supabase/functions/before-user-created/index') as typeof import('@/supabase/functions/before-user-created/index');
  if (!capturedHandler) {
    throw new Error('Deno.serve was not called by module load');
  }
  return {
    checkPasswordBreachedCount: module.checkPasswordBreachedCount,
    handler: capturedHandler,
  };
}

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete (global as any).Deno;
});

describe('checkPasswordBreachedCount (F-01 HIBP unit)', () => {
  it('returns leaked: true with the count when HIBP reports the suffix', async () => {
    const { checkPasswordBreachedCount } = loadBeforeUserCreated();

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        '0018A45C4D1DEF81644B54AB7F969B88D65:5\r\n' +
          `${KNOWN_LEAKED_SUFFIX}:9999999\r\n` +
          '011053FD0102E94D6AE2F8B83D76FAF94F6:2\r\n',
        { status: 200 },
      ),
    );

    const result = await checkPasswordBreachedCount(
      KNOWN_LEAKED_PASSWORD,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.leaked).toBe(true);
    expect(result.count).toBe(9999999);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(KNOWN_LEAKED_PREFIX);
    expect(url).not.toContain(KNOWN_LEAKED_SUFFIX); // k-anonymity: suffix never sent
    expect((init as RequestInit).headers).toMatchObject({
      'Add-Padding': 'true',
    });
  });

  it('returns leaked: false when the suffix is absent from the HIBP range', async () => {
    const { checkPasswordBreachedCount } = loadBeforeUserCreated();

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        '0018A45C4D1DEF81644B54AB7F969B88D65:5\r\n' +
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:7\r\n' +
          '011053FD0102E94D6AE2F8B83D76FAF94F6:2\r\n',
        { status: 200 },
      ),
    );

    const result = await checkPasswordBreachedCount(
      'a-strong-random-password-c3a91b7d4e2f8',
      fetchMock as unknown as typeof fetch,
    );

    expect(result.leaked).toBe(false);
    expect(result.count).toBe(0);
  });

  it('fails open with leaked: false when HIBP returns a non-2xx status', async () => {
    const { checkPasswordBreachedCount } = loadBeforeUserCreated();

    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 500 }));

    const result = await checkPasswordBreachedCount(
      KNOWN_LEAKED_PASSWORD,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.leaked).toBe(false);
    expect(result.count).toBe(0);
  });

  it('treats lines with count 0 as not leaked', async () => {
    const { checkPasswordBreachedCount } = loadBeforeUserCreated();

    const fetchMock = jest.fn().mockResolvedValue(
      new Response(`${KNOWN_LEAKED_SUFFIX}:0\r\n`, { status: 200 }),
    );

    const result = await checkPasswordBreachedCount(
      KNOWN_LEAKED_PASSWORD,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.leaked).toBe(false);
  });

  it('propagates fetch rejections so the handler can fail open', async () => {
    const { checkPasswordBreachedCount } = loadBeforeUserCreated();

    const fetchMock = jest
      .fn()
      .mockRejectedValue(new Error('Network unreachable'));

    await expect(
      checkPasswordBreachedCount(
        KNOWN_LEAKED_PASSWORD,
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('Network unreachable');
  });
});

describe('before-user-created HTTP handler (F-01 HIBP integration)', () => {
  function makeRequest(init?: RequestInit) {
    return new Request('https://example.com/functions/v1/before-user-created', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      ...init,
    });
  }

  it('returns 200 leaked:true when HIBP confirms the suffix', async () => {
    const { handler } = loadBeforeUserCreated();
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        `${KNOWN_LEAKED_SUFFIX}:1234\r\n`,
        { status: 200 },
      ),
    ) as any;

    const response = await handler(
      makeRequest({ body: JSON.stringify({ password: KNOWN_LEAKED_PASSWORD }) }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ leaked: true, count: 1234 });
  });

  it('returns 200 leaked:false for a password not in the breach DB', async () => {
    const { handler } = loadBeforeUserCreated();
    global.fetch = jest.fn().mockResolvedValue(
      new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\n', { status: 200 }),
    ) as any;

    const response = await handler(
      makeRequest({
        body: JSON.stringify({ password: 'untracked-9F8e3D7c2A1b4E5d6F0' }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ leaked: false, count: 0 });
  });

  it('returns 200 leaked:false (fail-open) when HIBP fetch rejects', async () => {
    const { handler } = loadBeforeUserCreated();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('HIBP timeout')) as any;

    try {
      const response = await handler(
        makeRequest({
          body: JSON.stringify({ password: KNOWN_LEAKED_PASSWORD }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ leaked: false, count: 0 });
      expect(warnSpy).toHaveBeenCalledWith(
        '[before-user-created] HIBP check failed, failing open',
        expect.objectContaining({ error_name: expect.any(String) }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns 400 when password is missing from the body', async () => {
    const { handler } = loadBeforeUserCreated();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const response = await handler(
        makeRequest({ body: JSON.stringify({}) }),
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('invalid_payload');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns 400 when body is not valid JSON', async () => {
    const { handler } = loadBeforeUserCreated();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const response = await handler(makeRequest({ body: 'not-json' }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('invalid_payload');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns 405 on GET', async () => {
    const { handler } = loadBeforeUserCreated();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const response = await handler(
        new Request('https://example.com/functions/v1/before-user-created', {
          method: 'GET',
        }),
      );

      expect(response.status).toBe(405);
      const body = await response.json();
      expect(body.code).toBe('method_not_allowed');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('handles CORS preflight', async () => {
    const { handler } = loadBeforeUserCreated();

    const response = await handler(
      new Request('https://example.com/functions/v1/before-user-created', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example',
        },
      }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects disallowed origin', async () => {
    const { handler } = loadBeforeUserCreated({
      ALLOWED_ORIGINS: 'https://app.example',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const response = await handler(
        makeRequest({
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.example',
          },
          body: JSON.stringify({ password: KNOWN_LEAKED_PASSWORD }),
        }),
      );

      expect(response.status).toBe(403);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('never includes the password in the response', async () => {
    const { handler } = loadBeforeUserCreated();
    global.fetch = jest.fn().mockResolvedValue(
      new Response(`${KNOWN_LEAKED_SUFFIX}:1\r\n`, { status: 200 }),
    ) as any;

    const password = 'super-sensitive-secret-12345';
    const response = await handler(
      makeRequest({ body: JSON.stringify({ password }) }),
    );

    const text = await response.text();
    expect(text).not.toContain(password);
  });
});
