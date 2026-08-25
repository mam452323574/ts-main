# AppLovin MAX Setup Notes

Code-side integration is ready, but the dashboard values must still be created in AppLovin MAX before a production build.

## App Record

- App name: SelfLens
- iOS bundle ID: `org.selflens.app`
- Android package: `com.selflens.app`
- App Store ID: `6775438896`
- Privacy URL: `https://privacy.selflens.org/privacy-policy/`
- Mediation: do not enable AdMob/Google as a mediation network.

## Rewarded Ad Units

Create one rewarded ad unit per platform:

- iOS rewarded scan/coach unlock
- Android rewarded scan/coach unlock

Then set these values in the build environment:

```text
EXPO_PUBLIC_APPLOVIN_SDK_KEY=<AppLovin SDK key>
EXPO_PUBLIC_APPLOVIN_IOS_REWARDED=<iOS rewarded ad unit ID>
EXPO_PUBLIC_APPLOVIN_ANDROID_REWARDED=<Android rewarded ad unit ID>
```

The committed `app.json` keeps these empty on purpose. `app.config.js` reads the environment first and falls back to the empty placeholders.

## Review Checklist

- Confirm AppLovin account/app approval before building.
- `config/applovinSkAdNetworkIds.json` contains the current AppLovin SKAdNetwork list fetched on 2026-07-05; refresh it from AppLovin before the final App Store build if the dashboard/docs say it changed.
- Add AppLovin's requested `app-ads.txt` entry if the dashboard requires it.
- Re-check App Store Connect privacy labels with AppLovin MAX included.
- Keep Tracking set to No unless a future mediation/consent change makes that untrue.
- Run a real device QA pass because AppLovin MAX is a native SDK and is skipped on web/Expo Go.
