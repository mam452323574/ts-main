import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Source unique des identifiants d'unités publicitaires AdMob (vidéo
// récompensée). Stratégie :
//   - En développement (__DEV__) on utilise TOUJOURS les IDs de TEST officiels
//     Google, pour ne jamais risquer de servir/cliquer une vraie pub pendant le
//     dev (ce qui ferait suspendre le compte AdMob).
//   - En production on lit les vrais IDs depuis `app.json > extra` (collés par
//     l'équipe une fois le compte AdMob prêt). Tant que ces clés sont vides, on
//     retombe sur les IDs de test.
//
// Pour passer en prod : coller les 2 unit IDs réels dans `app.json > extra`
// (clés ci-dessous) et les 2 App IDs dans le bloc plugin
// `react-native-google-mobile-ads`. Aucun changement de code requis.

type AdmobExtraKey =
  | 'EXPO_PUBLIC_ADMOB_ANDROID_REWARDED'
  | 'EXPO_PUBLIC_ADMOB_IOS_REWARDED';

// IDs de TEST officiels Google (équivalents de `TestIds.REWARDED` du SDK, mais
// codés en dur ici pour éviter d'importer statiquement le module natif).
// https://developers.google.com/admob/android/test-ads
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';

function readExtraValue(key: AdmobExtraKey): string | null {
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

export function getRewardedAdUnitId(): string {
  const testId = Platform.OS === 'ios' ? TEST_REWARDED_IOS : TEST_REWARDED_ANDROID;

  if (__DEV__) {
    return testId;
  }

  const realId = readExtraValue(
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_ADMOB_IOS_REWARDED'
      : 'EXPO_PUBLIC_ADMOB_ANDROID_REWARDED',
  );

  return realId ?? testId;
}
