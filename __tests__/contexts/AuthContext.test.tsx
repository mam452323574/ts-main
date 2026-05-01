import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

jest.unmock('@/contexts/AuthContext');

const mockGetRuntimeCapabilities = jest.fn();
const mockLogRuntimeDecision = jest.fn();
const mockLogRuntimeDecisionOnce = jest.fn();
const mockGetRuntimeConfig = jest.fn();
const mockGetSupabaseFunctionUrl = jest.fn();
const mockLoadPurchasesModule = jest.fn();
const mockMarkStartup = jest.fn();
const mockTrackFailureEvent = jest.fn();
const mockLogOperationalError = jest.fn();

jest.mock('@/utils/runtimeCapabilities', () => ({
  getRuntimeCapabilities: () => mockGetRuntimeCapabilities(),
  logRuntimeDecision: (...args: unknown[]) => mockLogRuntimeDecision(...args),
  logRuntimeDecisionOnce: (...args: unknown[]) =>
    mockLogRuntimeDecisionOnce(...args),
}));

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => mockGetRuntimeConfig(),
  getSupabaseFunctionUrl: (functionName: string) =>
    mockGetSupabaseFunctionUrl(functionName),
}));

jest.mock('@/services/purchasesRuntime', () => ({
  loadPurchasesModule: () => mockLoadPurchasesModule(),
}));

jest.mock('@/contexts/StartupDiagnosticsContext', () => ({
  useStartupDiagnostics: () => ({
    markStartup: mockMarkStartup,
    settleStartup: jest.fn(),
    hasTimedOut: false,
  }),
}));

jest.mock('@/services/analytics', () => ({
  trackFailureEvent: (...args: unknown[]) => mockTrackFailureEvent(...args),
}));

jest.mock('@/utils/observability', () => ({
  logOperationalError: (...args: unknown[]) => mockLogOperationalError(...args),
}));

