# Security Fix Plan — May 2026 (post-Shannon pentest)

> **Source pentest:** Shannon AI white-box, run 2026-05-01, workspace `ts-web-3`
> **Branch:** `security/post-pentest-fixes-2026-05`
> **Owner:** @malo
> **Target completion:** J+11 from kickoff

---

## Executive summary

Shannon found **7 authentication-class vulnerabilities** (1 Critical, 4 High, 2 Medium) and 2 misconfigurations on the Supabase backend. All other vuln classes (authz, injection, SSRF, XSS) are clean.

**Critical attack chain (proven):**
1. Sign up an account with a known-breached password (HIBP bypass)
2. Brute-force any victim account in ≤8 attempts (no per-account lockout)
3. Full account takeover (no MFA barrier — all 34 Edge Functions accept AAL1)

**Product decision:** MFA stays disabled → password-only flow MUST be hardened to compensate (strict server-side HIBP, lockout, email-verify gate).

---

## Wave 0 — Setup

| # | Task | Owner | Status |
|---|------|-------|--------|
| 0.1 | Create branch `security/post-pentest-fixes-2026-05` | malo | [x] |
| 0.2 | Create this tracking file | malo | [x] |
| 0.3 | **MANUAL:** Delete 5 pentest accounts in Supabase dashboard (see "Manual actions" below) | malo | [ ] |
| 0.4 | **MANUAL:** Verify Supabase plan is Pro+ (needed for Auth Hooks) | malo | [ ] |

---

## Wave 1 — IMMEDIATE (J+0 → J+1) — Close critical chain

| # | Task | Severity | Files | Owner | Status |
|---|------|----------|-------|-------|--------|
| 1.1 | Set `mailer_autoconfirm = false` in `supabase/config.toml` | High (misconfig) | `supabase/config.toml` | malo | [ ] |
| 1.1b | **MANUAL:** Mirror change in Supabase dashboard → Authentication → Email | High | dashboard | malo | [ ] |
| 1.2a | Migration: `login_attempts` table | Critical | `supabase/migrations/20260502_010000_login_attempts_table.sql` | malo | [ ] |
| 1.2b | Migration: `login_lockouts` table | Critical | `supabase/migrations/20260502_010100_login_lockouts_table.sql` | malo | [ ] |
| 1.2c | Migration: `record_login_attempt()` + `check_login_locked()` RPCs | Critical | `supabase/migrations/20260502_010200_pre_login_hook_rpc.sql` | malo | [ ] |
| 1.2d | Edge Function: `auth-pre-login` | Critical | `supabase/functions/auth-pre-login/index.ts` | malo | [ ] |
| 1.2e | **MANUAL:** Enable `password_grant_pre_login` HTTP hook in Supabase dashboard pointing to `auth-pre-login` | Critical | dashboard | malo | [ ] |
| 1.3 | Document MFA accepted residual risk | High (accepted) | `TRUST_BOUNDARIES.md`, `SECURITY_AUDIT_SUPABASE.md`, `supabase/functions/_shared/phase2Auth.ts` | malo | [ ] |

**Wave 1 closure criteria:**
- [ ] 6 wrong-password POSTs to `/auth/v1/token` → 6th rejected
- [ ] New signup does NOT auto-confirm; requires `verify-email-code`

---

## Wave 2 — SHORT-TERM (J+2 → J+5) — Server-side signup wrapper

| # | Task | Severity | Files | Owner | Status |
|---|------|----------|-------|-------|--------|
| 2.1 | Extract HIBP into `_shared/hibp.ts` | refactor | `supabase/functions/_shared/hibp.ts` (new), `before-user-created/index.ts` (use it) | malo | [ ] |
| 2.2 | Migration: `signup_attestations` + `consume_signup_attestation()` | Critical | `supabase/migrations/20260502_020000_signup_attestations.sql` | malo | [ ] |
| 2.3 | Edge Function: `secure-signup` (HIBP + disposable + IP rate + nonce) | High | `supabase/functions/secure-signup/index.ts` | malo | [ ] |
| 2.4 | Migration: `auth.enforce_signup_nonce()` trigger (ship DISABLED) | Critical | `supabase/migrations/20260502_020100_signup_nonce_trigger.sql` | malo | [ ] |
| 2.5 | Migrate `AuthContext.tsx` to call `secure-signup` instead of direct `supabase.auth.signUp()` | High | `contexts/AuthContext.tsx` (lines 1219, 1241, 1304, 1306, 1568), `app/signup.tsx`, tests | malo | [ ] |
| 2.6 | **MANUAL:** Push OTA update + force-update old binaries (wait for <1% legacy traffic) | High | Expo dashboard | malo | [ ] |
| 2.7 | **MANUAL:** Activate trigger: `ALTER TABLE auth.users ENABLE TRIGGER enforce_signup_nonce_trigger;` | Critical | Supabase SQL editor | malo | [ ] |
| 2.8 | Cleanup: deprecate `before-user-created`, `check-signup-eligibility`, `check-ip-signup` after 30 days stable | refactor | `active-edge-functions.json` | malo | [ ] |

