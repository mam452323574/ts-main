import React from 'react';
import { AppState, Platform, Text } from 'react-native';
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
const mockLogExpectedFailure = jest.fn();
const mockCreateOAuthState = jest.fn(() => 'oauth-state-1');
const mockCreateAppleNonceHash = jest.fn(async (rawNonce: string) => `hashed-${rawNonce}`);
const mockAppleSignInAsync = jest.fn();

jest.mock('@/utils/runtimeCapabilities', () => ({
  getRuntimeCapabilities: () => mockGetRuntimeCapabilities(),
  logRuntimeDecision: (...args: unknown[]) => mockLogRuntimeDecision(...args),
  logRuntimeDecisionOnce: (...args: unknown[]) =>
    mockLogRuntimeDecisionOnce(...args),
}));

jest.mock('@/services/runtimeConfig', () => ({
  getRuntimeConfig: () => mockGetRuntimeConfig(),
  tryGetRuntimeConfig: () => {
    try {
      return { ok: true, config: mockGetRuntimeConfig() };
    } catch (error) {
      return { ok: false, error };
    }
  },
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

jest.mock('@/utils/oauthState', () => ({
  createOAuthState: () => mockCreateOAuthState(),
}));

jest.mock('@/utils/appleNonce', () => ({
  createAppleNonceHash: (rawNonce: string) => mockCreateAppleNonceHash(rawNonce),
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => mockAppleSignInAsync(...args),
  AppleAuthenticationScope: {
    FULL_NAME: 'FULL_NAME',
    EMAIL: 'EMAIL',
  },
}));

jest.mock('@/utils/observability', () => ({
  logOperationalError: (...args: unknown[]) => mockLogOperationalError(...args),
  logExpectedFailure: (...args: unknown[]) => mockLogExpectedFailure(...args),
  sanitizeObservabilityProperties: (properties?: Record<string, unknown>) =>
    properties,
}));

jest.mock('@/services/avatar', () => ({
  clearAvatarUrlCache: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { secureStorage } from '@/services/secureStorage';

const { supabase } = jest.requireMock('@/services/supabase') as {
  supabase: {
    auth: {
      getSession: jest.Mock;
      setSession: jest.Mock;
      onAuthStateChange: jest.Mock;
      startAutoRefresh: jest.Mock;
      stopAutoRefresh: jest.Mock;
      signInWithOAuth: jest.Mock;
      signInWithIdToken: jest.Mock;
      exchangeCodeForSession: jest.Mock;
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
  refresh_token: 'refresh-token-1',
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
const mockTableInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const mockTableDeleteEq = jest.fn().mockResolvedValue({ data: null, error: null });
const mockTableDelete = jest.fn(() => ({
  eq: mockTableDeleteEq,
}));
const mockTableUpdateEq = jest.fn().mockResolvedValue({ data: null, error: null });
const mockTableUpdate = jest.fn(() => ({
  eq: mockTableUpdateEq,
}));
const { openAuthSessionAsync } = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock;
};
const SecureStoreMock = jest.requireMock('expo-secure-store') as {
  __resetSecureStoreMock?: () => void;
};

const APPLE_AUTHORIZATION_CODE_STORAGE_KEY =
  'selflens.apple.authorization_code.v1';

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
    signUp: auth.signUp,
    signInWithGoogle: auth.signInWithGoogle,
    signInWithOAuth: auth.signInWithOAuth,
    deleteAccount: auth.deleteAccount,
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
        signUp: (email: string, password: string) => Promise<{
          userId: string;
          email: string;
        }>;
        signInWithGoogle: () => Promise<void>;
        signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
        deleteAccount: () => Promise<void>;
      }
    | undefined;
}

describe('AuthProvider RevenueCat startup behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStoreMock.__resetSecureStoreMock?.();
    mockCreateAppleNonceHash.mockImplementation(
      async (rawNonce: string) => `hashed-${rawNonce}`,
    );
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
    supabase.auth.setSession.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://oauth.example/authorize' },
      error: null,
    });
    supabase.auth.signInWithIdToken.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    supabase.from.mockImplementation(() => ({
      select: mockProfileSelect,
      insert: mockTableInsert,
      delete: mockTableDelete,
      update: mockTableUpdate,
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
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'exp://auth/callback?code=oauth-code&state=oauth-state-1',
    });
    mockAppleSignInAsync.mockResolvedValue({
      identityToken: 'apple-identity-token',
      authorizationCode: 'apple-authorization-code',
      state: 'apple-state-1',
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

  it('calls the delete-account Edge Function and clears local auth state', async () => {
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
    mockFetch.mockClear();

    const deleteAccount = getLastAuthRender(onAuthRender)?.deleteAccount;
    await act(async () => {
      await deleteAccount?.();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/delete-account',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${session.access_token}`,
        }),
        body: JSON.stringify({ confirmation: 'DELETE_ACCOUNT' }),
      }),
    );
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(getLastAuthRender(onAuthRender)).toEqual(
      expect.objectContaining({
        user: null,
        session: null,
        userProfile: null,
      }),
    );
  });

  it('passes a stored Apple authorization code to account deletion for revocation', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    await secureStorage.setItem(
      APPLE_AUTHORIZATION_CODE_STORAGE_KEY,
      'apple-code-for-revoke',
    );
    const onAuthRender = jest.fn();

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.user?.id).toBe(user.id);
    });
    mockFetch.mockClear();

    const deleteAccount = getLastAuthRender(onAuthRender)?.deleteAccount;
    await act(async () => {
      await deleteAccount?.();
    });

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      confirmation: 'DELETE_ACCOUNT',
      apple_authorization_code: 'apple-code-for-revoke',
    });
    await expect(
      secureStorage.getItem(APPLE_AUTHORIZATION_CODE_STORAGE_KEY),
    ).resolves.toBeNull();
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

  it('turns secure-signup rate limits into IpLimitError with request_id telemetry', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canUseLocalNotifications: true,
      canRegisterForPushNotifications: false,
    });
    const onAuthRender = jest.fn();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: jest.fn().mockResolvedValue({
        error: 'Account creation limit reached for this network.',
        code: 'signup_rate_limited',
        request_id: 'req-limit-1',
      }),
    });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).rejects.toMatchObject({
      name: 'IpLimitError',
      code: 'signup_rate_limited',
      status: 429,
      requestId: 'req-limit-1',
    });

    // Le throttle 429 est une condition attendue : log en WARN, pas en ERROR.
    expect(mockLogExpectedFailure).toHaveBeenCalledWith(
      '[SignUp] secure-signup rate limited',
      null,
      {
        status: 429,
        code: 'signup_rate_limited',
        request_id: 'req-limit-1',
      },
    );
    expect(mockLogOperationalError).not.toHaveBeenCalledWith(
      '[SignUp] secure-signup rate limited',
      expect.anything(),
      expect.anything(),
    );
  });

  it('logs secure-signup generic rejections with request_id', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({
        error: 'Signup not allowed. Please try a different email or password.',
        code: 'signup_failed',
        request_id: 'req-signup-422',
      }),
    });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).rejects.toThrow('Erreur lors de la création du compte');

    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[SignUp] secure-signup rejected',
      null,
      {
        status: 422,
        code: 'signup_failed',
        request_id: 'req-signup-422',
      },
    );
  });

  it('bootstraps the session and repairs the profile after secure-signup without raw profile insert', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const createdUser = {
      id: 'new-user-1',
      email: 'fresh@example.com',
      user_metadata: {},
    };
    const createdSession = {
      access_token: 'session-token-new',
      refresh_token: 'refresh-token-new',
      user: createdUser,
    };

    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: createdSession } });
    supabase.auth.setSession.mockResolvedValueOnce({
      data: { user: createdUser, session: createdSession },
      error: null,
    });
    supabase.rpc.mockImplementation((name: string) => {
      if (name === 'repair_missing_user_profile') {
        return Promise.resolve({
          data: {
            ...userProfile,
            id: createdUser.id,
            email: createdUser.email,
            email_verified: false,
          },
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({
          ok: true,
          user_id: createdUser.id,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          ok: true,
          session: createdSession,
        }),
      });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).resolves.toEqual({
      userId: createdUser.id,
      email: 'fresh@example.com',
    });

    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: createdSession.access_token,
      refresh_token: createdSession.refresh_token,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('repair_missing_user_profile', {
      p_avatar_url: null,
    });
    expect(supabase.from).not.toHaveBeenCalledWith('user_profiles');
  });

  it('logs and skips orphan cleanup when session bootstrap fails after secure-signup', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const createdUserId = 'new-user-2';
    const createdSession = {
      access_token: 'session-token-new-2',
      refresh_token: 'refresh-token-new-2',
      user: {
        id: createdUserId,
        email: 'fresh@example.com',
        user_metadata: {},
      },
    };

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    supabase.auth.setSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error('session install failed'),
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({
          ok: true,
          user_id: createdUserId,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          ok: true,
          session: createdSession,
        }),
      });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).rejects.toThrow('Erreur lors de la création du compte');

    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[SignUp] Failed to install session after secure-signup',
      expect.any(Error),
      {
        user_id: createdUserId,
      },
    );
    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[Cleanup] Skipped orphan cleanup because no session',
      null,
      {
        user_id: createdUserId,
      },
    );
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'repair_missing_user_profile',
      expect.anything(),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/cleanup-orphan-user',
      expect.anything(),
    );
  });

  it('maps secure-login invalid_credentials after secure-signup to a generic signup failure', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const createdUserId = 'new-user-invalid-login';

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({
          ok: true,
          user_id: createdUserId,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({
          code: 'invalid_credentials',
          error: 'Invalid email or password.',
        }),
      });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).rejects.toThrow('Erreur lors de la création du compte');

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[SignUp] Failed to install session after secure-signup',
      expect.objectContaining({
        code: 'invalid_credentials',
        status: 401,
      }),
      {
        user_id: createdUserId,
      },
    );
    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[Cleanup] Skipped orphan cleanup because no session',
      null,
      {
        user_id: createdUserId,
      },
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/cleanup-orphan-user',
      expect.anything(),
    );
  });

  it('cleans up the orphan when profile repair fails after session install', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const createdUserId = 'new-user-3';
    const createdUser = {
      id: createdUserId,
      email: 'fresh@example.com',
      user_metadata: {},
    };
    const createdSession = {
      access_token: 'session-token-new-3',
      refresh_token: 'refresh-token-new-3',
      user: createdUser,
    };

    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: createdSession } })
      .mockResolvedValueOnce({ data: { session: createdSession } });
    supabase.auth.setSession.mockResolvedValueOnce({
      data: { user: createdUser, session: createdSession },
      error: null,
    });
    supabase.rpc.mockImplementation((name: string) => {
      if (name === 'repair_missing_user_profile') {
        return Promise.resolve({
          data: null,
          error: new Error('repair failed'),
        });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: jest.fn().mockResolvedValue({
          ok: true,
          user_id: createdUserId,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          ok: true,
          session: createdSession,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signUp = getLastAuthRender(onAuthRender)?.signUp;
    await expect(
      signUp?.('fresh@example.com', 'StrongerPass42!'),
    ).rejects.toThrow('Erreur lors de la création du compte');

    expect(mockLogOperationalError).toHaveBeenCalledWith(
      '[SignUp] Failed to repair initial profile after session install',
      null,
      {
        user_id: createdUserId,
      },
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/cleanup-orphan-user',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${createdSession.access_token}`,
        }),
      }),
    );
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('uses profile repair RPC instead of raw insert for OAuth bootstrap when profile is missing', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const oauthUser = {
      id: 'oauth-user-1',
      email: 'oauth@example.com',
      user_metadata: {
        avatar_url: 'https://avatar.example/profile.png',
        sub: 'google-sub-1',
      },
    };
    const oauthSession = {
      access_token: 'oauth-session-token',
      refresh_token: 'oauth-refresh-token',
      user: oauthUser,
    };

    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: oauthSession } });
    supabase.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: oauthUser, session: oauthSession },
      error: null,
    });
    mockProfileMaybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValue({
        data: {
          ...userProfile,
          id: oauthUser.id,
          email: oauthUser.email,
        },
        error: null,
      });
    supabase.rpc.mockImplementation((name: string) => {
      if (name === 'repair_missing_user_profile') {
        return Promise.resolve({
          data: {
            ...userProfile,
            id: oauthUser.id,
            email: oauthUser.email,
          },
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        disposable: false,
        success: true,
      }),
    });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signInWithGoogle = getLastAuthRender(onAuthRender)?.signInWithGoogle;
    await expect(signInWithGoogle?.()).resolves.toBeUndefined();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'exp://auth/callback',
        queryParams: {
          state: 'oauth-state-1',
        },
        skipBrowserRedirect: true,
      },
    });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      'https://oauth.example/authorize',
      'exp://auth/callback',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('repair_missing_user_profile', {
      p_avatar_url: 'https://avatar.example/profile.png',
    });
    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      'oauth-code',
    );
  });

  it('keeps the legacy OAuth wrapper delegated to the Google flow', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signInWithOAuth = getLastAuthRender(onAuthRender)?.signInWithOAuth;
    await expect(signInWithOAuth?.('google')).resolves.toBeUndefined();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: 'exp://auth/callback',
          skipBrowserRedirect: true,
        }),
      }),
    );
  });

  it('uses native Apple sign-in with nonce instead of web OAuth on iOS', async () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    mockCreateOAuthState
      .mockReturnValueOnce('apple-nonce-1')
      .mockReturnValueOnce('apple-state-1');
    const onAuthRender = jest.fn();

    try {
      supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

      renderProvider(onAuthRender);

      await waitFor(() => {
        expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
      });

      const signInWithOAuth = getLastAuthRender(onAuthRender)?.signInWithOAuth;
      await expect(signInWithOAuth?.('apple')).resolves.toBeUndefined();

      expect(mockCreateAppleNonceHash).toHaveBeenCalledWith('apple-nonce-1');
      expect(mockAppleSignInAsync).toHaveBeenCalledWith({
        requestedScopes: ['FULL_NAME', 'EMAIL'],
        nonce: 'hashed-apple-nonce-1',
        state: 'apple-state-1',
      });
      expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
        provider: 'apple',
        token: 'apple-identity-token',
        nonce: 'apple-nonce-1',
      });
      expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'apple' }),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  });

  it('logs Apple id-token exchange failures without token material', async () => {
    const originalPlatformOS = Platform.OS;
    const appleError = new Error('Apple nonce mismatch');
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    mockCreateOAuthState
      .mockReturnValueOnce('apple-nonce-2')
      .mockReturnValueOnce('apple-state-2');
    mockAppleSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-identity-token-secret',
      authorizationCode: 'apple-authorization-code-secret',
      state: 'apple-state-2',
    });
    supabase.auth.signInWithIdToken.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: appleError,
    });
    const onAuthRender = jest.fn();

    try {
      supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

      renderProvider(onAuthRender);

      await waitFor(() => {
        expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
      });

      const signInWithOAuth = getLastAuthRender(onAuthRender)?.signInWithOAuth;
      await expect(signInWithOAuth?.('apple')).rejects.toThrow(
        'Apple nonce mismatch',
      );

      expect(mockLogOperationalError).toHaveBeenCalledWith(
        '[OAuth] Apple signInWithIdToken failed',
        appleError,
        { provider: 'apple' },
      );
      expect(mockLogOperationalError).toHaveBeenCalledWith(
        '[OAuth] Apple native flow failed',
        appleError,
        { provider: 'apple' },
      );
      const loggedPayload = JSON.stringify(mockLogOperationalError.mock.calls);
      expect(loggedPayload).not.toContain('apple-identity-token-secret');
      expect(loggedPayload).not.toContain('apple-authorization-code-secret');
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
    }
  });

  it('soft-allows Apple OAuth signup when shared review-network IP rate limit is hit', async () => {
    const originalPlatformOS = Platform.OS;
    const originalDev = (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: false,
    });
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'standalone',
      isExpoGo: false,
      canUseNativePurchases: true,
      canRegisterForPushNotifications: true,
      canUseLocalNotifications: true,
    });
    mockCreateOAuthState
      .mockReturnValueOnce('apple-nonce-3')
      .mockReturnValueOnce('apple-state-3');
    mockAppleSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-identity-token',
      state: 'apple-state-3',
    });
    mockProfileMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: userProfile, error: null });
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    supabase.rpc.mockResolvedValueOnce({ data: userProfile, error: null });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: jest.fn().mockResolvedValue({
          code: 'ip_signup_rate_limited',
          error: 'Signup limit reached',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ allowed: true }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ success: true }),
      });
    const onAuthRender = jest.fn();

    try {
      renderProvider(onAuthRender);

      await waitFor(() => {
        expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
      });

      const signInWithOAuth = getLastAuthRender(onAuthRender)?.signInWithOAuth;
      await expect(signInWithOAuth?.('apple')).resolves.toBeUndefined();

      expect(mockLogOperationalError).toHaveBeenCalledWith(
        '[OAuth] IP eligibility rate limit soft-allowed',
        expect.objectContaining({ name: 'IpLimitError' }),
        { provider: 'apple' },
      );
      expect(mockLogOperationalError).not.toHaveBeenCalledWith(
        '[OAuth] IP eligibility blocked signup',
        expect.anything(),
        expect.anything(),
      );
      expect(supabase.rpc).toHaveBeenCalledWith(
        'repair_missing_user_profile',
        expect.any(Object),
      );
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatformOS,
      });
      Object.defineProperty(globalThis, '__DEV__', {
        configurable: true,
        value: originalDev,
      });
    }
  });

  it('treats a dismissed OAuth browser session as a clean cancellation', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    openAuthSessionAsync.mockResolvedValueOnce({
      type: 'dismiss',
    });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signInWithGoogle = getLastAuthRender(onAuthRender)?.signInWithGoogle;
    await expect(signInWithGoogle?.()).rejects.toThrow(
      'Authentification annulée',
    );

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    // Une annulation volontaire ne doit pas être remontée en erreur
    // opérationnelle (sinon stack trace rouge bruyante pour un geste normal).
    expect(mockLogOperationalError).not.toHaveBeenCalledWith(
      '[OAuth] OAuth flow failed',
      expect.anything(),
      expect.anything(),
    );
  });

  it('does not log OAuth callback codes or tokens during debug logging', async () => {
    mockGetRuntimeCapabilities.mockReturnValue({
      platform: 'ios',
      appOwnership: 'expo',
      isExpoGo: true,
      canUseNativePurchases: false,
      canRegisterForPushNotifications: false,
      canUseLocalNotifications: true,
    });
    const onAuthRender = jest.fn();
    const consoleInfoSpy = jest
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);

    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

    renderProvider(onAuthRender);

    await waitFor(() => {
      expect(getLastAuthRender(onAuthRender)?.loading).toBe(false);
    });

    const signInWithGoogle = getLastAuthRender(onAuthRender)?.signInWithGoogle;
    await expect(signInWithGoogle?.()).resolves.toBeUndefined();

    const serializedDebugLogs = JSON.stringify([
      consoleInfoSpy.mock.calls,
      mockLogOperationalError.mock.calls,
    ]);
    expect(serializedDebugLogs).not.toContain('oauth-code');
    expect(serializedDebugLogs).not.toContain('oauth-session-token');
    expect(serializedDebugLogs).not.toContain('oauth-refresh-token');

    consoleInfoSpy.mockRestore();
  });
});
