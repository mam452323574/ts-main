import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..');

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('no-tracking ads configuration', () => {
  it('does not ship ATT/AdMob and configures AppLovin MAX without tracking prompts', () => {
    const appConfig = readProjectFile('app.json');
    const appRuntimeConfig = readProjectFile('app.config.js');
    const packageJson = readProjectFile('package.json');
    const adsContext = readProjectFile('contexts/AdsContext.tsx');
    const adsConstants = readProjectFile('constants/ads.ts');

    expect(appConfig).not.toContain('expo-tracking-transparency');
    expect(appConfig).not.toContain('userTrackingUsageDescription');
    expect(appConfig).not.toContain('react-native-google-mobile-ads');
    expect(appConfig).not.toContain('ca-app-pub-');
    expect(packageJson).not.toContain('expo-tracking-transparency');
    expect(packageJson).not.toContain('react-native-google-mobile-ads');
    expect(packageJson).toContain('react-native-applovin-max');
    expect(adsContext).not.toContain('requestTrackingPermissionsAsync');
    expect(adsContext).toContain('setTermsAndPrivacyPolicyFlowEnabled(true)');
    expect(adsConstants).toContain('EXPO_PUBLIC_APPLOVIN_SDK_KEY');
    expect(adsConstants).toContain('EXPO_PUBLIC_APPLOVIN_IOS_REWARDED');
    expect(adsConstants).toContain('EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED');
    expect(appRuntimeConfig).toContain('EXPO_PUBLIC_APPLOVIN_SDK_KEY');
  });
});
