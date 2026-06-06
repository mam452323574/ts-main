# Google Play Subscription Setup

`SelfLens` uses the store plus RevenueCat as the active subscription path.

## Canonical Flow

1. Android purchases happen in the native app through `react-native-purchases`.
2. Google Play remains the billing authority for the Android subscription.
3. RevenueCat is the canonical entitlement bridge used by the app and backend.
4. `revenuecat-webhook` is the primary backend sync path into `user_profiles`.
5. `sync-subscription-status` exists only as an authenticated fallback/manual repair path.

## What Is No Longer Active

- The legacy `upgrade-to-premium` endpoint has been removed and must not be used for new integrations.
- The app no longer depends on a direct `react-native-iap` purchase-verification flow.
- Client-side webhook verification is deprecated.

## Required Configuration

- Google Play product(s) and base plans configured in Play Console
- RevenueCat project connected to the Play app
- RevenueCat entitlement configured for premium access
- RevenueCat webhook secret/authorization configured for Supabase
- Public RevenueCat SDK key configured in the mobile runtime
- RevenueCat server API key configured in Supabase secrets

## Operational Checks

- Confirm a sandbox purchase grants the premium entitlement in RevenueCat.
- Confirm `revenuecat-webhook` marks the matching row in `revenuecat_webhook_events` as `processed`.
- Confirm `user_profiles.account_tier`, `subscription_status`, and `subscription_expiry_date` update from the RevenueCat sync.
- Use `sync-subscription-status` only to repair a missed sync or to validate a suspected mismatch.

## Logging And Safety

- Do not log purchase tokens, raw receipts, webhook bodies, or provider secrets.
- Use request or event identifiers when investigating failures.
- Treat backend profile state as derived data, not the billing authority.
