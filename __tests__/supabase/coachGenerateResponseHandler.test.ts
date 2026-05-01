const mockHandleCorsPreflightRequest = jest.fn();
const mockJsonResponse = jest.fn((req: Request, payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
);
const mockPostCoachGenerateWebhook = jest.fn();
const mockRequireCoachGenerateWebhookEndpoints = jest.fn();
const mockCreateServiceRoleClient = jest.fn();
const mockRequireAuthenticatedUser = jest.fn();
const mockLoadPhase2FeatureFlags = jest.fn();
const mockRequireFeatureEnabled = jest.fn();
const mockParseCoachGenerateRequest = jest.fn();
const mockCreateRequestId = jest.fn();
const mockLogPhase2Error = jest.fn();
const mockBuildNormalizedPayloadHash = jest.fn();
const mockReadJsonBody = jest.fn();

jest.mock('@/supabase/functions/_shared/cors.ts', () => ({
  handleCorsPreflightRequest: ((...args: Parameters<typeof mockHandleCorsPreflightRequest>) =>
    mockHandleCorsPreflightRequest(...args)) as typeof mockHandleCorsPreflightRequest,
  validateCorsOrigin: jest.fn(() => null),
  jsonResponse: ((req: Request, payload: unknown, init?: ResponseInit) =>
    mockJsonResponse(req, payload, init)) as typeof mockJsonResponse,
}));

jest.mock('@/supabase/functions/_shared/coachProvider.ts', () => ({
  COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS: 45_000,
  COACH_RESPONSE_TOO_LARGE_ERROR_CODE: 'coach_response_too_large',
  postCoachGenerateWebhook: (...args: unknown[]) =>
    mockPostCoachGenerateWebhook(...args),
  requireCoachGenerateWebhookEndpoints: (...args: unknown[]) =>
    mockRequireCoachGenerateWebhookEndpoints(...args),
}));

jest.mock('@/supabase/functions/_shared/phase2Auth.ts', () => ({
  createServiceRoleClient: (...args: unknown[]) =>
    mockCreateServiceRoleClient(...args),
  requireAuthenticatedUser: (...args: unknown[]) =>
    mockRequireAuthenticatedUser(...args),
}));

jest.mock('@/supabase/functions/_shared/phase2Config.ts', () => ({
  loadPhase2FeatureFlags: (...args: unknown[]) =>
    mockLoadPhase2FeatureFlags(...args),
  requireFeatureEnabled: (...args: unknown[]) =>
    mockRequireFeatureEnabled(...args),
}));

jest.mock('@/supabase/functions/_shared/phase2Contracts.ts', () => ({
  parseCoachGenerateRequest: (...args: unknown[]) =>
    mockParseCoachGenerateRequest(...args),
}));

jest.mock('@/supabase/functions/_shared/phase2Observability.ts', () => ({
  createRequestId: (...args: unknown[]) => mockCreateRequestId(...args),
  logPhase2Error: (...args: unknown[]) => mockLogPhase2Error(...args),
  summarizeProviderPayload: jest.fn((payload: unknown, extras: Record<string, unknown>) => ({
    ...(typeof payload === 'object' && payload ? payload : {}),
    ...extras,
  })),
  summarizeWebhookResult: jest.fn((result: Record<string, unknown>, extras: Record<string, unknown>) => ({
    ...result,
    ...extras,
  })),
}));

jest.mock('@/supabase/functions/_shared/phase2Utils.ts', () => ({
  ...jest.requireActual('@/supabase/functions/_shared/phase2Utils.ts'),
  buildNormalizedPayloadHash: (...args: unknown[]) =>
    mockBuildNormalizedPayloadHash(...args),
  readJsonBody: (...args: unknown[]) => mockReadJsonBody(...args),
}));

import { getCoachPersona } from '@/shared/coachPersonas';
import {
  COACH_GENERATE_REQUEST_MAX_BYTES,
  handleCoachGenerateResponseRequest,
  runPendingCoachGenerationTask,
} from '@/supabase/functions/coach-generate-response/handler.ts';

function createFeatureFlags() {
  return {
    scope: 'mobile',
    social_enabled: false,
    coach_enabled: true,
    entry_offer_enabled: false,
    social_comments_enabled: false,
    moderation_enabled: false,
    entry_offer_offering_id: null,
    rollout_percentage: null,
    post_rate_limit_per_day: 3,
    comment_rate_limit_per_hour: 10,
    report_rate_limit_per_day: 10,
    repeated_rejection_threshold: 3,
    rejected_content_cooldown_hours: 24,
    coach_cache_ttl_minutes: 720,
  };
}

function createQuotaStatus(overrides: Record<string, unknown> = {}) {
  return {
    account_tier: 'premium',
    limit: 8,
    used_count: 1,
    available: 7,
    next_recharge_at: '2026-04-07T10:00:00.000Z',
    unlimited: false,
    window_seconds: 86400,
    as_of: '2026-04-06T10:00:00.000Z',
    ...overrides,
  };
}

function createRequestClient(options: {
  accountTier?: string;
  cacheKey?: string;
  existingEntry?: Record<string, unknown> | null;
  pendingEntry?: Record<string, unknown>;
  rateLimitResult?: { allowed: boolean; window_exceeded?: string } | null;
  rateLimitError?: { code?: string; message?: string } | null;
  quotaReservation?: Record<string, unknown>;
}) {
  const accountTier = options.accountTier ?? 'premium';
  const cacheKey = options.cacheKey ?? 'cache-key-1';
  const existingEntry = options.existingEntry ?? null;
  const pendingEntry =
    options.pendingEntry ??
    ({
      id: 'entry-pending',
      persona_key: 'gentle_supportive',
      status: 'pending',
      title: null,
      body: null,
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: null,
      response_payload_json: {},
    } as Record<string, unknown>);
  const rateLimitResult = options.rateLimitResult ?? { allowed: true };
  const rateLimitError = options.rateLimitError ?? null;
  const quotaReservation =
    options.quotaReservation ??
    ({
      success: true,
      allowed: true,
      code: null,
      usage_event_id: 'usage-1',
      quota: createQuotaStatus(),
    } as Record<string, unknown>);

  return {
    rpc: jest.fn((rpcName: string) => {
      if (rpcName === 'record_coach_generation_attempt') {
        return Promise.resolve({
          data: rateLimitError ? null : rateLimitResult,
          error: rateLimitError,
        });
      }

      if (rpcName === 'compute_coach_cache_key') {
        return Promise.resolve({
          data: cacheKey,
          error: null,
        });
      }

      if (rpcName === 'reserve_coach_quota') {
        return Promise.resolve({
          data: quotaReservation,
          error: null,
        });
      }

      if (rpcName === 'attach_coach_quota_event') {
        return Promise.resolve({
          data: {
            success: true,
            attached: true,
            quota: createQuotaStatus(),
          },
          error: null,
        });
      }

      if (rpcName === 'refund_coach_quota_event') {
        return Promise.resolve({
          data: {
            success: true,
            refunded: true,
            quota: createQuotaStatus({ available: 8, used_count: 0 }),
          },
          error: null,
        });
      }

      return Promise.resolve({
        data: null,
        error: { code: 'unexpected_rpc', message: rpcName },
      });
    }),
    from: jest.fn((tableName: string) => {
      if (tableName === 'user_profiles') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: {
                  account_tier: accountTier,
                },
                error: null,
              }),
            })),
          })),
        };
      }

      if (tableName === 'coach_entries') {
        return {
          select: jest.fn(() => {
            const filters: {
              eq: jest.Mock;
              maybeSingle: jest.Mock;
            } = {
              eq: jest.fn(() => filters),
              maybeSingle: jest.fn().mockResolvedValue({
                data: existingEntry,
                error: null,
              }),
            };

            return filters;
          }),
          upsert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({
                data: pendingEntry,
                error: null,
              }),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${tableName}`);
    }),
  };
}

function createWorkerClient() {
  const updates: Array<{
    payload: Record<string, unknown>;
    columnName: string;
    value: string;
  }> = [];

  return {
    updates,
    client: {
      from: jest.fn((tableName: string) => {
        if (tableName !== 'coach_entries') {
          throw new Error(`Unexpected table ${tableName}`);
        }

        return {
          update: jest.fn((payload: Record<string, unknown>) => ({
            eq: jest.fn((columnName: string, value: string) => {
              updates.push({ payload, columnName, value });

              if (payload.status === 'ready') {
                return {
                  select: jest.fn(() => ({
                    single: jest.fn().mockResolvedValue({
                      data: {
                        id: value,
                        ...payload,
                      },
                      error: null,
                    }),
                  })),
                };
              }

              return Promise.resolve({
                data: null,
                error: null,
              });
            }),
          })),
        };
      }),
    },
  };
}

describe('coach generate response handler', () => {
  const originalEdgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: unknown;
  }).EdgeRuntime;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRequestId.mockReturnValue('req-1');
    mockReadJsonBody.mockResolvedValue({
      payload: {
        payload_version: 2,
        latest_scan: { scan_id: 'scan-1' },
      },
      persona_key: 'gentle_supportive',
    });
    mockParseCoachGenerateRequest.mockReturnValue({
      payload: {
        payload_version: 2,
        latest_scan: { scan_id: 'scan-1' },
      },
      persona_key: 'gentle_supportive',
    });
    mockBuildNormalizedPayloadHash.mockResolvedValue('hash-1');
    mockLoadPhase2FeatureFlags.mockResolvedValue(createFeatureFlags());
    mockRequireFeatureEnabled.mockImplementation(() => undefined);
    mockRequireAuthenticatedUser.mockResolvedValue({
      id: 'user-1',
    });
    mockRequireCoachGenerateWebhookEndpoints.mockResolvedValue({
      primaryUrl: 'https://primary.example/webhook',
      fallbackUrl: null,
    });
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { EdgeRuntime?: unknown }).EdgeRuntime =
      originalEdgeRuntime;
  });

  it('returns pending immediately and schedules background processing for fresh generations', async () => {
    const requestClient = createRequestClient({});
    let scheduledTask: Promise<unknown> | null = null;

    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));
    (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
    }).EdgeRuntime = {
      waitUntil: (task) => {
        scheduledTask = task;
      },
    };

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      cached: false,
      entry_id: 'entry-pending',
      status: 'pending',
      title: null,
      body: null,
      quota: expect.objectContaining({
        limit: 8,
        available: 7,
      }),
    });
    expect(scheduledTask).toBeTruthy();
    expect(mockPostCoachGenerateWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          entry_id: 'entry-pending',
          user_id: 'user-1',
        }),
      }),
    );
    expect(mockRequireCoachGenerateWebhookEndpoints).toHaveBeenCalledWith(
      requestClient,
      null,
      'req-1',
    );
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_generation',
      }),
    );
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'attach_coach_quota_event',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_coach_entry_id: 'entry-pending',
      }),
    );
    expect(mockReadJsonBody).toHaveBeenCalledWith(expect.any(Request), {
      maxBytes: COACH_GENERATE_REQUEST_MAX_BYTES,
    });
  });

  it('keeps cache hits synchronous and does not schedule background work', async () => {
    const existingEntry = {
      id: 'entry-ready',
      persona_key: 'gentle_supportive',
      status: 'ready',
      title: 'Cached guidance',
      body: 'Stay steady.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: '2099-04-12T10:00:00.000Z',
      response_payload_json: {},
    };
    const requestClient = createRequestClient({
      existingEntry,
    });
    const waitUntil = jest.fn();

    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: typeof waitUntil };
    }).EdgeRuntime = {
      waitUntil,
    };

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      cached: true,
      entry_id: 'entry-ready',
      status: 'ready',
      title: 'Cached guidance',
      body: 'Stay steady.',
      quota: expect.objectContaining({
        limit: 8,
        available: 7,
      }),
    });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(mockRequireCoachGenerateWebhookEndpoints).not.toHaveBeenCalled();
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_cache',
      }),
    );
  });

  it('rejects exhausted Coach product quota before creating entries or calling the provider', async () => {
    const requestClient = createRequestClient({
      quotaReservation: {
        success: true,
        allowed: false,
        code: 'coach_quota_exhausted',
        usage_event_id: null,
        quota: createQuotaStatus({
          account_tier: 'free',
          limit: 1,
          used_count: 1,
          available: 0,
          next_recharge_at: '2026-04-07T10:00:00.000Z',
        }),
      },
    });

    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'coach_quota_exhausted',
      details: expect.objectContaining({
        quota_limit: 1,
        quota_available: 0,
        quota_next_recharge_at: '2026-04-07T10:00:00.000Z',
      }),
    });
    expect(mockRequireCoachGenerateWebhookEndpoints).toHaveBeenCalledWith(
      requestClient,
      null,
      'req-1',
    );
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
  });

  it('rejects missing scan payload without consuming Coach quota', async () => {
    const requestClient = createRequestClient({});
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        recent_scans: [],
        latest_scan: null,
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'coach_no_usable_scan',
    });
    expect(requestClient.rpc).not.toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.anything(),
    );
    expect(mockRequireCoachGenerateWebhookEndpoints).not.toHaveBeenCalled();
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
  });

  it('updates the same pending entry to ready when the background task succeeds', async () => {
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: true,
        status: 200,
        payload: {
          title: 'Ready coach guidance',
          body: 'Keep the plan simple this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
        },
        bodyPresent: true,
        rawText: '{"title":"Ready coach guidance"}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    await runPendingCoachGenerationTask({
      cacheKey: 'cache-key-1',
      client,
      featureFlags: createFeatureFlags(),
      inputHash: 'hash-1',
      pendingEntry: {
        id: 'entry-pending',
      },
      persona: getCoachPersona('gentle_supportive'),
      requestBody: {
        payload: { payload_version: 2 },
        persona_key: 'gentle_supportive',
      },
      requestId: 'req-1',
      resolvedLocale: 'fr',
      userId: 'user-1',
      webhookEndpoints: {
        primaryUrl: 'https://primary.example/webhook',
        fallbackUrl: null,
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'ready',
        title: 'Ready coach guidance',
        body: 'Keep the plan simple this week.',
        locale: 'fr',
      }),
    });
  });

  it('marks the same pending entry as errored when the provider fails', async () => {
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: false,
        status: 503,
        payload: {
          error: 'temporary outage',
        },
        bodyPresent: true,
        rawText: '{"error":"temporary outage"}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-1',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-1',
        pendingEntry: {
          id: 'entry-pending',
        },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: { payload_version: 2 },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-1',
        resolvedLocale: 'fr',
        userId: 'user-1',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'coach_webhook_failed',
      status: 502,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'coach_webhook_503',
        response_payload_json: expect.objectContaining({
          request_id: 'req-1',
          provider: 'n8n',
          source: 'coach_generation',
          error_code: 'coach_webhook_503',
        }),
      }),
    });
  });

  it('marks the same pending entry as errored with request metadata when the provider payload is invalid', async () => {
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: true,
        status: 200,
        payload: {
          body: 'Missing title',
          source: 'coach-provider',
        },
        bodyPresent: true,
        rawText: '{"body":"Missing title"}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-1',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-1',
        pendingEntry: {
          id: 'entry-pending',
        },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: { payload_version: 2 },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-1',
        resolvedLocale: 'fr',
        userId: 'user-1',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'invalid_coach_response',
      status: 502,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'invalid_coach_response',
        response_payload_json: expect.objectContaining({
          request_id: 'req-1',
          webhook_status: 200,
          provider: 'n8n',
          source: 'coach_generation',
          error_code: 'invalid_coach_response',
          wrapper_source: 'root',
          title_present: false,
          body_present: true,
        }),
      }),
    });
  });

  it('rejects with 429 when the per-user rate limit is exceeded', async () => {
    const requestClient = createRequestClient({
      rateLimitResult: { allowed: false, window_exceeded: 'minute' },
    });

    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'coach_rate_limit_exceeded',
    });
    expect(mockLoadPhase2FeatureFlags).not.toHaveBeenCalled();
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
    expect(mockRequireCoachGenerateWebhookEndpoints).not.toHaveBeenCalled();
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'record_coach_generation_attempt',
      expect.objectContaining({ p_user_id: 'user-1' }),
    );
  });

  it('marks the pending entry as errored when the webhook response exceeds the size limit', async () => {
    const Phase2HttpErrorModule = jest.requireActual(
      '@/supabase/functions/_shared/phase2Errors',
    ) as { Phase2HttpError: new (status: number, code: string, message: string) => Error };
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockRejectedValue(
      new Phase2HttpErrorModule.Phase2HttpError(
        502,
        'coach_response_too_large',
        'Coach webhook response must be 32768 bytes or fewer',
      ),
    );

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-1',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-1',
        pendingEntry: {
          id: 'entry-pending',
        },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: { payload_version: 2 },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-1',
        resolvedLocale: 'fr',
        userId: 'user-1',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'coach_response_too_large',
      status: 502,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'coach_response_too_large',
        response_payload_json: expect.objectContaining({
          error_code: 'coach_response_too_large',
          provider: 'n8n',
          request_id: 'req-1',
          source: 'coach_generation',
        }),
      }),
    });
  });
});
