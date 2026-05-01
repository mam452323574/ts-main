const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockEnsureUserProfileExistsForAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialCreateCommentRequest = jest.fn();
const mockCreatePhase2DatabaseError = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockBuildInitialSocialModerationFields = jest.fn();
const mockResolveSocialPublishModerationResult = jest.fn();
const mockAssertCommentableSocialPost = jest.fn();
const mockAssertNoRecentDuplicateComment = jest.fn();
const mockFetchViewerProfileSnapshot = jest.fn();
const mockGetSocialRateLimit = jest.fn();
const mockGetSocialRejectionCooldown = jest.fn();
const mockNormalizeSocialText = jest.fn();
const mockSha256Hex = jest.fn();

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
  parseSocialCreateCommentRequest: (...args: unknown[]) =>
    mockParseSocialCreateCommentRequest(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  createPhase2DatabaseError: (...args: unknown[]) =>
    mockCreatePhase2DatabaseError(...args),
  getPhase2ErrorStatus: (error: { status?: number }) => error?.status ?? 500,
  Phase2HttpError: MockPhase2HttpError,
  toPhase2ErrorPayload: (
    error: { message?: string; code?: string; details?: unknown },
    options: { requestId?: string } = {},
  ) => ({
    success: false,
    error: error?.message ?? 'Unexpected server error',
    code: error?.code ?? 'internal_error',
    details: error?.details,
    request_id: options.requestId,
  }),
}));

jest.mock('../../supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: () => mockCreateRequestId(),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Moderation.ts', () => ({
  buildInitialSocialModerationFields: (...args: unknown[]) =>
    mockBuildInitialSocialModerationFields(...args),
  resolveSocialPublishModerationResult: (...args: unknown[]) =>
    mockResolveSocialPublishModerationResult(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Social.ts', () => ({
  assertCommentableSocialPost: (...args: unknown[]) =>
    mockAssertCommentableSocialPost(...args),
  assertNoRecentDuplicateComment: (...args: unknown[]) =>
    mockAssertNoRecentDuplicateComment(...args),
  fetchViewerProfileSnapshot: (...args: unknown[]) =>
    mockFetchViewerProfileSnapshot(...args),
  getSocialRateLimit: (...args: unknown[]) => mockGetSocialRateLimit(...args),
  getSocialRejectionCooldown: (...args: unknown[]) =>
    mockGetSocialRejectionCooldown(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  normalizeSocialText: (...args: unknown[]) => mockNormalizeSocialText(...args),
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
}));

function createInsertChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: jest.fn(() => chain),
    single: jest.fn(() => Promise.resolve(result)),
  };
  const insert = jest.fn(() => chain);

  return {
    insert,
    chain,
  };
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-create-comment/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-create-comment edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'viewer-1' });
    mockEnsureUserProfileExistsForAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
    });
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
      social_comments_enabled: true,
      moderation_enabled: false,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockParseSocialCreateCommentRequest.mockReturnValue({
      post_id: 'post-1',
      content_text: 'Great progress',
    });
    mockAssertCommentableSocialPost.mockResolvedValue(undefined);
    mockGetSocialRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
    });
    mockGetSocialRejectionCooldown.mockResolvedValue({
      active: false,
    });
    mockFetchViewerProfileSnapshot.mockResolvedValue({
      username: 'viewer',
      avatar_url: null,
    });
    mockNormalizeSocialText.mockReturnValue('Great progress');
    mockSha256Hex.mockResolvedValue('hash-1');
    mockResolveSocialPublishModerationResult.mockReturnValue({
      moderation_state: 'approved',
    });
    mockBuildInitialSocialModerationFields.mockReturnValue({});
    mockAssertNoRecentDuplicateComment.mockResolvedValue(undefined);
    mockCreatePhase2DatabaseError.mockReturnValue(
      new MockPhase2HttpError(
        500,
        'social_comment_create_failed',
        'Failed to create social comment',
      ),
    );
  });

  it('passes the target post into the recent duplicate comment check', async () => {
    const { insert } = createInsertChain({
      data: {
        id: 'comment-1',
        post_id: 'post-1',
        moderation_state: 'approved',
      },
      error: null,
    });
    const supabaseClient = {
      rpc: jest.fn(async () => ({ data: false, error: null })),
      from: jest.fn(() => ({
        insert,
      })),
    };
    mockCreateServiceRoleClient.mockReturnValue(supabaseClient);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-create-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      comment_id: 'comment-1',
      post_id: 'post-1',
      moderation_state: 'approved',
      published: true,
      rate_limit: {
        allowed: true,
        remaining: 9,
      },
      cooldown: {
        active: false,
      },
    });
    expect(mockAssertNoRecentDuplicateComment).toHaveBeenCalledWith(
      supabaseClient,
      'viewer-1',
      'post-1',
      'hash-1',
    );
  });
});
