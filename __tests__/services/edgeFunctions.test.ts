const mockGetRuntimeConfig = jest.fn();
const mockGetSupabaseFunctionUrl = jest.fn();
const mockGetSession = jest.fn();

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: (...args: unknown[]) => mockGetRuntimeConfig(...args),
  getSupabaseFunctionUrl: (...args: unknown[]) => mockGetSupabaseFunctionUrl(...args),
}));

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

import {
  invokeAuthedEdgeFunction,
  type EdgeFunctionInvokeErrorOptions,
} from '@/services/edgeFunctions';

class TestEdgeFunctionError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  functionName?: string;

  constructor(message: string, options: EdgeFunctionInvokeErrorOptions) {
    super(message);
    this.name = 'TestEdgeFunctionError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
    this.functionName = options.functionName;
  }
}

function createError(message: string, options: EdgeFunctionInvokeErrorOptions) {
  return new TestEdgeFunctionError(message, options);
}

describe('edgeFunctions service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRuntimeConfig.mockReturnValue({
      supabaseUrl: 'https://qpogulljnnacrxdjbwiz.supabase.co',
    });
    mockGetSupabaseFunctionUrl.mockReturnValue(
      'https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/coach-generate-response',
    );
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
        },
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('preserves 5xx edge function metadata on rejected invocations', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Coach provider returned an error',
          code: 'coach_webhook_failed',
          details: {
            provider_status: 503,
            step: 'webhook',
          },
          request_id: 'req-coach-503',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    await expect(
      invokeAuthedEdgeFunction({
        scopeLabel: 'Coach',
        functionName: 'coach-generate-response',
        payload: {
          payload_version: 2,
        },
        createError,
      }),
    ).rejects.toMatchObject({
      message: 'Coach provider returned an error',
      code: 'coach_webhook_failed',
      status: 503,
      details: {
        provider_status: 503,
        step: 'webhook',
      },
      requestId: 'req-coach-503',
      functionName: 'coach-generate-response',
    });
  });

  it('preserves BOOT_ERROR payload messages when the edge function fails to start', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'BOOT_ERROR',
          message: 'Function failed to start (please check logs)',
          request_id: 'req-boot-503',
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    await expect(
      invokeAuthedEdgeFunction({
        scopeLabel: 'Coach',
        functionName: 'coach-generate-response',
        payload: {
          payload_version: 2,
        },
        createError,
      }),
    ).rejects.toMatchObject({
      message: 'Function failed to start (please check logs)',
      code: 'BOOT_ERROR',
      status: 503,
      requestId: 'req-boot-503',
      functionName: 'coach-generate-response',
    });
  });

  it('keeps local authentication failures as 401 errors before any request is sent', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });

    await expect(
      invokeAuthedEdgeFunction({
        scopeLabel: 'Coach',
        functionName: 'coach-generate-response',
        payload: {
          payload_version: 2,
        },
        createError,
      }),
    ).rejects.toMatchObject({
      message: 'Authentication required',
      code: 'missing_authentication',
      status: 401,
      requestId: undefined,
      functionName: 'coach-generate-response',
    });

    expect(global.fetch).toBe(originalFetch);
  });

  it('tags missing routes with the configured Supabase project on 404 responses', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'Not Found',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      ),
    ) as typeof fetch;

    await expect(
      invokeAuthedEdgeFunction({
        scopeLabel: 'Coach',
        functionName: 'coach-generate-response',
        payload: {
          payload_version: 2,
        },
        createError,
      }),
    ).rejects.toMatchObject({
      message:
        'Coach route "coach-generate-response" is not deployed on Supabase project "qpogulljnnacrxdjbwiz" (404).',
      code: 'edge_function_route_missing',
      status: 404,
      functionName: 'coach-generate-response',
    });
  });
});
