const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockEnsureUserProfileExistsForAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialUpdateCommentRequest = jest.fn();
const mockCreatePhase2DatabaseError = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockBuildInitialSocialModerationFields = jest.fn();
const mockAssertEditableSocialComment = jest.fn();
const mockAssertNoRecentDuplicateCommentExcluding = jest.fn();
const mockGetSocialCommentSnapshotForUser = jest.fn();
const mockGetSocialRejectionCooldown = jest.fn();
const mockNormalizeSocialText = jest.fn();
const mockSha256Hex = jest.fn();

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
  parseSocialUpdateCommentRequest: (...args: unknown[]) =>
    mockParseSocialUpdateCommentRequest(...args),
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

jest.mock('../../supabase/functions/_shared/phase2Moderation.ts', () => ({
  buildInitialSocialModerationFields: (...args: unknown[]) =>
    mockBuildInitialSocialModerationFields(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Social.ts', () => ({
  assertEditableSocialComment: (...args: unknown[]) =>
    mockAssertEditableSocialComment(...args),
  assertNoRecentDuplicateCommentExcluding: (...args: unknown[]) =>
    mockAssertNoRecentDuplicateCommentExcluding(...args),
  getSocialCommentSnapshotForUser: (...args: unknown[]) =>
    mockGetSocialCommentSnapshotForUser(...args),
  getSocialRejectionCooldown: (...args: unknown[]) =>
    mockGetSocialRejectionCooldown(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  normalizeSocialText: (...args: unknown[]) => mockNormalizeSocialText(...args),
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
}));

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
    require('@/supabase/functions/social-update-comment/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-update-comment edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'viewer-1' });
    mockEnsureUserProfileExistsForAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
    });
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
      social_comments_enabled: true,
      moderation_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockParseSocialUpdateCommentRequest.mockReturnValue({
      comment_id: 'comment-1',
      content_text: 'Edited comment',
    });
    mockAssertEditableSocialComment.mockResolvedValue({
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'viewer-1',
      content_text: 'Original comment',
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      moderation_summary_json: {
        edit_count: 1,
      },
      content_hash: 'previous-hash',
    });
    mockGetSocialRejectionCooldown.mockResolvedValue({
      active: false,
    });
    mockNormalizeSocialText.mockReturnValue('Edited comment');
    mockSha256Hex.mockResolvedValue('hash-2');
    mockAssertNoRecentDuplicateCommentExcluding.mockResolvedValue(undefined);
    mockBuildInitialSocialModerationFields.mockReturnValue({
      moderation_queued_at: '2026-04-17T10:00:00.000Z',
    });
    mockGetSocialCommentSnapshotForUser.mockResolvedValue({
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'viewer-1',
      author_username: 'viewer',
      author_avatar_url: null,
      content_text: 'Edited comment',
      created_at: '2026-04-06T12:00:00.000Z',
      like_count: 2,
      viewer_has_liked: false,
      moderation_status: 'pending',
      moderation_state: 'pending',
      moderation_reason: null,
      moderation_provider: null,
      rejection_count: 1,
      last_rejected_at: null,
      deleted_at: null,
    });
  });

  it('registers a request handler when the module loads', async () => {
    const handler = await loadHandler();

    expect(typeof handler).toBe('function');
  });

  it('returns the updated comment snapshot expected by the client contract', async () => {
    const updateChain = createUpdateChain({
      data: {
        id: 'comment-1',
      },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        update: jest.fn(() => updateChain),
      })),
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-update-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      comment: expect.objectContaining({
        id: 'comment-1',
        post_id: 'post-1',
        content_text: 'Edited comment',
        moderation_state: 'pending',
      }),
    });
    expect(mockGetSocialCommentSnapshotForUser).toHaveBeenCalledWith(
      expect.anything(),
      'viewer-1',
      'comment-1',
    );
  });

  it('returns the current comment snapshot without writing when the normalized text is unchanged', async () => {
    const from = jest.fn();
    mockCreateServiceRoleClient.mockReturnValue({ from });
    mockAssertEditableSocialComment.mockResolvedValueOnce({
      id: 'comment-1',
      post_id: 'post-1',
      author_id: 'viewer-1',
      content_text: 'Edited comment',
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      moderation_summary_json: {
        edit_count: 1,
      },
      content_hash: 'previous-hash',
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-update-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({
      success: true,
      comment: expect.objectContaining({
        id: 'comment-1',
        post_id: 'post-1',
        content_text: 'Edited comment',
      }),
    });
    expect(from).not.toHaveBeenCalled();
    expect(mockGetSocialRejectionCooldown).not.toHaveBeenCalled();
    expect(
      mockAssertNoRecentDuplicateCommentExcluding,
    ).not.toHaveBeenCalled();
    expect(
      mockEnsureUserProfileExistsForAuthenticatedUser,
    ).not.toHaveBeenCalled();
  });

  it('returns a 403 payload when the viewer cannot edit the targeted comment', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(),
    });
    mockAssertEditableSocialComment.mockRejectedValueOnce(
      new MockPhase2HttpError(
        403,
        'comment_edit_forbidden',
        'Only the author can edit this social comment',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-update-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Only the author can edit this social comment',
      code: 'comment_edit_forbidden',
      request_id: 'request-1',
    });
    expect(mockLogPhase2Error).toHaveBeenCalled();
  });

  it('propagates database update failures through the phase2 error envelope', async () => {
    const updateError = {
      code: '23514',
      message: 'violates check constraint',
    };
    const updateChain = createUpdateChain({
      data: null,
      error: updateError,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        update: jest.fn(() => updateChain),
      })),
    });
    mockCreatePhase2DatabaseError.mockReturnValueOnce(
      new MockPhase2HttpError(
        500,
        'social_comment_update_failed',
        'Failed to update social comment',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-update-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Failed to update social comment',
      code: 'social_comment_update_failed',
      request_id: 'request-1',
    });
    expect(mockCreatePhase2DatabaseError).toHaveBeenCalledWith(
      updateError,
      expect.objectContaining({
        fallbackCode: 'social_comment_update_failed',
        relationName: 'social_comments',
      }),
    );
  });

  it('propagates snapshot lookup failures after a successful update', async () => {
    const updateChain = createUpdateChain({
      data: {
        id: 'comment-1',
      },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        update: jest.fn(() => updateChain),
      })),
    });
    mockGetSocialCommentSnapshotForUser.mockRejectedValueOnce(
      new MockPhase2HttpError(
        500,
        'social_comment_snapshot_failed',
        'Failed to load the updated social comment',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-update-comment', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Failed to load the updated social comment',
      code: 'social_comment_snapshot_failed',
      request_id: 'request-1',
    });
  });
});
