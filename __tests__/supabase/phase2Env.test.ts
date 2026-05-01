describe('phase2 env helpers', () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  let env: Record<string, string | undefined>;

  const loadPhase2Env = () => {
    jest.resetModules();
    (globalThis as typeof globalThis & {
      Deno: { env: { get: (name: string) => string | undefined } };
    }).Deno = {
      env: {
        get: (name: string) => env[name],
      },
    };

    return require('@/supabase/functions/_shared/phase2Env.ts') as typeof import('@/supabase/functions/_shared/phase2Env.ts');
  };

  beforeEach(() => {
    env = {};
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
  });

  it('reads server-side RevenueCat configuration without exposing defaults incorrectly', () => {
    env.REVENUECAT_API_KEY = 'rc_secret';
    env.REVENUECAT_PREMIUM_ENTITLEMENT_ID = 'gold';
    env.REVENUECAT_WEBHOOK_SECRET = 'webhook-secret';

    const { getRevenueCatServerConfig } = loadPhase2Env();

    expect(getRevenueCatServerConfig()).toEqual({
      apiBaseUrl: 'https://api.revenuecat.com',
      apiKey: 'rc_secret',
      premiumEntitlementId: 'gold',
      webhookAuthorization: 'webhook-secret',
    });
  });

  it('fails fast when required server env values are missing', () => {
    const { requireServerEnv } = loadPhase2Env();

    expect(() => requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY is not configured'
    );
  });

  it('returns trimmed optional webhook URLs and an empty string when unset', () => {
    env.N8N_SCAN_ANALYZE_WEBHOOK_URL = '  https://hooks.example.com/analyze  ';

    const { getOptionalWebhookUrl } = loadPhase2Env();

    expect(getOptionalWebhookUrl('N8N_SCAN_ANALYZE_WEBHOOK_URL')).toBe(
      'https://hooks.example.com/analyze'
    );
    expect(getOptionalWebhookUrl('MISSING_WEBHOOK_URL')).toBe('');
  });
});
