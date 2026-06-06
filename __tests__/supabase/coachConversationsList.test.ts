const mockCreateServiceRoleClient = jest.fn();
const mockCreateAuthenticatedRequestClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockCreateRequestId = jest.fn(() => 'request-1');
const mockLogPhase2Error = jest.fn();

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
  createAuthenticatedRequestClient: (...args: unknown[]) =>
    mockCreateAuthenticatedRequestClient(...args),
  requireAuthenticatedUser: (...args: unknown[]) =>
    mockRequireAuthenticatedUser(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Config.ts', () => ({
  loadPhase2FeatureFlags: (...args: unknown[]) =>
    mockLoadPhase2FeatureFlags(...args),
  requireFeatureEnabled: (...args: unknown[]) =>
    mockRequireFeatureEnabled(...args),
}));

jest.mock('../../supabase/functions/_shared/phase2Errors.ts', () => ({
  createPhase2DatabaseError: jest.fn(
    () =>
      new MockPhase2HttpError(
        500,
        'coach_conversations_list_failed',
        'Failed to load Coach conversations',
      ),
  ),
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

function createConversationRow(userId: string) {
  return {
    id: `conversation-${userId}`,
    user_id: userId,
    updated_at: '2026-05-27T09:00:00.000Z',
    persona_key: 'patient_calm',
    title: null,
    first_user_message_preview: 'Je veux mieux dormir',
    last_message_preview: 'Regardons votre routine.',
  };
}

async function loadHandler() {
  jest.resetModules();
  (global as any).Deno = {
    serve: jest.fn(),
  };

  jest.isolateModules(() => {
    require('@/supabase/functions/coach-conversations-list/index.ts');
  });

  return (global as any).Deno.serve.mock.calls[0]?.[0] as
    | ((req: Request) => Promise<Response>)
    | undefined;
}

function createRequest(payload: Record<string, unknown> = {
  persona_key: 'patient_calm',
  limit: 20,
}) {
  return new Request('https://example.com/functions/v1/coach-conversations-list', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

describe('coach-conversations-list edge function', () => {
  let serviceRole: { rpc: jest.Mock };
  let authenticatedClient: { rpc: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    serviceRole = { rpc: jest.fn() };
    authenticatedClient = {
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockCreateServiceRoleClient.mockReturnValue(serviceRole);
    mockCreateAuthenticatedRequestClient.mockReturnValue(authenticatedClient);
    mockRequireAuthenticatedUser.mockResolvedValue({ id: 'user-a' });
    mockLoadPhase2FeatureFlags.mockResolvedValue({
      coach_chat_enabled: true,
    });
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
  });

  it('uses the bearer-authenticated client for the RLS RPC and returns user A conversations', async () => {
    const userConversation = createConversationRow('user-a');
    authenticatedClient.rpc.mockResolvedValueOnce({
      data: [userConversation],
      error: null,
    });
    const req = createRequest();
    const handler = await loadHandler();
    const response = await handler?.(req);

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      items: [userConversation],
      has_more: false,
    });
    expect(mockRequireAuthenticatedUser).toHaveBeenCalledWith(serviceRole, req);
    expect(mockLoadPhase2FeatureFlags).toHaveBeenCalledWith(serviceRole);
    expect(mockCreateAuthenticatedRequestClient).toHaveBeenCalledWith(req);
    expect(serviceRole.rpc).not.toHaveBeenCalled();
    expect(authenticatedClient.rpc).toHaveBeenCalledWith(
      'get_coach_conversations_page',
      {
        p_limit: 21,
        p_cursor_updated_at: null,
        p_cursor_id: null,
        p_include_archived: false,
        p_include_hidden: false,
        p_persona_key: 'patient_calm',
      },
    );
    expect(authenticatedClient.rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_user_id');
  });

  it('never exposes a row owned by another authenticated user', async () => {
    mockRequireAuthenticatedUser.mockResolvedValueOnce({ id: 'user-b' });
    authenticatedClient.rpc.mockResolvedValueOnce({
      data: [createConversationRow('user-a')],
      error: null,
    });
    const handler = await loadHandler();
    const response = await handler?.(createRequest());

    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      items: [],
    });
  });

  it('returns an empty inbox only when the authenticated RPC has no matching coach conversation', async () => {
    authenticatedClient.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });
    const handler = await loadHandler();
    const response = await handler?.(createRequest());

    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      items: [],
      has_more: false,
      next_cursor: null,
    });
    expect(authenticatedClient.rpc).toHaveBeenCalledWith(
      'get_coach_conversations_page',
      expect.objectContaining({
        p_persona_key: 'patient_calm',
      }),
    );
  });

  it('passes p_persona_key=null to the RPC for the global inbox', async () => {
    const userConversation = createConversationRow('user-a');
    authenticatedClient.rpc.mockResolvedValueOnce({
      data: [userConversation],
      error: null,
    });

    const handler = await loadHandler();
    const response = await handler?.(createRequest({
      persona_key: null,
      limit: 20,
    }));

    await expect(response?.json()).resolves.toMatchObject({
      success: true,
      items: [userConversation],
    });
    expect(authenticatedClient.rpc).toHaveBeenCalledWith(
      'get_coach_conversations_page',
      expect.objectContaining({
        p_persona_key: null,
      }),
    );
  });
});
