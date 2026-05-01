const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockRequireAdminUserProfile = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialReclassifyPostRequest = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockCreateSocialModerationEvent = jest.fn();
const mockNormalizeModerationState = jest.fn();

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
  requireAdminUserProfile: (...args: unknown[]) =>
    mockRequireAdminUserProfile(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Config.ts', () => ({
  loadPhase2FeatureFlags: (...args: unknown[]) =>
    mockLoadPhase2FeatureFlags(...args),
  requireFeatureEnabled: (...args: unknown[]) =>
    mockRequireFeatureEnabled(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Contracts.ts', () => ({
  parseSocialReclassifyPostRequest: (...args: unknown[]) =>
    mockParseSocialReclassifyPostRequest(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: () => mockCreateRequestId(),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  Phase2HttpError: MockPhase2HttpError,
  getPhase2ErrorStatus: (error: { status?: number }) => error?.status ?? 500,
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

jest.mock('../../supabase/functions/_shared/phase2Moderation.ts', () => ({
  createSocialModerationEvent: (...args: unknown[]) =>
    mockCreateSocialModerationEvent(...args),
  normalizeModerationState: (...args: unknown[]) =>
    mockNormalizeModerationState(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
  readOptionalString: (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null,
  validatePhase2SocialCategory: (value: string | null) => {
    if (value === 'before_after' || value === 'food' || value === 'physique') {
      return value;
    }

    throw new MockPhase2HttpError(
      400,
      'invalid_category',
      'category must be one of before_after, food, or physique',
    );
  },
}));

function createSelectChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };

  return chain;
}

function createUpdateChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    eq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    select: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };

  return chain;
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-reclassify-post/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-reclassify-post edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'admin-1' });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({ social_enabled: true });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockCreateSocialModerationEvent.mockResolvedValue('event-1');
    mockNormalizeModerationState.mockReturnValue('approved');
  });

  it.each([
    ['before_after'],
    ['food'],
    ['physique'],
  ])('reclassifies a post to the valid category %s and writes an audit event', async (nextCategory) => {
    const previousCategory = nextCategory === 'food' ? 'before_after' : 'food';

    mockParseSocialReclassifyPostRequest.mockReturnValue({
      post_id: 'post-1',
      category: nextCategory,
    });

    const selectChain = createSelectChain({
      data: {
        id: 'post-1',
        author_id: 'author-1',
        category: previousCategory,
        moderation_state: 'approved',
        deleted_at: null,
      },
      error: null,
    });
    const updateChain = createUpdateChain({
      data: {
        id: 'post-1',
      },
      error: null,
    });

    const from = jest
      .fn()
      .mockReturnValueOnce({
        select: jest.fn(() => selectChain),
      })
      .mockReturnValueOnce({
        update: jest.fn(() => updateChain),
      });

    mockCreateServiceRoleClient.mockReturnValue({
      from,
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-reclassify-post', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      post_id: 'post-1',
      previous_category: previousCategory,
      category: nextCategory,
      event_id: 'event-1',
    });
    expect(mockCreateSocialModerationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'reclassify_category',
        metadata: expect.objectContaining({
          previous_category: previousCategory,
          next_category: nextCategory,
          moderation_state_at_change: 'approved',
        }),
      }),
    );
  });

  it('rejects no-op category changes with an explicit 409 error', async () => {
    mockParseSocialReclassifyPostRequest.mockReturnValue({
      post_id: 'post-1',
      category: 'food',
    });

    const selectChain = createSelectChain({
      data: {
        id: 'post-1',
        author_id: 'author-1',
        category: 'food',
        moderation_state: 'approved',
        deleted_at: null,
      },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => selectChain),
      })),
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-reclassify-post', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'post_category_unchanged',
      error: 'Social post category already set to the requested value',
      request_id: 'request-1',
    });
  });

  it('rejects invalid categories explicitly', async () => {
    mockParseSocialReclassifyPostRequest.mockImplementation(() => {
      throw new MockPhase2HttpError(
        400,
        'invalid_category',
        'category must be one of before_after, food, or physique',
      );
    });

    mockCreateServiceRoleClient.mockReturnValue({});

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-reclassify-post', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'invalid_category',
      error: 'category must be one of before_after, food, or physique',
      request_id: 'request-1',
    });
  });
});
