import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'expo-router';
import type {
  AdDisplayFailedInfo,
  AdInfo,
  AdLoadFailedInfo,
  AdRewardInfo,
} from 'react-native-applovin-max';

import { RewardedAdOptInModal } from '@/components/ads/RewardedAdOptInModal';
import { PUBLIC_PRIVACY_POLICY_URL } from '@/constants/privacyPolicy';
import {
  getAppLovinSdkKey,
  getRewardedAdUnitId,
} from '@/constants/ads';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadAdsModule } from '@/services/adsRuntime';
import { trackEvent } from '@/services/analytics';
import { logOperationalError } from '@/utils/observability';
import {
  getRuntimeCapabilities,
  logRuntimeDecision,
  logRuntimeDecisionOnce,
} from '@/utils/runtimeCapabilities';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';

type AdsModule = NonNullable<Awaited<ReturnType<typeof loadAdsModule>>>;

export type AdGateSurface = 'scan' | 'coach';
export type AdGateOutcome = 'rewarded' | 'skipped' | 'unavailable';

interface AdsContextValue {
  /** Une vidéo récompensée est préchargée et prête à être montrée. */
  isReady: boolean;
  /**
   * Point d'entrée unique réutilisable par le scan et le coach.
   * - premium/admin, web ou Expo Go -> résout `'rewarded'` immédiatement ;
   * - gratuit -> affiche l'opt-in ; selon le choix : `'rewarded'`,
   *   `'skipped'` ou `'unavailable'`.
   *
   * Ne bloque jamais l'utilisateur : si AppLovin n'est pas configuré ou si la
   * pub échoue, retourne `'unavailable'` pour laisser le flux normal continuer.
   */
  presentRewardedAdGate: (surface: AdGateSurface) => Promise<AdGateOutcome>;
}

const MAX_REWARDED_LOAD_RETRY_COUNT = 6;
const REWARDED_SHOW_WATCHDOG_MS = 120_000;

const AdsContext = createContext<AdsContextValue | null>(null);

