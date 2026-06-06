import {
  getRuntimeCapabilities,
  logRuntimeDecision,
  logRuntimeDecisionOnce,
} from '@/utils/runtimeCapabilities';
import { logOperationalError } from '@/utils/observability';

// Le module AdMob est un module natif : on le charge paresseusement via
// `require` (comme RevenueCat dans `purchasesRuntime.ts`) pour ne JAMAIS le
// résoudre sur le web ou en Expo Go, où le binaire natif est absent.
type AdsModule = typeof import('react-native-google-mobile-ads');

let adsModulePromise: Promise<AdsModule | null> | null = null;

export async function loadAdsModule(): Promise<AdsModule | null> {
  const runtime = getRuntimeCapabilities();

  if (!runtime.canUseAds) {
    logRuntimeDecisionOnce(
      'AdMob skipped',
      {
        reason: runtime.isExpoGo
          ? 'development-build-required'
          : 'unsupported-runtime',
      },
      runtime.isExpoGo ? 'admob-skipped-expo-go' : 'admob-skipped-unsupported',
    );
    return null;
  }

  if (!adsModulePromise) {
    adsModulePromise = Promise.resolve()
      .then(() => require('react-native-google-mobile-ads') as AdsModule)
      .then((module) => {
        logRuntimeDecision('AdMob loaded');
        return module;
      })
      .catch((error) => {
        logOperationalError('[Runtime] Failed to load AdMob module', error);
        return null;
      });
  }

  return adsModulePromise;
}

export function resetAdsModuleCache() {
  adsModulePromise = null;
}
