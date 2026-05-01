import {
  COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS,
  COACH_GENERATE_WEBHOOK_ENV_NAME,
  COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
  COACH_PROVIDER_NOT_CONFIGURED_MESSAGE,
  requireCoachGenerateWebhookEndpoints,
} from '@/supabase/functions/_shared/coachProvider';
import {
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '@/supabase/functions/_shared/phase2Errors';

describe('coach provider configuration', () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    env = {};
    (globalThis as typeof globalThis & {
      Deno: { env: { get: (name: string) => string | undefined } };
    }).Deno = {
      env: {
        get: (name: string) => env[name],
      },
    };
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
  });

  it('exposes the explicit long-running timeout for coach response generation', () => {
    expect(COACH_GENERATE_RESPONSE_WEBHOOK_TIMEOUT_MS).toBe(45_000);
  });

  it('marks the coach entry as errored and throws the canonical payload when the webhook is missing', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({
      eq,
    }));
    const from = jest.fn(() => ({
      update,
    }));
    const client = {
      from,
    };

    let thrownError: unknown;

    try {
      await requireCoachGenerateWebhookEndpoints(client, 'entry-123', 'req-123');
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Phase2HttpError);
    expect(thrownError).toMatchObject({
      status: 503,
      code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
      message: COACH_PROVIDER_NOT_CONFIGURED_MESSAGE,
    });
    expect(toPhase2ErrorPayload(thrownError, { requestId: 'req-123' })).toEqual({
      success: false,
      error: COACH_PROVIDER_NOT_CONFIGURED_MESSAGE,
      code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
      status: 503,
      request_id: 'req-123',
    });

    expect(from).toHaveBeenCalledWith('coach_entries');
    expect(update).toHaveBeenCalledWith({
      status: 'error',
      error_code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
      response_payload_json: {
        error_code: COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE,
        provider: 'n8n',
        request_id: 'req-123',
        source: 'coach_generation',
      },
    });
    expect(eq).toHaveBeenCalledWith('id', 'entry-123');
  });

  it('returns the configured coach webhook URL without touching coach_entries when present', async () => {
    env[COACH_GENERATE_WEBHOOK_ENV_NAME] = ' https://hooks.example.com/coach ';

    const update = jest.fn();
    const from = jest.fn(() => ({
      update,
    }));
    const client = {
      from,
    };

    await expect(
      requireCoachGenerateWebhookEndpoints(client, 'entry-123'),
    ).resolves.toEqual({
      primaryUrl: 'https://hooks.example.com/coach',
      fallbackUrl: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
