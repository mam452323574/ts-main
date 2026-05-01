# Trust Boundaries

## Authentication Posture (2026-04-26)

- The app runs at **AAL1 only** — MFA enrollment was removed (commits `1efd1b7`, `214323a`) and `auth.mfa_factors` purged (migration `20260425230000`). All RLS policies that previously gated rows on `aal = aal2` have been unwrapped (migrations `20260425220000`, `20260425240000`).
- **Risk accepted**: a single compromised password = full account takeover, including for admin accounts. There is no second factor.
- **Compensating controls in place**:
  1. **HIBP password check at signup** via [`supabase/functions/before-user-created`](supabase/functions/before-user-created/index.ts) — blocks signups with passwords from known data breaches (k-anonymity, fail-open). See [`SETUP_AUTH_HOOK_HIBP.md`](SETUP_AUTH_HOOK_HIBP.md).
  2. **Static common-password blacklist** via [`utils/passwordBlacklist.ts`](utils/passwordBlacklist.ts) (`SignUpCredentialsSchema.refine`).
  3. **Email verification** required before access (Edge Functions `send-verification-email` / `verify-email-code`).
  4. **Inactivity timeout 15 min** in [`app/_layout.tsx`](app/_layout.tsx) (`useInactivityTimeout`).
  5. **Global signOut scope** so password reset / suspicious activity invalidates all device sessions.
  6. **Rate limit signup/login** by IP via `check-ip-signup` Edge Function.
- Edge Function helper `assertAal2BearerToken` ([`supabase/functions/_shared/phase2Auth.ts`](supabase/functions/_shared/phase2Auth.ts)) is now a **no-op** kept in place for forward compatibility if MFA is reintroduced. New code must NOT rely on it as a security boundary.

## Client-Trusted

- The client may choose when to request a purchase, restore, upload reservation, share action, report submission, or coach prompt.
- The client is not authoritative for premium access, moderation state, social visibility, or scan entitlement outcomes.
- Treat all client-provided identifiers and text as untrusted input until backend validation completes.

## Backend-Authoritative

- Supabase Edge Functions validate authentication, ownership, rate limits, canonical storage paths, and moderation workflow state.
- The backend decides whether a scan reservation is valid, whether a social upload path is usable, and whether posts/comments/reports stay visible.
- Moderation state, report workflow state, and social integrity counters are backend-owned.

## Store / RevenueCat-Authoritative

- App Store / Google Play billing state is authoritative for subscription status.
- RevenueCat is the canonical subscription integration used to translate store state into app entitlements.
- `revenuecat-webhook` is the primary sync path into `user_profiles`.
- `sync-subscription-status` is fallback/manual repair only and must not be treated as the primary entitlement source.

## Subscription Source Of Truth

- Canonical source of truth: store receipt state via RevenueCat.
- Derived app state: `user_profiles.account_tier`, `subscription_status`, `subscription_expiry_date`, and `subscription_platform`.
- The client should gate premium UX from backend profile state, not from optimistic purchase assumptions.

## Moderation And Social Integrity

- Backend moderation decides post/comment visibility and rejection state.
- Reports are advisory inputs; report volume can trigger auto-hide workflows, but the backend remains authoritative.
- Reserved social uploads must map to stable social storage paths, not scan URLs or signed temporary assets.
- Raw provider failures may be summarized for operations, but raw webhook bodies and sensitive payloads should not be logged back to clients.

## XSS / HTML Injection

- All user-supplied text is rendered exclusively via React Native `<Text>` (or equivalent native components) — never via WebView HTML, `dangerouslySetInnerHTML`, or any DOM-based renderer.
- `normalizeSocialText` (Edge Functions) rejects HTML-like markup, control characters, bidi controls, and dangerous URI schemes (`javascript:`, `vbscript:`, `data:`) before persistence.
- All remote image URIs are normalized via `normalizeTrustedImageUri` (Supabase host whitelist) or `normalizeTrustedHttpsImageUri` (HTTPS-only, no auth, no port) before being passed to `<Image>`.
- All deep-link / route payloads pass through `safeParseJsonRouteParam` which enforces a 64 KB cap and strips control / bidi characters before `JSON.parse`.
- Email templates (Edge Functions) interpolate values exclusively through `escapeHtml` and `assertSafeNumericCode`. Raw string-concat into HTML is forbidden.
- Edge Function responses always include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'`, `Strict-Transport-Security`, and `Referrer-Policy: no-referrer`.
- Any future feature that introduces a WebView, web client, server-rendered HTML, Markdown rendering, or PDF export must re-validate this trust model and add an output-side escaper / sanitizer (e.g. DOMPurify) before shipping.
