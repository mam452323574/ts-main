# Supabase Security Configuration

This document outlines manual security configurations that must be enabled in the Supabase dashboard.

## Critical Security Settings

### 1. Leaked Password Protection

**Status:** Requires Manual Configuration

**2026-04-25 implementation note:** the repository-side hardening work is in place,
but this dashboard toggle cannot be activated from code. Enable it in Supabase Auth
and record the current Advisor result here once the dashboard validation is done.

**Description:**
Supabase Auth can prevent users from using compromised passwords by checking against the HaveIBeenPwned.org database. This is a critical security feature that helps protect user accounts.

**How to Enable:**

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers** → **Email**
3. Scroll down to the **Security** section
4. Find the setting **"Enable leaked password protection"**
5. Toggle it **ON**
6. Click **Save** to apply changes

**What it does:**
- When enabled, Supabase checks new passwords and password changes against the HaveIBeenPwned database
- If a password appears in known data breaches, the user will be required to choose a different password
- This happens automatically without storing or transmitting the actual password

**Recommendation:**
✅ **Enable this immediately** for production environments

---

## Additional Recommended Settings

### 2. Email Confirmations

**Location:** Authentication → Settings → Email Auth

Consider enabling:
- **Confirm email** - Requires users to verify their email before accessing the app
- **Secure email change** - Requires confirmation when changing email addresses

### 3. Rate Limiting

**Location:** Authentication → Rate Limits

Review and adjust rate limits for:
- **Sign up attempts** - Prevent spam registrations
- **Sign in attempts** - Prevent brute force attacks
- **Password reset requests** - Prevent abuse

### 4. Session Management

**Location:** Authentication → Settings

Configure:
- **JWT expiry** - How long access tokens remain valid (default: 1 hour)
- **Refresh token rotation** - Enable for enhanced security
- **Session timeout** - Automatically log out inactive users

### 5. CORS (Cross-Origin Resource Sharing)

**Status:** ✅ Configured via code

**Description:**
Les fonctions Edge Supabase utilisent une validation CORS dynamique pour restreindre les origines autorisées. Cela empêche les sites web non autorisés d'appeler vos APIs.

**Configuration requise:**

1. Dans le dashboard Supabase, allez dans **Project Settings** → **Edge Functions**
2. Ajoutez la variable d'environnement `ALLOWED_ORIGINS`
3. Définissez les origines autorisées séparées par des virgules

**Exemple de valeur pour `ALLOWED_ORIGINS`:**

```
https://votre-domaine.com,https://www.votre-domaine.com,http://localhost:8081,http://localhost:19006
```

**Origines recommandées par environnement:**

| Environnement | Origines |
|---------------|----------|
| Production | `https://votre-domaine.com,https://www.votre-domaine.com` |
| Développement | `http://localhost:8081,http://localhost:19006,http://localhost:3000` |
| Expo Go | `exp://localhost:8081,exp://192.168.x.x:8081` |

**Notes importantes:**
- Les applications mobiles natives (iOS/Android compilées) n'envoient pas d'en-tête `Origin`, elles ne sont donc pas affectées par CORS
- Ne jamais utiliser `*` en production - cela autoriserait toutes les origines
- Pour le développement local, vous pouvez temporairement inclure `*` dans la liste

**Fichiers concernés:**
- `supabase/functions/_shared/cors.ts` - Module partagé de validation CORS
- Toutes les fonctions Edge importent et utilisent ce module

---

## Database Security - Already Configured ✅

The following security measures have been implemented via migrations:

- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Optimized RLS policies using `(select auth.uid())`
- ✅ Immutable search paths on all database functions
- ✅ Proper indexes for performance
- ✅ Secure function definitions with SECURITY DEFINER

---

## Coach webhook HMAC enforcement (C-04)

**Status:** Requires ops + n8n configuration after the 2026-05-19 audit fixes
are merged. The Edge Function code is already wired to send HMAC headers when
`PHASE2_WEBHOOK_AUTH_MODE` includes `hmac`. The two n8n workflows
(`coach.json`, `coach-conversation.json`) contain a verification node that
runs in *dual-mode* by default (log violations, accept the request) so we can
roll out without an outage.

### Staged rollout

1. **T+0** — merge the audit-fix PR. No env var changes yet. Edge does not
   send HMAC headers, n8n does not enforce. Stable.
