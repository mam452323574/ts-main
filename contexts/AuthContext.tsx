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
import { getRuntimeConfig, getSupabaseFunctionUrl } from '@/services/runtimeConfig';
import { clearAvatarUrlCache } from '@/services/avatar';
import { trackFailureEvent } from '@/services/analytics';
import {
  DEFAULT_COACH_PERSONA_KEY,
  hasCoachPersonaAccess,
  isCoachPersonaKey,
} from '@/shared/coachPersonas';
import {
  logOperationalError,
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
import { invalidateScanEligibilityQueries } from '@/utils/scanEligibilityQuery';
import { syncDeviceLocaleToProfile } from '@/services/userProfile';

WebBrowser.maybeCompleteAuthSession();

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
  const runtimeConfig = getRuntimeConfig();
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
      token || (options.allowAnon ? runtimeConfig.supabaseAnonKey : null);

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

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ nextStep: AuthNextStep; userId: string }> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const userId = data.user.id;
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
      if (
        error instanceof Error &&
        (error.name === 'IpLimitError' ||
          error.message.includes('limit reached') ||
          (error.message.includes('limite') && error.message.includes('atteinte')))
      ) {
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
    // server-side `secure-signup` Edge Function. It enforces HIBP, the
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

    if (!secureResponse.ok || !secureBody?.ok || !secureBody?.user_id) {
      // secure-signup returns a generic, enumeration-safe error for ALL
      // rejection paths (HIBP, disposable, rate limit, policy, email taken,
      // etc.). We surface a generic UI error to match.
      logOperationalError('[SignUp] secure-signup rejected', null, {
        status: secureResponse.status,
        code: secureBody?.code,
      });
      throw new Error(t('auth.error_account_creation'));
    }

    const newUserId = secureBody.user_id as string;

    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert(
        buildInitialProfileInsert({
          id: newUserId,
          email,
        })
      );

    if (profileError) {
      // U2-α Phase 3 — l'insert profile a échoué : on a un compte
      // `auth.users` orphelin. On déclenche le cleanup via Edge Function
      // (`cleanup-orphan-user`) qui supprime auth.users + nettoie sessions.
      logOperationalError('[SignUp] Failed to create initial profile', profileError, {
        user_id: newUserId,
      });
      try {
        await cleanupOrphanUser(newUserId);
      } catch (cleanupError) {
        logOperationalError('[SignUp] Orphan cleanup failed after profile insert error', cleanupError, {
          user_id: newUserId,
        });
      }
      throw new Error(t('auth.error_account_creation'));
    }

    // secure-signup uses admin.createUser which does NOT return a session.
    // We need an active session to drive the email-verification flow
    // (sendVerificationEmail), so sign in immediately. The new auth-pre-login
    // hook will not block this because there are zero prior failed attempts.
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !signInData.session) {
      logOperationalError('[SignUp] Auto signIn after signUp failed', signInError, {
        user_id: newUserId,
      });
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

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    try {
      const redirectUrl =
        Platform.OS === 'web'
          ? window.location.origin
          : Linking.createURL('oauth/callback');
      const oauthState = createOAuthState();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            state: oauthState,
          },
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) {
        logOperationalError('[OAuth] Failed to initiate OAuth', error, {
          provider,
        });
        throw error;
      }

      if (Platform.OS !== 'web' && data?.url) {
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
            logOperationalError('[OAuth] Failed to exchange OAuth code', sessionError, {
              provider,
            });
            throw sessionError;
          }

          if (sessionData.user) {
            await handleOAuthUserSetup(sessionData.user, provider);
          }
        } else if (result.type === 'cancel') {
          throw new Error(t('auth.error_auth_cancelled'));
        }
      }
    } catch (error) {
      logOperationalError('[OAuth] OAuth flow failed', error, {
        provider,
      });
      throw error;
    }
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
        logOperationalError('[OAuth] IP eligibility blocked signup', error, {
          provider,
        });
        await cleanupOrphanUser(oauthUser.id);
        throw error;
      }

      const isDisposable = await checkDisposableEmail(email);

      if (isDisposable) {
        await cleanupOrphanUser(oauthUser.id);
        throw new Error(t('auth.error_disposable_email'));
      }

      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert(
          buildInitialProfileInsert(
            {
              id: oauthUser.id,
              email,
            },
            {
              avatar_url: oauthUser.user_metadata?.avatar_url || null,
            }
          )
        );

      if (profileError) {
        logOperationalError('[OAuth] Failed to create OAuth profile', profileError, {
          provider,
          user_id: oauthUser.id,
        });
        await cleanupOrphanUser(oauthUser.id);
        throw profileError;
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
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      const accessToken = currentSession?.access_token;

      if (!accessToken) {
        throw new Error('Authentication required for cleanup');
      }

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

      await supabase.auth.signOut();
    } catch (error) {
      logOperationalError('[Cleanup] Failed to clean up orphan user', error, {
        user_id: userId,
      });
    }
  };

  const signOut = async () => {
    try {
      authVersionRef.current += 1;
      lastAuthHydrationSignatureRef.current = buildAuthHydrationSignature(null);
      setCurrentUserProfile(null);
      setCurrentUser(null);
      setCurrentSession(null);
      subscriptionSyncAttemptedAtRef.current.clear();

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
