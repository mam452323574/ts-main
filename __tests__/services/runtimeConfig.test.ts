describe('runtimeConfig', () => {
  const originalEnv = process.env;

  const loadRuntimeConfigModule = (extra?: Record<string, unknown>) => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: extra
        ? {
            expoConfig: {
              extra,
            },
          }
        : {
            expoConfig: undefined,
          },
    }));

    return require('@/services/runtimeConfig') as typeof import('@/services/runtimeConfig');
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    delete process.env.REVENUECAT_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reads required public config and builds function URLs from Expo public extra', () => {
    const { getRuntimeConfig, getSupabaseFunctionUrl } = loadRuntimeConfigModule({
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co/',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'public-ios-key',
    });

    expect(getRuntimeConfig()).toEqual({
      supabaseUrl: 'https://test.supabase.co/',
      supabaseAnonKey: 'public-anon-key',
      revenueCatIosApiKey: 'public-ios-key',
      revenueCatAndroidApiKey: null,
      aptabaseAppKey: null,
      aptabaseHost: null,
    });
    expect(getSupabaseFunctionUrl('analyze-scan')).toBe(
      'https://test.supabase.co/functions/v1/analyze-scan'
    );
  });

  it('falls back to process.env for public runtime values when Expo extra is unavailable', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://env.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'env-anon-key';

    const { getRuntimeConfig } = loadRuntimeConfigModule();

    expect(getRuntimeConfig().supabaseUrl).toBe('https://env.supabase.co');
    expect(getRuntimeConfig().supabaseAnonKey).toBe('env-anon-key');
  });

  it('fails fast when a required public config value is missing', () => {
    const { getRuntimeConfig } = loadRuntimeConfigModule({
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    });

    expect(() => getRuntimeConfig()).toThrow(
      'Missing required public config: EXPO_PUBLIC_SUPABASE_ANON_KEY'
    );
  });

  it('does not expose server-only secret material through the client runtime config', () => {
    process.env.REVENUECAT_API_KEY = 'server-secret-should-not-leak';

    const { getRuntimeConfig } = loadRuntimeConfigModule({
      EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    });

    const runtimeConfig = getRuntimeConfig();

    expect(Object.keys(runtimeConfig).sort()).toEqual([
      'aptabaseAppKey',
      'aptabaseHost',
      'revenueCatAndroidApiKey',
      'revenueCatIosApiKey',
      'supabaseAnonKey',
      'supabaseUrl',
    ]);
    expect(JSON.stringify(runtimeConfig)).not.toContain(
      'server-secret-should-not-leak'
    );
  });
});
