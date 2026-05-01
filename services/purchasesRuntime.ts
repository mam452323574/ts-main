import {
  getRuntimeCapabilities,
  logRuntimeDecision,
  logRuntimeDecisionOnce,
} from '@/utils/runtimeCapabilities';
import { logOperationalError } from '@/utils/observability';

type PurchasesModule = typeof import('react-native-purchases');

let purchasesModulePromise: Promise<PurchasesModule | null> | null = null;

export async function loadPurchasesModule(): Promise<PurchasesModule | null> {
  const runtime = getRuntimeCapabilities();

  if (!runtime.canUseNativePurchases) {
    logRuntimeDecisionOnce(
      'RevenueCat skipped',
      {
        reason: runtime.isExpoGo
          ? 'development-build-required'
          : 'unsupported-runtime',
      },
      runtime.isExpoGo
        ? 'revenuecat-skipped-expo-go'
        : 'revenuecat-skipped-unsupported',
    );
    return null;
  }

  if (!purchasesModulePromise) {
    purchasesModulePromise = Promise.resolve()
      .then(() => require('react-native-purchases') as PurchasesModule)
      .then((module) => {
        logRuntimeDecision('RevenueCat loaded');
        return module;
      })
      .catch((error) => {
        logOperationalError('[Runtime] Failed to load RevenueCat module', error);
        return null;
      });
  }

  return purchasesModulePromise;
}

export function resetPurchasesModuleCache() {
  purchasesModulePromise = null;
}