2. **T+0+config** — set in prod:
   - `PHASE2_WEBHOOK_AUTH_MODE=hmac`
   - `PHASE2_WEBHOOK_HMAC_SECRET=<openssl rand -hex 32>`
   - Mirror the same secret in n8n as `COACH_WEBHOOK_HMAC_SECRET`.
   - Keep `COACH_WEBHOOK_HMAC_ENFORCE=false` on n8n.
   → Edge sends signatures, n8n logs violations but accepts.
3. **T+24h** — inspect n8n execution logs. Expect **zero**
   `[coach-webhook-hmac]` warnings. If any: debug the secret / format
   mismatch before continuing.
4. **T+24h+verified** — flip n8n env var `COACH_WEBHOOK_HMAC_ENFORCE=true`.
   Unsigned or mismatched requests are now rejected with
   `coach_webhook_signature_invalid` / `coach_webhook_signature_missing` /
   `coach_webhook_timestamp_invalid`.
5. **T+48h** — confirm the Edge function success rate on
   `coach-generate-response` and `coach-send-message` is unchanged.

### Rollback

- Fast: set `COACH_WEBHOOK_HMAC_ENFORCE=false` on n8n. Effect is immediate.
- Wider: set `PHASE2_WEBHOOK_AUTH_MODE=none` on Supabase Edge to stop
  sending the headers entirely. (`bearer` is **not** a valid fallback —
  the bearer token was dropped 2026-05-19; flipping back to `bearer`
  triggers `invalid_webhook_auth_configuration` until the token is re-set.)

### Ops checklist

- [ ] Secret generated (`openssl rand -hex 32`, length ≥ 32 bytes).
- [ ] Stored in Supabase Edge Function secrets:
      `supabase secrets set PHASE2_WEBHOOK_HMAC_SECRET=...`.
- [ ] Mirrored in n8n as `COACH_WEBHOOK_HMAC_SECRET` (env var or node
      credential).
- [ ] `PHASE2_WEBHOOK_AUTH_MODE=hmac` set in Supabase secrets (pre-flight
      `sh scripts/check-webhook-secrets.sh hmac <ref>` exit 0).
- [ ] HMAC verification node present on **both** workflows (`coach.json`,
      `coach-conversation.json`).
- [ ] 24 h dual-mode observation completed with zero warnings before
      `COACH_WEBHOOK_HMAC_ENFORCE=true`.

---

## n8n logging hygiene (N-E)

The two Coach workflows handle PII (user_id, conversation content) at run
time. By default, n8n persists every node's input/output for the configured
retention window — so a leak of the n8n log store would expose user content.

### Required settings (prod)

| Env var | Recommended value | Rationale |
|---|---|---|
| `N8N_LOG_LEVEL` | `warn` | Skip per-execution INFO traces that include payloads |
| `EXECUTIONS_DATA_PRUNE` | `true` | Prune old executions automatically |
| `EXECUTIONS_DATA_MAX_AGE` | `72` (hours) | Cap retention to 3 days |
| `EXECUTIONS_DATA_SAVE_ON_SUCCESS` | `none` | Don't persist successful runs (we have the DB record) |
| `EXECUTIONS_DATA_SAVE_ON_ERROR` | `all` | Keep error runs for debugging |
| `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS` | `false` | Don't persist manual test runs |

### Code-level mitigation

The normaliser Code node truncates `user_id` to its first 8 chars in the
node's return payload so it shows as `0a4b1c2d…` in any downstream node log.
The full UUID is not needed downstream of normalization (n8n routes by
`persona_route` after that point).

### Verification

After applying the env config:

```bash
# Should return no recent execution data older than 72h
n8n executionData:prune --dryRun

# Sample a recent execution → user_id should be redacted in node 2+ inputs
```

---

## Verification

After enabling leaked password protection, verify it's working by:

1. Attempting to sign up with a known weak password (e.g., "password123")
2. The system should reject it and prompt for a stronger password
3. Check the Supabase logs to confirm the password check is occurring

---

## Support

For questions about these security settings:
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Security Best Practices](https://supabase.com/docs/guides/auth/auth-helpers/security-best-practices)
- [HaveIBeenPwned Integration](https://supabase.com/docs/guides/auth/passwords#password-security)