export function useAdsGate(): AdsContextValue {
  const context = useContext(AdsContext);
  if (!context) {
    return {
      isReady: false,
      presentRewardedAdGate: async () => 'rewarded',
    };
  }
  return context;
}

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const isPremium = hasPremiumAccessFromProfile(userProfile, loading);
  const adsEnabled =
    getRuntimeCapabilities().canUseAds && !loading && !isPremium;

  const [isReady, setIsReady] = useState(false);
  const [optInVisible, setOptInVisible] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const adsModuleRef = useRef<AdsModule | null>(null);
  const adLoadedRef = useRef(false);
  const adLoadingRef = useRef(false);
  const adShownRef = useRef(false);
  const rewardEarnedRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gateResolverRef = useRef<((outcome: AdGateOutcome) => void) | null>(null);
  const currentSurfaceRef = useRef<AdGateSurface>('scan');
  const adsEnabledRef = useRef(adsEnabled);
  adsEnabledRef.current = adsEnabled;

  const preloadRef = useRef<() => void>(() => {});

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const clearShowWatchdog = useCallback(() => {
    if (showWatchdogRef.current) {
      clearTimeout(showWatchdogRef.current);
      showWatchdogRef.current = null;
    }
  }, []);

  const resolveGate = useCallback(
    (outcome: AdGateOutcome) => {
      clearShowWatchdog();
      setOptInVisible(false);
      const resolver = gateResolverRef.current;
      gateResolverRef.current = null;
      resolver?.(outcome);
    },
    [clearShowWatchdog],
  );

  const resetLoadedState = useCallback(() => {
    adLoadedRef.current = false;
    adLoadingRef.current = false;
    setIsReady(false);
  }, []);

  const scheduleLoadRetry = useCallback(() => {
    clearRetryTimeout();
    if (!adsEnabledRef.current) {
      return;
    }

    retryAttemptRef.current += 1;
    if (retryAttemptRef.current > MAX_REWARDED_LOAD_RETRY_COUNT) {
      return;
    }

    const retryDelaySeconds = Math.pow(
      2,
      Math.min(MAX_REWARDED_LOAD_RETRY_COUNT, retryAttemptRef.current),
    );
    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      preloadRef.current();
    }, retryDelaySeconds * 1000);
  }, [clearRetryTimeout]);

  const cleanupRewardedListeners = useCallback(() => {
    const module = adsModuleRef.current;
    if (!module) {
      return;
    }

    try {
      module.RewardedAd.removeAdLoadedEventListener();
      module.RewardedAd.removeAdLoadFailedEventListener();
      module.RewardedAd.removeAdDisplayedEventListener();
      module.RewardedAd.removeAdFailedToDisplayEventListener();
      module.RewardedAd.removeAdHiddenEventListener();
      module.RewardedAd.removeAdReceivedRewardEventListener();
    } catch (error) {
      logOperationalError('[Ads] Failed to remove AppLovin listeners', error);
    }
  }, []);

  const handleAdClosed = useCallback(() => {
    const earned = rewardEarnedRef.current;
    resetLoadedState();
    adShownRef.current = false;
    rewardEarnedRef.current = false;
    resolveGate(earned ? 'rewarded' : 'skipped');
    preloadRef.current();
  }, [resetLoadedState, resolveGate]);

  const handleDisplayFailure = useCallback(
    (error: AdDisplayFailedInfo | unknown) => {
      logOperationalError('[Ads] AppLovin rewarded ad failed to display', error);
      trackEvent('ad_failed', { surface: currentSurfaceRef.current });
      resetLoadedState();
      adShownRef.current = false;
      rewardEarnedRef.current = false;
      resolveGate('unavailable');
      preloadRef.current();
    },
    [resetLoadedState, resolveGate],
  );

  const handleLoadFailure = useCallback(
    (error: AdLoadFailedInfo | unknown) => {
      logOperationalError('[Ads] AppLovin rewarded ad failed to load', error);
      resetLoadedState();
      scheduleLoadRetry();
    },
    [resetLoadedState, scheduleLoadRetry],
  );

  const registerRewardedListeners = useCallback(
    (module: AdsModule) => {
      cleanupRewardedListeners();

      module.RewardedAd.addAdLoadedEventListener((_adInfo: AdInfo) => {
        retryAttemptRef.current = 0;
        adLoadedRef.current = true;
        adLoadingRef.current = false;
        setIsReady(true);
      });

      module.RewardedAd.addAdLoadFailedEventListener(handleLoadFailure);

      module.RewardedAd.addAdDisplayedEventListener((_adInfo: AdInfo) => {
        adShownRef.current = true;
      });

      module.RewardedAd.addAdFailedToDisplayEventListener(handleDisplayFailure);

      module.RewardedAd.addAdHiddenEventListener((_adInfo: AdInfo) => {
        handleAdClosed();
      });

      module.RewardedAd.addAdReceivedRewardEventListener(
        (_rewardInfo: AdRewardInfo) => {
          rewardEarnedRef.current = true;
          trackEvent('ad_rewarded_earned', { surface: currentSurfaceRef.current });
        },
      );
    },
    [cleanupRewardedListeners, handleAdClosed, handleDisplayFailure, handleLoadFailure],
  );

  const preloadRewardedAd = useCallback(() => {
    const module = adsModuleRef.current;
    const adUnitId = getRewardedAdUnitId();
    if (!module || !adsEnabledRef.current || !initialized || !adUnitId) {
      return;
    }
    if (adLoadingRef.current || adLoadedRef.current) {
      return;
    }

    try {
      clearRetryTimeout();
      rewardEarnedRef.current = false;
      adLoadingRef.current = true;
      adLoadedRef.current = false;
      setIsReady(false);
      module.RewardedAd.loadAd(adUnitId);
    } catch (error) {
      logOperationalError('[Ads] Failed to start AppLovin rewarded load', error);
      resetLoadedState();
      scheduleLoadRetry();
    }
  }, [clearRetryTimeout, initialized, resetLoadedState, scheduleLoadRetry]);

  useEffect(() => {
    preloadRef.current = preloadRewardedAd;
  }, [preloadRewardedAd]);

  const handleOptInWatch = useCallback(async () => {
    trackEvent('ad_optin_accepted', { surface: currentSurfaceRef.current });

    const module = adsModuleRef.current;
    const adUnitId = getRewardedAdUnitId();
    if (!adsEnabledRef.current || !module || !adUnitId || !initialized) {
      trackEvent('ad_unavailable', { surface: currentSurfaceRef.current });
      resolveGate('unavailable');
      return;
    }

    try {
      const isAdReady = await module.RewardedAd.isAdReady(adUnitId);
      if (!isAdReady) {
        trackEvent('ad_unavailable', { surface: currentSurfaceRef.current });
        preloadRef.current();
        resolveGate('unavailable');
        return;
      }

      adShownRef.current = true;
      rewardEarnedRef.current = false;
      clearShowWatchdog();
      showWatchdogRef.current = setTimeout(() => {
        logOperationalError('[Ads] AppLovin rewarded ad show watchdog expired', {
          surface: currentSurfaceRef.current,
        });
        resetLoadedState();
        adShownRef.current = false;
        rewardEarnedRef.current = false;
        resolveGate('unavailable');
        preloadRef.current();
      }, REWARDED_SHOW_WATCHDOG_MS);
      module.RewardedAd.showAd(adUnitId, currentSurfaceRef.current);
    } catch (error) {
      handleDisplayFailure(error);
    }
  }, [
    clearShowWatchdog,
    handleDisplayFailure,
    initialized,
    resetLoadedState,
    resolveGate,
  ]);

  const handleOptInLater = useCallback(() => {
    trackEvent('ad_optin_declined', { surface: currentSurfaceRef.current });
    resolveGate('skipped');
  }, [resolveGate]);

  const handleOptInGoPremium = useCallback(() => {
    trackEvent('ad_optin_declined', {
      surface: currentSurfaceRef.current,
      reason: 'go_premium',
    });
    resolveGate('skipped');
    router.push('/premium-upgrade');
  }, [resolveGate, router]);

  const presentRewardedAdGate = useCallback(
    (surface: AdGateSurface): Promise<AdGateOutcome> => {
      if (!adsEnabled) {
        return Promise.resolve('rewarded');
      }

      const adUnitId = getRewardedAdUnitId();
      if (!initialized || !adsModuleRef.current || !adUnitId) {
        trackEvent('ad_unavailable', { surface });
        logRuntimeDecisionOnce(
          'AppLovin MAX rewarded gate unavailable',
          {
            reason: !adUnitId ? 'missing-rewarded-ad-unit' : 'sdk-not-ready',
            surface,
          },
          `applovin-gate-unavailable-${surface}-${adUnitId ? 'sdk' : 'unit'}`,
        );
        return Promise.resolve('unavailable');
      }

      if (gateResolverRef.current) {
        return Promise.resolve('unavailable');
      }

      currentSurfaceRef.current = surface;
      trackEvent('ad_optin_shown', { surface });

      return new Promise<AdGateOutcome>((resolve) => {
        gateResolverRef.current = resolve;
        if (!adLoadedRef.current) {
          preloadRewardedAd();
        }
        setOptInVisible(true);
      });
    },
    [adsEnabled, initialized, preloadRewardedAd],
  );

  useEffect(() => {
    if (!getRuntimeCapabilities().canUseAds) {
      return;
    }

    const sdkKey = getAppLovinSdkKey();
    const adUnitId = getRewardedAdUnitId();
    if (!sdkKey || !adUnitId) {
      logRuntimeDecisionOnce(
        'AppLovin MAX init skipped',
        {
          reason: !sdkKey ? 'missing-sdk-key' : 'missing-rewarded-ad-unit',
        },
        !sdkKey ? 'applovin-missing-sdk-key' : 'applovin-missing-rewarded-unit',
      );
      return;
    }

    let cancelled = false;

    (async () => {
      const module = await loadAdsModule();
      if (!module || cancelled) {
        return;
      }

      adsModuleRef.current = module;
      registerRewardedListeners(module);

      try {
        module.AppLovinMAX.setTermsAndPrivacyPolicyFlowEnabled(true);
        module.AppLovinMAX.setPrivacyPolicyUrl(PUBLIC_PRIVACY_POLICY_URL);
        module.AppLovinMAX.setInitializationAdUnitIds([adUnitId]);
        await module.AppLovinMAX.initialize(sdkKey);
        if (!cancelled) {
          logRuntimeDecision('AppLovin MAX initialized');
          setInitialized(true);
        }
      } catch (error) {
        logOperationalError('[Ads] AppLovin MAX initialize failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registerRewardedListeners]);

  useEffect(() => {
    if (initialized && adsEnabled) {
      preloadRewardedAd();
    }
  }, [initialized, adsEnabled, preloadRewardedAd]);

  useEffect(() => {
    if (!adsEnabled) {
      clearRetryTimeout();
      clearShowWatchdog();
      resetLoadedState();
      adShownRef.current = false;
      rewardEarnedRef.current = false;
    }
  }, [adsEnabled, clearRetryTimeout, clearShowWatchdog, resetLoadedState]);

  useEffect(
    () => () => {
      clearRetryTimeout();
      clearShowWatchdog();
      cleanupRewardedListeners();
    },
    [cleanupRewardedListeners, clearRetryTimeout, clearShowWatchdog],
  );

  const value = useMemo<AdsContextValue>(
    () => ({ isReady, presentRewardedAdGate }),
    [isReady, presentRewardedAdGate],
  );

  return (
    <AdsContext.Provider value={value}>
      {children}
      <RewardedAdOptInModal
        visible={optInVisible}
        onClose={() => setOptInVisible(false)}
        onWatch={handleOptInWatch}
        onLater={handleOptInLater}
        onGoPremium={handleOptInGoPremium}
      />
    </AdsContext.Provider>
  );
}