jest.mock('@/services/avatar', () => ({
  clearAvatarUrlCache: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    auth: {
      getSession: jest.Mock;
      onAuthStateChange: jest.Mock;
      startAutoRefresh: jest.Mock;
      stopAutoRefresh: jest.Mock;
      signOut: jest.Mock;
    };
    from: jest.Mock;
    rpc: jest.Mock;
  };
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

const user = {
  id: 'user-1',
  email: 'user@example.com',
  user_metadata: {},
};

const session = {
  access_token: 'session-token-1',
  user,
};

const userProfile = {
  id: user.id,
  email: user.email,
  username: 'testuser',
  avatar_url: null,
  scan_count: 0,
  account_tier: 'free',
  coach_persona_key: 'gentle_supportive',
  bio: null,
  push_token: null,
  email_verified: true,
  has_seen_tutorial: true,
  notification_settings: {
    reminders: true,
    achievements: true,
    newContent: true,
  },
  scan_usage: {
    health: { last_scan_date: null, scan_timestamps: [] },
    body: { last_scan_date: null, scan_timestamps: [] },
    nutrition: { last_scan_date: null, scan_timestamps: [] },
  },
  welcome_credits: {
    health: 0,
    body: 0,
    nutrition: 0,
  },
  last_scan_date: null,
  account_created_at: '2026-04-25T00:00:00.000Z',
  created_at: '2026-04-25T00:00:00.000Z',
  updated_at: '2026-04-25T00:00:00.000Z',
};

let authStateCallback:
  | ((event: string, nextSession: any) => void)
  | null = null;
let appStateCallback: ((state: typeof AppState.currentState) => void) | null =
  null;
let mockCurrentAppState: typeof AppState.currentState = 'active';
const mockUnsubscribe = jest.fn();
const mockRemoveAppStateListener = jest.fn();
const mockProfileMaybeSingle = jest.fn();
const mockProfileEq = jest.fn(() => ({
  maybeSingle: mockProfileMaybeSingle,
}));
const mockProfileSelect = jest.fn(() => ({
  eq: mockProfileEq,
}));

const renderProvider = (onAuthRender: jest.Mock = jest.fn()) =>
  render(
    <AuthProvider>
      <AuthStateProbe onRender={onAuthRender} />
    </AuthProvider>,
  );

function AuthStateProbe({ onRender }: { onRender: jest.Mock }) {
  const auth = useAuth();
  onRender({
    user: auth.user,
    session: auth.session,
    userProfile: auth.userProfile,
    loading: auth.loading,
  });
  return <Text testID="auth-child">ready</Text>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function getLastAuthRender(onAuthRender: jest.Mock) {
  const lastCall = onAuthRender.mock.calls[onAuthRender.mock.calls.length - 1];
  return lastCall?.[0] as
    | {
        user: typeof user | null;
        session: typeof session | null;
        userProfile: typeof userProfile | null;
        loading: boolean;
      }
    | undefined;
}

describe('AuthProvider RevenueCat startup behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallback = null;
    appStateCallback = null;
    mockCurrentAppState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_event, callback) => {
        appStateCallback = callback;
        return {
          remove: mockRemoveAppStateListener,
        } as any;
      },
    );
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => mockCurrentAppState,
    });
    mockGetRuntimeConfig.mockReturnValue({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      revenueCatIosApiKey: 'ios-key',
      revenueCatAndroidApiKey: 'android-key',
      aptabaseAppKey: null,
      aptabaseHost: null,
    });
    mockGetSupabaseFunctionUrl.mockImplementation(
      (functionName: string) =>
        `https://example.supabase.co/functions/v1/${functionName}`,
    );
    supabase.auth.getSession.mockResolvedValue({
      data: { session },
    });
    supabase.auth.onAuthStateChange.mockImplementation(
      (callback: typeof authStateCallback) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      },
    );
    supabase.from.mockImplementation(() => ({
      select: mockProfileSelect,
    }));
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    mockProfileMaybeSingle.mockResolvedValue({
      data: userProfile,
      error: null,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });
  });

  it('skips RevenueCat identity and subscription sync during Expo Go hydration', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });

    renderProvider();

    await waitFor(() => {
      expect(mockProfileMaybeSingle).toHaveBeenCalled();
    });

    expect(mockLoadPurchasesModule).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLogRuntimeDecisionOnce).toHaveBeenCalledWith(
      'RevenueCat subscription sync skipped',
      { reason: 'development-build-required' },
      'revenuecat-subscription-sync-skipped-expo-go',
    );
  });

  it('dedupes subscription sync across initial session and INITIAL_SESSION event', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'standalone',
      isExpoGo: false,
      canUseNativePurchases: true,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: true,
    });
    mockLoadPurchasesModule.mockResolvedValue({
      default: {
        logIn: jest.fn().mockResolvedValue(undefined),
        logOut: jest.fn().mockResolvedValue(undefined),
      },
    });

    renderProvider();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      authStateCallback?.('INITIAL_SESSION', session);
      await Promise.resolve();
    });

    expect(mockProfileMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/sync-subscription-status',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${session.access_token}`,
        }),
      }),
    );
  });

  it('starts and stops Supabase auto refresh with native AppState', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    mockCurrentAppState = 'background';

    const { unmount } = renderProvider();

    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateCallback?.('active');
    });
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateCallback?.('background');
    });
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);

    unmount();

    expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(3);
  });

  it('keeps the profile and updates the session on TOKEN_REFRESHED', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    const onAuthRender = jest.fn();
    const refreshedSession = {
      ...session,
      access_token: 'session-token-2',
      refresh_token: 'refresh-token-2',
      expires_at: 123456,
    };

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    await act(async () => {
      authStateCallback?.('TOKEN_REFRESHED', refreshedSession);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.session?.access_token).toBe(
        'session-token-2'
      );
    });
    expect(getLastAuthRender(onAuthRender)?.userProfile?.username).toBe(
      userProfile.username
    );
  });

  it('keeps an existing profile when profile refresh fails during TOKEN_REFRESHED', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    const onAuthRender = jest.fn();
    const refreshedSession = {
      ...session,
      access_token: 'session-token-2',
      refresh_token: 'refresh-token-2',
      expires_at: 123456,
    };

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.userProfile?.id).toBe(user.id);
    });

    mockProfileMaybeSingle.mockRejectedValueOnce(new Error('network failed'));
    supabase.rpc.mockRejectedValueOnce(new Error('rpc unavailable'));

    await act(async () => {
      authStateCallback?.('TOKEN_REFRESHED', refreshedSession);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.session?.access_token).toBe(
        'session-token-2'
      );
    });
    expect(getLastAuthRender(onAuthRender)?.userProfile?.username).toBe(
      userProfile.username
    );
  });

  it('clears auth state on SIGNED_OUT', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    const onAuthRender = jest.fn();

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.user?.id).toBe(user.id);
    });

    await act(async () => {
      authStateCallback?.('SIGNED_OUT', null);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)).toEqual(
        expect.objectContaining({
          user: null,
          session: null,
          userProfile: null,
          loading: false,
        })
      );
    });
  });

  it('does not repair a missing profile after a stale signed-in hydration is superseded by sign-out', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    const profileRead = createDeferred<{ data: null; error: null }>();
    mockProfileMaybeSingle.mockReturnValueOnce(profileRead.promise);

    renderProvider();

    await waitFor(() => {
      expect(mockProfileMaybeSingle).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      authStateCallback?.('SIGNED_OUT', null);
      profileRead.resolve({ data: null, error: null });
      await profileRead.promise;
      await Promise.resolve();
    });

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'repair_missing_user_profile',
      expect.anything(),
    );
    expect(mockLogOperationalError).not.toHaveBeenCalledWith(
      '[Auth] Failed to repair missing user profile',
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips missing profile repair when the current Supabase session no longer matches the hydrated user', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session } })
      .mockResolvedValueOnce({ data: { session: null } });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    renderProvider();

    await waitFor(() => {
      expect(mockLogRuntimeDecision).toHaveBeenCalledWith(
        'Missing profile repair skipped',
        expect.objectContaining({
          reason: 'stale-or-missing-session',
          userId: user.id,
        }),
      );
    });

    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'repair_missing_user_profile',
      expect.anything(),
    );
    expect(mockLogOperationalError).not.toHaveBeenCalledWith(
      '[Auth] Failed to repair missing user profile',
      expect.anything(),
      expect.anything(),
    );
  });
});
