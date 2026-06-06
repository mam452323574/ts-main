import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import type { RewardedAd } from 'react-native-google-mobile-ads';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { RewardedAdOptInModal } from '@/components/ads/RewardedAdOptInModal';
import { loadAdsModule } from '@/services/adsRuntime';
import { getRewardedAdUnitId } from '@/constants/ads';
import { trackEvent } from '@/services/analytics';
import { hasPremiumAccessFromProfile } from '@/utils/subscription';
import {
  getRuntimeCapabilities,
  logRuntimeDecision,
} from '@/utils/runtimeCapabilities';
import { logOperationalError } from '@/utils/observability';

type AdsModule = NonNullable<Awaited<ReturnType<typeof loadAdsModule>>>;

export type AdGateSurface = 'scan' | 'coach';
export type AdGateOutcome = 'rewarded' | 'skipped' | 'unavailable';

interface AdsContextValue {
  /** Une vidéo récompensée est préchargée et prête à être montrée. */
  isReady: boolean;
  /**
   * Point d'entrée unique réutilisable par le scan et le coach.
   * - premium/admin, web ou Expo Go → résout `'rewarded'` immédiatement (aucune
   *   pub, flux inchangé) ;
   * - gratuit → affiche l'opt-in ; selon le choix : `'rewarded'` (pub regardée),
   *   `'skipped'` (refus) ou `'unavailable'` (aucune pub dispo / échec).
   *
   * Ne bloque JAMAIS l'utilisateur : en cas de souci pub, retourne
   * `'unavailable'` pour laisser l'appelant poursuivre son flux normal.
   */
  presentRewardedAdGate: (surface: AdGateSurface) => Promise<AdGateOutcome>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

export function useAdsGate(): AdsContextValue {
  const context = useContext(AdsContext);
  if (!context) {
    // Fail-open : si le provider n'est pas monté (tests, web, etc.), on ne
    // bloque jamais le scan/coach.
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

  // --- Refs de cycle de vie (toujours à jour, évitent les closures périmées) ---
  const adsModuleRef = useRef<AdsModule | null>(null);
  const rewardedAdRef = useRef<RewardedAd | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const adLoadedRef = useRef(false);
  const adLoadingRef = useRef(false);
  const adShownRef = useRef(false);
  const rewardEarnedRef = useRef(false);
  const nonPersonalizedRef = useRef(false);

  const gateResolverRef = useRef<((outcome: AdGateOutcome) => void) | null>(null);
  const currentSurfaceRef = useRef<AdGateSurface>('scan');

  // adsEnabled est lu dans des callbacks stables → on en garde une version ref.
  const adsEnabledRef = useRef(adsEnabled);
  adsEnabledRef.current = adsEnabled;

  // Référence vers la dernière version de preload (casse la dépendance
  // circulaire handleAdClosed ↔ preloadRewardedAd).
  const preloadRef = useRef<() => void>(() => {});

  const resolveGate = useCallback((outcome: AdGateOutcome) => {
    const resolver = gateResolverRef.current;
    gateResolverRef.current = null;
    resolver?.(outcome);
  }, []);

  const cleanupAdListeners = useCallback(() => {
    unsubscribersRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // listener déjà détaché — sans conséquence
      }
    });
    unsubscribersRef.current = [];
  }, []);

  const handleAdClosed = useCallback(() => {
    const earned = rewardEarnedRef.current;
    cleanupAdListeners();
    rewardedAdRef.current = null;
    adLoadedRef.current = false;
    adLoadingRef.current = false;
    adShownRef.current = false;
    rewardEarnedRef.current = false;
    setIsReady(false);
    resolveGate(earned ? 'rewarded' : 'skipped');
    // Précharge la suivante pour le prochain scan/coach.
    preloadRef.current();
  }, [cleanupAdListeners, resolveGate]);

  const handleAdError = useCallback(
    (error: unknown) => {
      cleanupAdListeners();
      rewardedAdRef.current = null;
      adLoadedRef.current = false;
      adLoadingRef.current = false;
      setIsReady(false);
      logOperationalError('[Ads] Rewarded ad error', error);
      // Erreur pendant l'affichage d'une pub déjà acceptée → on débloque.
      if (adShownRef.current) {
        adShownRef.current = false;
        trackEvent('ad_failed', { surface: currentSurfaceRef.current });
        resolveGate('unavailable');
      }
    },
    [cleanupAdListeners, resolveGate],
  );

  const preloadRewardedAd = useCallback(() => {
    const adsModule = adsModuleRef.current;
    if (!adsModule || !adsEnabledRef.current) {
      return;
    }
    if (adLoadingRef.current || adLoadedRef.current) {
      return;
    }

    try {
      cleanupAdListeners();
      rewardEarnedRef.current = false;

      const { RewardedAd, RewardedAdEventType, AdEventType } = adsModule;
      const ad = RewardedAd.createForAdRequest(getRewardedAdUnitId(), {
        requestNonPersonalizedAdsOnly: nonPersonalizedRef.current,
      });

      const subscriptions: Array<() => void> = [
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          adLoadedRef.current = true;
          adLoadingRef.current = false;
          setIsReady(true);
        }),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          rewardEarnedRef.current = true;
          trackEvent('ad_rewarded_earned', { surface: currentSurfaceRef.current });
        }),
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          handleAdClosed();
        }),
        ad.addAdEventListener(AdEventType.ERROR, (error) => {
          handleAdError(error);
        }),
      ];

      unsubscribersRef.current = subscriptions;
      rewardedAdRef.current = ad;
      adLoadingRef.current = true;
      adLoadedRef.current = false;
      setIsReady(false);
      ad.load();
    } catch (error) {
      adLoadingRef.current = false;
      logOperationalError('[Ads] Failed to preload rewarded ad', error);
    }
  }, [cleanupAdListeners, handleAdClosed, handleAdError]);

  useEffect(() => {
    preloadRef.current = preloadRewardedAd;
  }, [preloadRewardedAd]);

  // --- Handlers de l'opt-in (CustomAlert appelle onDismiss PUIS onPress) ------
  const handleOptInWatch = useCallback(async () => {
    trackEvent('ad_optin_accepted', { surface: currentSurfaceRef.current });
    const ad = rewardedAdRef.current;
    if (adsEnabledRef.current && ad && adLoadedRef.current) {
      try {
        adShownRef.current = true;
        rewardEarnedRef.current = false;
        await ad.show(); // la résolution se fait via le listener CLOSED
        return;
      } catch (error) {
        logOperationalError('[Ads] Failed to show rewarded ad', error);
        trackEvent('ad_failed', { surface: currentSurfaceRef.current });
        adShownRef.current = false;
      }
    } else {
      trackEvent('ad_unavailable', { surface: currentSurfaceRef.current });
    }
    // Pas de pub dispo / échec → ne pas bloquer, l'appelant poursuit.
    preloadRef.current();
    resolveGate('unavailable');
  }, [resolveGate]);

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
      // Premium/admin, web ou Expo Go → jamais de pub.
      if (!adsEnabled) {
        return Promise.resolve('rewarded');
      }
      // Sécurité : une seule pub à la fois.
      if (gateResolverRef.current) {
        return Promise.resolve('unavailable');
      }

      currentSurfaceRef.current = surface;
      trackEvent('ad_optin_shown', { surface });

      return new Promise<AdGateOutcome>((resolve) => {
        gateResolverRef.current = resolve;
        // Tente un préchargement pendant que l'utilisateur lit l'opt-in.
        if (!adLoadedRef.current) {
          preloadRewardedAd();
        }
        setOptInVisible(true);
      });
    },
    [adsEnabled, preloadRewardedAd],
  );

  // --- Initialisation unique : UMP (RGPD) → ATT iOS → SDK AdMob --------------
  useEffect(() => {
    if (!getRuntimeCapabilities().canUseAds) {
      return;
    }

    let cancelled = false;

    (async () => {
      const adsModule = await loadAdsModule();
      if (!adsModule || cancelled) {
        return;
      }
      adsModuleRef.current = adsModule;

      // 1. Consentement RGPD via le SDK UMP de Google.
      try {
        const { AdsConsent, AdsConsentStatus } = adsModule;
        const consentInfo = await AdsConsent.requestInfoUpdate();
        if (
          consentInfo.isConsentFormAvailable &&
          consentInfo.status === AdsConsentStatus.REQUIRED
        ) {
          await AdsConsent.loadAndShowConsentFormIfRequired();
        }
      } catch (error) {
        logOperationalError('[Ads] UMP consent flow failed', error);
      }

      // 2. App Tracking Transparency (iOS). Le refus → pubs non personnalisées.
      try {
        if (Platform.OS === 'ios') {
          const tracking = require('expo-tracking-transparency');
          const current = await tracking.getTrackingPermissionsAsync();
          let status = current.status;
          if (status === 'undetermined') {
            const requested = await tracking.requestTrackingPermissionsAsync();
            status = requested.status;
          }
          nonPersonalizedRef.current = status !== 'granted';
        }
      } catch (error) {
        logOperationalError('[Ads] ATT request failed', error);
      }

      // 3. Initialisation du SDK AdMob.
      try {
        const mobileAds = adsModule.default;
        if (__DEV__) {
          try {
            await mobileAds().setRequestConfiguration({
              testDeviceIdentifiers: ['EMULATOR'],
            });
          } catch (error) {
            logOperationalError('[Ads] setRequestConfiguration failed', error);
          }
        }
        await mobileAds().initialize();
        if (!cancelled) {
          logRuntimeDecision('AdMob initialized');
          setInitialized(true);
        }
      } catch (error) {
        logOperationalError('[Ads] mobileAds initialize failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Précharge dès que le SDK est prêt et que l'utilisateur est éligible (gratuit).
  useEffect(() => {
    if (initialized && adsEnabled) {
      preloadRewardedAd();
    }
  }, [initialized, adsEnabled, preloadRewardedAd]);

  // Utilisateur premium/admin (ou capacité perdue) → on libère la pub préchargée.
  useEffect(() => {
    if (!adsEnabled) {
      cleanupAdListeners();
      rewardedAdRef.current = null;
      adLoadedRef.current = false;
      adLoadingRef.current = false;
      setIsReady(false);
    }
  }, [adsEnabled, cleanupAdListeners]);

  useEffect(() => () => cleanupAdListeners(), [cleanupAdListeners]);

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
