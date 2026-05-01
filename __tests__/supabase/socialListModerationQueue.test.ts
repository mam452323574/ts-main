const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockRequireAdminUserProfile = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockCreatePhase2DatabaseError = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();

class MockPhase2HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
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
  requireAdminUserProfile: (...args: unknown[]) =>
    mockRequireAdminUserProfile(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Config.ts', () => ({
  loadPhase2FeatureFlags: (...args: unknown[]) =>
    mockLoadPhase2FeatureFlags(...args),
  requireFeatureEnabled: (...args: unknown[]) =>
    mockRequireFeatureEnabled(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: () => mockCreateRequestId(),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  createPhase2DatabaseError: (...args: unknown[]) =>
    mockCreatePhase2DatabaseError(...args),
  Phase2HttpError: MockPhase2HttpError,
  getPhase2ErrorStatus: (error: { status?: number }) => error?.status ?? 500,
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

function createQueuePayload(
  rows: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    items: rows,
    pending_count: 1,
    flagged_count: 0,
    reported_count: 1,
    needs_review_count: 1,
    processed_count: 2,
    limit: 50,
    has_more: false,
    ...overrides,
  };
}

function createQueueClient(options: {
  data: unknown;
  error: unknown;
  auditError?: unknown;
}) {
  const rpc = jest.fn().mockResolvedValue({
    data: options.data,
    error: options.error,
  });
  const auditInsert = jest.fn().mockResolvedValue({
    error: options.auditError ?? null,
  });
  const from = jest.fn((tableName: string) => {
    if (tableName !== 'admin_audit_events') {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return {
      insert: auditInsert,
    };
  });

  return {
    rpc,
    from,
    auditInsert,
  };
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/social-list-moderation-queue/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

function createQueueRows() {
  return [
    {
      content_type: 'post',
      content_id: 'pending-post',
      author_id: 'author-1',
      author_username: 'alice',
      category: 'food',
      content_text: 'Pending review',
      asset_url: null,
      moderation_state: 'pending',
      moderation_reason: null,
      moderation_provider: null,
      created_at: '2026-04-14T08:00:00.000Z',
      open_reports: 1,
      total_reports_24h: 1,
      unique_reporters_24h: 1,
      unique_viewer_count: 4,
      reason_codes: ['harassment'],
      last_reported_at: '2026-04-14T08:10:00.000Z',
      moderation_queued_at: '2026-04-14T08:05:00.000Z',
      moderation_claimed_at: null,
      moderation_completed_at: null,
      moderation_attempt_count: 0,
      moderation_last_error: null,
      raw_like_count: 6,
      raw_dislike_count: 1,
      admin_like_adjustment: -8,
      admin_dislike_adjustment: 2,
      effective_like_count: 0,
      effective_dislike_count: 3,
      author_active_bans: [],
    },
    {
      content_type: 'comment',
      content_id: 'reported-comment',
      author_id: 'author-2',
      author_username: 'bob',
      category: null,
      content_text: 'Approved but still reported',
      asset_url: null,
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      created_at: '2026-04-14T07:00:00.000Z',
      open_reports: 3,
      total_reports_24h: 3,
      unique_reporters_24h: 2,
      unique_viewer_count: 0,
      reason_codes: ['spam_repeat'],
      last_reported_at: '2026-04-14T07:10:00.000Z',
      moderation_queued_at: '2026-04-14T07:05:00.000Z',
      moderation_claimed_at: null,
      moderation_completed_at: '2026-04-14T07:30:00.000Z',
      moderation_attempt_count: 0,
      moderation_last_error: null,
      raw_like_count: 0,
      raw_dislike_count: 0,
      admin_like_adjustment: 0,
      admin_dislike_adjustment: 0,
      effective_like_count: 0,
      effective_dislike_count: 0,
      author_active_bans: [],
    },
    {
      content_type: 'post',
      content_id: 'already-clean',
      author_id: 'author-3',
      author_username: 'charlie',
      category: 'before_after',
      content_text: 'Already resolved',
      asset_url: null,
      moderation_state: 'approved',
      moderation_reason: null,
      moderation_provider: null,
      created_at: '2026-04-14T06:00:00.000Z',
      open_reports: 0,
      total_reports_24h: 0,
      unique_reporters_24h: 0,
      unique_viewer_count: 2,
      reason_codes: [],
      last_reported_at: null,
      moderation_queued_at: '2026-04-14T06:05:00.000Z',
      moderation_claimed_at: null,
      moderation_completed_at: '2026-04-14T09:30:00.000Z',
      moderation_attempt_count: 1,
      moderation_last_error: null,
      raw_like_count: 4,
      raw_dislike_count: 0,
      admin_like_adjustment: 3,
      admin_dislike_adjustment: 0,
      effective_like_count: 7,
      effective_dislike_count: 0,
      author_active_bans: [],
    },
  ];
}

describe('social-list-moderation-queue edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when the authenticated user is not an admin', async () => {
    mockCreateServiceRoleClient.mockReturnValue({});
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'viewer-1',
    });
    mockRequireAdminUserProfile.mockRejectedValue(
      new MockPhase2HttpError(403, 'admin_only', 'Admin access required'),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-list-moderation-queue', {
        method: 'GET',
      }),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'admin_only',
      error: 'Admin access required',
      request_id: 'request-1',
    });
  });

  it('returns processed moderation items for admins when the processed filter is selected', async () => {
    const queueClient = createQueueClient({
      data: createQueuePayload(createQueueRows(), {
        limit: 2,
        has_more: true,
      }),
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue(queueClient);
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'admin-1',
    });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request(
        'https://example.com/functions/v1/social-list-moderation-queue?filter=processed&limit=2',
        {
          method: 'GET',
        },
      ),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      pending_count: 1,
      flagged_count: 0,
      reported_count: 1,
      needs_review_count: 1,
      processed_count: 2,
      limit: 2,
      has_more: true,
      next_cursor: 'Mg',
      items: [
        expect.objectContaining({
          content_id: 'already-clean',
          moderation_state: 'approved',
          unique_viewer_count: 2,
          raw_like_count: 4,
          admin_like_adjustment: 3,
          effective_like_count: 7,
        }),
        expect.objectContaining({
          content_id: 'reported-comment',
          moderation_state: 'approved',
          unique_viewer_count: 0,
        }),
      ],
    });
    expect(queueClient.rpc).toHaveBeenCalledWith(
      'list_social_moderation_queue_page',
      {
        p_filter: 'processed',
        p_limit: 2,
        p_offset: 0,
      },
    );
    expect(queueClient.from).toHaveBeenCalledWith('admin_audit_events');
    expect(queueClient.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-1',
        action: 'social_moderation_queue.list',
        request_id: 'request-1',
        metadata: {
          filter: 'processed',
          limit: 2,
          offset: 0,
        },
      }),
    );
    expect(mockRequireFeatureEnabled).toHaveBeenCalledWith(
      true,
      'social_disabled',
      'Social moderation is currently disabled',
    );
  });

  it('defaults optional enrichment fields when the queue view omits them', async () => {
    const partialQueueRow = {
      ...createQueueRows()[0],
    };

    delete (partialQueueRow as Record<string, unknown>).unique_viewer_count;
    delete (partialQueueRow as Record<string, unknown>).raw_like_count;
    delete (partialQueueRow as Record<string, unknown>).raw_dislike_count;
    delete (partialQueueRow as Record<string, unknown>).admin_like_adjustment;
    delete (partialQueueRow as Record<string, unknown>).admin_dislike_adjustment;
    delete (partialQueueRow as Record<string, unknown>).effective_like_count;
    delete (partialQueueRow as Record<string, unknown>).effective_dislike_count;
    delete (partialQueueRow as Record<string, unknown>).author_active_bans;

    const queueClient = createQueueClient({
      data: createQueuePayload([partialQueueRow]),
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue(queueClient);
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'admin-1',
    });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-list-moderation-queue', {
        method: 'GET',
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      items: [
        expect.objectContaining({
          content_id: 'pending-post',
          unique_viewer_count: 0,
          raw_like_count: 0,
          raw_dislike_count: 0,
          admin_like_adjustment: 0,
          admin_dislike_adjustment: 0,
          effective_like_count: 0,
          effective_dislike_count: 0,
          author_active_bans: [],
        }),
      ],
    });
    expect(queueClient.rpc).toHaveBeenCalledWith(
      'list_social_moderation_queue_page',
      {
        p_filter: 'needs_review',
        p_limit: 50,
        p_offset: 0,
      },
    );
  });

  it('rejects queue rows that are missing structural identifiers', async () => {
    const invalidQueueRow = {
      ...createQueueRows()[0],
      content_id: null,
    };
    const queueClient = createQueueClient({
      data: createQueuePayload([invalidQueueRow]),
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue(queueClient);
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'admin-1',
    });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-list-moderation-queue', {
        method: 'GET',
      }),
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toMatchObject({
      success: false,
      code: 'social_admin_queue_invalid_payload',
      error: 'Social moderation queue returned an invalid item payload',
      status: 500,
      request_id: 'request-1',
      details: {
        item_index: 0,
      },
    });
  });

  it('maps moderation queue schema drift to a structured database error payload', async () => {
    const queueError = {
      code: '42703',
      message: 'column "unique_viewer_count" does not exist',
    };
    const queueClient = createQueueClient({
      data: [],
      error: queueError,
    });

    mockCreateServiceRoleClient.mockReturnValue(queueClient);
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'admin-1',
    });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      social_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockCreatePhase2DatabaseError.mockReturnValue(
      new MockPhase2HttpError(
        503,
        'database_column_missing',
        'Social moderation queue listing requires the "unique_viewer_count" column on the configured Supabase project.',
      ),
    );

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-list-moderation-queue', {
        method: 'GET',
      }),
    );

    expect(mockCreatePhase2DatabaseError).toHaveBeenCalledWith(queueError, {
      contextLabel: 'Social moderation queue listing',
      fallbackCode: 'social_moderation_queue_fetch_failed',
      fallbackMessage: 'Failed to load the social moderation queue',
      relationName: 'social_moderation_queue',
      rpcName: 'list_social_moderation_queue_page',
    });
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      success: false,
      code: 'database_column_missing',
      error:
        'Social moderation queue listing requires the "unique_viewer_count" column on the configured Supabase project.',
      status: 503,
      request_id: 'request-1',
    });
  });

  it('rejects invalid moderation queue filters explicitly', async () => {
    mockCreateServiceRoleClient.mockReturnValue({});
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'admin-1',
    });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);

    const handler = await loadHandler();
    const response = await handler?.(
      new Request(
        'https://example.com/functions/v1/social-list-moderation-queue?filter=bad-filter',
        {
          method: 'GET',
        },
      ),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: 'invalid_filter',
      error: 'filter must be one of needs_review, reported, or processed',
      request_id: 'request-1',
    });
  });
});
