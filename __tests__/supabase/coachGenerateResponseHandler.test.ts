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
const mockLogPhase2Info = jest.fn();
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
  logPhase2Info: (...args: unknown[]) => mockLogPhase2Info(...args),
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
  buildCoachResponse,
  COACH_GENERATE_REQUEST_MAX_BYTES,
  handleCoachGenerateResponseRequest,
  runPendingCoachGenerationTask,
} from '@/supabase/functions/coach-generate-response/handler.ts';

function createFeatureFlags() {
  return {
    scope: 'mobile',
    social_enabled: false,
    coach_enabled: true,
    coach_chat_enabled: false,
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

function createWorkerClient(options: {
  appliedEntryIds?: string[];
  inferredPersona?: Record<string, unknown> | null;
  tokenQuotaRejection?: Error;
  updatedAt?: string;
} = {}) {
  const operations: string[] = [];
  const updates: Array<{
    payload: Record<string, unknown>;
    columnName: string;
    value: string;
  }> = [];
  const ledgerUpserts: Array<Record<string, unknown>> = [];
  const ledgerDeletes: Array<{ columnName: string; value: string }> = [];
  const userProfileUpdates: Array<{
    payload: Record<string, unknown>;
    expectedUpdatedAt: string | null;
    matched: boolean;
  }> = [];
  const appliedEntryIds = new Set(options.appliedEntryIds ?? []);
  let inferredPersona = options.inferredPersona ?? null;
  let updatedAt = options.updatedAt ?? '2026-04-06T08:00:00.000Z';

  return {
    operations,
    updates,
    ledgerUpserts,
    ledgerDeletes,
    userProfileUpdates,
    getPersistedPersona: () => inferredPersona,
    client: {
      from: jest.fn((tableName: string) => {
        if (tableName === 'coach_entries') {
          return {
            update: jest.fn((payload: Record<string, unknown>) => ({
              eq: jest.fn((columnName: string, value: string) => {
                updates.push({ payload, columnName, value });
                if (payload.status === 'error') {
                  operations.push('entry:error');
                } else if (payload.status === 'ready') {
                  operations.push('entry:ready');
                }

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
        }

        if (tableName === 'coach_profile_update_applications') {
          return {
            upsert: jest.fn((payload: Record<string, unknown>) => ({
              select: jest.fn(() => {
                ledgerUpserts.push(payload);
                const coachEntryId =
                  typeof payload.coach_entry_id === 'string'
                    ? payload.coach_entry_id
                    : '';
                const inserted = !appliedEntryIds.has(coachEntryId);
                if (inserted) {
                  appliedEntryIds.add(coachEntryId);
                }
                return Promise.resolve({
                  data: inserted ? [{ coach_entry_id: coachEntryId }] : [],
                  error: null,
                });
              }),
            })),
            delete: jest.fn(() => ({
              eq: jest.fn((columnName: string, value: string) => {
                ledgerDeletes.push({ columnName, value });
                appliedEntryIds.delete(value);
                return Promise.resolve({
                  data: null,
                  error: null,
                });
              }),
            })),
          };
        }

        if (tableName === 'user_profiles') {
          return {
            select: jest.fn(() => {
              const filters: {
                eq: jest.Mock;
                single: jest.Mock;
                maybeSingle: jest.Mock;
              } = {
                eq: jest.fn(() => filters),
                single: jest.fn().mockResolvedValue({
                  data: {
                    inferred_persona: inferredPersona,
                    updated_at: updatedAt,
                  },
                  error: null,
                }),
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    inferred_persona: inferredPersona,
                    updated_at: updatedAt,
                  },
                  error: null,
                }),
              };

              return filters;
            }),
            update: jest.fn((payload: Record<string, unknown>) => {
              let expectedUpdatedAt: string | null = null;
              const filters: {
                eq: jest.Mock;
                select: jest.Mock;
              } = {
                eq: jest.fn((columnName: string, value: string) => {
                  if (columnName === 'updated_at') {
                    expectedUpdatedAt = value;
                  }
                  return filters;
                }),
                select: jest.fn(() => {
                  const matched =
                    expectedUpdatedAt === null || expectedUpdatedAt === updatedAt;
                  userProfileUpdates.push({
                    payload,
                    expectedUpdatedAt,
                    matched,
                  });
                  if (matched) {
                    inferredPersona =
                      (payload.inferred_persona as Record<string, unknown> | null) ??
                      null;
                    if (
                      inferredPersona &&
                      typeof inferredPersona.last_updated_at === 'string'
                    ) {
                      updatedAt = inferredPersona.last_updated_at;
                    }
                  }
                  return Promise.resolve({
                    data: matched
                      ? [
                          {
                            inferred_persona: inferredPersona,
                            updated_at: updatedAt,
                          },
                        ]
                      : [],
                    error: null,
                  });
                }),
              };

              return filters;
            }),
          };
        }

        throw new Error(`Unexpected table ${tableName}`);
      }),
      rpc: jest.fn((fnName: string, _params: Record<string, unknown>) => {
        if (fnName === 'record_coach_token_consumption') {
          if (options.tokenQuotaRejection) {
            return Promise.reject(options.tokenQuotaRejection);
          }
          return Promise.resolve({
            data: { allowed: true },
            error: null,
          });
        }
        if (fnName === 'refund_coach_quota_event') {
          operations.push('quota:refund');
          return Promise.resolve({
            data: {
              success: true,
              refunded: true,
              quota: createQuotaStatus({
                account_tier: 'free',
                limit: 1,
                used_count: 0,
                available: 1,
                next_recharge_at: null,
              }),
            },
            error: null,
          });
        }
        throw new Error(`Unexpected rpc ${fnName}`);
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

  it('normalizes legacy trend prompt and question aliases when building the API response', () => {
    const response = buildCoachResponse(
      {
        id: 'entry-legacy-trend',
        persona_key: 'patient_calm',
        prompt_type: 'trend_comparison',
        question_key: 'trend_comparison__week_progress_review',
        question_text: null,
        response_version: 1,
        status: 'ready',
        title: 'Lecture de tendance',
        body: 'On voit une tendance utile.',
        disclaimer:
          'Wellness guidance only. This is not a diagnosis or medical advice.',
        cta_label: null,
        cta_route: null,
        content_json: null,
        response_payload_json: {},
        request_payload_json: {},
        source: 'n8n',
        expires_at: null,
        locale: 'fr',
      },
      false,
      null,
    );

    expect(response.prompt_type).toBe('trend_review');
    expect(response.question_key).toBe('trend_review__week_progress_review');
    expect(response.question_text).toBe(
      "Dis-moi ce qui s'ameliore, ce qui bloque et quoi continuer cette semaine.",
    );
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

  it('persists question_key and question_text on pending entries and returns them immediately', async () => {
    const requestClient = createRequestClient({
      pendingEntry: {
        id: 'entry-question',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan',
        question_key: 'latest_scan__three_simple_actions',
        question_text:
          "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
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
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan',
        latest_scan: { scan_id: 'scan-1' },
        question_key: 'latest_scan__three_simple_actions',
        question_text:
          "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      entry_id: 'entry-question',
      question_key: 'latest_scan__three_simple_actions',
      question_text:
        "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
    });

    const coachEntriesRelation = requestClient.from.mock.results
      .filter((_, index) => requestClient.from.mock.calls[index]?.[0] === 'coach_entries')
      .map((result) => result.value)
      .find((relation) => relation?.upsert?.mock?.calls?.length > 0);

    expect(coachEntriesRelation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        question_key: 'latest_scan__three_simple_actions',
        question_text:
          "Quelles 3 actions simples auront le plus d'impact d'ici ce soir ?",
      }),
      expect.objectContaining({
        onConflict: 'user_id,cache_key',
      }),
    );
  });

  it('persists and forwards free_question pending entries with quota', async () => {
    const requestClient = createRequestClient({
      pendingEntry: {
        id: 'entry-free-question',
        persona_key: 'gentle_supportive',
        prompt_type: 'free_question',
        question_key: null,
        question_text:
          'Comment adapter ma semaine avec mes derniers scans ?',
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
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'free_question',
        latest_scan: { scan_id: 'scan-1' },
        latest_by_type: {
          health: { scan_id: 'scan-1' },
          body: null,
          nutrition: null,
          super: null,
        },
        question_key: null,
        question_text:
          'Comment adapter ma semaine avec mes derniers scans ?',
        question_hints: {
          intent_key: 'free_question_open',
          time_scope: 'ongoing',
          preferred_artifacts: ['action_steps', 'context_notes'],
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      entry_id: 'entry-free-question',
      prompt_type: 'free_question',
      question_key: null,
      question_text:
        'Comment adapter ma semaine avec mes derniers scans ?',
      quota: expect.objectContaining({
        limit: 8,
        available: 7,
      }),
    });

    const coachEntriesRelation = requestClient.from.mock.results
      .filter((_, index) => requestClient.from.mock.calls[index]?.[0] === 'coach_entries')
      .map((result) => result.value)
      .find((relation) => relation?.upsert?.mock?.calls?.length > 0);

    expect(coachEntriesRelation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_type: 'free_question',
        question_key: null,
        question_text:
          'Comment adapter ma semaine avec mes derniers scans ?',
      }),
      expect.objectContaining({
        onConflict: 'user_id,cache_key',
      }),
    );
    expect(mockPostCoachGenerateWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          entry_id: 'entry-free-question',
          payload: expect.objectContaining({
            prompt_type: 'free_question',
            question_text:
              'Comment adapter ma semaine avec mes derniers scans ?',
          }),
        }),
      }),
    );
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_generation',
      }),
    );
  });

  it('reserves the scan_cta bucket when payload.scan_intent is present (cache miss)', async () => {
    // R-23 (2026-05-26): scanner-CTA flow must hit a separate quota bucket
    // so free users keep 1 preset + 1 scan-CTA per 24h. The handler picks
    // `coach_scan_cta_generation` based on payload.scan_intent.
    const requestClient = createRequestClient({
      pendingEntry: {
        id: 'entry-scan-cta',
        persona_key: 'gentle_supportive',
        prompt_type: 'latest_scan_issue_resolution',
        question_key: 'improve_hydration_from_scan',
        question_text: 'Comment mieux m hydrater apres ce scan ?',
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
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-cta-1' },
        scan_intent: {
          scan_id: 'scan-cta-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
        question_key: 'improve_hydration_from_scan',
        question_text: 'Comment mieux m hydrater apres ce scan ?',
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_scan_cta_generation',
      }),
    );
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'attach_coach_quota_event',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_scan_cta_generation',
      }),
    );
    // Sanity: it must NOT also reserve from the general bucket.
    expect(requestClient.rpc).not.toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_generation' }),
    );
  });

  it('reserves the scan_cta bucket on cache hits when payload.scan_intent is present', async () => {
    // R-23 (2026-05-26): scan-CTA cache hits must also count against the
    // scan_cta bucket, not the general one. Otherwise free users could
    // repeatedly hit a cached scan-CTA answer at the expense of their general
    // quota.
    const existingEntry = {
      id: 'entry-scan-cta-cached',
      persona_key: 'gentle_supportive',
      status: 'ready',
      title: 'Cached scan CTA reply',
      body: 'Hydrate with rhythm.',
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
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-cta-1' },
        scan_intent: {
          scan_id: 'scan-cta-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-123',
        },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_scan_cta_cache',
      }),
    );
    expect(requestClient.rpc).not.toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_cache' }),
    );
  });

  // ---------------------------------------------------------------------------
  // R-23 (2026-05-26) — bucket-aware 429 + per-tier behaviour.
  // These tests guard the UX promise: a free user blocked on scan_cta must
  // see the scan_cta cooldown, never the (different) general one — otherwise
  // the alert "next request in X" lies. Also locks in premium 8+8 and admin
  // unlimited at the handler level.
  // ---------------------------------------------------------------------------

  it('429 on scan_cta exhaustion surfaces the scan_cta bucket cooldown (not the general one)', async () => {
    // Free user: general has 1 slot left but scan_cta is exhausted. The user
    // clicked a scanner CTA → the handler must reserve coach_scan_cta_generation
    // and the resulting 429 must point at the scan_cta cooldown so the UI
    // shows "next request in ~24h" instead of "now" (general top-level).
    const scanCtaRechargeAt = '2026-05-27T12:00:00.000Z';
    const requestClient = createRequestClient({
      accountTier: 'free',
      quotaReservation: {
        success: true,
        allowed: false,
        code: 'coach_quota_exhausted',
        usage_event_id: null,
        quota: {
          // Top-level mirrors `general` per the post-migration RPC contract.
          // It still has 1 slot left — that is exactly the trap the handler
          // must NOT expose to the user as the cooldown for this 429.
          account_tier: 'free',
          limit: 1,
          used_count: 0,
          available: 1,
          next_recharge_at: null,
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 1,
              used_count: 0,
              available: 1,
              next_recharge_at: null,
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 1,
              used_count: 1,
              available: 0,
              next_recharge_at: scanCtaRechargeAt,
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'coach_quota_exhausted',
      details: expect.objectContaining({
        quota_account_tier: 'free',
        quota_limit: 1,
        quota_used_count: 1,
        quota_available: 0,
        // CRITICAL: must mirror the scan_cta cooldown, not general's null.
        quota_next_recharge_at: scanCtaRechargeAt,
        quota_source: 'coach_scan_cta_generation',
        quota_bucket: 'scan_cta',
      }),
    });
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_scan_cta_generation' }),
    );
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
  });

  it('429 on general exhaustion still surfaces the general bucket cooldown', async () => {
    // Symmetric guard: when a free user exhausts the general bucket and
    // clicks a preset, the 429 must point at general's next_recharge_at.
    const generalRechargeAt = '2026-05-27T12:00:00.000Z';
    const requestClient = createRequestClient({
      accountTier: 'free',
      quotaReservation: {
        success: true,
        allowed: false,
        code: 'coach_quota_exhausted',
        usage_event_id: null,
        quota: {
          account_tier: 'free',
          limit: 1,
          used_count: 1,
          available: 0,
          next_recharge_at: generalRechargeAt,
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 1,
              used_count: 1,
              available: 0,
              next_recharge_at: generalRechargeAt,
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 1,
              used_count: 0,
              available: 1,
              next_recharge_at: null,
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      details: expect.objectContaining({
        quota_next_recharge_at: generalRechargeAt,
        quota_source: 'coach_generation',
        quota_bucket: 'general',
      }),
    });
  });

  it('premium tier: when the general bucket is exhausted (8/8) the handler returns 429 with the general cooldown', async () => {
    // Locks in the premium=8 limit from build_coach_quota_status_json. The
    // handler does not need to know the limit explicitly; it just trusts the
    // RPC's allowed=false response and projects the consumed bucket into the
    // 429 payload.
    const generalRechargeAt = '2026-05-27T10:00:00.000Z';
    const requestClient = createRequestClient({
      accountTier: 'premium',
      quotaReservation: {
        success: true,
        allowed: false,
        code: 'coach_quota_exhausted',
        usage_event_id: null,
        quota: {
          account_tier: 'premium',
          limit: 8,
          used_count: 8,
          available: 0,
          next_recharge_at: generalRechargeAt,
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 8,
              used_count: 8,
              available: 0,
              next_recharge_at: generalRechargeAt,
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 8,
              used_count: 3,
              available: 5,
              next_recharge_at: '2026-05-27T09:00:00.000Z',
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      details: expect.objectContaining({
        quota_account_tier: 'premium',
        quota_limit: 8,
        quota_used_count: 8,
        quota_available: 0,
        quota_bucket: 'general',
      }),
    });
  });

  // ---------------------------------------------------------------------------
  // R-24 (2026-05-26) — full coverage matrix for the split-bucket Coach quota.
  // Locks in scenarios D8/D10/D11 (premium per-bucket), F15 (refund scan_cta),
  // C5/C6 (cross-bucket non-interference) and G19 (cache hits do consume a
  // slot in the bucket they map to). Server is source of truth; tests assert
  // the RPC call shape (p_source) and the 429 details (quota_bucket).
  // ---------------------------------------------------------------------------

  it('D10: premium reserves the scan_cta bucket independently of general (positive case)', async () => {
    // Premium user with general=5/8 and scan_cta=0/8 clicks a scanner CTA.
    // Must reserve coach_scan_cta_generation, scan_cta bucket should be
    // consulted, general bucket usage is irrelevant for this gate.
    const requestClient = createRequestClient({
      accountTier: 'premium',
      quotaReservation: {
        success: true,
        allowed: true,
        code: null,
        usage_event_id: 'usage-premium-scan-cta',
        quota: {
          account_tier: 'premium',
          limit: 8,
          used_count: 5,
          available: 3,
          next_recharge_at: '2026-05-27T09:00:00.000Z',
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 8,
              used_count: 5,
              available: 3,
              next_recharge_at: '2026-05-27T09:00:00.000Z',
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 8,
              used_count: 1,
              available: 7,
              next_recharge_at: '2026-05-27T11:30:00.000Z',
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({
        p_user_id: 'user-1',
        p_source: 'coach_scan_cta_generation',
      }),
    );
    // The attached event must record the scan_cta source so the refund (if it
    // ever fires) credits back the scan_cta bucket, not general.
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'attach_coach_quota_event',
      expect.objectContaining({ p_source: 'coach_scan_cta_generation' }),
    );
  });

  it('D11: premium 9th scan_cta is blocked with a scan_cta-scoped cooldown', async () => {
    // Symmetric to the existing premium-general-exhausted test, on the
    // scan_cta bucket this time. The 429 details must surface the scan_cta
    // cooldown (not the general one — which may still have slots left).
    const scanCtaRechargeAt = '2026-05-27T11:30:00.000Z';
    const requestClient = createRequestClient({
      accountTier: 'premium',
      quotaReservation: {
        success: true,
        allowed: false,
        code: 'coach_quota_exhausted',
        usage_event_id: null,
        quota: {
          account_tier: 'premium',
          limit: 8,
          used_count: 2,
          available: 6,
          next_recharge_at: '2026-05-27T09:00:00.000Z',
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 8,
              used_count: 2,
              available: 6,
              next_recharge_at: '2026-05-27T09:00:00.000Z',
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 8,
              used_count: 8,
              available: 0,
              next_recharge_at: scanCtaRechargeAt,
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'body',
          priority_metric: 'posture_score',
          severity: 'medium',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      details: expect.objectContaining({
        quota_account_tier: 'premium',
        quota_limit: 8,
        quota_used_count: 8,
        quota_available: 0,
        // CRITICAL: scan_cta cooldown surfaced, not the general one.
        quota_next_recharge_at: scanCtaRechargeAt,
        quota_bucket: 'scan_cta',
        quota_source: 'coach_scan_cta_generation',
      }),
    });
  });

  it('C5: free with general exhausted can still reserve scan_cta (cross-bucket non-interference)', async () => {
    // Direct expression of the product promise: a free user who burned their
    // single preset slot must still be able to click a scanner CTA. We mirror
    // what the DB RPC does: when reserve_coach_quota is called with the
    // scan_cta source, only the scan_cta bucket gates the decision.
    const requestClient = createRequestClient({
      accountTier: 'free',
      quotaReservation: {
        success: true,
        allowed: true,
        code: null,
        usage_event_id: 'usage-free-scan-cta-cross',
        quota: {
          account_tier: 'free',
          limit: 1,
          used_count: 0,
          available: 1,
          next_recharge_at: null,
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 1,
              used_count: 1,
              available: 0,
              next_recharge_at: '2026-05-27T08:00:00.000Z',
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 1,
              used_count: 0,
              available: 1,
              next_recharge_at: null,
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'nutrition',
          priority_metric: 'protein_grams',
          severity: 'medium',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_scan_cta_generation' }),
    );
    // The handler MUST NOT also reserve under coach_generation — that would
    // double-charge the user and partially defeat the split.
    expect(requestClient.rpc).not.toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_generation' }),
    );
  });

  it('F15: refunds the scan_cta bucket when a scanner-CTA background task fails', async () => {
    // Symmetric to the F14 insufficient_data refund test, but routed through
    // the scan_cta bucket. The refund must be addressed to the same
    // usage_event_id the handler reserved under the scan-CTA source — this is
    // why we passed the source through attach_coach_quota_event.
    const { client, operations, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: true,
        status: 200,
        payload: {
          response_version: 2,
          title: 'Conseil du jour',
          body: 'Cadre générique fr.',
          disclaimer: 'Ce conseil ne remplace pas un avis médical.',
          content: null,
          source: 'n8n',
          insufficient_data: true,
          debug: {
            coach_fallback_used: true,
            fallback_reason: 'generic_error',
            language: 'fr',
            coach_route: 'latest_scan_issue_resolution',
            prompt_type: 'latest_scan_issue_resolution',
            has_scan_intent: true,
          },
        },
        bodyPresent: true,
        rawText: '{"insufficient_data":true}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-scan-cta-refund',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-scan-cta-refund',
        pendingEntry: {
          id: 'entry-scan-cta-refund',
        },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: {
            payload_version: 2,
            scan_intent: {
              scan_id: 'scan-1',
              scan_type: 'face',
              priority_metric: 'hydration_level',
              severity: 'high',
            },
          },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-scan-cta-refund',
        resolvedLocale: 'fr',
        userId: 'user-1',
        usageEventId: 'usage-free-scan-cta-refund',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'coach_insufficient_data',
      status: 422,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      value: 'entry-scan-cta-refund',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'coach_insufficient_data',
      }),
    });
    // Refund must address the original usage_event_id reserved against
    // scan_cta — restoring exactly one scan_cta slot, never a general one.
    expect(client.rpc).toHaveBeenCalledWith('refund_coach_quota_event', {
      p_usage_event_id: 'usage-free-scan-cta-refund',
      p_user_id: 'user-1',
      p_reason: 'coach_insufficient_data',
    });
    expect(operations).toEqual(['quota:refund', 'entry:error']);
  });

  it('G19: cache hit still consumes a slot in its bucket (documents current behaviour)', async () => {
    // Re-clicking a cached scanner-CTA answer reserves coach_scan_cta_cache
    // and attaches the event to the cached coach_entry. This is the existing
    // behaviour: each *request* (cache or fresh) counts against the bucket.
    // This test documents it so it cannot regress silently — changing it
    // requires a product decision (see audit 2026-05-26 §8 Q2).
    const existingEntry = {
      id: 'entry-scan-cta-cached',
      persona_key: 'gentle_supportive',
      status: 'ready',
      title: 'Cached scan CTA reply',
      body: 'Hydrate with rhythm.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: '2099-04-12T10:00:00.000Z',
      response_payload_json: {},
    };
    const requestClient = createRequestClient({
      accountTier: 'free',
      existingEntry,
      quotaReservation: {
        success: true,
        allowed: true,
        code: null,
        usage_event_id: 'usage-cache-scan-cta',
        quota: {
          account_tier: 'free',
          limit: 1,
          used_count: 1,
          available: 0,
          next_recharge_at: '2026-05-27T12:00:00.000Z',
          unlimited: false,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: 1,
              used_count: 0,
              available: 1,
              next_recharge_at: null,
              window_seconds: 86400,
            },
            scan_cta: {
              limit: 1,
              used_count: 1,
              available: 0,
              next_recharge_at: '2026-05-27T12:00:00.000Z',
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);

    await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    // Two assertions enforce the contract:
    //  1. The cache path DOES call reserve_coach_quota (consumes a slot).
    //  2. The attach call wires the cache event to the existing entry id so
    //     the ledger remains coherent.
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      expect.objectContaining({ p_source: 'coach_scan_cta_cache' }),
    );
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'attach_coach_quota_event',
      expect.objectContaining({
        p_usage_event_id: 'usage-cache-scan-cta',
        p_coach_entry_id: 'entry-scan-cta-cached',
        p_source: 'coach_scan_cta_cache',
      }),
    );
  });

  it('admin tier: reservation is always allowed (unlimited on both buckets)', async () => {
    // Smoke test for the admin tier — the RPC returns allowed=true with
    // unlimited=true so the handler proceeds to schedule the background
    // task. No quota exhaustion can possibly fire for admins.
    const requestClient = createRequestClient({
      accountTier: 'admin',
      quotaReservation: {
        success: true,
        allowed: true,
        code: null,
        usage_event_id: null,
        quota: {
          account_tier: 'admin',
          limit: null,
          used_count: 0,
          available: null,
          next_recharge_at: null,
          unlimited: true,
          window_seconds: 86400,
          as_of: '2026-05-26T12:00:00.000Z',
          buckets: {
            general: {
              limit: null,
              used_count: 0,
              available: null,
              next_recharge_at: null,
              window_seconds: 86400,
            },
            scan_cta: {
              limit: null,
              used_count: 0,
              available: null,
              next_recharge_at: null,
              window_seconds: 86400,
            },
          },
        },
      },
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: {
        payload_version: 2,
        prompt_type: 'latest_scan_issue_resolution',
        latest_scan: { scan_id: 'scan-1' },
        scan_intent: {
          scan_id: 'scan-1',
          scan_type: 'face',
          priority_metric: 'hydration_level',
          severity: 'high',
        },
      },
      persona_key: 'gentle_supportive',
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({ payload: { payload_version: 2 } }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      status: 'pending',
      quota: expect.objectContaining({
        account_tier: 'admin',
        unlimited: true,
        limit: null,
        available: null,
      }),
    });
    expect(requestClient.rpc).toHaveBeenCalledWith(
      'reserve_coach_quota',
      // Even for admins the source still travels — the RPC short-circuits to
      // unlimited but the source label is what lets us audit the bucket of
      // origin in production logs.
      expect.objectContaining({ p_source: 'coach_scan_cta_generation' }),
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
    const { client, operations, updates } = createWorkerClient();

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
      usageEventId: 'usage-free-ready',
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
    expect(operations).toEqual(['entry:ready']);
    expect(client.rpc).not.toHaveBeenCalledWith(
      'refund_coach_quota_event',
      expect.anything(),
    );
  });

  it('preserves previous_error_code on the ready update when the retry-upsert wiped an earlier failure', async () => {
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
      pendingEntry: { id: 'entry-pending' },
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
      previousErrorContext: {
        previous_error_code: 'coach_webhook_failed',
        previous_errored_at: '2026-05-19T22:00:00.000Z',
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      status: 'ready',
      response_payload_json: expect.objectContaining({
        previous_error_code: 'coach_webhook_failed',
        previous_errored_at: '2026-05-19T22:00:00.000Z',
      }),
    });
  });

  it('preserves previous_error_code on the error update when the retry also fails', async () => {
    const { client, updates } = createWorkerClient();
    const Phase2HttpErrorModule = jest.requireActual(
      '../../supabase/functions/_shared/phase2Errors.ts',
    ) as { Phase2HttpError: new (status: number, code: string, message: string) => Error };

    mockPostCoachGenerateWebhook.mockRejectedValue(
      new Phase2HttpErrorModule.Phase2HttpError(
        502,
        'coach_webhook_failed',
        'Coach generation provider returned an error',
      ),
    );

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-1',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-1',
        pendingEntry: { id: 'entry-pending' },
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
        previousErrorContext: {
          previous_error_code: 'invalid_coach_response',
          previous_errored_at: '2026-05-19T22:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ code: 'coach_webhook_failed' });

    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      status: 'error',
      error_code: 'coach_webhook_failed',
      response_payload_json: expect.objectContaining({
        previous_error_code: 'invalid_coach_response',
        previous_errored_at: '2026-05-19T22:00:00.000Z',
      }),
    });
  });

  it('applies ready-entry profile_updates only once per coach_entry id', async () => {
    const { client, ledgerUpserts, userProfileUpdates, getPersistedPersona } =
      createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: true,
        status: 200,
        payload: {
          title: 'Ready coach guidance',
          body: 'Keep the plan simple this week.',
          disclaimer:
            'Wellness guidance only. This is not a diagnosis or medical advice.',
          content: {
            title: 'Ready coach guidance',
            summary: 'Stay steady.',
            context_notes: [],
            priorities: [],
            action_steps: [],
            warnings: [],
            encouragement: null,
            primary_metric_delta: null,
            data_gaps: [],
            confidence: null,
            profile_updates: {
              detected_diet_signals: ['protein_focus'],
              detected_strong_focus: 'nutrition',
              suggested_goals: ['Hydration'],
              suggested_persona_key: 'patient_calm',
            },
          },
        },
        bodyPresent: true,
        rawText: '{"title":"Ready coach guidance"}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    const taskOptions = {
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
    } as const;

    await runPendingCoachGenerationTask(taskOptions);
    await runPendingCoachGenerationTask(taskOptions);

    expect(ledgerUpserts).toHaveLength(2);
    expect(userProfileUpdates.filter((entry) => entry.matched)).toHaveLength(1);
    expect(getPersistedPersona()).toMatchObject({
      detected_diet_signals: ['protein_focus'],
      detected_strong_focus: 'nutrition',
      suggested_goals: ['Hydration'],
      suggested_persona_key: 'patient_calm',
      update_count: 1,
    });
  });

  it('marks the same pending entry as errored when the provider fails', async () => {
    const { client, operations, updates } = createWorkerClient();

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
        usageEventId: 'usage-free-provider-error',
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
    expect(client.rpc).toHaveBeenCalledWith('refund_coach_quota_event', {
      p_usage_event_id: 'usage-free-provider-error',
      p_user_id: 'user-1',
      p_reason: 'coach_webhook_503',
    });
    expect(operations).toEqual(['quota:refund', 'entry:error']);
  });

  it('marks the pending entry as errored when a Phase2 webhook setup error is thrown', async () => {
    const Phase2HttpErrorModule = jest.requireActual(
      '@/supabase/functions/_shared/phase2Errors',
    ) as { Phase2HttpError: new (status: number, code: string, message: string) => Error };
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockRejectedValue(
      new Phase2HttpErrorModule.Phase2HttpError(
        500,
        'invalid_webhook_auth_configuration',
        'Webhook auth is misconfigured',
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
      code: 'invalid_webhook_auth_configuration',
      status: 500,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'invalid_webhook_auth_configuration',
        response_payload_json: expect.objectContaining({
          request_id: 'req-1',
          provider: 'n8n',
          source: 'coach_generation',
          error_code: 'invalid_webhook_auth_configuration',
          code: 'invalid_webhook_auth_configuration',
          status: 500,
        }),
      }),
    });
  });

  it('marks the same pending entry as errored with request metadata when the provider payload is invalid', async () => {
    const { client, operations, updates } = createWorkerClient();

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
        usageEventId: 'usage-free-invalid-response',
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
    expect(client.rpc).toHaveBeenCalledWith('refund_coach_quota_event', {
      p_usage_event_id: 'usage-free-invalid-response',
      p_user_id: 'user-1',
      p_reason: 'invalid_coach_response',
    });
    expect(operations).toEqual(['quota:refund', 'entry:error']);
  });

  it('refunds the quota and marks the entry errored when n8n reports insufficient_data', async () => {
    // R-22 (2026-05-26): n8n now sets `insufficient_data: true` when the body
    // it served came from the generic R-14 fallback or localizedCopy.genericError
    // (LLM refusal). The Edge handler must treat this as a non-consuming
    // failure so the free user does not lose their 1/24h quota on a fabricated
    // reply.
    const { client, operations, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: true,
        status: 200,
        payload: {
          response_version: 2,
          title: 'Conseil du jour',
          body:
            'Voici un cadre simple : identifie UNE intention claire pour cette semaine, choisis UN moment pour la mettre en pratique.',
          disclaimer: 'Ce conseil ne remplace pas un avis médical.',
          content: null,
          source: 'n8n',
          insufficient_data: true,
          debug: {
            coach_fallback_used: true,
            fallback_reason: 'generic_error',
            language: 'fr',
            coach_route: 'nutrition_focus',
            prompt_type: 'nutrition_focus',
            has_scan_intent: true,
          },
        },
        bodyPresent: true,
        rawText: '{"insufficient_data":true,...}',
      },
      usedFallback: false,
      fallbackReason: null,
    });

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-insufficient',
        client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-insufficient',
        pendingEntry: {
          id: 'entry-pending-insufficient',
        },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: { payload_version: 2 },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-insufficient',
        resolvedLocale: 'fr',
        userId: 'user-1',
        usageEventId: 'usage-free-insufficient',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'coach_insufficient_data',
      status: 422,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending-insufficient',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'coach_insufficient_data',
        response_payload_json: expect.objectContaining({
          request_id: 'req-insufficient',
          provider: 'n8n',
          source: 'coach_generation',
          error_code: 'coach_insufficient_data',
          fallback_reason: 'generic_error',
          language: 'fr',
          coach_route: 'nutrition_focus',
          prompt_type: 'nutrition_focus',
          has_scan_intent: true,
        }),
      }),
    });
    expect(client.rpc).toHaveBeenCalledWith('refund_coach_quota_event', {
      p_usage_event_id: 'usage-free-insufficient',
      p_user_id: 'user-1',
      p_reason: 'coach_insufficient_data',
    });
    expect(operations).toEqual(['quota:refund', 'entry:error']);
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

  it('stores n8n JSON parse-like 500 responses as invalid coach payloads with safe diagnostics', async () => {
    const { client, updates } = createWorkerClient();

    mockPostCoachGenerateWebhook.mockResolvedValue({
      webhookResult: {
        ok: false,
        status: 500,
        payload: {
          error: 'Unterminated string in JSON at position 3629',
        },
        bodyPresent: true,
        rawText: [
          'Coach Strict / weekly_plan',
          'Node type',
          '@n8n/n8n-nodes-langchain.chainLlm',
          'NodeOperationError: Unterminated string in JSON at position 3629',
          'at ChainLlm.node.ts:107:13',
        ].join('\n'),
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
        persona: getCoachPersona('strict_tough'),
        requestBody: {
          payload: { payload_version: 2, prompt_type: 'weekly_plan' },
          persona_key: 'strict_tough',
        },
        requestId: 'req-parse-1',
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
          request_id: 'req-parse-1',
          webhook_status: 500,
          response_body_present: true,
          provider: 'n8n',
          source: 'coach_generation',
          error_code: 'invalid_coach_response',
          provider_failure_kind: 'json_parse_failed',
          provider_failure_stage: 'n8n_chain_llm',
          provider_node_type: '@n8n/n8n-nodes-langchain.chainLlm',
          provider_node_name: 'Coach Strict / weekly_plan',
        }),
      }),
    });
  });

  it('refunds free quota and marks the pending entry as errored when an RPC rejects before the webhook call', async () => {
    const workerMocks = createWorkerClient({
      tokenQuotaRejection: new Error('rpc unreachable'),
    });

    await expect(
      runPendingCoachGenerationTask({
        cacheKey: 'cache-key-1',
        client: workerMocks.client,
        featureFlags: createFeatureFlags(),
        inputHash: 'hash-1',
        pendingEntry: { id: 'entry-pending' },
        persona: getCoachPersona('gentle_supportive'),
        requestBody: {
          payload: { payload_version: 2 },
          persona_key: 'gentle_supportive',
        },
        requestId: 'req-bug-a-1',
        resolvedLocale: 'fr',
        userId: 'user-1',
        usageEventId: 'usage-free-before-provider',
        webhookEndpoints: {
          primaryUrl: 'https://primary.example/webhook',
          fallbackUrl: null,
        },
      }),
    ).rejects.toThrow('rpc unreachable');

    expect(workerMocks.updates).toHaveLength(1);
    expect(workerMocks.updates[0]).toMatchObject({
      columnName: 'id',
      value: 'entry-pending',
      payload: expect.objectContaining({
        status: 'error',
        error_code: 'coach_generation_failed',
      }),
    });
    expect(workerMocks.client.rpc).toHaveBeenCalledWith(
      'refund_coach_quota_event',
      {
        p_usage_event_id: 'usage-free-before-provider',
        p_user_id: 'user-1',
        p_reason: 'coach_generation_failed',
      },
    );
    expect(workerMocks.operations).toEqual(['quota:refund', 'entry:error']);
    expect(mockPostCoachGenerateWebhook).not.toHaveBeenCalled();
  });

  it('uses a unique cache_key for the new pending entry when force_refresh is set and a ready entry exists (Bug B regression)', async () => {
    // Bug B regression: before the fix, the UPSERT on (user_id, cache_key)
    // overwrote the existing 'ready' entry with the new 'pending' values,
    // destroying body/title/content_json. If the background generation then
    // failed (Bug A or n8n timeout), the previous conseil was lost forever —
    // including from the user-visible history (which reads the same table).
    // The fix preserves the ready entry by using a unique cache_key for the
    // new pending row, so UPSERT becomes an INSERT (no conflict).
    const existingReadyEntry = {
      id: 'entry-ready-existing',
      persona_key: 'gentle_supportive',
      status: 'ready',
      title: 'Previous guidance',
      body: 'Stay focused on small wins.',
      disclaimer:
        'Wellness guidance only. This is not a diagnosis or medical advice.',
      cta_label: null,
      cta_route: null,
      source: 'n8n',
      expires_at: '2099-04-12T10:00:00.000Z',
      response_payload_json: {},
      cache_key: 'cache-key-1',
    };
    const requestClient = createRequestClient({
      existingEntry: existingReadyEntry,
      cacheKey: 'cache-key-1',
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: { payload_version: 2, latest_scan: { scan_id: 'scan-1' } },
      persona_key: 'gentle_supportive',
      force_refresh: true,
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));
    (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
    }).EdgeRuntime = {
      waitUntil: () => undefined,
    };

    const response = await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({
          payload: { payload_version: 2 },
          force_refresh: true,
        }),
      }),
    );

    expect(response.status).toBe(200);

    const coachEntriesRelation = requestClient.from.mock.results
      .filter(
        (_, index) =>
          requestClient.from.mock.calls[index]?.[0] === 'coach_entries',
      )
      .map((result) => result.value)
      .find((relation) => relation?.upsert?.mock?.calls?.length > 0);

    expect(coachEntriesRelation).toBeDefined();
    const upsertedValues = coachEntriesRelation.upsert.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(upsertedValues).toBeDefined();
    expect(typeof upsertedValues?.cache_key).toBe('string');
    // The new pending entry must NOT reuse the existing ready entry's cache_key
    // (otherwise UPSERT would overwrite). It must start with the original
    // cache_key prefix to remain logically linked, then append a uniqueness
    // marker (`__fr_`).
    expect(upsertedValues?.cache_key).not.toBe('cache-key-1');
    expect(upsertedValues?.cache_key as string).toMatch(/^cache-key-1__fr_/);
  });

  it('keeps the original cache_key when force_refresh is set but no existing ready entry is found', async () => {
    // Edge case for Bug B fix: when there's no existing ready entry, there's
    // nothing to preserve, so we use the original cache_key (which lets future
    // requests find this entry via the normal lookup).
    const requestClient = createRequestClient({
      existingEntry: null,
      cacheKey: 'cache-key-1',
    });
    mockParseCoachGenerateRequest.mockReturnValueOnce({
      payload: { payload_version: 2, latest_scan: { scan_id: 'scan-1' } },
      persona_key: 'gentle_supportive',
      force_refresh: true,
    });
    mockCreateServiceRoleClient.mockReturnValue(requestClient);
    mockPostCoachGenerateWebhook.mockReturnValue(new Promise(() => undefined));
    (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
    }).EdgeRuntime = {
      waitUntil: () => undefined,
    };

    await handleCoachGenerateResponseRequest(
      new Request('https://example.com/functions/v1/coach-generate-response', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-123' },
        body: JSON.stringify({
          payload: { payload_version: 2 },
          force_refresh: true,
        }),
      }),
    );

    const coachEntriesRelation = requestClient.from.mock.results
      .filter(
        (_, index) =>
          requestClient.from.mock.calls[index]?.[0] === 'coach_entries',
      )
      .map((result) => result.value)
      .find((relation) => relation?.upsert?.mock?.calls?.length > 0);

    const upsertedValues = coachEntriesRelation?.upsert?.mock?.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(upsertedValues?.cache_key).toBe('cache-key-1');
  });
});
