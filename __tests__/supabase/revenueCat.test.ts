describe('revenueCat shared helpers', () => {
  const originalDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  let env: Record<string, string | undefined>;

  const loadRevenueCatModule = () => {
    jest.resetModules();
    (globalThis as typeof globalThis & {
      Deno: { env: { get: (name: string) => string | undefined } };
    }).Deno = {
      env: {
        get: (name: string) => env[name],
      },
    };

    return require('@/supabase/functions/_shared/revenueCat.ts') as typeof import('@/supabase/functions/_shared/revenueCat.ts');
  };

  beforeEach(() => {
    env = {};
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = originalDeno;
  });

  it('derives an active premium patch from a live entitlement', () => {
    const { deriveRevenueCatProfilePatch } = loadRevenueCatModule();

    const result = deriveRevenueCatProfilePatch(
      {
        subscriber: {
          entitlements: {
            premium: {
              expires_date: '2099-01-01T00:00:00.000Z',
              product_identifier: 'health_scan_premium_monthly',
              store: 'app_store',
            },
          },
          subscriptions: {
            health_scan_premium_monthly: {
              expires_date: '2099-01-01T00:00:00.000Z',
              store: 'app_store',
            },
          },
        },
      },
      new Date('2026-04-07T00:00:00.000Z')
    );

    expect(result).toEqual({
      account_tier: 'premium',
      subscription_status: 'active',
      subscription_expiry_date: '2099-01-01T00:00:00.000Z',
      subscription_platform: 'ios',
    });
  });

  it('marks premium users as past_due when billing issues are detected before expiry', () => {
    const { deriveRevenueCatProfilePatch } = loadRevenueCatModule();

    const result = deriveRevenueCatProfilePatch(
      {
        subscriber: {
          entitlements: {
            premium: {
              expires_date: '2099-01-01T00:00:00.000Z',
              billing_issues_detected_at: '2026-04-01T00:00:00.000Z',
              product_identifier: 'health_scan_premium_monthly',
              store: 'play_store',
            },
          },
          subscriptions: {
            health_scan_premium_monthly: {
              expires_date: '2099-01-01T00:00:00.000Z',
              billing_issues_detected_at: '2026-04-01T00:00:00.000Z',
              store: 'play_store',
            },
          },
        },
      },
      new Date('2026-04-07T00:00:00.000Z')
    );

    expect(result).toEqual({
      account_tier: 'premium',
      subscription_status: 'past_due',
      subscription_expiry_date: '2099-01-01T00:00:00.000Z',
      subscription_platform: 'android',
    });
  });

  it('downgrades to free when the entitlement is expired', () => {
    const { deriveRevenueCatProfilePatch } = loadRevenueCatModule();

    const result = deriveRevenueCatProfilePatch(
      {
        subscriber: {
          entitlements: {
            premium: {
              expires_date: '2026-01-01T00:00:00.000Z',
              product_identifier: 'health_scan_premium_monthly',
              store: 'app_store',
            },
          },
          subscriptions: {
            health_scan_premium_monthly: {
              expires_date: '2026-01-01T00:00:00.000Z',
              store: 'app_store',
            },
          },
        },
      },
      new Date('2026-04-07T00:00:00.000Z')
    );

    expect(result).toEqual({
      account_tier: 'free',
      subscription_status: 'expired',
      subscription_expiry_date: '2026-01-01T00:00:00.000Z',
      subscription_platform: 'ios',
    });
  });

  it('extracts unique app user ids from webhook payload aliases', () => {
    const { extractRevenueCatAppUserIds } = loadRevenueCatModule();

    expect(
      extractRevenueCatAppUserIds({
        event: {
          app_user_id: '11111111-1111-4111-8111-111111111111',
          original_app_user_id: '11111111-1111-4111-8111-111111111111',
          aliases: [
            '22222222-2222-4222-8222-222222222222',
            '11111111-1111-4111-8111-111111111111',
          ],
        },
      })
    ).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });
});
