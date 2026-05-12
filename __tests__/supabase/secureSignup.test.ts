const mockCreateServiceRoleClient = jest.fn();
const mockResolveTrustedClientIp = jest.fn((_req?: Request) => '203.0.113.10');

class MockPhase2HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'Phase2HttpError';
    this.status = status;
    this.code = code;
  }
}

jest.mock('../../supabase/functions/_shared/clientIp.ts', () => ({
  resolveTrustedClientIp: (req: Request) => mockResolveTrustedClientIp(req),
}));

jest.mock('../../supabase/functions/_shared/cors.ts', () => ({
  handleCorsPreflightRequest: jest.fn(
    () => new Response(null, { status: 204 }),
  ),
  validateCorsOrigin: jest.fn(() => null),
  jsonResponse: jest.fn(
    (
      _req: Request,
      body: unknown,
      init: {
        status?: number;
      } = {},
    ) =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      }),
  ),
}));

jest.mock('../../supabase/functions/_shared/phase2Auth.ts', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  Phase2HttpError: MockPhase2HttpError,
}));

type ServeHandler = (req: Request) => Promise<Response>;

function createSelectChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: jest.fn(() => chain),
    in: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    limit: jest.fn(() => Promise.resolve(result)),
  };

  return chain;
}

function createInsertChain(result: { error: unknown }) {
  return {
    insert: jest.fn(() => Promise.resolve(result)),
  };
}

function loadSecureSignupHandler(): ServeHandler {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: jest.fn(() => 'req-signup-1'),
    },
  });

  jest.isolateModules(() => {
    require('@/supabase/functions/secure-signup/index.ts');
  });

  const handler = (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ServeHandler
    | undefined;
  if (!handler) {
    throw new Error('Deno.serve was not called by secure-signup');
  }

  return handler;
}

function makeSignupRequest(body: Record<string, unknown>) {
  return new Request('https://example.supabase.co/functions/v1/secure-signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('secure-signup edge function', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockResolveTrustedClientIp.mockReturnValue('203.0.113.10');
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete (global as any).Deno;
  });

  it('creates an auth-confirmed user while leaving app verification to the profile gate', async () => {
    const createUser = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 'created-user-1',
        },
      },
      error: null,
    });
    const admin = {
      from: jest.fn((table: string) => {
        if (table === 'signup_attestations') {
          return createInsertChain({ error: null });
        }

        return createSelectChain({
          data: [],
          error: null,
        });
      }),
      rpc: jest
        .fn()
        .mockResolvedValueOnce({
          data: [{ allowed: true, reason: null }],
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: null,
        }),
      auth: {
        admin: {
          createUser,
        },
      },
    };
    mockCreateServiceRoleClient.mockReturnValue(admin);
    const handler = loadSecureSignupHandler();

    const response = await handler(
      makeSignupRequest({
        email: 'fresh@example.com',
        password: 'StrongerPass42!',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      user_id: 'created-user-1',
    });
    expect(createUser).toHaveBeenCalledWith({
      email: 'fresh@example.com',
      password: 'StrongerPass42!',
      email_confirm: true,
      user_metadata: { signup_nonce: 'req-signup-1' },
    });
    expect(admin.rpc).toHaveBeenCalledWith('record_ip_signup', {
      client_ip: '203.0.113.10',
      p_user_id: 'created-user-1',
    });
  });

  it('returns 429 with request_id when the IP signup quota is reached', async () => {
    const admin = {
      from: jest.fn(() =>
        createSelectChain({
          data: [],
          error: null,
        }),
      ),
      rpc: jest.fn().mockResolvedValue({
        data: [{ allowed: false, reason: 'weekly_limit_reached' }],
        error: null,
      }),
      auth: {
        admin: {
          createUser: jest.fn(),
        },
      },
    };
    mockCreateServiceRoleClient.mockReturnValue(admin);
    const handler = loadSecureSignupHandler();

    const response = await handler(
      makeSignupRequest({
        email: 'fresh@example.com',
        password: 'StrongerPass42!',
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Account creation limit reached for this network. Please try again later.',
      code: 'signup_rate_limited',
      request_id: 'req-signup-1',
    });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[secure-signup] rejected', {
      request_id: 'req-signup-1',
      reason: 'ip_rate_limited',
    });
  });

  it('keeps password-policy rejection generic while logging the reason', async () => {
    const admin = {
      from: jest.fn(() =>
        createSelectChain({
          data: [],
          error: null,
        }),
      ),
      rpc: jest.fn().mockResolvedValue({
        data: [{ allowed: true, reason: null }],
        error: null,
      }),
      auth: {
        admin: {
          createUser: jest.fn(),
        },
      },
    };
    mockCreateServiceRoleClient.mockReturnValue(admin);
    const handler = loadSecureSignupHandler();

    const response = await handler(
      makeSignupRequest({
        email: 'fresh@example.com',
        password: 'longenough',
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: 'Signup not allowed. Please try a different email or password.',
      code: 'signup_failed',
      request_id: 'req-signup-1',
    });
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[secure-signup] rejected', {
      request_id: 'req-signup-1',
      reason: 'password_policy',
    });
  });

  it('keeps Auth create failures generic while logging safe metadata', async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table === 'signup_attestations') {
          return createInsertChain({ error: null });
        }

        return createSelectChain({
          data: [],
          error: null,
        });
      }),
      rpc: jest.fn().mockResolvedValue({
        data: [{ allowed: true, reason: null }],
        error: null,
      }),
      auth: {
        admin: {
          createUser: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: 'user_already_exists',
              status: 422,
            },
          }),
        },
      },
    };
    mockCreateServiceRoleClient.mockReturnValue(admin);
    const handler = loadSecureSignupHandler();

    const response = await handler(
      makeSignupRequest({
        email: 'fresh@example.com',
        password: 'StrongerPass42!',
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: 'Signup not allowed. Please try a different email or password.',
      code: 'signup_failed',
      request_id: 'req-signup-1',
    });
    expect(warnSpy).toHaveBeenCalledWith('[secure-signup] rejected', {
      request_id: 'req-signup-1',
      reason: 'auth_create_failed',
      error_code: 'user_already_exists',
      error_status: 422,
    });
  });
});
