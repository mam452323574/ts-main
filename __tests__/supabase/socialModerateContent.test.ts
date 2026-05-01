const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockRequireAdminUserProfile = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseSocialModerateContentRequest = jest.fn();
const mockReadJsonBody = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();
const mockApplySocialModerationDecisionToTarget = jest.fn();
const mockCreateSocialModerationEvent = jest.fn();
const mockResolveModerationStateForAction = jest.fn();
const mockResolveSocialReportWorkflowStatusForDecision = jest.fn();
const mockUpdateLinkedSocialReportsForModerationDecision = jest.fn();

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
  parseSocialModerateContentRequest: (...args: unknown[]) =>
    mockParseSocialModerateContentRequest(...args),
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
  applySocialModerationDecisionToTarget: (...args: unknown[]) =>
    mockApplySocialModerationDecisionToTarget(...args),
  createSocialModerationEvent: (...args: unknown[]) =>
    mockCreateSocialModerationEvent(...args),
  resolveModerationStateForAction: (...args: unknown[]) =>
    mockResolveModerationStateForAction(...args),
  resolveSocialReportWorkflowStatusForDecision: (...args: unknown[]) =>
    mockResolveSocialReportWorkflowStatusForDecision(...args),
  updateLinkedSocialReportsForModerationDecision: (...args: unknown[]) =>
    mockUpdateLinkedSocialReportsForModerationDecision(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Utils.ts', () => ({
  PHASE2_SOCIAL_REQUEST_MAX_BYTES: 50000,
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
}));

function createMaybeSingleChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    eq: jest.fn(() => chain),
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
    require('@/supabase/functions/social-moderate-content/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

describe('social-moderate-content edge function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'admin-1' });
    mockRequireAdminUserProfile.mockResolvedValue(undefined);
    mockLoadPhase2FeatureFlags.mockResolvedValue({ social_enabled: true });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockReadJsonBody.mockResolvedValue({});
    mockUpdateLinkedSocialReportsForModerationDecision.mockResolvedValue([
      'report-1',
      'report-2',
    ]);
    mockCreateSocialModerationEvent.mockResolvedValue('event-1');
    mockResolveSocialReportWorkflowStatusForDecision.mockReturnValue('resolved');
  });

  it('supports approved to rejected moderation reversals and records an audit event', async () => {
    mockParseSocialModerateContentRequest.mockReturnValue({
      target_type: 'post',
      target_post_id: 'post-1',
      action: 'reject',
      reason_code: 'admin_reject',
    });
    mockResolveModerationStateForAction.mockReturnValue('rejected');
    mockApplySocialModerationDecisionToTarget.mockResolvedValue({
      id: 'post-1',
      moderation_state: 'rejected',
    });

    const existingTargetQuery = createMaybeSingleChain({
      data: {
        id: 'post-1',
        author_id: 'author-1',
        moderation_state: 'approved',
        moderation_reason: null,
        deleted_at: null,
      },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => existingTargetQuery),
      })),
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-moderate-content', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      action: 'reject',
      moderation_state: 'rejected',
      event_id: 'event-1',
    });
    expect(mockApplySocialModerationDecisionToTarget).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targetType: 'post',
        targetId: 'post-1',
        nextState: 'rejected',
      }),
    );
    expect(mockCreateSocialModerationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'reject',
        previousState: 'approved',
        nextState: 'rejected',
      }),
    );
  });

  it('supports rejected or removed content being restored to approved with an audit trail', async () => {
    mockParseSocialModerateContentRequest.mockReturnValue({
      target_type: 'comment',
      target_comment_id: 'comment-1',
      action: 'restore',
    });
    mockResolveModerationStateForAction.mockReturnValue('approved');
    mockApplySocialModerationDecisionToTarget.mockResolvedValue({
      id: 'comment-1',
      moderation_state: 'approved',
    });

    const existingTargetQuery = createMaybeSingleChain({
      data: {
        id: 'comment-1',
        author_id: 'author-2',
        moderation_state: 'removed',
        moderation_reason: 'admin_remove',
        deleted_at: null,
      },
      error: null,
    });

    mockCreateServiceRoleClient.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => existingTargetQuery),
      })),
    });

    const handler = await loadHandler();
    const response = await handler?.(
      new Request('https://example.com/functions/v1/social-moderate-content', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      action: 'restore',
      moderation_state: 'approved',
      event_id: 'event-1',
    });
    expect(mockCreateSocialModerationEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'restore',
        previousState: 'removed',
        nextState: 'approved',
      }),
    );
  });
});
