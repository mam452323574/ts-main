const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockEnsureUserProfileExistsForAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialRecordPostViewsRequest = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockGetSocialRateLimit = jest.fn();

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
  parseSocialRecordPostViewsRequest: (...args: unknown[]) =>
    mockParseSocialRecordPostViewsRequest(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
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

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Social.ts', () => ({
  getSocialRateLimit: (...args: unknown[]) => mockGetSocialRateLimit(...args),
}));

function createVisiblePostsQuery(options: {
  data: unknown[];
  error: unknown;
}) {
  const query = {
    in: jest.fn(async () => ({
      data: options.data,
      error: options.error,
    })),
  };

  return {
    select: jest.fn(() => query),
    query,
  };
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-record-post-views/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-record-post-views edge function', () => {
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
    mockParseSocialRecordPostViewsRequest.mockReturnValue({
      post_ids: ['post-approved', 'post-hidden', 'post-own-pending', 'post-deleted'],
    });
    mockGetSocialRateLimit.mockResolvedValue({
      allowed: true,
      limit_count: 100,
      window_seconds: 300,
      recent_count: 0,
      retry_after_seconds: 0,
    });
  });

  it('records only approved posts plus the authenticated author own visible pending posts', async () => {
    const visiblePostsQuery = createVisiblePostsQuery({
      data: [
        {
          id: 'post-approved',
          author_id: 'author-1',
          moderation_state: 'approved',
          deleted_at: null,
        },
        {
          id: 'post-hidden',
          author_id: 'author-2',
          moderation_state: 'hidden',
          deleted_at: null,
        },
        {
          id: 'post-own-pending',
          author_id: 'viewer-1',
          moderation_state: 'pending',
          deleted_at: null,
        },
        {
          id: 'post-deleted',
          author_id: 'author-3',
          moderation_state: 'approved',
          deleted_at: '2026-04-18T10:00:00.000Z',
        },
      ],
      error: null,
    });
    const serviceRoleClient = {
      from: jest.fn(() => ({
        select: visiblePostsQuery.select,
      })),
      rpc: jest.fn().mockResolvedValue({
        data: [{ recorded_count: 2 }],
        error: null,
      }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-record-post-views', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(serviceRoleClient.from).toHaveBeenCalledWith('social_posts');
    expect(visiblePostsQuery.query.in).toHaveBeenCalledWith('id', [
      'post-approved',
      'post-hidden',
      'post-own-pending',
      'post-deleted',
    ]);
    expect(mockEnsureUserProfileExistsForAuthenticatedUser).toHaveBeenCalledWith(
      serviceRoleClient,
      expect.objectContaining({ id: 'viewer-1' }),
    );
    expect(serviceRoleClient.rpc).toHaveBeenCalledWith('record_social_post_views', {
      p_post_ids: ['post-approved', 'post-own-pending'],
      p_viewer_id: 'viewer-1',
    });
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      recorded_count: 2,
    });
  });

  it('returns a successful no-op response when no requested post is eligible for unique view tracking', async () => {
    const visiblePostsQuery = createVisiblePostsQuery({
      data: [
        {
          id: 'post-hidden',
          author_id: 'author-2',
          moderation_state: 'hidden',
          deleted_at: null,
        },
      ],
      error: null,
    });
    const serviceRoleClient = {
      from: jest.fn(() => ({
        select: visiblePostsQuery.select,
      })),
      rpc: jest.fn(),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceRoleClient);
    mockParseSocialRecordPostViewsRequest.mockReturnValue({
      post_ids: ['post-hidden'],
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-record-post-views', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(mockEnsureUserProfileExistsForAuthenticatedUser).not.toHaveBeenCalled();
    expect(serviceRoleClient.rpc).not.toHaveBeenCalled();
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      recorded_count: 0,
    });
  });
});
