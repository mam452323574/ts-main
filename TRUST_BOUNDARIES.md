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

## Accepted residual risk: AAL1-only sessions (no MFA)

> **Source:** Shannon pentest 2026-05-01, finding AUTH-VULN-07. Decision: keep MFA disabled (product call).

MFA / second-factor auth was removed from the product. The check `assertAal2BearerToken()` in `supabase/functions/_shared/phase2Auth.ts` is intentionally a no-op. Consequence:

- Any password-only session (JWT claim `aal: "aal1"`) is accepted by ALL 34 authenticated Edge Functions, including health-data and billing surfaces.
- An attacker who obtains a user's password (via credential stuffing, phishing, brute force, or breach) gains full account access with no second-factor barrier.
- This means **the password is the single point of failure for account security**.

### Compensating controls (must remain in place)

To make the password-only flow as hard to compromise as possible, these controls are mandatory and tested as part of the security regression suite (`__tests__/security/`):

1. **Per-account login lockout** — `auth-pre-login` Edge Function + `record_login_attempt()` RPC. 5 fails / 15min from same (email,ip) → 30-min lock with exponential backoff. **NOTE (Free plan):** until upgraded to Supabase Pro+, the lockout is enforced via the client-side wrapper `secure-login` (called from `AuthContext.signIn()`). An attacker calling `/auth/v1/token` directly with the public anon key bypasses the wrapper. This is an accepted residual risk pending Pro+ upgrade.
2. **Server-side HIBP enforcement** — `secure-signup` Edge Function + `auth.enforce_signup_nonce` trigger. Direct `/auth/v1/signup` calls bypassing the wrapper are rejected at the Postgres layer.
3. **Email verification gate** — `mailer_autoconfirm = false`. New accounts are not usable until `verify-email-code` succeeds.
4. **Password policy (RELAXED 2026-05)** — minimum 8 characters, requires lowercase + digit only. HIBP check disabled per product decision. This re-opens AUTH-VULN-01 by design — accepted residual risk because the lockout, email-verify, disposable-email, and IP rate-limit controls remain in place. To re-enable HIBP: uncomment the block in `supabase/functions/secure-signup/index.ts` and toggle "Leaked password protection" ON in the Supabase dashboard.
5. **Server-side disposable-email filter** — folded into `secure-signup`, blocks subdomain bypasses.

### When to re-evaluate

Restore MFA enforcement (re-implement `assertAal2BearerToken()` to require `aal: "aal2"`) if any of the following becomes true:
- A real-world account takeover incident occurs.
- The compensating controls above are weakened or removed.
- The product onboards regulated data (HIPAA, GDPR Article 9) requiring 2FA by compliance.
- Insurance/audit requirement.

## Accepted residual risk: GoTrue version disclosure

`GET /auth/v1/health` returns the GoTrue server version unauthenticated. Supabase does not expose a way to disable this on the managed product. Risk accepted because (a) Supabase keeps GoTrue patched on its release schedule, (b) the version is also discoverable through behavioral fingerprinting, and (c) blocking it would require fronting GoTrue with Cloudflare which adds cost/complexity.
