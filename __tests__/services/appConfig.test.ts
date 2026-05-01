import {
  APP_CONFIG_REMOTE_KEY,
  DEFAULT_APP_CONFIG,
  DEFAULT_FEATURE_FLAGS,
  areSocialCommentsEnabled,
  fetchAppConfig,
  parseAppConfigValue,
  resolveSocialCommentsGate,
  shouldEnableSocialComments,
} from '@/services/appConfig';

const mockCanonicalMaybeSingle = jest.fn();
const mockCompatibilityMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockCanonicalEq = jest.fn(() => ({
  maybeSingle: mockCanonicalMaybeSingle,
}));
const mockCompatibilityEq = jest.fn(() => ({
  maybeSingle: mockCompatibilityMaybeSingle,
}));
const mockCanonicalSelect = jest.fn(() => ({
  eq: mockCanonicalEq,
}));
const mockCompatibilitySelect = jest.fn(() => ({
  eq: mockCompatibilityEq,
}));
const mockFrom = jest.fn((table: string) => {
  if (table === 'app_feature_flags') {
    return {
      select: mockCanonicalSelect,
    };
  }

  if (table === 'app_config') {
    return {
      select: mockCompatibilitySelect,
    };
  }

  throw new Error(`Unexpected table requested in appConfig test: ${table}`);
});

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('appConfig service', () => {
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: '42883',
        message: 'function get_phase2_feature_flags does not exist',
      },
    });
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  it('parses supported fields and keeps unknown payload values safe', () => {
    expect(
      parseAppConfigValue({
        social_enabled: true,
        coach_enabled: true,
        entry_offer_enabled: false,
        social_comments_enabled: true,
        entry_offer_offering_id: 'welcome_offer',
        post_rate_limit_per_day: 5,
        comment_rate_limit_per_hour: 10,
        rollout_percentage: 25,
        moderation_enabled: true,
        report_rate_limit_per_day: 12,
        repeated_rejection_threshold: 4,
        rejected_content_cooldown_hours: 48,
        coach_cache_ttl_minutes: 1440,
        ignored_key: 'ignored',
      }),
    ).toEqual({
      social_enabled: true,
      coach_enabled: true,
      entry_offer_enabled: false,
      social_comments_enabled: true,
      config_source: 'default',
      entry_offer_offering_id: 'welcome_offer',
      post_rate_limit_per_day: 5,
      comment_rate_limit_per_hour: 10,
      rollout_percentage: 25,
      moderation_enabled: true,
    });
  });

  it('falls back to defaults for malformed payloads', () => {
    expect(
      parseAppConfigValue({
        social_enabled: 'yes',
        coach_enabled: 1,
        entry_offer_enabled: null,
        social_comments_enabled: 'no',
        entry_offer_offering_id: 42,
        post_rate_limit_per_day: 'daily',
        comment_rate_limit_per_hour: {},
        rollout_percentage: [],
        moderation_enabled: 'sure',
      }),
    ).toEqual(DEFAULT_APP_CONFIG);
    expect(parseAppConfigValue(null)).toEqual(DEFAULT_APP_CONFIG);
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      social_enabled: false,
      coach_enabled: false,
      entry_offer_enabled: false,
      social_comments_enabled: false,
    });
  });

  it('treats a missing comments flag as enabled when social is enabled', () => {
    expect(parseAppConfigValue({ social_enabled: true })).toEqual({
      ...DEFAULT_APP_CONFIG,
      social_enabled: true,
      social_comments_enabled: true,
    });
    expect(
      parseAppConfigValue({
        social_enabled: true,
        social_comments_enabled: false,
      }),
    ).toEqual({
      ...DEFAULT_APP_CONFIG,
      social_enabled: true,
      social_comments_enabled: false,
    });
    expect(areSocialCommentsEnabled({ social_enabled: true } as any)).toBe(true);
    expect(
      areSocialCommentsEnabled({
        social_enabled: true,
        social_comments_enabled: false,
      }),
    ).toBe(false);
  });

  it('resolves the social comments gate without treating defaults as an explicit disable', () => {
    expect(
      resolveSocialCommentsGate(DEFAULT_APP_CONFIG, {
        resolved: false,
      }),
    ).toBe('unknown');
    expect(
      resolveSocialCommentsGate(DEFAULT_APP_CONFIG, {
        resolved: true,
      }),
    ).toBe('unknown');
    expect(
      resolveSocialCommentsGate(
        {
          social_enabled: true,
          social_comments_enabled: true,
          config_source: 'canonical',
        },
        { resolved: true },
      ),
    ).toBe('enabled');
    expect(
      resolveSocialCommentsGate(
        {
          social_enabled: true,
          social_comments_enabled: false,
          config_source: 'canonical',
        },
        { resolved: true },
      ),
    ).toBe('disabled');
    expect(shouldEnableSocialComments('unknown')).toBe(true);
    expect(shouldEnableSocialComments('enabled')).toBe(true);
    expect(shouldEnableSocialComments('disabled')).toBe(false);
  });

  it('prefers the canonical app_feature_flags row when it is available', async () => {
    mockCanonicalMaybeSingle.mockResolvedValue({
      data: {
        social_enabled: true,
        moderation_enabled: true,
      },
      error: null,
    });

    await expect(fetchAppConfig()).resolves.toEqual({
      ...DEFAULT_APP_CONFIG,
      config_source: 'canonical',
      social_enabled: true,
      social_comments_enabled: true,
      moderation_enabled: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('app_feature_flags');
    expect(mockCanonicalSelect).toHaveBeenCalledWith(
      'social_enabled, coach_enabled, entry_offer_enabled, social_comments_enabled, entry_offer_offering_id, post_rate_limit_per_day, comment_rate_limit_per_hour, rollout_percentage, moderation_enabled',
    );
    expect(mockCanonicalEq).toHaveBeenCalledWith('scope', APP_CONFIG_REMOTE_KEY);
    expect(mockCompatibilitySelect).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('falls back to the feature flags RPC when direct config reads fail', async () => {
    mockCanonicalMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table app_feature_flags',
      },
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          social_enabled: true,
          moderation_enabled: true,
        },
      ],
      error: null,
    });

    await expect(fetchAppConfig()).resolves.toEqual({
      ...DEFAULT_APP_CONFIG,
      config_source: 'rpc',
      social_enabled: true,
      social_comments_enabled: true,
      moderation_enabled: true,
    });

    expect(mockRpc).toHaveBeenCalledWith('get_phase2_feature_flags', {
      p_scope: APP_CONFIG_REMOTE_KEY,
    });
    expect(mockCompatibilitySelect).not.toHaveBeenCalled();
  });

  it('falls back to the app_config compatibility view when app_feature_flags is unavailable', async () => {
    mockCanonicalMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "app_feature_flags" does not exist',
      },
    });
    mockCompatibilityMaybeSingle.mockResolvedValue({
      data: {
        value: {
          coach_enabled: true,
          social_comments_enabled: true,
        },
      },
      error: null,
    });

    await expect(fetchAppConfig()).resolves.toEqual({
      ...DEFAULT_APP_CONFIG,
      config_source: 'compatibility',
      coach_enabled: true,
      social_comments_enabled: true,
    });

    expect(mockFrom).toHaveBeenCalledWith('app_config');
    expect(mockRpc).toHaveBeenCalledWith('get_phase2_feature_flags', {
      p_scope: APP_CONFIG_REMOTE_KEY,
    });
    expect(mockCompatibilitySelect).toHaveBeenCalledWith('value');
    expect(mockCompatibilityEq).toHaveBeenCalledWith('key', APP_CONFIG_REMOTE_KEY);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('falls back when the canonical row is missing and returns defaults when all sources are unavailable', async () => {
    mockCanonicalMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    mockCompatibilityMaybeSingle.mockResolvedValueOnce({
      data: {
        value: {
          social_enabled: true,
          social_comments_enabled: true,
        },
      },
      error: null,
    });

    await expect(fetchAppConfig()).resolves.toEqual({
      ...DEFAULT_APP_CONFIG,
      config_source: 'compatibility',
      social_enabled: true,
      social_comments_enabled: true,
    });
    expect(mockRpc).toHaveBeenCalledWith('get_phase2_feature_flags', {
      p_scope: APP_CONFIG_REMOTE_KEY,
    });
    expect(mockCompatibilitySelect).toHaveBeenCalledWith('value');

    jest.clearAllMocks();

    mockCanonicalMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "app_feature_flags" does not exist',
      },
    });
    mockCompatibilityMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '42P01', message: 'relation "app_config" does not exist' },
    });

    await expect(fetchAppConfig()).resolves.toEqual(DEFAULT_APP_CONFIG);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
