# Premium Logic Reference

## Source Of Truth

- Store billing state is authoritative for whether a subscription is active.
- RevenueCat is the canonical entitlement integration used by both client and backend.
- Backend `user_profiles` subscription fields are derived state used for gating and product UX.

## Active Paths

- Client purchase and restore: `react-native-purchases`
- Primary backend sync: `supabase/functions/revenuecat-webhook`
- Authenticated fallback/manual repair: `supabase/functions/sync-subscription-status`

## Deprecated Paths

- The legacy `upgrade-to-premium` Edge Function has been removed. RevenueCat plus backend sync is the active purchase path.
- Direct client-side purchase verification and client webhook flows are not active.
- `react-native-iap` is no longer part of the supported subscription path.

## Gating Rules

- Premium UI should trust backend profile state for gating decisions.
- Backend sync logic must never upgrade or downgrade based on client claims alone.
- Admin accounts keep admin tier even when RevenueCat sync updates subscription fields.

## Operational Failure Signals

- Check `revenuecat_webhook_events.processing_state` and `last_error` for webhook failures.
- Check client Aptabase failure events for purchase, restore, and entitlement-sync issues.
- Use request IDs and webhook event IDs for correlation instead of raw provider payloads.
