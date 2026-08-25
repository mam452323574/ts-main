import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Source unique des identifiants AppLovin MAX (vidéo récompensée).
// Tant que le compte MAX / les ad units ne sont pas validés, les clés restent
// vides et le gate publicitaire fail-open côté provider.

type AppLovinExtraKey =
  | 'EXPO_PUBLIC_APPLOVIN_SDK_KEY'
  | 'EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED'
  | 'EXPO_PUBLIC_APPLOVIN_IOS_REWARDED';

function readExtraValue(key: AppLovinExtraKey): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  const envValue = process.env[key];
  return typeof envValue === 'string' && envValue.trim().length > 0
    ? envValue.trim()
    : null;
}

export function getAppLovinSdkKey(): string | null {
  return readExtraValue('EXPO_PUBLIC_APPLOVIN_SDK_KEY');
}

export function getRewardedAdUnitId(): string | null {
  return readExtraValue(
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_APPLOVIN_IOS_REWARDED'
      : 'EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED',
  );
}
