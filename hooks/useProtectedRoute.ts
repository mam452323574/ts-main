import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStartupDiagnostics } from '@/contexts/StartupDiagnosticsContext';
import { useCustomAlert } from '@/hooks/useCustomAlert';
import { usePostSignupOnboardingPending } from '@/hooks/usePostSignupOnboardingPending';
import {
  isPublicRoute,
  isSharedRoute,
  isEmailVerificationRoute,
  isProfileSetupRoute,
  isPostSignupOnboardingRoute,
  isProtectedRoute,
  isAdminRoute,
  isPremiumRoute,
  isSpecialRoute,
} from '@/constants/routes';
import { hasPremiumAccess } from '@/utils/subscription';
import { clearPreAuthOnboardingDraft } from '@/utils/preAuthOnboarding';

const LOOP_DETECTION = {
  THRESHOLD: 5,
  TIME_WINDOW: 1000,
  // P3-L Phase 2 — durée minimum pendant laquelle on suspend la détection
  // après une alerte, pour éviter une oscillation immédiate si un bug
  // continue à pousser des redirections cycliques.
  COOLDOWN_MS: 60_000,
} as const;

const SAME_REDIRECT_DEBOUNCE_MS = 500;

interface NavigationState {
  forceLogout: boolean;
}

interface RouteState {
  isRootEntry: boolean;
  isPublic: boolean;
  isShared: boolean;
  isEmailVerification: boolean;
  isProfileSetup: boolean;
  isPostSignupOnboarding: boolean;
  isProtected: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  isSpecial: boolean;
  segment: string;
}

