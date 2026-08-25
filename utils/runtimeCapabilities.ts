import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  sanitizeObservabilityProperties,
  type SafeObservabilityProperties,
} from './observability';

export interface RuntimeCapabilities {
  platform: typeof Platform.OS;
  appOwnership: string;
  isExpoGo: boolean;
  canUseNativePurchases: boolean;
  canUseLocalNotifications: boolean;
  canRegisterForPushNotifications: boolean;
  canUseAds: boolean;
}

const runtimeDecisionLogHistory = new Set<string>();

export function getRuntimeCapabilities(): RuntimeCapabilities {
  const appOwnership = Constants.appOwnership ?? 'unknown';
  const isExpoGo = appOwnership === 'expo';
  const isWeb = Platform.OS === 'web';
  const canUseLocalNotifications = !isWeb && !(isExpoGo && Platform.OS === 'android');

  return {
    platform: Platform.OS,
    appOwnership,
    isExpoGo,
    canUseNativePurchases: !isWeb && !isExpoGo,
    // expo-notifications remains unreliable in Expo Go on Android, so we keep
    // local scheduling disabled there while allowing other native runtimes.
    canUseLocalNotifications,
    canRegisterForPushNotifications: !isWeb && !isExpoGo,
    // AppLovin MAX est un SDK natif : indisponible sur le web et en Expo Go
    // (nécessite un dev/EAS build). On garde la même règle que les achats natifs.
    canUseAds: !isWeb && !isExpoGo,
  };
}

export function logStartupMarker(
  marker: string,
  extra: SafeObservabilityProperties = {}
) {
  console.log('[Startup]', marker, sanitizeObservabilityProperties({
    ...getRuntimeCapabilities(),
    ...extra,
  }));
}

export function logRuntimeDecision(
  scope: string,
  extra: SafeObservabilityProperties = {}
) {
  console.log('[Runtime]', scope, sanitizeObservabilityProperties({
    ...getRuntimeCapabilities(),
    ...extra,
  }));
}

export function logRuntimeDecisionOnce(
  scope: string,
  extra: SafeObservabilityProperties = {},
  key?: string,
) {
  const cacheKey =
    key ??
    `${scope}:${JSON.stringify(sanitizeObservabilityProperties(extra) ?? {})}`;

  if (runtimeDecisionLogHistory.has(cacheKey)) {
    return;
  }

  runtimeDecisionLogHistory.add(cacheKey);
  logRuntimeDecision(scope, extra);
}
