# HIBP password check — `before-user-created` setup

## Why this exists

This is the **F-01 compensating control** that runs in place of Supabase's
"Prevent use of leaked passwords" feature (Pro-only). Since MFA + AAL2 were
removed (commits `1efd1b7`, `214323a`), a compromised password = full
account takeover. Blocking signups that reuse passwords from known data
breaches narrows the residual risk.

## What it does

`supabase/functions/before-user-created/index.ts` accepts a JSON body
`{ password: "<plaintext>" }` and returns `{ leaked: boolean, count: number }`.
It checks the password against the HaveIBeenPwned database using the
**k-anonymity range API**: only the first 5 characters of the SHA-1 hash
ever leave the function. The full password and the full hash never leave
our infrastructure.

The `signUp()` flow in [`contexts/AuthContext.tsx`](contexts/AuthContext.tsx)
calls this endpoint before `supabase.auth.signUp()`. If `leaked: true`, it
throws `Error('password_leaked')` which surfaces in
[`screens/SignUpScreen.tsx`](screens/SignUpScreen.tsx) as the i18n string
`auth.errors.password_leaked`.

## Important: this is NOT a Supabase Auth Hook

At the time of writing, Supabase's Auth Hooks v2 do **not** expose the raw
password during signup — GoTrue hashes it before any hook fires. So a
"Before User Created" hook with password access does not exist in the
public API. We therefore wire this as a **client-side precheck**: the
frontend calls `before-user-created` BEFORE `supabase.auth.signUp()` and
aborts on `leaked: true`.

The function is named `before-user-created` to stay forward-compatible if
Supabase ships a true pre-creation hook with password access in the
future. At that point the same Edge Function can be re-wired as a real
Auth Hook with no logic change.

**Bypass surface**: a determined attacker can call `supabase.auth.signUp`
directly via raw HTTP and skip the precheck. That is acceptable — the goal
is to nudge users away from breached passwords, not to enforce a strict
gate against motivated attackers.

## Deployment

The function is already wired into:
- [`supabase/functions/active-edge-functions.json`](supabase/functions/active-edge-functions.json) — included in `deploy_functions.ps1` auto-deploy
- [`supabase/config.toml`](supabase/config.toml) — `verify_jwt = false`
  (called pre-auth, no JWT yet)

To deploy alone:

```bash
npx supabase functions deploy before-user-created --use-api --project-ref <PROJECT_REF>
```

Or use the bulk deploy script:

```powershell
.\deploy_functions.ps1 -ProjectRef <PROJECT_REF>
```

## Configuration

The function reads `ALLOWED_ORIGINS` from Edge Function secrets (shared
with all other functions, no new secret required). It does not need
`HMAC_SECRET` or any HIBP API key — HIBP's range API is unauthenticated.

## Testing

### Unit tests (Jest)

```bash
npm test -- __tests__/supabase/beforeUserCreated.test.ts
```

Covers:
- HIBP returns leaked → 200 `{ leaked: true, count }`
- HIBP returns clean → 200 `{ leaked: false, count: 0 }`
- HIBP fails / times out → 200 `{ leaked: false }` (fail-open)
- Body without `password` → 400 `{ code: 'invalid_payload' }`
- GET method → 405
- CORS preflight → 200
- Disallowed origin → 403
- Password never appears in the response body

### Manual smoke test (against deployed function)

```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/before-user-created \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"password":"password"}'
# Expected: {"leaked":true,"count":<large number>}

curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/before-user-created \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"password":"correct-horse-battery-staple-9f8a7b6c5d4e3"}'
# Expected: {"leaked":false,"count":0}
```

### End-to-end via the app

1. Open the signup screen
2. Enter a known-leaked password like `Password123` or `qwerty`
3. Expected: red error with text matching `auth.errors.password_leaked`
   (FR: "Ce mot de passe figure dans une fuite de données connue.
   Choisissez-en un autre.")
4. Enter a strong random password
5. Expected: signup proceeds normally

## Limitations

- **Only checks at signup**, not at password change or reset. Existing
  passwords are not re-validated.
- **Fail-open**: if HIBP is unreachable, signup proceeds. Better to keep
  the funnel available than to block on a third-party outage.
- **Bypassable** by attackers calling Supabase Auth directly. This is a
  user-protection feature, not an enforcement boundary.
- **HIBP uses SHA-1**: not ideal cryptographically, but acceptable here
  because (a) only the 5-char prefix is sent over the network — the full
  hash never leaves our function, (b) HIBP's data model and ecosystem is
  built around SHA-1, (c) there is no security claim about HIBP's hash
  function — k-anonymity is the security primitive that matters, and SHA-1
  is fine for that purpose.

## When Supabase ships a real "Before User Created" hook with password access

If/when Supabase exposes a pre-creation hook that includes the raw
password (or a hashed-with-salt password we can compare against HIBP via
a different API), refactor:

1. Update `before-user-created/index.ts` to detect Auth Hook payload
   format `{ type, event, user, password }` and respond accordingly
   (`{ error: { http_code: 400, message: "password_leaked" } }`).
2. Activate it in Supabase Dashboard → Auth → Hooks (Beta).
3. Remove the `assertPasswordNotBreached()` call from `AuthContext.signUp`.

The unit tests for `checkPasswordBreachedCount` (the pure function) stay
unchanged.
