import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/services/supabase';
import { UserProfile } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { loadPurchasesModule } from '@/services/purchasesRuntime';
import { tryGetRuntimeConfig, getSupabaseFunctionUrl } from '@/services/runtimeConfig';
import { clearAvatarUrlCache } from '@/services/avatar';
import { secureStorage } from '@/services/secureStorage';
import { trackFailureEvent } from '@/services/analytics';
import {
  DEFAULT_COACH_PERSONA_KEY,
  hasCoachPersonaAccess,
  isCoachPersonaKey,
} from '@/shared/coachPersonas';
import { normalizePersistedInferredPersona } from '@/shared/coachProfileMemory';
import {
  logExpectedFailure,
  logOperationalError,
  sanitizeObservabilityProperties,
  type SafeObservabilityProperties,
} from '@/utils/observability';
import { validateCanonicalUsername } from '@/utils/username';
import {
  getRuntimeCapabilities,
  logRuntimeDecision,
  logRuntimeDecisionOnce,
} from '@/utils/runtimeCapabilities';
import { queryClient } from '@/services/queryClient';
import { createOAuthState } from '@/utils/oauthState';
import { createAppleNonceHash } from '@/utils/appleNonce';
import {
  createOAuthCancelledError,
  isOAuthCancellationError,
} from '@/utils/oauthErrors';
import { invalidateScanEligibilityQueries } from '@/utils/scanEligibilityQuery';
import { syncDeviceLocaleToProfile } from '@/services/userProfile';
import { invalidateCoachProfileMemoryCache } from '@/services/coach';
import { isPostgresUniqueViolation } from '@/utils/postgrestErrors';

// Guard : un échec de cet appel natif au niveau module ne doit jamais faire
// crasher le démarrage (cf. rejet App Store 2.1(a) build 1.0.0(6)).
try {
  WebBrowser.maybeCompleteAuthSession();
} catch (error) {
  console.warn('[Auth] maybeCompleteAuthSession a échoué au démarrage:', error);
}

