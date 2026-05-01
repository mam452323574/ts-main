const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockEnsureUserProfileExistsForAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialDeleteCommentRequest = jest.fn();
const mockCreatePhase2DatabaseError = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockAssertDeletableSocialComment = jest.fn();

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
  parseSocialDeleteCommentRequest: (...args: unknown[]) =>
    mockParseSocialDeleteCommentRequest(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  createPhase2DatabaseError: (...args: unknown[]) =>
    mockCreatePhase2DatabaseError(...args),
  getPhase2ErrorStatus: (error: { status?: number }) => error?.status ?? 500,
  Phase2HttpError: MockPhase2HttpError,
  toPhase2ErrorPayload: (
    error: { message?: string; code?: string },
    options: { requestId?: string } = {},
  ) => ({
    success: false,
    error: error?.message ?? 'Unexpected server error',
    code: error?.code ?? 'internal_error',
    request_id: options.requestId,
  }),
}));

jest.mock('../../supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: () => mockCreateRequestId(),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Social.ts', () => ({
  assertDeletableSocialComment: (...args: unknown[]) =>
    mockAssertDeletableSocialComment(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
}));

function createDeleteTargetChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    eq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    select: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };

  return chain;
}

function createResolveReportsChain(result: { error: unknown }) {
  const chain: any = {
    eq: jest.fn(() => chain),
    in: jest.fn(() => Promise.resolve(result)),
  };

  return chain;
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-delete-comment/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-delete-comment edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'viewer-1' });
    mockEnsureUserProfileExistsForAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
    });
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
      social_comments_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockParseSocialDeleteCommentRequest.mockReturnValue({
      comment_id: 'comment-1',
    });
    mockAssertDeletableSocialComment.mockResolvedValue({
      id: 'comment-1',
      post_id: 'post-1',
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      moderation_summary_json: {},
    });
  });

  it('registers a request handler when the module loads', async () => {
    const handler = await loadHandler();

    expect(typeof handler).toBe('function');
  });

  it('returns the comment deletion payload expected by the client contract', async () => {
    const deleteCommentChain = createDeleteTargetChain({
      data: {
        id: 'comment-1',
        post_id: 'post-1',
        deleted_at: '2026-04-17T10:00:00.000Z',
      },
      error: null,
    });
    const resolveReportsChain = createResolveReportsChain({
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest
        .fn()
        .mockReturnValueOnce({
          update: jest.fn(() => deleteCommentChain),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => resolveReportsChain),
        }),
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-delete-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      comment_id: 'comment-1',
      post_id: 'post-1',
      moderation_state: 'removed',
      deleted_at: '2026-04-17T10:00:00.000Z',
    });
  });

  it('returns a 403 payload when the viewer cannot delete the targeted comment', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(),
    });
    mockAssertDeletableSocialComment.mockRejectedValueOnce(
      new MockPhase2HttpError(
        403,
        'comment_delete_forbidden',
        'Only the author can delete this social comment',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-delete-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Only the author can delete this social comment',
      code: 'comment_delete_forbidden',
      request_id: 'request-1',
    });
    expect(mockLogPhase2Error).toHaveBeenCalled();
  });

  it('returns a 409 payload when the targeted comment has already been deleted', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(),
    });
    mockAssertDeletableSocialComment.mockRejectedValueOnce(
      new MockPhase2HttpError(
        409,
        'comment_already_deleted',
        'Social comment already deleted',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-delete-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Social comment already deleted',
      code: 'comment_already_deleted',
      request_id: 'request-1',
    });
  });

  it('propagates linked report resolution failures after the comment has been soft deleted', async () => {
    const deleteCommentChain = createDeleteTargetChain({
      data: {
        id: 'comment-1',
        post_id: 'post-1',
        deleted_at: '2026-04-17T10:00:00.000Z',
      },
      error: null,
    });
    const reportsError = {
      code: '42501',
      message: 'permission denied',
    };
    const resolveReportsChain = createResolveReportsChain({
      error: reportsError,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest
        .fn()
        .mockReturnValueOnce({
          update: jest.fn(() => deleteCommentChain),
        })
        .mockReturnValueOnce({
          update: jest.fn(() => resolveReportsChain),
        }),
    });
    mockCreatePhase2DatabaseError.mockReturnValueOnce(
      new MockPhase2HttpError(
        500,
        'social_report_resolution_failed',
        'Failed to resolve linked social reports',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-delete-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Failed to resolve linked social reports',
      code: 'social_report_resolution_failed',
      request_id: 'request-1',
    });
    expect(mockCreatePhase2DatabaseError).toHaveBeenCalledWith(
      reportsError,
      expect.objectContaining({
        fallbackCode: 'social_report_resolution_failed',
        relationName: 'social_reports',
      }),
    );
  });
});