export function useProtectedRoute() {
  const { user, userProfile, loading, isEmailVerified, signOut } = useAuth();
  const { t } = useLanguage();
  const { markStartup } = useStartupDiagnostics();
  const { showAlert, alertElement } = useCustomAlert();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const {
    isPending: isPostSignupOnboardingPending,
    isLoading: isPostSignupOnboardingPendingLoading,
  } = usePostSignupOnboardingPending(user?.id);

  const [state, setState] = useState<NavigationState>({
    forceLogout: false,
  });

  const lastRedirectTime = useRef<number>(0);
  const lastRedirectSignatureRef = useRef<string>('');
  const redirectCountRef = useRef<number>(0);
  const loopDetectedRef = useRef<boolean>(false);
  const loopCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeReadyLoggedRef = useRef<boolean>(false);

  // Nettoie le timer de cooldown au démontage pour éviter les fuites.
  useEffect(() => {
    return () => {
      if (loopCooldownTimeoutRef.current) {
        clearTimeout(loopCooldownTimeoutRef.current);
        loopCooldownTimeoutRef.current = null;
      }
    };
  }, []);

  const isRouterReady = navigationState?.key != null;

  useEffect(() => {
    if (!isRouterReady || routeReadyLoggedRef.current) {
      return;
    }

    routeReadyLoggedRef.current = true;
    markStartup('route-ready', {
      segment: segments[0] || '',
    });
  }, [isRouterReady, markStartup, segments]);

  const getCurrentRouteState = useCallback((): RouteState => {
    const currentSegment = String(segments[0] ?? '');

    return {
      isRootEntry: currentSegment === '' || currentSegment === 'index',
      isPublic: isPublicRoute(currentSegment),
      isShared: isSharedRoute(currentSegment),
      isEmailVerification: isEmailVerificationRoute(currentSegment),
      isProfileSetup: isProfileSetupRoute(currentSegment),
      isPostSignupOnboarding: isPostSignupOnboardingRoute(currentSegment),
      isProtected: isProtectedRoute(currentSegment),
      isAdmin: isAdminRoute(currentSegment),
      isPremium: isPremiumRoute(currentSegment),
      isSpecial: isSpecialRoute(currentSegment),
      segment: currentSegment,
    };
  }, [segments]);

  const getAuthState = useCallback(() => {
    const accountTier = userProfile?.account_tier;
    return {
      isAuthenticated: !!user,
      hasProfile: !!userProfile,
      isVerified: isEmailVerified,
      hasUsername: !!userProfile?.username,
      hasSeenTutorial: userProfile?.has_seen_tutorial ?? false,
      isAdmin: accountTier === 'admin',
      // Admin a accès aux routes premium (super-set des privilèges).
      isPremium: hasPremiumAccess(accountTier),
      userEmail: user?.email || '',
      userId: user?.id || '',
    };
  }, [user, userProfile, isEmailVerified]);

  const safeRedirect = useCallback(
    (path: string, params?: Record<string, string>) => {
      const now = Date.now();
      const redirectSignature = JSON.stringify({
        path,
        params: params ?? null,
      });

      if (
        lastRedirectSignatureRef.current === redirectSignature &&
        now - lastRedirectTime.current < SAME_REDIRECT_DEBOUNCE_MS
      ) {
        return;
      }

      lastRedirectTime.current = now;
      lastRedirectSignatureRef.current = redirectSignature;

      if (params) {
        router.replace({ pathname: path as any, params });
      } else {
        router.replace(path as any);
      }
    },
    [router]
  );

  const resetLoopDetection = useCallback(() => {
    redirectCountRef.current = 0;
    loopDetectedRef.current = false;
    if (loopCooldownTimeoutRef.current) {
      clearTimeout(loopCooldownTimeoutRef.current);
      loopCooldownTimeoutRef.current = null;
    }
  }, []);

  const handleEmergencyLogout = useCallback(async () => {
    try {
      console.log('[Navigation] Emergency logout initiated');
      await signOut();
      setState((prev) => ({ ...prev, forceLogout: true }));
    } catch (error) {
      console.error('[Navigation] Error during emergency logout:', error);
      setState((prev) => ({ ...prev, forceLogout: true }));
    }
  }, [signOut]);

  const showLoopAlert = useCallback(() => {
    showAlert(
      t('navigation.loop_error_title'),
      t('navigation.loop_error_msg'),
      [
        {
          text: t('navigation.logout_btn'),
          style: 'destructive',
          onPress: handleEmergencyLogout,
        },
        {
          text: t('settings.cancel'),
          style: 'cancel',
          onPress: resetLoopDetection,
        },
      ],
      undefined,
      {
        variant: 'danger',
        emoji: '!',
        dismissible: false,
      }
    );
  }, [handleEmergencyLogout, resetLoopDetection, showAlert, t]);

  useEffect(() => {
    if (!isRouterReady) {
      return;
    }

    if (state.forceLogout) {
      redirectCountRef.current = 0;
      loopDetectedRef.current = false;
      setState({ forceLogout: false });
      router.replace('/welcome' as any);
      return;
    }

    if (loading) {
      return;
    }

    const routeState = getCurrentRouteState();
    const authState = getAuthState();
    const shouldWaitForOnboardingDecision =
      authState.isAuthenticated &&
      authState.isVerified &&
      authState.hasUsername &&
      !authState.hasSeenTutorial &&
      isPostSignupOnboardingPendingLoading;
    const shouldShowPostSignupOnboarding =
      authState.isAuthenticated &&
      authState.isVerified &&
      authState.hasUsername &&
      !authState.hasSeenTutorial &&
      isPostSignupOnboardingPending;
    const now = Date.now();
    const timeSinceLastRedirect = now - lastRedirectTime.current;

    if (routeState.segment === '+not-found') {
      return;
    }

    if (shouldWaitForOnboardingDecision) {
      return;
    }

    if (timeSinceLastRedirect < LOOP_DETECTION.TIME_WINDOW) {
      if (
        !routeState.isProtected &&
        !routeState.isPublic &&
        !routeState.isShared &&
        !routeState.isEmailVerification &&
        !routeState.isProfileSetup &&
        !routeState.isSpecial &&
        !routeState.isRootEntry
      ) {
        redirectCountRef.current++;
      }
    } else if (
      routeState.isProtected ||
      routeState.isPublic ||
      routeState.isShared ||
      routeState.isRootEntry
    ) {
      if (redirectCountRef.current > 0) {
        resetLoopDetection();
      }
    }

    if (
      redirectCountRef.current >= LOOP_DETECTION.THRESHOLD &&
      !loopDetectedRef.current
    ) {
      console.error('[Navigation] LOOP DETECTED - Too many redirects!');
      loopDetectedRef.current = true;
      // P3-L Phase 2 — cooldown 60 s post-alerte. Pendant cette fenêtre, la
      // détection reste active et bloque toute nouvelle navigation, même si
      // un re-render intermédiaire essayait de la reset.
      if (loopCooldownTimeoutRef.current) {
        clearTimeout(loopCooldownTimeoutRef.current);
      }
      loopCooldownTimeoutRef.current = setTimeout(() => {
        loopDetectedRef.current = false;
        redirectCountRef.current = 0;
        loopCooldownTimeoutRef.current = null;
      }, LOOP_DETECTION.COOLDOWN_MS);
      showLoopAlert();
      return;
    }

    if (loopDetectedRef.current) {
      return;
    }

    if (!authState.isAuthenticated) {
      if (
        routeState.isRootEntry ||
        (!routeState.isPublic &&
          !routeState.isShared &&
          !routeState.isEmailVerification)
      ) {
        safeRedirect('/welcome');
      }
      return;
    }

    if (authState.hasProfile && !authState.isVerified) {
      if (
        routeState.isRootEntry ||
        (!routeState.isEmailVerification &&
          !routeState.isPublic &&
          !routeState.isShared)
      ) {
        safeRedirect('/email-verification', {
          email: authState.userEmail,
          userId: authState.userId,
          type: 'signup',
        });
      }
      return;
    }

    if (authState.isVerified && !authState.hasUsername) {
      if (
        routeState.isRootEntry ||
        (!routeState.isProfileSetup &&
          !routeState.isEmailVerification &&
          !routeState.isPostSignupOnboarding &&
          !routeState.isShared)
      ) {
        safeRedirect('/username-setup');
      }
      return;
    }

    if (shouldShowPostSignupOnboarding) {
      if (!routeState.isPostSignupOnboarding && !routeState.isShared) {
        safeRedirect('/post-signup-onboarding');
      }
      return;
    }

    // Gate admin (P1-1) — défense en profondeur côté client. Le RLS et les
    // Edge Functions Supabase restent autoritaires côté serveur.
    if (routeState.isAdmin && !authState.isAdmin) {
      safeRedirect('/(tabs)');
      return;
    }

    // Gate premium (P2-D Phase 2) — défense en profondeur + UX cohérente.
    // Redirige vers /premium-upgrade plutôt que /(tabs) pour proposer la
    // conversion plutôt que masquer silencieusement la fonctionnalité.
    if (routeState.isPremium && !authState.isPremium) {
      safeRedirect('/premium-upgrade');
      return;
    }

    if (authState.isVerified && authState.hasUsername) {
      if (routeState.isRootEntry || routeState.isPublic) {
        void clearPreAuthOnboardingDraft();
        safeRedirect('/(tabs)');
      }
    }
  }, [
    user,
    userProfile,
    loading,
    isEmailVerified,
    segments,
    state.forceLogout,
    getCurrentRouteState,
    getAuthState,
    safeRedirect,
    resetLoopDetection,
    showLoopAlert,
    router,
    isRouterReady,
    isPostSignupOnboardingPending,
    isPostSignupOnboardingPendingLoading,
  ]);

  return {
    isLoading: loading,
    isLoopDetected: loopDetectedRef.current,
    alertElement,
  };
}
