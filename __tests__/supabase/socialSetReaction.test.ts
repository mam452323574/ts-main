const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockEnsureUserProfileExistsForAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialSetReactionRequest = jest.fn();
const mockCreatePhase2DatabaseError = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockSummarizeSupabaseError = jest.fn();
const mockAssertReactableSocialPost = jest.fn();

class MockPhase2HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'Phase2HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

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
  requireAuthenticatedUser: (...args: unknown[]) =>
    mockRequireAuthenticatedUser(...args),
  ensureUserProfileExistsForAuthenticatedUser: (...args: unknown[]) =>
    mockEnsureUserProfileExistsForAuthenticatedUser(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Config.ts', () => ({
  loadPhase2FeatureFlags: (...args: unknown[]) =>
    mockLoadPhase2FeatureFlags(...args),
  requireFeatureEnabled: (...args: unknown[]) =>
    mockRequireFeatureEnabled(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Contracts.ts', () => ({
  parseSocialSetReactionRequest: (...args: unknown[]) =>
    mockParseSocialSetReactionRequest(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  createPhase2DatabaseError: (...args: unknown[]) =>
    mockCreatePhase2DatabaseError(...args),
  getPhase2ErrorStatus: (error: { status?: number }) => error?.status ?? 500,
  Phase2HttpError: MockPhase2HttpError,
  toPhase2ErrorPayload: (
    error: { message?: string; code?: string; details?: unknown; status?: number },
    options: { requestId?: string } = {},
  ) => ({
    success: false,
    error: error?.message ?? 'Unexpected server error',
    code: error?.code ?? 'internal_error',
    details: error?.details,
    status: error?.status ?? 500,
    request_id: options.requestId,
  }),
}));

jest.mock('../../supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: () => mockCreateRequestId(),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
  summarizeSupabaseError: (...args: unknown[]) => mockSummarizeSupabaseError(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Social.ts', () => ({
  assertReactableSocialPost: (...args: unknown[]) =>
    mockAssertReactableSocialPost(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
}));

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-set-reaction/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-set-reaction edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@example.com',
    });
    mockEnsureUserProfileExistsForAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
    });
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockParseSocialSetReactionRequest.mockReturnValue({
      post_id: 'post-1',
      reaction: 'like',
    });
    mockAssertReactableSocialPost.mockResolvedValue(undefined);
  });

  it('returns the exact reaction payload expected by the client contract after auto-healing the profile', async () => {
    const serviceRoleClient = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          post_id: 'post-1',
          viewer_reaction: 'like',
          like_count: 8,
          dislike_count: 3,
        },
        error: null,
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-set-reaction', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(mockEnsureUserProfileExistsForAuthenticatedUser).toHaveBeenCalledWith(
      serviceRoleClient,
      expect.objectContaining({ id: 'viewer-1' }),
    );
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      post_id: 'post-1',
      viewer_reaction: 'like',
      like_count: 8,
      dislike_count: 3,
    });
  });

  it('keeps request diagnostics structured and logs the SQL ambiguity details when the reaction RPC fails with 42702', async () => {
    const rpcError = {
      code: '42702',
      message: 'column reference "post_id" is ambiguous',
      details:
        'It could refer to either a PL/pgSQL variable or a table column.',
      hint: 'Use ON CONSTRAINT or qualify the reference.',
    };
    const serviceRoleClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: rpcError,
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient);
    mockSummarizeSupabaseError.mockReturnValue({
      error_code: '42702',
      error_message: 'column reference "post_id" is ambiguous',
      error_detail:
        'It could refer to either a PL/pgSQL variable or a table column.',
      error_hint: 'Use ON CONSTRAINT or qualify the reference.',
    });
    mockCreatePhase2DatabaseError.mockReturnValue(
      new MockPhase2HttpError(
        500,
        'social_reaction_update_failed',
        'Failed to update the social reaction',
        {
          source_code: '42702',
          column: 'post_id',
          rpc: 'set_social_post_reaction',
        },
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-set-reaction', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(mockLogPhase2Error).toHaveBeenNthCalledWith(
      1,
      '[social-set-reaction] RPC failed',
      rpcError,
      expect.objectContaining({
        request_id: 'request-1',
        rpc_name: 'set_social_post_reaction',
        error_code: '42702',
        error_message: 'column reference "post_id" is ambiguous',
        error_detail:
          'It could refer to either a PL/pgSQL variable or a table column.',
        error_hint: 'Use ON CONSTRAINT or qualify the reference.',
      }),
    );
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Failed to update the social reaction',
      code: 'social_reaction_update_failed',
      details: {
        source_code: '42702',
        column: 'post_id',
        rpc: 'set_social_post_reaction',
      },
      status: 500,
      request_id: 'request-1',
    });
  });
});