**Wave 2 closure criteria:**
- [ ] Direct `curl POST /auth/v1/signup` with breached password → HTTP 4xx (trigger blocks)
- [ ] Direct `curl POST /auth/v1/signup` with `@mailinator.com` → HTTP 4xx
- [ ] 11 signups from same IP via `secure-signup` → 11th blocked

---

## Wave 3 — POLISH (J+6 → J+10) — Hardening + crypto

| # | Task | Severity | Files | Owner | Status |
|---|------|----------|-------|-------|--------|
| 3.1 | Add Cache-Control headers to `SECURITY_HEADERS` | Medium | `supabase/functions/_shared/cors.ts:38-44` | malo | [ ] |
| 3.2 | Replace `Math.random()` with `crypto.randomInt()` (8-digit code) | Medium | `supabase/functions/send-verification-email/index.ts:193` | malo | [ ] |
| 3.3 | Use `timingSafeEqual()` for webhook bearer comparison | High (potential) | `supabase/functions/revenuecat-webhook/index.ts:63` | malo | [ ] |
| 3.4 | Apply `validateWebhookUrl()` to coach + social-report webhooks (defense-in-depth) | Info | `supabase/functions/_shared/coachWebhook.ts`, `supabase/functions/social-report-content/index.ts` | malo | [ ] |
| 3.5 | Document version-disclosure decision (`/auth/v1/health`) | Low | `SECURITY_AUDIT_SUPABASE.md` | malo | [ ] |
| 3.6 | Fix subdomain matching in disposable email check | High | `supabase/functions/check-signup-eligibility/index.ts` (and `secure-signup`) | malo | [ ] |

---

## Wave 4 — Verification (J+11)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 4.1 | Re-run Shannon pentest on workspace `ts-web-postfix` | malo | [ ] |
| 4.2 | Add security regression tests in `__tests__/security/` (9 tests, see plan) | malo | [ ] |
| 4.3 | Set up monitoring (5xx on hooks, lockout count, attestation failures) | malo | [ ] |

---

## Manual actions required (cannot be automated)

These are the tasks **only the human owner can do** (production data, dashboards, OTA pushes):

1. **Delete 5 pentest accounts** in Supabase dashboard → Authentication → Users:
   - `victim_bruteforce_1777674895@protonmail.com` (id `659b2c16-caf8-44fa-ad90-8ad38afe7fe2`)
   - `pentest_vuln01_1777674801@gmail.com` (id `b07b3923-d4c7-4d7e-967c-604b5cfe0fe8`)
   - `attacker_1777674833@mailinator.com` (id `54883a33-6039-43d4-8d44-ed33103439e8`)
   - `sectest_weak@mailinator.com`
   - `sectest_common@mailinator.com`
   *(Search by `sectest_*` and `pentest_*` prefixes; also check for any account ending in `@mailinator.com` not yours)*

2. **Confirm Supabase plan is Pro+** for Auth Hooks support (`password_grant_pre_login` HTTP hook). Free tier doesn't expose this hook.

3. **Mirror `mailer_autoconfirm = false`** in Supabase dashboard → Authentication → Email (the `config.toml` change only affects local dev unless deployed via `supabase db push`).

4. **Enable Auth Hook** in dashboard → Authentication → Hooks → Add HTTP hook:
   - Type: `Password Grant Pre-Login`
   - URL: `https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/auth-pre-login`
   - Secret: generate one + add to Edge Function env

5. **Push OTA + force-update** old binaries via Expo before activating Wave 2.7 trigger.

6. **Run `ALTER TABLE auth.users ENABLE TRIGGER enforce_signup_nonce_trigger;`** in SQL editor when OTA adoption ≥99%.

---

## Findings reference (Shannon)

| ID | Severity | Title | Confidence |
|----|----------|-------|-----------|
| AUTH-VULN-03 | Critical | No per-account login lockout | Exploited |
| AUTH-VULN-01 | High | HIBP bypass via direct GoTrue call | Exploited |
| AUTH-VULN-02 | High | Disposable email + IP rate bypass | Exploited |
| AUTH-VULN-07 | High | MFA removed (AAL2 enforcement disabled) | Exploited (accepted) |
| AUTH-VULN-06 | High (potential) | Non-timing-safe webhook token compare | Code confirmed |
| AUTH-VULN-05 | Medium (potential) | Math.random in verification code | Code confirmed |
| AUTH-VULN-04 | Medium (potential) | Missing Cache-Control on auth responses | Code confirmed |
| MISCONFIG-01 | High | `mailer_autoconfirm: true` (auto-confirm signups) | Confirmed |
| MISCONFIG-02 | Low | Version disclosure on `/auth/v1/health` | Confirmed |
| SSRF-DID | Info | 3 webhook env vars skip `validateWebhookUrl()` | Defense-in-depth |

Full Shannon report: `C:\Users\maloh\.shannon\workspaces\ts-web-3\deliverables\comprehensive_security_assessment_report.md`
Auth exploitation evidence: `C:\Users\maloh\.shannon\workspaces\ts-web-3\deliverables\auth_exploitation_evidence.md`
