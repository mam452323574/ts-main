import { z } from 'zod';

import {
  invokeAuthedEdgeFunction,
  type EdgeFunctionInvokeErrorOptions,
} from '@/services/edgeFunctions';

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    supabaseUrl: 'https://qpogulljnnacrxdjbwiz.supabase.co',
    supabaseAnonKey: 'k',
    revenueCatIosApiKey: null,
    revenueCatAndroidApiKey: null,
    aptabaseAppKey: null,
    aptabaseHost: null,
  }),
  getSupabaseFunctionUrl: (name: string) =>
    `https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/${name}`,
}));

const mockGetSession = jest.fn().mockResolvedValue({
  data: { session: { access_token: 'test-token' } },
});

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

class TestError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
}

const createError = (message: string, options: EdgeFunctionInvokeErrorOptions) => {
  const error = new TestError(message);
  error.code = options.code;
  error.status = options.status;
  error.details = options.details;
  return error;
};

describe('invokeAuthedEdgeFunction — Zod response validation (P2-B)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  it("renvoie le payload tel quel si responseSchema n'est pas fourni (compat)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ arbitrary: 'shape', data: 1 }),
    });

    const response = await invokeAuthedEdgeFunction<{ arbitrary: string }, TestError>({
      scopeLabel: 'Test',
      functionName: 'noop',
      payload: {},
      createError,
    });

    expect(response).toEqual({ arbitrary: 'shape', data: 1 });
  });

  it('renvoie les données validées quand responseSchema accepte le payload', async () => {
    const schema = z.object({ ok: z.literal(true), value: z.number() });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, value: 42, extra: 'ignored' }),
    });

    const result = await invokeAuthedEdgeFunction<{ ok: true; value: number }, TestError>({
      scopeLabel: 'Test',
      functionName: 'validated',
      payload: {},
      createError,
      responseSchema: schema,
    });

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('lève une erreur edge_function_invalid_response si le schéma rejette', async () => {
    const schema = z.object({ ok: z.literal(true), value: z.number() });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: 'not-bool', value: 'not-num' }),
    });

    await expect(
      invokeAuthedEdgeFunction<{ ok: true; value: number }, TestError>({
        scopeLabel: 'Test',
        functionName: 'malformed',
        payload: {},
        createError,
        responseSchema: schema,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid payload'),
      code: 'edge_function_invalid_response',
    });
  });
});
