# Expo Development Workflow

## Quick Modes

- `npm run dev`
  - Starts Expo Go for quick UI checks.
  - Remote push token registration and RevenueCat are intentionally disabled in Expo Go.
  - Local scheduled notifications can still run on iOS Expo Go.
- `npm run dev:client`
  - Starts Metro for a native development build created with EAS.
  - Use this mode when testing RevenueCat, Expo push tokens, or other native-only behavior.
  - Make sure the public runtime environment includes both `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` before launching the dev client.

## Recommended Native Test Flow

1. Build and install a development client:
   - `eas build --profile development --platform ios`
   - `eas build --profile development --platform android`
2. Open the installed development build on the device or simulator.
3. Attach Metro with `npm run dev:client`.

## Native Folder Warning

- `npx expo-doctor` will continue to warn that `ios/` and `android/` are committed.
- That warning is expected in this repo because it uses a prebuild-style workflow with native folders checked in.
- Changes to native-affecting Expo config in `app.json` are not auto-synced while those folders exist.
- After changing fields such as `plugins`, `ios`, `android`, `scheme`, `icon`, or splash settings, sync native projects intentionally:
  - Run `npx expo prebuild --platform ios --no-install` and/or `npx expo prebuild --platform android --no-install`
  - Or apply the equivalent native changes manually if you want tighter control over the generated diff

## Validation

- `npx expo install --check`
- `npx expo-doctor`