type AuthNextStep = 'email_verification' | 'ready';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isEmailVerified: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ nextStep: AuthNextStep; userId: string }>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ userId: string; email: string }>;
  completeSignUp: (
    userId: string,
    username: string,
    avatarUrl?: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  setUsername: (username: string, avatarUrl?: string | null) => Promise<void>;
  updateNotificationSettings: (
    notificationSettings: UserProfile['notification_settings']
  ) => Promise<void>;
  markTutorialSeen: () => Promise<void>;
  updateAvatarUrl: (avatarUrl: string | null) => Promise<void>;
  updateCoachPersona: (
    personaKey: UserProfile['coach_persona_key']
  ) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  isDisposableEmail: (email: string) => Promise<boolean>;
  sendVerificationEmail: () => Promise<void>;
  verifyEmailCode: (code: string) => Promise<boolean>;
  cleanupOrphanUser: (userId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

class OAuthUserVisibleError extends Error {
  constructor(message = 'oauth_login_failed') {
    super(message);
    this.name = 'OAuthUserVisibleError';
  }
}

type SafeProfileMutationInput = {
  username?: string | null;
  avatar_url?: string | null;
  notification_settings?: UserProfile['notification_settings'];
  push_token?: string | null;
  has_seen_tutorial?: boolean;
  coach_persona_key?: UserProfile['coach_persona_key'];
};

type ProfileWriteError = Error & {
  code?: string;
  status?: number;
  details?: unknown;
};

type LoadedUserProfileResult = {
  profile: UserProfile | null;
  source: 'supabase' | 'missing-profile' | 'profile-error';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_NOTIFICATION_SETTINGS: UserProfile['notification_settings'] = {
  reminders: true,
  achievements: true,
  newContent: true,
};

const APPLE_AUTHORIZATION_CODE_STORAGE_KEY =
  'selflens.apple.authorization_code.v1';

const SUBSCRIPTION_SYNC_DEDUPE_WINDOW_MS = 60 * 1000;

function normalizeOAuthPath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function readOAuthCallbackParams(callbackUrl: string) {
  const parsedUrl = new URL(callbackUrl);
  const params = new URLSearchParams(parsedUrl.search);
  const hash = parsedUrl.hash.replace(/^#\??/, '');

  if (hash) {
    new URLSearchParams(hash).forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return { parsedUrl, params };
}

function resolveOAuthAuthorizationCode(
  callbackUrl: string,
  expectedRedirectUrl: string,
  expectedState: string,
) {
  const { parsedUrl, params } = readOAuthCallbackParams(callbackUrl);
  const expectedUrl = new URL(expectedRedirectUrl);

  if (
    parsedUrl.protocol !== expectedUrl.protocol ||
    parsedUrl.host !== expectedUrl.host ||
    normalizeOAuthPath(parsedUrl.pathname) !== normalizeOAuthPath(expectedUrl.pathname)
  ) {
    throw new Error('Invalid OAuth redirect URL');
  }

  if (params.get('state') !== expectedState) {
    throw new Error('Invalid OAuth state');
  }

  const authCode = params.get('code');
  if (!authCode) {
    throw new Error('Missing OAuth authorization code');
  }

  return authCode;
}

function logOAuthDebug(
  message: string,
  properties?: SafeObservabilityProperties,
) {
  if (!__DEV__) {
    return;
  }

  const metadata = sanitizeObservabilityProperties(properties);
  if (metadata) {
    console.info(message, metadata);
    return;
  }

  console.info(message);
}

function logOAuthDebugError(
  message: string,
  error: unknown,
  properties?: SafeObservabilityProperties,
) {
  logOperationalError(message, error, properties);
}

async function persistAppleAuthorizationCode(authorizationCode: unknown) {
  if (typeof authorizationCode !== 'string') return;

  const trimmedCode = authorizationCode.trim();
  if (!trimmedCode) return;

  try {
    await secureStorage.setItem(
      APPLE_AUTHORIZATION_CODE_STORAGE_KEY,
      trimmedCode,
    );
  } catch (error) {
    logOperationalError('[OAuth] Failed to store Apple authorization code', error, {
      provider: 'apple',
    });
  }
}

async function readAppleAuthorizationCodeForRevocation() {
  try {
    const code = await secureStorage.getItem(APPLE_AUTHORIZATION_CODE_STORAGE_KEY);
    return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
  } catch (error) {
    logOperationalError('[DeleteAccount] Failed to read Apple authorization code', error, {
      provider: 'apple',
    });
    return null;
  }
}

async function clearAppleAuthorizationCode() {
  try {
    await secureStorage.removeItem(APPLE_AUTHORIZATION_CODE_STORAGE_KEY);
  } catch (error) {
    logOperationalError('[Auth] Failed to clear Apple authorization code', error, {
      provider: 'apple',
    });
  }
}

function isIpLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'IpLimitError' ||
      error.message.includes('limit reached') ||
      (error.message.includes('limite') && error.message.includes('atteinte')))
  );
}

const normalizeLoadedUserProfile = (
  profile: UserProfile | null,
): UserProfile | null => {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    coach_persona_key: isCoachPersonaKey(profile.coach_persona_key)
      ? profile.coach_persona_key
      : DEFAULT_COACH_PERSONA_KEY,
    inferred_persona: normalizePersistedInferredPersona(
      profile.inferred_persona ?? null,
    ),
  };
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readAuthMetadataString = (
  user: Pick<User, 'user_metadata'>,
  key: string,
) => {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
};

const resolveAuthUserAvatarUrl = (user: Pick<User, 'user_metadata'>) =>
  readAuthMetadataString(user, 'avatar_url') ||
  readAuthMetadataString(user, 'avatarUrl') ||
  readAuthMetadataString(user, 'picture');

const buildAuthGateProfile = (
  userId: string,
  rawProfile: Partial<UserProfile> | null,
): UserProfile | null => {
  if (!rawProfile) {
    return null;
  }

  const now = new Date().toISOString();

  return normalizeLoadedUserProfile({
    id: userId,
    email: typeof rawProfile.email === 'string' ? rawProfile.email : '',
    username:
      typeof rawProfile.username === 'string' ? rawProfile.username : null,
    avatar_url:
      typeof rawProfile.avatar_url === 'string' ? rawProfile.avatar_url : null,
    scan_count: 0,
    account_tier: 'free',
    coach_persona_key: DEFAULT_COACH_PERSONA_KEY,
    bio: null,
    push_token: null,
    email_verified: rawProfile.email_verified === true,
    has_seen_tutorial: rawProfile.has_seen_tutorial === true,
    notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
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
    account_created_at:
      typeof rawProfile.account_created_at === 'string'
        ? rawProfile.account_created_at
        : now,
    created_at:
      typeof rawProfile.created_at === 'string' ? rawProfile.created_at : now,
    updated_at:
      typeof rawProfile.updated_at === 'string' ? rawProfile.updated_at : now,
  });
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useLanguage();
  const { markStartup } = useStartupDiagnostics();
  const runtime = getRuntimeCapabilities();
  const runtimeConfigResult = tryGetRuntimeConfig();
  const supabaseAnonKey = runtimeConfigResult.ok
    ? runtimeConfigResult.config.supabaseAnonKey
    : null;
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const userRef = useRef<User | null>(null);
  const userProfileRef = useRef<UserProfile | null>(null);
  const isMountedRef = useRef(true);
  const authVersionRef = useRef(0);
  const lastAuthHydrationSignatureRef = useRef<string | null>(null);
  const lastProfileStartupSignatureRef = useRef<string | null>(null);
  const subscriptionSyncAttemptedAtRef = useRef<Map<string, number>>(new Map());
  const localeSyncSignatureRef = useRef<string | null>(null);

  const setCurrentSession = (nextSession: Session | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  };

  const setCurrentUser = (nextUser: User | null) => {
    userRef.current = nextUser;
    setUser(nextUser);
  };

  const setCurrentUserProfile = (nextProfile: UserProfile | null) => {
    userProfileRef.current = nextProfile;
    setUserProfile(nextProfile);
  };

  const isAuthHydrationCurrent = (version: number) =>
    isMountedRef.current && authVersionRef.current === version;

  const buildAuthHydrationSignature = (nextSession: Session | null) =>
    nextSession?.user?.id
      ? [
          nextSession.user.id,
          nextSession.access_token,
          nextSession.refresh_token,
          nextSession.expires_at,
        ]
          .filter((value): value is string | number => value !== undefined)
          .join(':')
      : 'no-session';

  const startAuthHydration = (
    nextSession: Session | null,
    source: string,
    hydrateAuthState: (
      session: Session | null,
      version: number,
      source: string,
    ) => Promise<void>,
  ) => {
    const signature = buildAuthHydrationSignature(nextSession);
    if (lastAuthHydrationSignatureRef.current === signature) {
      return;
    }

    lastAuthHydrationSignatureRef.current = signature;
    const version = ++authVersionRef.current;
    void hydrateAuthState(nextSession, version, source);
  };

  const applyUserProfile = (
    profile: UserProfile | null,
    version: number,
    extra: SafeObservabilityProperties = {}
  ) => {
    if (!isAuthHydrationCurrent(version)) {
      return;
    }

    setCurrentUserProfile(profile);
    const startupPayload = {
      hasProfile: !!profile,
      userId: profile?.id || extra.userId || '',
      ...extra,
    };
    const startupSignature = JSON.stringify(startupPayload);

    if (lastProfileStartupSignatureRef.current === startupSignature) {
      return;
    }

    lastProfileStartupSignatureRef.current = startupSignature;
    markStartup('profile-loaded', startupPayload);
  };

  const getFunctionHeaders = (
    token?: string | null,
    options: { allowAnon?: boolean } = {},
  ) => {
    const authToken =
      token || (options.allowAnon ? supabaseAnonKey : null);

    if (!authToken) {
      throw new Error('Authentication required for this request');
    }

    return {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json; charset=utf-8',
      'Content-Type': 'application/json',
    };
  };

  const resolveFunctionAccessToken = async (token?: string | null) => {
    if (token) {
      return token;
    }

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    return currentSession?.access_token ?? null;
  };

  const buildFunctionError = (
    functionName: string,
    status: number,
    payload: unknown,
  ) => {
    const errorPayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as {
            error?: unknown;
            code?: unknown;
            request_id?: unknown;
          })
        : {};
    const error = new Error(
      typeof errorPayload.error === 'string' && errorPayload.error.length > 0
        ? errorPayload.error
        : `${functionName} failed (${status})`,
    ) as Error & {
      code?: string;
      status?: number;
      requestId?: string;
    };

    error.code =
      typeof errorPayload.code === 'string' ? errorPayload.code : undefined;
    error.status = status;
    error.requestId =
      typeof errorPayload.request_id === 'string'
        ? errorPayload.request_id
        : undefined;

    return error;
  };

  const invalidateProfileDependentQueries = async () => {
    try {
      const { queryClient } = require('@/app/_layout');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['socialFeed'] }),
        queryClient.invalidateQueries({ queryKey: ['socialComments'] }),
      ]);
    } catch (error) {
      logOperationalError(
        '[ProfileUpdate] Failed to invalidate profile dependent queries',
        error,
      );
    }
  };

  const invalidateScanEligibilityCache = async (userId: string | null | undefined) => {
    try {
      const { queryClient } = require('@/app/_layout');
      await invalidateScanEligibilityQueries(queryClient, userId);
    } catch (error) {
      logOperationalError(
        '[ProfileUpdate] Failed to invalidate scan eligibility queries',
        error,
        { user_id: userId ?? undefined },
      );
    }
  };

  const invokeJsonFunction = async <TResponse,>(
    functionName: string,
    payload: Record<string, unknown>,
    options: { accessToken?: string | null } = {}
  ): Promise<TResponse> => {
    const accessToken = await resolveFunctionAccessToken(options.accessToken);
    const response = await fetch(getSupabaseFunctionUrl(functionName), {
      method: 'POST',
      headers: getFunctionHeaders(accessToken),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw buildFunctionError(functionName, response.status, data);
    }

    return data as TResponse;
  };

  const syncSubscriptionStatus = async (
    accessToken?: string | null,
    options: { userId?: string | null } = {}
  ) => {
    if (runtime.isExpoGo) {
      logRuntimeDecisionOnce(
        'RevenueCat subscription sync skipped',
        { reason: 'development-build-required' },
        'revenuecat-subscription-sync-skipped-expo-go',
      );
      return;
    }

    try {
      const currentAccessToken =
        accessToken ??
        (await supabase.auth.getSession()).data.session?.access_token;
      if (!currentAccessToken) {
        return;
      }

      const syncSignature = `${options.userId ?? 'unknown'}:${currentAccessToken}`;
      const now = Date.now();
      const lastAttemptedAt = subscriptionSyncAttemptedAtRef.current.get(syncSignature);
      if (
        lastAttemptedAt &&
        now - lastAttemptedAt < SUBSCRIPTION_SYNC_DEDUPE_WINDOW_MS
      ) {
        return;
      }

      subscriptionSyncAttemptedAtRef.current.set(syncSignature, now);

      const response = await fetch(getSupabaseFunctionUrl('sync-subscription-status'), {
        method: 'POST',
        headers: getFunctionHeaders(currentAccessToken),
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        // New accounts without RevenueCat history return 400/404 — expected, not an error
        if (response.status === 400 || response.status === 404) {
          return;
        }
        const data = await response.json().catch(() => ({}));
        throw buildFunctionError('sync-subscription-status', response.status, data);
      }
    } catch (error) {
      trackFailureEvent('subscription_entitlement_sync_failed', error, {
        source: 'auth_context',
      });
      logOperationalError('[Auth] Background subscription sync failed', error, {
        source: 'auth_context',
      });
    }
  };

  const syncRevenueCatIdentity = async (userId: string | null) => {
    if (!runtime.canUseNativePurchases) {
      logRuntimeDecisionOnce(
        'RevenueCat identity sync skipped',
        {
          reason: runtime.isExpoGo
            ? 'development-build-required'
            : 'unsupported-runtime',
        },
        runtime.isExpoGo
          ? 'revenuecat-identity-sync-skipped-expo-go'
          : 'revenuecat-identity-sync-skipped-unsupported',
      );
      return;
    }

    try {
      const purchasesModule = await loadPurchasesModule();
      if (!purchasesModule) {
        return;
      }

      const Purchases = purchasesModule.default;
      if (!userId) {
        await Purchases.logOut();
        return;
      }

      await Purchases.logIn(userId);
    } catch (error) {
      logOperationalError('[Auth] RevenueCat identity sync failed', error);
    }
  };

  const readUserProfileResult = async (
    userId: string,
  ): Promise<LoadedUserProfileResult> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const profile = normalizeLoadedUserProfile(data ?? null);
      return {
        profile,
        source: profile ? 'supabase' : 'missing-profile',
      };
    } catch (error) {
      try {
        const { data: authGateProfile, error: gateError } = await supabase.rpc(
          'get_auth_gate_profile',
        );

        if (gateError) {
          throw gateError;
        }

        const gateProfile = Array.isArray(authGateProfile)
          ? authGateProfile[0]
          : authGateProfile;
        const profile = buildAuthGateProfile(userId, gateProfile ?? null);

        return {
          profile,
          source: profile ? 'supabase' : 'missing-profile',
        };
      } catch (gateError) {
        logOperationalError('[Auth] Failed to load user profile', error, {
          user_id: userId,
        });
        logOperationalError('[Auth] Failed to load auth gate profile', gateError, {
          user_id: userId,
        });
      }

      logOperationalError('[Auth] Failed to load user profile', error, {
        user_id: userId,
      });
      return {
        profile: null,
        source: 'profile-error',
      };
    }
  };

  const loadUserProfile = async (
    userId: string,
    version = authVersionRef.current
  ): Promise<UserProfile | null> => {
    const result = await readUserProfileResult(userId);
    applyUserProfile(result.profile, version, {
      userId,
      source: result.source,
    });
    return result.profile;
  };

  const buildInitialProfileInsert = (
    currentUser: Pick<User, 'id' | 'email'>,
    safeFields: SafeProfileMutationInput = {}
  ) => ({
    id: currentUser.id,
    email: currentUser.email || `${currentUser.id}@oauth.temp`,
    username:
      safeFields.username === undefined ? null : safeFields.username,
    avatar_url:
      safeFields.avatar_url === undefined ? null : safeFields.avatar_url,
    ...(safeFields.notification_settings
      ? { notification_settings: safeFields.notification_settings }
      : {}),
    ...(safeFields.push_token !== undefined
      ? { push_token: safeFields.push_token }
      : {}),
    ...(safeFields.has_seen_tutorial !== undefined
      ? { has_seen_tutorial: safeFields.has_seen_tutorial }
      : {}),
    ...(safeFields.coach_persona_key !== undefined
      ? { coach_persona_key: safeFields.coach_persona_key }
      : {}),
  });

  const hasCurrentSessionForUser = async (userId: string, version: number) => {
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      return (
        isAuthHydrationCurrent(version) &&
        currentSession?.user?.id === userId &&
        Boolean(currentSession.access_token)
      );
    } catch (error) {
      logOperationalError('[Auth] Failed to verify current session', error, {
        user_id: userId,
      });
      return false;
    }
  };

  const repairMissingUserProfile = async (
    currentUser: Pick<User, 'id' | 'email' | 'user_metadata'>,
    version = authVersionRef.current,
  ) => {
    try {
      if (!(await hasCurrentSessionForUser(currentUser.id, version))) {
        logRuntimeDecision('Missing profile repair skipped', {
          reason: 'stale-or-missing-session',
          userId: currentUser.id,
        });
        return null;
      }

      const { data, error } = await supabase.rpc('repair_missing_user_profile', {
        p_avatar_url: resolveAuthUserAvatarUrl(currentUser),
      });

      if (error) {
        throw error;
      }

      if (!isAuthHydrationCurrent(version)) {
        return null;
      }

      const rawProfile = (Array.isArray(data) ? data[0] : data) as
        | UserProfile
        | null;
      const profile = normalizeLoadedUserProfile(rawProfile);

      applyUserProfile(profile, version, {
        userId: currentUser.id,
        source: profile ? 'supabase' : 'profile-error',
      });

      if (!profile) {
        logOperationalError(
          '[Auth] User profile repair RPC returned no row',
          null,
          { user_id: currentUser.id },
        );
      }

      return profile;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        // Race with on_auth_user_created trigger or concurrent repair: row
        // exists now, re-read instead of invalidating the profile state.
        const refreshed = await readUserProfileResult(currentUser.id);
        if (!isAuthHydrationCurrent(version)) {
          return null;
        }
        applyUserProfile(refreshed.profile, version, {
          userId: currentUser.id,
          source: refreshed.profile ? 'supabase' : 'profile-error',
        });
        return refreshed.profile;
      }

      logOperationalError('[Auth] Failed to repair missing user profile', error, {
        user_id: currentUser.id,
      });
      applyUserProfile(null, version, {
        userId: currentUser.id,
        source: 'profile-error',
      });
      return null;
    }
  };

  const extractMissingProfileColumn = (error: unknown) => {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const errorRecord = error as Record<string, unknown>;
    const errorMessages = [
      errorRecord.message,
      errorRecord.details,
      errorRecord.hint,
    ].filter((value): value is string => typeof value === 'string');

    for (const errorMessage of errorMessages) {
      const quotedMatch = errorMessage.match(/'([^']+)' column/i);
      if (quotedMatch?.[1]) {
        return quotedMatch[1];
      }

      const directMatch = errorMessage.match(/\bcolumn\s+([a-z_][a-z0-9_]*)\b/i);
      if (directMatch?.[1]) {
        return directMatch[1];
      }
    }

    return undefined;
  };

  const buildProfileWriteErrorHaystack = (error: unknown) => {
    if (!error || typeof error !== 'object') {
      return '';
    }

    const errorRecord = error as Record<string, unknown>;
    return [
      errorRecord.message,
      errorRecord.details,
      errorRecord.hint,
    ]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
  };

  const createProfileWriteError = (
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: unknown;
    } = {}
  ): ProfileWriteError => {
    const error = new Error(message) as ProfileWriteError;
    error.code = options.code;
    error.status = options.status;
    error.details = options.details;
    return error;
  };

  const mapCoachPersonaProfileWriteError = (
    error: unknown,
    attemptedFieldKeys: string[],
  ): ProfileWriteError | null => {
    if (!attemptedFieldKeys.includes('coach_persona_key')) {
      return null;
    }

    const errorCode =
      error && typeof error === 'object'
        ? (error as { code?: string }).code
        : undefined;
    const missingColumn = extractMissingProfileColumn(error);
    const haystack = buildProfileWriteErrorHaystack(error);

    if (
      missingColumn === 'coach_persona_key' ||
      errorCode === 'PGRST204' ||
      errorCode === '42703'
    ) {
      return createProfileWriteError(
        'Coach persona is unavailable because "user_profiles.coach_persona_key" is missing on the configured Supabase project.',
        {
          code: 'coach_persona_schema_mismatch',
          status: 503,
          details: error,
        }
      );
    }

    if (
      errorCode === '42501' ||
      haystack.includes('permission denied') ||
      haystack.includes('row-level security')
    ) {
      return createProfileWriteError(
        'Coach persona could not be saved because Supabase denied access to "user_profiles.coach_persona_key".',
        {
          code: 'coach_persona_policy_denied',
          status: 403,
          details: error,
        }
      );
    }

    if (errorCode === '23514') {
      return createProfileWriteError(
        'Coach persona could not be saved because the database rejected the selected persona value.',
        {
          code: 'coach_persona_constraint_failed',
          status: 400,
          details: error,
        }
      );
    }

    return null;
  };

  const logProfileMutationError = (
    error: unknown,
    operation: 'insert' | 'update',
    attemptedFieldKeys: string[],
  ) => {
    const metadata = {
      operation,
      attempted_fields: attemptedFieldKeys.join(','),
      attempted_field_count: attemptedFieldKeys.length,
      missing_profile_column: extractMissingProfileColumn(error),
    };

    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: unknown }).code === 'PGRST204'
    ) {
      logOperationalError(
        '[ProfileUpdate] user_profiles schema cache mismatch',
        error,
        metadata,
      );
      return;
    }

    logOperationalError('[ProfileUpdate] Safe profile mutation failed', error, metadata);
  };

  const mapProfileWriteError = (
    error: any,
    attemptedFieldKeys: string[],
  ): never => {
    const coachPersonaError = mapCoachPersonaProfileWriteError(
      error,
      attemptedFieldKeys,
    );
    if (coachPersonaError) {
      throw coachPersonaError;
    }

    if (error?.code === '23505') {
      throw new Error(t('auth.error_username_taken'));
    }

    if (
      typeof error?.message === 'string' &&
      error.message.includes('Email must be verified')
    ) {
      throw new Error(t('auth.error_email_verification_required'));
    }

    throw error;
  };

  const upsertSafeProfile = async (safeFields: SafeProfileMutationInput) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const sanitizedFields: SafeProfileMutationInput = {};
    if (safeFields.username !== undefined) {
      sanitizedFields.username = safeFields.username;
    }
    if (safeFields.avatar_url !== undefined) {
      sanitizedFields.avatar_url = safeFields.avatar_url;
    }
    if (safeFields.notification_settings !== undefined) {
      sanitizedFields.notification_settings = safeFields.notification_settings;
    }
    if (safeFields.push_token !== undefined) {
      sanitizedFields.push_token = safeFields.push_token;
    }
    if (safeFields.has_seen_tutorial !== undefined) {
      sanitizedFields.has_seen_tutorial = safeFields.has_seen_tutorial;
    }
    if (safeFields.coach_persona_key !== undefined) {
      sanitizedFields.coach_persona_key = safeFields.coach_persona_key;
    }

    try {
      const attemptedFieldKeys = Object.keys(sanitizedFields).sort();
      const shouldRefreshSocialIdentity =
        safeFields.username !== undefined || safeFields.avatar_url !== undefined;

      if (safeFields.avatar_url !== undefined) {
        clearAvatarUrlCache(safeFields.avatar_url);
      }

      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existingProfile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update(sanitizedFields)
          .eq('id', user.id);

        if (updateError) {
          logProfileMutationError(updateError, 'update', attemptedFieldKeys);
          mapProfileWriteError(updateError, attemptedFieldKeys);
        }
      } else {
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert(buildInitialProfileInsert(user, sanitizedFields));

        if (insertError) {
          if (insertError.code === '23505') {
            const { error: retryUpdateError } = await supabase
              .from('user_profiles')
              .update(sanitizedFields)
              .eq('id', user.id);

            if (retryUpdateError) {
              logProfileMutationError(
                retryUpdateError,
                'update',
                attemptedFieldKeys,
              );
              mapProfileWriteError(retryUpdateError, attemptedFieldKeys);
            }
          } else {
            logProfileMutationError(insertError, 'insert', attemptedFieldKeys);
            mapProfileWriteError(insertError, attemptedFieldKeys);
          }
        }
      }

      await refreshUserProfileForUser(user.id);

      if (shouldRefreshSocialIdentity) {
        await invalidateProfileDependentQueries();
      }
    } catch (error) {
      if (
        !(
          error &&
          typeof error === 'object' &&
          ((error as { code?: unknown }).code === '23505' ||
            (error as { code?: unknown }).code === 'PGRST204')
        )
      ) {
        logOperationalError('[ProfileUpdate] Safe profile mutation failed', error);
      }
      throw error;
    }
  };

  const ensureHealthScoreSeed = async (userId: string, initialScore = 0) => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('health_scores').insert({
      user_id: userId,
      score: initialScore,
      calories_current: 0,
      calories_goal: 2000,
      bodyfat: initialScore === 50 ? 20 : 0,
      muscle: 40,
      date: today,
    });

    if (error && !error.message?.includes('duplicate')) {
      logOperationalError('[Auth] Health score seed failed', error, {
        user_id: userId,
      });
    }
  };

  const ensureOauthConnection = async (
    payload: {
      user_id: string;
      provider: string;
      provider_user_id: string;
      provider_email?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) => {
    const { error } = await supabase.from('oauth_connections').insert(payload);
    if (error && !error.message?.includes('duplicate')) {
      logOperationalError('[Auth] OAuth connection seed failed', error, {
        user_id: payload.user_id,
      });
    }
  };

  async function refreshUserProfileForUser(userId: string) {
    await syncRevenueCatIdentity(userId);
    await syncSubscriptionStatus(undefined, { userId });
    const profile = await loadUserProfile(userId, authVersionRef.current);
    await invalidateScanEligibilityCache(userId);
    return profile;
  }

  const resolveNextAuthStep = async (
    profile: UserProfile | null,
  ): Promise<AuthNextStep> => {
    if (profile && !profile.email_verified) {
      return 'email_verification';
    }

    return 'ready';
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const syncAutoRefresh = (state: typeof AppState.currentState) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh?.();
      } else {
        supabase.auth.stopAutoRefresh?.();
      }
    };

    syncAutoRefresh(AppState.currentState);

    const subscription = AppState.addEventListener('change', syncAutoRefresh);

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh?.();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const hydrateAuthState = async (
      nextSession: Session | null,
      version: number,
      source: string
    ) => {
      if (!isAuthHydrationCurrent(version)) {
        return;
      }

      setCurrentSession(nextSession);
      setCurrentUser(nextSession?.user ?? null);
      markStartup('session-loaded', {
        hasSession: !!nextSession,
        userId: nextSession?.user?.id || '',
        source,
      });

      if (nextSession?.user) {
        const [, , profileLoadResult] = await Promise.all([
          syncRevenueCatIdentity(nextSession.user.id),
          syncSubscriptionStatus(nextSession.access_token, {
            userId: nextSession.user.id,
          }),
          readUserProfileResult(nextSession.user.id),
        ]);
        if (!isAuthHydrationCurrent(version)) {
          return;
        }

        if (
          profileLoadResult.source === 'profile-error' &&
          userProfileRef.current?.id === nextSession.user.id
        ) {
          markStartup('profile-loaded', {
            hasProfile: true,
            userId: nextSession.user.id,
            source: 'retained-after-profile-error',
          });
        } else {
          applyUserProfile(profileLoadResult.profile, version, {
            userId: nextSession.user.id,
            source: profileLoadResult.source,
          });
        }

        if (
          profileLoadResult.source === 'missing-profile' &&
          isAuthHydrationCurrent(version)
        ) {
          await repairMissingUserProfile(nextSession.user, version);
        }
      } else {
        subscriptionSyncAttemptedAtRef.current.clear();
        await syncRevenueCatIdentity(null);
        if (!isAuthHydrationCurrent(version)) {
          return;
        }

        applyUserProfile(null, version, {
          source: 'no-session',
        });
        logRuntimeDecision('RevenueCat profile sync skipped', {
          reason: 'no-session',
        });
      }

      if (!isAuthHydrationCurrent(version)) {
        return;
      }

      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) =>
        startAuthHydration(initialSession, 'initial-session', hydrateAuthState)
      )
      .catch((error) => {
        logOperationalError('[AuthProvider] Failed to load session', error);
        if (isMountedRef.current) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession) => {
        if (!nextSession && event !== 'INITIAL_SESSION' && event !== 'SIGNED_OUT') {
          return;
        }

        startAuthHydration(
          nextSession,
          `auth-state-change:${event}`,
          hydrateAuthState,
        );
      }
    );

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userProfile?.id) {
      localeSyncSignatureRef.current = null;
      return;
    }

    const signature = `${userProfile.id}:${locale}`;
    if (localeSyncSignatureRef.current === signature) {
      return;
    }
    localeSyncSignatureRef.current = signature;

    const profileSnapshot = {
      id: userProfile.id,
      language_code: userProfile.language_code ?? null,
      country_code: userProfile.country_code ?? null,
    };

    void (async () => {
      try {
        const result = await syncDeviceLocaleToProfile(profileSnapshot, locale);
        if (!result.updated || !isMountedRef.current) {
          return;
        }
        setUserProfile((previous) => {
          if (!previous || previous.id !== profileSnapshot.id) {
            return previous;
          }
          return {
            ...previous,
            language_code: result.language_code,
            country_code: result.country_code,
          };
        });
      } catch (error) {
        logOperationalError(
          '[AuthProvider] syncDeviceLocaleToProfile failed',
          error,
        );
      }
    })();
  }, [
    userProfile?.id,
    userProfile?.language_code,
    userProfile?.country_code,
    locale,
  ]);

  const logCleanupSkippedWithoutSession = (userId: string) => {
    logOperationalError('[Cleanup] Skipped orphan cleanup because no session', null, {
      user_id: userId,
    });
  };

  const installSecureLoginSession = async (
    email: string,
    password: string,
  ): Promise<{ user: User; session: Session }> => {
    // Phase 0 (post-pentest, Free-plan path): route login through the
    // server-side `secure-login` Edge Function so the per-account lockout
    // (AUTH-VULN-03) actually fires for app traffic. On Pro+ this would be
    // enforced by the `password_verification_attempt` Auth Hook instead.
    // Direct `/auth/v1/token` calls with the public anon key still bypass
    // the lockout — accepted residual risk on Free, see TRUST_BOUNDARIES.md.
    const secureResponse = await fetch(
      getSupabaseFunctionUrl('secure-login'),
      {
        method: 'POST',
        headers: getFunctionHeaders(null, { allowAnon: true }),
        body: JSON.stringify({ email, password }),
      },
    );

    const secureBody = await secureResponse.json().catch(() => ({}));

    if (!secureResponse.ok || !secureBody?.ok || !secureBody?.session) {
      // Throw a shape compatible with what callers used to expect from
      // `signInWithPassword`'s error: a generic Error. Account-locked is
      // distinguishable via the code so callers can show a custom UI.
      const errorCode = secureBody?.code ?? 'invalid_credentials';
      const error = new Error(secureBody?.error ?? 'Invalid email or password.') as Error & {
        code?: string;
        status?: number;
      };
      error.code = errorCode;
      error.status = secureResponse.status;
      throw error;
    }

    // secure-login does the actual signInWithPassword on the server. We
    // need to set the session on the local client so subsequent supabase
    // calls work. setSession persists the access + refresh tokens.
    const { data, error: setErr } = await supabase.auth.setSession({
      access_token: secureBody.session.access_token,
      refresh_token: secureBody.session.refresh_token,
    });

    if (setErr || !data?.user || !data?.session) {
      throw new Error('Login session could not be installed. Please try again.');
    }

    return {
      user: data.user,
      session: data.session,
    };
  };

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ nextStep: AuthNextStep; userId: string }> => {
    let signedInUser: User;
    try {
      ({ user: signedInUser } = await installSecureLoginSession(email, password));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Login session could not be installed. Please try again.'
      ) {
        logOperationalError('[SignIn] failed to install session locally', error, {});
      }
      throw error;
    }

    const userId = signedInUser.id;
    const profile = await loadUserProfile(userId, authVersionRef.current);
    const nextStep = await resolveNextAuthStep(profile);

    return { nextStep, userId };
  };

  const checkIpEligibility = async () => {
    if (__DEV__) {
      return;
    }

    try {
      const response = await fetch(getSupabaseFunctionUrl('check-ip-signup'), {
        method: 'POST',
        headers: getFunctionHeaders(null, { allowAnon: true }),
        body: JSON.stringify({ action: 'check' }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429) {
          const limitError = new Error(
            t('auth.error_ip_limit_reached') ||
              'Signup limit reached for this network.'
          );
          limitError.name = 'IpLimitError';
          throw limitError;
        }

        logOperationalError('[SignUp] IP check failed but allowing signup', null, {
          status: response.status,
          code:
            typeof (data as { code?: unknown }).code === 'string'
              ? (data as { code: string }).code
              : undefined,
          request_id:
            typeof (data as { request_id?: unknown }).request_id === 'string'
              ? (data as { request_id: string }).request_id
              : undefined,
        });
      }
    } catch (error) {
      if (isIpLimitError(error)) {
        throw error;
      }

      logOperationalError('[SignUp] IP check failed', error);
    }
  };

  const recordIpSignup = async (userId: string, accessToken?: string | null) => {
    try {
      const token = await resolveFunctionAccessToken(accessToken);
      await fetch(getSupabaseFunctionUrl('check-ip-signup'), {
        method: 'POST',
        headers: getFunctionHeaders(token),
        body: JSON.stringify({ action: 'record' }),
      });
    } catch (error) {
      logOperationalError('[SignUp] Failed to record IP signup', error, {
        user_id: userId,
      });
    }
  };

  const signUp = async (
    email: string,
    password: string
  ): Promise<{ userId: string; email: string }> => {
    // Wave 2.5 (post-pentest 2026-05) — instead of calling
    // `supabase.auth.signUp()` directly, route the signup through the
    // server-side `secure-signup` Edge Function. It enforces the
    // disposable-email blocklist (with subdomain matching), the IP rate
    // limit, and the password policy in one bypass-proof place. The
    // companion DB trigger (migration 20260502020100) refuses any direct
    // `/auth/v1/signup` call once activated in production.
    //
    // Note: secure-signup also handles IP rate limiting + recording, so we
    // no longer call `checkIpEligibility()` or `recordIpSignup()` here.
    const secureResponse = await fetch(
      getSupabaseFunctionUrl('secure-signup'),
      {
        method: 'POST',
        headers: getFunctionHeaders(null, { allowAnon: true }),
        body: JSON.stringify({ email, password }),
      },
    );

    const secureBody = await secureResponse.json().catch(() => ({}));
    const securePayload =
      secureBody && typeof secureBody === 'object' && !Array.isArray(secureBody)
        ? (secureBody as { code?: unknown; request_id?: unknown })
        : {};
    const secureCode =
      typeof securePayload.code === 'string' ? securePayload.code : undefined;
    const secureRequestId =
      typeof securePayload.request_id === 'string'
        ? securePayload.request_id
        : undefined;

    if (secureResponse.status === 429 && secureCode === 'signup_rate_limited') {
      const limitError = new Error(
        t('auth.error_ip_limit_reached') ||
          'Signup limit reached for this network.'
      ) as Error & {
        code?: string;
        status?: number;
        requestId?: string;
      };
      limitError.name = 'IpLimitError';
      limitError.code = secureCode;
      limitError.status = secureResponse.status;
      limitError.requestId = secureRequestId;
      // 429 réseau = throttle attendu (l'UI le présente proprement via
      // `IpLimitError`). On log en WARN, pas en ERROR, pour éviter une stack
      // trace bruyante sur une condition bénigne. Cf. le même pattern pour le
      // rate-limit coach dans `services/coach.ts`.
      logExpectedFailure('[SignUp] secure-signup rate limited', null, {
        status: secureResponse.status,
        code: secureCode,
        request_id: secureRequestId,
      });
      throw limitError;
    }

    if (!secureResponse.ok || !secureBody?.ok || !secureBody?.user_id) {
      // secure-signup returns a generic, enumeration-safe error for ALL
      // rejection paths except the safe network-level rate limit. We surface
      // a generic UI error to match.
      logOperationalError('[SignUp] secure-signup rejected', null, {
        status: secureResponse.status,
        code: secureCode,
        request_id: secureRequestId,
      });
      throw new Error(t('auth.error_account_creation'));
    }

    const newUserId = secureBody.user_id as string;
    let signedInUser: User;
    try {
      ({ user: signedInUser } = await installSecureLoginSession(email, password));
    } catch (error) {
      logOperationalError('[SignUp] Failed to install session after secure-signup', error, {
        user_id: newUserId,
      });
      logCleanupSkippedWithoutSession(newUserId);
      throw new Error(t('auth.error_account_creation'));
    }

    const repairedProfile = await repairMissingUserProfile(signedInUser);

    if (!repairedProfile) {
      logOperationalError('[SignUp] Failed to repair initial profile after session install', null, {
        user_id: newUserId,
      });
      await cleanupOrphanUser(newUserId);
      throw new Error(t('auth.error_account_creation'));
    }

    return { userId: newUserId, email };
  };

  const completeSignUp = async (
    userId: string,
    username: string,
    avatarUrl?: string
  ) => {
    const { normalizedUsername, valid } = validateCanonicalUsername(username);
    if (!valid) {
      throw new Error(t('onboarding.username_status.invalid'));
    }

    const isAvailable = await checkUsernameAvailability(normalizedUsername);
    if (!isAvailable) {
      throw new Error(t('auth.error_username_taken'));
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || currentUser.id !== userId) {
      throw new Error(t('auth.error_session_invalid'));
    }

    try {
      await upsertSafeProfile({
        username: normalizedUsername,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl || null } : {}),
      });

      await ensureOauthConnection({
        user_id: userId,
        provider: 'email',
        provider_user_id: userId,
        provider_email: currentUser.email,
      });

      await ensureHealthScoreSeed(userId);
      await refreshUserProfileForUser(userId);
    } catch (profileError) {
      logOperationalError('[SignUp] Profile completion failed', profileError, {
        user_id: userId,
      });
      throw profileError;
    }
  };

  const signInWithOAuthProvider = async (provider: 'google' | 'apple') => {
    try {
      const redirectUrl =
        Platform.OS === 'web'
          ? window.location.origin
          : Linking.createURL('auth/callback');
      // L'URL generee par Linking.createURL('auth/callback') doit etre ajoutee
      // dans Supabase Authentication > URL Configuration > Redirect URLs.
      logOAuthDebug('[OAuth] Generated redirect URL', {
        provider,
        redirectTo: redirectUrl,
      });
      const oauthState = createOAuthState();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            state: oauthState,
          },
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        logOAuthDebugError('[OAuth] Failed to initiate OAuth', error, {
          provider,
        });
        throw error;
      }

      if (!data?.url) {
        throw new Error('OAuth authorization URL is missing');
      }

      if (Platform.OS === 'web') {
        window.location.assign(data.url);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === 'success' && result.url) {
        const authCode = resolveOAuthAuthorizationCode(
          result.url,
          redirectUrl,
          oauthState,
        );
        const { data: sessionData, error: sessionError } =
          await supabase.auth.exchangeCodeForSession(authCode);

        if (sessionError) {
          logOAuthDebugError('[OAuth] Failed to exchange OAuth code', sessionError, {
            provider,
          });
          throw sessionError;
        }

        if (sessionData.user) {
          await handleOAuthUserSetup(sessionData.user, provider);
        }
        return;
      }

      logOAuthDebug('[OAuth] Auth session closed before completion', {
        provider,
        result_type: result.type,
      });
      // L'utilisateur a fermé/annulé l'onglet d'auth : ce n'est pas une panne.
      // On tague l'erreur pour que le catch (ci-dessous) ne la remonte pas en
      // ERROR et que les écrans n'affichent pas de bandeau rouge.
      throw createOAuthCancelledError(t('auth.error_auth_cancelled'));
    } catch (error) {
      // Annulation volontaire : déjà tracée en info ("Auth session closed...").
      // Inutile et trompeur de la logger comme erreur opérationnelle.
      if (!isOAuthCancellationError(error)) {
        logOAuthDebugError('[OAuth] OAuth flow failed', error, {
          provider,
        });
      }
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    await signInWithOAuthProvider('google');
  };

  // Apple sur iOS = flux NATIF (expo-apple-authentication + signInWithIdToken).
  // Pas de flux web Apple (evite la verification de domaine + le secret .p8 a
  // renouveler). Sur les autres plateformes, le bouton Apple n'est pas affiche.
  const signInWithAppleNative = async () => {
    try {
      const AppleAuthentication = require('expo-apple-authentication');
      const appleRawNonce = createOAuthState();
      const appleNonceHash = await createAppleNonceHash(appleRawNonce);
      const appleState = createOAuthState();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: appleNonceHash,
        state: appleState,
      });

      const identityToken = credential?.identityToken;
      if (!identityToken) {
        throw new Error('Apple identity token is missing');
      }
      if (credential?.state !== appleState) {
        throw new Error('Apple OAuth state mismatch');
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: identityToken,
          nonce: appleRawNonce,
        });

      if (sessionError) {
        logOAuthDebugError('[OAuth] Apple signInWithIdToken failed', sessionError, {
          provider: 'apple',
        });
        throw sessionError;
      }

      if (sessionData.user) {
        await handleOAuthUserSetup(sessionData.user, 'apple');
        await persistAppleAuthorizationCode(credential?.authorizationCode);
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // Annulation volontaire (l'utilisateur ferme la feuille Apple) : non bloquant.
      if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
        throw createOAuthCancelledError(t('auth.error_auth_cancelled'));
      }
      if (!isOAuthCancellationError(error)) {
        logOAuthDebugError('[OAuth] Apple native flow failed', error, {
          provider: 'apple',
        });
      }
      throw error;
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (provider === 'apple' && Platform.OS === 'ios') {
      await signInWithAppleNative();
      return;
    }
    if (provider === 'apple') {
      throw new OAuthUserVisibleError('apple_native_auth_unavailable');
    }
    await signInWithOAuthProvider(provider);
  };

  const handleOAuthUserSetup = async (
    oauthUser: User,
    provider: 'google' | 'apple'
  ) => {
    try {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', oauthUser.id)
        .maybeSingle();

      if (existingProfile) {
        await refreshUserProfileForUser(oauthUser.id);
        return;
      }

      const email = oauthUser.email || `${oauthUser.id}@oauth.temp`;

      try {
        await checkIpEligibility();
      } catch (error) {
        if ((provider === 'apple' || provider === 'google') && isIpLimitError(error)) {
          logOperationalError('[OAuth] IP eligibility rate limit soft-allowed', error, {
            provider,
          });
        } else {
          logOperationalError('[OAuth] IP eligibility blocked signup', error, {
            provider,
          });
          await cleanupOrphanUser(oauthUser.id);
          throw error;
        }
      }

      const isDisposable = await checkDisposableEmail(email);

      if (isDisposable) {
        await cleanupOrphanUser(oauthUser.id);
        throw new Error(t('auth.error_disposable_email'));
      }

      const repairedProfile = await repairMissingUserProfile(oauthUser);

      if (!repairedProfile) {
        logOperationalError('[OAuth] Failed to repair OAuth profile after session install', null, {
          provider,
          user_id: oauthUser.id,
        });
        await cleanupOrphanUser(oauthUser.id);
        throw new Error(t('auth.error_account_creation'));
      }

      void recordIpSignup(oauthUser.id);

      await ensureOauthConnection({
        user_id: oauthUser.id,
        provider,
        provider_user_id: oauthUser.user_metadata?.sub || oauthUser.id,
        provider_email: email,
        metadata: oauthUser.user_metadata || {},
      });

      await ensureHealthScoreSeed(oauthUser.id, 50);
      await refreshUserProfileForUser(oauthUser.id);
    } catch (error) {
      logOperationalError('[OAuth] OAuth user setup failed', error, {
        provider,
        user_id: oauthUser.id,
      });
      throw error;
    }
  };

  const checkDisposableEmail = async (email: string): Promise<boolean> => {
    // U2-γ Phase 3 — vérification déléguée à l'Edge Function
    // `check-signup-eligibility` (verify_jwt = false) au lieu d'interroger
    // la table directement côté client. Le check côté serveur ne peut pas
    // être bypassé en appelant `supabase.auth.signUp` en direct si le
    // call-site signup respecte le retour de cette fonction.
    try {
      const response = await fetch(
        getSupabaseFunctionUrl('check-signup-eligibility'),
        {
          method: 'POST',
          headers: getFunctionHeaders(null, { allowAnon: true }),
          body: JSON.stringify({ email }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Failure ouverte : on laisse passer et on log. Le RLS / quota
        // serveur reste autoritaire en aval. Évite de bloquer un user légitime
        // si la function est temporairement down.
        logOperationalError(
          '[SignUp] disposable email check failed, allowing signup',
          null,
          {
            status: response.status,
          },
        );
        return false;
      }

      const allowed = (data as { allowed?: unknown }).allowed === true;
      const reason =
        typeof (data as { reason?: unknown }).reason === 'string'
          ? ((data as { reason: string }).reason)
          : null;
      return !allowed && reason === 'disposable_email';
    } catch (error) {
      logOperationalError(
        '[SignUp] disposable email check threw, allowing signup',
        error,
      );
      return false;
    }
  };

  const checkUsernameAvailability = async (
    username: string,
    retryCount = 0
  ): Promise<boolean> => {
    const { normalizedUsername, valid } = validateCanonicalUsername(username);
    if (!valid) {
      return false;
    }

    const maxRetries = 3;
    const retryDelay = Math.min(1000 * 2 ** retryCount, 5000);
    const queryTimeout = 8000;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Query timeout exceeded')),
          queryTimeout
        );
      });

      // B-01 backend audit — la table user_profiles est désormais restreinte
      // à auth.uid() = id ; la vue publique expose la colonne username pour
      // permettre la vérification de disponibilité sans leak des autres
      // colonnes sensibles (email, subscription_*, etc.).
      const queryPromise = supabase
        .from('user_profiles_public')
        .select('id, username')
        .eq('username', normalizedUsername)
        .maybeSingle();

      const { data, error } = (await Promise.race([
        queryPromise,
        timeoutPromise,
      ])) as Awaited<typeof queryPromise>;

      if (error) {
        throw error;
      }

      if (!data) {
        return true;
      }

      return data.id === user?.id;
    } catch (error) {
      if (
        retryCount < maxRetries &&
        error instanceof Error &&
        (error.message.includes('network') ||
          error.message.includes('timeout') ||
          error.message.includes('Query timeout'))
      ) {
        await sleep(retryDelay);
        return checkUsernameAvailability(normalizedUsername, retryCount + 1);
      }

      throw error;
    }
  };

  const setUsername = async (username: string, avatarUrl?: string | null) => {
    const { normalizedUsername, valid } = validateCanonicalUsername(username);
    if (!valid) {
      throw new Error(t('onboarding.username_status.invalid'));
    }

    const isAvailable = await checkUsernameAvailability(normalizedUsername);
    if (!isAvailable) {
      throw new Error(t('auth.error_username_taken'));
    }

    await upsertSafeProfile({
      username: normalizedUsername,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    });
  };

  const updateNotificationSettings = async (
    notificationSettings: UserProfile['notification_settings']
  ) => {
    const fallbackSettings =
      userProfile?.notification_settings ?? DEFAULT_NOTIFICATION_SETTINGS;
    const sanitizedSettings: UserProfile['notification_settings'] = {
      reminders:
        typeof notificationSettings?.reminders === 'boolean'
          ? notificationSettings.reminders
          : fallbackSettings.reminders,
      achievements:
        typeof notificationSettings?.achievements === 'boolean'
          ? notificationSettings.achievements
          : fallbackSettings.achievements,
      newContent:
        typeof notificationSettings?.newContent === 'boolean'
          ? notificationSettings.newContent
          : fallbackSettings.newContent,
    };

    await upsertSafeProfile({
      notification_settings: sanitizedSettings,
    });
  };

  const markTutorialSeen = async () => {
    await upsertSafeProfile({
      has_seen_tutorial: true,
    });
  };

  const updateAvatarUrl = async (avatarUrl: string | null) => {
    await upsertSafeProfile({
      avatar_url: avatarUrl,
    });
  };

  const updateCoachPersona = async (
    personaKey: UserProfile['coach_persona_key']
  ) => {
    if (!isCoachPersonaKey(personaKey)) {
      throw new Error('Invalid coach persona');
    }

    if (!hasCoachPersonaAccess(personaKey, userProfile?.account_tier)) {
      throw new Error('Coach persona requires premium');
    }

    await upsertSafeProfile({
      coach_persona_key: personaKey,
    });
  };

  const refreshUserProfile = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    await refreshUserProfileForUser(user.id);
  };

  const isDisposableEmail = async (email: string): Promise<boolean> => {
    return checkDisposableEmail(email);
  };

  const sendVerificationEmail = async (): Promise<void> => {
    try {
      await invokeJsonFunction('send-verification-email', {
        locale,
      });
    } catch (error) {
      logOperationalError('[Verification] Failed to send verification email', error, {
        type: 'signup',
        user_id: user?.id,
      });
      throw error;
    }
  };

  const verifyEmailCode = async (code: string): Promise<boolean> => {
    try {
      const data = await invokeJsonFunction<{
        verified?: boolean;
        error?: string;
        errorKey?: string;
        remainingAttempts?: number;
      }>('verify-email-code', {
        code,
      });

      return data.verified === true;
    } catch (error: any) {
      const payload = error?.message;
      logOperationalError('[Verification] Failed to verify code', error, {
        type: 'signup',
        user_id: user?.id,
      });
      throw new Error(payload || t('auth.error_verification_code'));
    }
  };

  const cleanupOrphanUser = async (userId: string): Promise<void> => {
    const accessToken = await resolveFunctionAccessToken();

    if (!accessToken) {
      logCleanupSkippedWithoutSession(userId);
      return;
    }

    try {
      const response = await fetch(
        getSupabaseFunctionUrl('cleanup-orphan-user'),
        {
          method: 'POST',
          headers: getFunctionHeaders(accessToken),
          body: JSON.stringify({ userId }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        logOperationalError(
          '[Cleanup] Failed to clean up orphan user',
          buildFunctionError('cleanup-orphan-user', response.status, data),
          {
            user_id: userId,
          },
        );
      }

    } catch (error) {
      logOperationalError('[Cleanup] Failed to clean up orphan user', error, {
        user_id: userId,
      });
    } finally {
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        logOperationalError('[Cleanup] Failed to sign out after orphan cleanup', signOutError, {
          user_id: userId,
        });
      }
    }
  };

  const clearDeletedAccountLocalState = async () => {
    authVersionRef.current += 1;
    lastAuthHydrationSignatureRef.current = buildAuthHydrationSignature(null);
    setCurrentUserProfile(null);
    setCurrentUser(null);
    setCurrentSession(null);
    subscriptionSyncAttemptedAtRef.current.clear();
    invalidateCoachProfileMemoryCache();

    await syncRevenueCatIdentity(null);

    try {
      queryClient.clear();
    } catch (queryError) {
      logOperationalError('[DeleteAccount] Failed to clear React Query cache', queryError);
    }

    try {
      await AsyncStorage.multiRemove([
        'supabase.auth.token',
        '@supabase.auth.token',
        'healthscan_badges',
      ]);
    } catch (storageError) {
      logOperationalError('[DeleteAccount] Failed to clear AsyncStorage', storageError);
    }
    await clearAppleAuthorizationCode();

    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      logOperationalError('[DeleteAccount] Local sign out after deletion failed', signOutError);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    const accessToken = await resolveFunctionAccessToken();
    if (!accessToken) {
      throw new Error('Authentication required');
    }

    const appleAuthorizationCode = await readAppleAuthorizationCodeForRevocation();
    const deleteAccountPayload: {
      confirmation: 'DELETE_ACCOUNT';
      apple_authorization_code?: string;
    } = {
      confirmation: 'DELETE_ACCOUNT',
    };

    if (appleAuthorizationCode) {
      deleteAccountPayload.apple_authorization_code = appleAuthorizationCode;
    }

    const response = await fetch(getSupabaseFunctionUrl('delete-account'), {
      method: 'POST',
      headers: getFunctionHeaders(accessToken),
      body: JSON.stringify(deleteAccountPayload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw buildFunctionError('delete-account', response.status, data);
    }

    await clearDeletedAccountLocalState();
  };

  const signOut = async () => {
    try {
      // S-14 — Avant tout teardown, on tente de purger les reservations
      // d'upload social pending. Best-effort : si la RPC echoue, la TTL de
      // 30min prendra le relais. On le fait AVANT de clear les caches /
      // setCurrentUser(null) pour avoir encore le user.id disponible.
      const currentUserId = user?.id ?? null;
      if (currentUserId) {
        try {
          await supabase.rpc('release_pending_social_upload_reservations', {
            p_user_id: currentUserId,
          });
        } catch (releaseError) {
          // Non-bloquant : la TTL des reservations prend le relais.
          logOperationalError(
            '[SignOut] Failed to release pending social upload reservations',
            releaseError,
          );
        }
      }

      authVersionRef.current += 1;
      lastAuthHydrationSignatureRef.current = buildAuthHydrationSignature(null);
      setCurrentUserProfile(null);
      setCurrentUser(null);
      setCurrentSession(null);
      subscriptionSyncAttemptedAtRef.current.clear();
      invalidateCoachProfileMemoryCache();

      await syncRevenueCatIdentity(null);

      try {
        // P2-G Phase 2 — import direct (plus de require dynamique fragile).
        // `queryClient.clear()` doit s'exécuter avant `supabase.auth.signOut`
        // pour s'assurer que les données utilisateur ne survivent pas en cache
        // si signOut échoue.
        queryClient.clear();
      } catch (queryError) {
        logOperationalError('[SignOut] Failed to clear React Query cache', queryError);
      }

      try {
        await AsyncStorage.multiRemove([
          'supabase.auth.token',
          '@supabase.auth.token',
          'healthscan_badges',
        ]);
      } catch (storageError) {
        logOperationalError('[SignOut] Failed to clear AsyncStorage', storageError);
      }
      await clearAppleAuthorizationCode();

      // scope:'global' invalide tous les refresh tokens de l'utilisateur,
      // y compris sur les autres devices. Indispensable pour qu'une
      // déconnexion volontaire ferme aussi les sessions concurrentes
      // (recommandation P1-2 de FRONTEND_SECURITY_AUDIT.md).
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        logOperationalError('[SignOut] Failed to sign out from Supabase', error);
        throw error;
      }
    } catch (error) {
      logOperationalError('[SignOut] Sign-out flow failed', error);
      setCurrentUserProfile(null);
      setCurrentUser(null);
      setCurrentSession(null);
      throw error;
    }
  };

  const isEmailVerified = userProfile?.email_verified ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userProfile,
        loading,
        isEmailVerified,
        signIn,
        signUp,
        completeSignUp,
        signInWithGoogle,
        signInWithOAuth,
        signOut,
        checkUsernameAvailability,
        setUsername,
        updateNotificationSettings,
        markTutorialSeen,
        updateAvatarUrl,
        updateCoachPersona,
        refreshUserProfile,
        isDisposableEmail,
        sendVerificationEmail,
        verifyEmailCode,
        cleanupOrphanUser,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
