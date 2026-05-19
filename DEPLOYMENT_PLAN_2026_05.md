# Deployment Plan — Post-pentest security fixes (May 2026)

> **Companion doc to:** `SECURITY_FIX_PLAN_2026_05.md` (the fix plan itself).
> **Branch:** `security/post-pentest-fixes-2026-05` (3 commits, +1391 / -114 lines).
> **Target environment:** Production direct (`qpogulljnnacrxdjbwiz.supabase.co`).
> **Mobile release strategy:** Full build + store submission (no OTA).
> **Supabase plan:** Free → AUTH-VULN-03 hook unavailable, see Phase 0.

---

## Context & decisions

| Decision | Choice | Implication |
|---|---|---|
| Git remote | None | No `git push`. All deploys from this machine. |
| Supabase env | Direct prod | Heightened risk. All migrations are additive (new tables/RPCs only) — low collision risk with existing schema. |
| Mobile release | Full build (EAS Build + store submission) | 1-7 days store review + weeks of organic adoption before ≥99% reached. |
| Supabase plan | Free | `password_verification_attempt` Auth Hook NOT available. AUTH-VULN-03 lockout limited to "best-effort" wrapper (Phase 0). |
| Lockout architecture | Wrapper `secure-login` (option c) | Lockout effective only for clients calling the wrapper. Direct `/auth/v1/token` calls with anon key still bypass. Documented as residual risk. |
| Rollout | Phased | Phase 1 = server-side deploy now (no breakage). Phase 2 = trigger activation after store adoption ≥99% (weeks). |

---

## Phase 0 — Add `secure-login` wrapper (code change BEFORE deploy)

Because Auth Hook isn't available on Free, we add a client-callable wrapper:

| # | Action | Who |
|---|--------|-----|
| 0.1 | New Edge Function `supabase/functions/secure-login/` calling `record_login_attempt()` + `signInWithPassword` server-side | Claude |
| 0.2 | Update `AuthContext.tsx` `signIn()` to invoke `secure-login` instead of `supabase.auth.signInWithPassword()` | Claude |
| 0.3 | Update `SECURITY_FIX_PLAN_2026_05.md` to note Free-plan caveat + add `secure-login` to deprecation candidates after Pro+ upgrade | Claude |
| 0.4 | Add `[functions.secure-login]` `verify_jwt = false` in `config.toml` | Claude |
| 0.5 | Commit Phase 0 | Claude |

**Result:** Lockout works for app users. Direct `/auth/v1/token` curl calls still bypass — documented residual risk until Pro+ upgrade.

---

## Phase 1 — Tooling install (one-time, ~10 min)

| # | Action | Command | Who |
|---|--------|---------|-----|
| 1.1 | Install Supabase CLI | `scoop install supabase` (or download from https://github.com/supabase/cli/releases) | Claude (with permission) |
| 1.2 | Install EAS CLI | `npm install -g eas-cli` | Claude |
| 1.3 | `supabase login` | Opens browser for OAuth | **You** (interactive) |
| 1.4 | `supabase link --project-ref qpogulljnnacrxdjbwiz` | Links cwd to your prod project | Claude |
| 1.5 | `eas login` | Prompts for Expo creds | **You** (interactive) |

---

## Phase 2 — Pre-deploy validation (~15 min)

Run BEFORE touching prod, catches obvious breakage:

| # | Action | Command | Pass criteria |
|---|--------|---------|---------------|
| 2.1 | TypeScript type-check | `npm run typecheck` | Zero TS errors |
| 2.2 | Run unit tests | `npm test` | All green (existing tests) |
| 2.3 | Lint Edge Functions (Deno syntax) | `deno check supabase/functions/secure-signup/index.ts secure-login/index.ts auth-pre-login/index.ts _shared/hibp.ts` | No diagnostics |
| 2.4 | Validate SQL migrations syntax (dry-run) | `supabase db lint --linked` | No errors |
| 2.5 | Diff what will be applied | `supabase db diff --linked --schema public,auth` | Review the diff manually |

⚠️ **STOP if any step fails.** Fix locally before continuing.

---

## Phase 3 — Server-side deploy to prod (~30 min)

All steps are **additive** (new tables/RPCs/functions). Existing flows untouched until Phase 4 trigger activation.

### 3.1 Apply migrations
```bash
supabase db push --linked
```
Applies in order:
- `20260502010000_login_attempts_table.sql`
- `20260502010100_login_lockouts_table.sql`
- `20260502010200_pre_login_hook_rpc.sql`
- `20260502020000_signup_attestations.sql`
- `20260502020100_signup_nonce_trigger.sql` (trigger created **DISABLED**)

**Rollback if needed:** `supabase db reset --linked` (DESTRUCTIVE — only on staging) OR write a counter-migration manually.

### 3.2 Set env vars on Edge Functions
```bash
# Required: webhook host allowlist (Wave 3.4 made it strict)
supabase secrets set WEBHOOK_ALLOWED_HOSTS="n8n.<your-domain>,n8n-fallback.<your-domain>" --linked

# Required: auth hook secret (for when you upgrade to Pro+; harmless on Free)
# Generate a random 64-char secret first:
SECRET=$(openssl rand -hex 32)
supabase secrets set AUTH_HOOK_SECRET="$SECRET" --linked
echo "Save this secret — you'll need it for the dashboard hook config later: $SECRET"
```

### 3.3 Deploy Edge Functions
Order: shared infra modules implicitly bundled with each function deploy.

```bash
# New functions
supabase functions deploy auth-pre-login --linked --no-verify-jwt
supabase functions deploy secure-signup --linked --no-verify-jwt
supabase functions deploy secure-login --linked --no-verify-jwt

# Modified functions (must redeploy to pick up _shared/* changes)
supabase functions deploy revenuecat-webhook --linked --no-verify-jwt
supabase functions deploy send-verification-email --linked
supabase functions deploy check-signup-eligibility --linked --no-verify-jwt
supabase functions deploy before-user-created --linked --no-verify-jwt

# All other functions need redeploy too (Cache-Control headers in _shared/cors.ts)
# Use --all flag if available, else loop:
for fn in $(ls supabase/functions/ | grep -v '^_'); do
  supabase functions deploy "$fn" --linked
done
```

**Rollback:** `supabase functions deploy <name>` from a previous git commit, OR redeploy from `master` branch.

### 3.4 Smoke tests (curl from this machine)
```bash
# secure-signup must accept good password
curl -X POST https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/secure-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"deploy-smoke-test+1@gmail.com","password":"DeploySmokeP@ss!2026"}'
# Expected: 201 + {ok: true, user_id: "..."}

# secure-signup must reject a password that misses the relaxed policy
curl -X POST https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/secure-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"deploy-smoke-test+2@gmail.com","password":"password"}'
# Expected: 422 + signup_failed

# secure-signup must reject @mailinator.com
curl -X POST https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/secure-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"deploy-smoke@mailinator.com","password":"DeploySmokeP@ss!2026"}'
# Expected: 422 + signup_failed

# Cleanup the smoke-test account afterwards via dashboard
```

---

## Phase 4 — Manual dashboard actions (you only — I cannot)

Order matters; do them in this sequence:

| # | Action | Where | Why |
|---|--------|-------|-----|
| 4.1 | Disable "Auto-confirm users" | Dashboard → Authentication → Email | Mirror config.toml change. **REQUIRED** for AUTH-VULN-02 fix. |
| 4.2 | Keep "Leaked password protection" (HIBP) OFF | Dashboard → Authentication → Password protection | Mirrors the accepted residual-risk decision in `TRUST_BOUNDARIES.md`. |
| 4.3 | Set min password length = 8 | Dashboard → Authentication → Password requirements | Mirrors `secure-signup` policy. |
| 4.4 | Enable required character classes: lowercase + digit only | Same panel | Same. |
| 4.5 | Delete 5 pentest accounts | Dashboard → Authentication → Users (search `sectest_*`, `pentest_*`, `victim_bruteforce_*`, `attacker_*@mailinator.com`) | Production data hygiene. |
| 4.6 | (When you upgrade to Pro+) Add HTTP Auth Hook → Password Verification Attempt → URL `https://qpogulljnnacrxdjbwiz.supabase.co/functions/v1/auth-pre-login` → Secret = the value you saved from step 3.2 | Dashboard → Authentication → Hooks | Activates AUTH-VULN-03 server-side lockout. |

---

## Phase 5 — Mobile build + store submission

This kicks off the multi-week clock for AUTH-VULN-01/02 trigger activation.

| # | Action | Command | Who | Notes |
|---|--------|---------|-----|-------|
| 5.1 | Build for both platforms | `eas build --platform all --profile production` | Claude | Takes 30-90 min |
| 5.2 | Submit to stores | `eas submit --platform all --profile production` | Claude | Need Apple/Google creds |
| 5.3 | Apple App Store review | n/a | **Apple** | 24h-7d typical |
| 5.4 | Google Play review | n/a | **Google** | Hours-3 days |
| 5.5 | Monitor adoption % | Expo dashboard / your analytics | **You** | Wait for ≥99% before Phase 6 |

⚠️ **Do NOT skip waiting for adoption.** Activating the trigger before ≥99% adoption breaks signup for ALL users on the old client (they'll get `signup_nonce_invalid` error).

---

## Phase 6 — Trigger activation (LATER, weeks after Phase 5)

When adoption reaches ≥99% and you're ready to actually close AUTH-VULN-01 + 02:

| # | Action | Where | Who |
|---|--------|-------|-----|
| 6.1 | Verify adoption metrics ≥99% | Your analytics | **You** |
| 6.2 | Run in Supabase SQL Editor:<br>`ALTER TABLE auth.users ENABLE TRIGGER enforce_signup_nonce_trigger;` | Dashboard → SQL Editor | **You** |
| 6.3 | Monitor 5xx rate on `/auth/v1/signup` for 24h | Supabase logs | **You** |
| 6.4 | If breakage spike → rollback:<br>`ALTER TABLE auth.users DISABLE TRIGGER enforce_signup_nonce_trigger;` | Same editor | **You** |

---

## Phase 7 — Verification (D+1 after Phase 6)

| # | Action | Command | Pass criteria |
|---|--------|---------|---------------|
| 7.1 | Re-run Shannon pentest | `npx -y @keygraph/shannon start -u http://host.docker.internal:3000 -r '<repo path>' -w ts-web-postfix` | None of the 7 AUTH-VULN findings reappear |
| 7.2 | Manual bypass tests (curl) | See `SECURITY_FIX_PLAN_2026_05.md` §"Wave 4.2" | All 9 tests pass |
| 7.3 | Test on a real device, signup + email verify flow | Use the new release | Works end-to-end |

---

## Phase 8 — Cleanup (after 30 days of Phase 6 stable)

| # | Action | Files | Who |
|---|--------|-------|-----|
| 8.1 | Mark deprecated pre-check Edge Functions | `before-user-created`, `check-signup-eligibility`, `check-ip-signup` (kept for backward compat with very old clients) | Claude |
| 8.2 | Delete deprecated functions | `supabase functions delete <name>` | Claude |
| 8.3 | If upgraded to Pro+: deprecate `secure-login` wrapper, rely solely on `auth-pre-login` Auth Hook | Code + AuthContext | Claude |

---

## What I (Claude) can vs. cannot do

| Step | Me? | You? |
|---|---|---|
| Install CLIs | ✅ | — |
| `supabase login` (browser OAuth) | ❌ | ✅ |
| `supabase link` | ✅ | — |
| `supabase db push` | ✅ | — |
| `supabase functions deploy` | ✅ | — |
| `supabase secrets set` | ✅ | — |
| Curl smoke tests | ✅ | — |
| Dashboard config changes | ❌ | ✅ |
| Delete prod accounts | ❌ | ✅ |
| `eas login` (interactive) | ❌ | ✅ |
| `eas build` | ✅ | — |
| `eas submit` (needs Apple creds) | ⚠️ may need your creds inline | ✅ |
| Activate `ENABLE TRIGGER` | ❌ (destructive prod action without your sign-off) | ✅ |
| Re-run Shannon | ✅ | — |

---

## Risk assessment

| Phase | Risk | Mitigation |
|---|---|---|
| Phase 3 (server deploy) | LOW | Migrations additive, trigger DISABLED, no impact on existing flow |
| Phase 4 (dashboard) | LOW | Standard config changes, well-tested by Supabase |
| Phase 5 (build+submit) | LOW | Standard EAS workflow |
| Phase 6 (trigger activation) | **HIGH** | Old clients break. MUST wait ≥99% adoption. Has rollback (DISABLE TRIGGER). |
| Phase 7 (verify) | NONE | Read-only |

---

## Estimated timeline

| Phase | Effort | When |
|---|---|---|
| Phase 0 (secure-login code) | 1h dev | Now |
| Phase 1 (tooling) | 10 min | Now |
| Phase 2 (validation) | 15 min | Now |
| Phase 3 (server deploy) | 30 min | Now |
| Phase 4 (dashboard manual) | 15 min | Now (you) |
| Phase 5 (build + submit) | 1-2h dev + 1-7 days store review | Now → +1 week |
| **Phase 5 adoption wait** | **2-6 weeks (real-world)** | — |
| Phase 6 (trigger activation) | 5 min | Week 4-8 |
| Phase 7 (verify) | 1 day | Week 4-8 + 1 day |
| Phase 8 (cleanup) | 30 min | Week 8-12 |

**Total wall-clock: 4-12 weeks.** Effort on your side: ~30 min dashboard + few hours build/submit + monitoring.

---

## Phase S — Social security fixes (Waves 1-3 from SOCIAL_SECURITY_AUDIT.md)

> **Companion doc:** [SOCIAL_SECURITY_AUDIT.md](SOCIAL_SECURITY_AUDIT.md), [SOCIAL_FIX_PLAN.md](SOCIAL_FIX_PLAN.md).
> **Statut:** code et migrations prêts (15 findings corrigés + 1 vérifié + 1 shadow + 1 documenté).
> **Reste à faire:** déploiement ops + coordination n8n.

### Phase S.1 — Prérequis ops (avant tout deploy)

| # | Action | Qui | Notes |
|---|--------|-----|-------|
| S.1.1 | Configurer `N8N_RESPONSE_HMAC_SECRET` côté Supabase secrets (ou réutiliser `PHASE2_WEBHOOK_HMAC_SECRET`) | **You** | Dashboard → Edge Functions → Secrets |
| S.1.2 | Configurer `WEBHOOK_ALLOWED_HOSTS` (déjà existant — vérifier que la liste couvre tous les hostnames n8n utilisés) | **You** | Dashboard → Edge Functions → Secrets |
| S.1.3 | Configurer `WEBHOOK_VERIFY_RESPONSE=false` (kill-switch ON pour le déploiement initial) | **You** | Évite de casser n8n pendant la coordination |
| S.1.4 | (Optionnel) `WEBHOOK_ALLOW_PRIVATE_IPS` — laisser absent ou explicite `false` en prod | **You** | Bypass SSRF pour dev uniquement |

### Phase S.2 — Déploiement des migrations (ordre strict)

À exécuter via `supabase db push` (CLI installé en Phase 1) ou Dashboard → SQL Editor :

| # | Migration | Effet |
|---|-----------|-------|
| S.2.1 | `20260520120000_admin_idempotency_keys.sql` | `admin_audit_events.idempotency_key` UNIQUE + RPC eradicate v2 |
| S.2.2 | `20260521120000_clamp_social_admin_reaction_adjustments.sql` | CHECK constraint + clamp RPC adjust |
| S.2.3 | `20260522120000_weighted_report_count.sql` | `compute_weighted_report_count` + table shadow (mode shadow, trigger inchangée) |
| S.2.4 | `20260523120000_release_pending_social_upload_reservations.sql` | RPC purge reservations logout |
| S.2.5 | `20260524130000_social_report_threshold_shadow_logging.sql` | Trigger modifiée pour log shadow (décision toujours raw) |
| S.2.6 | `20260525120000_harden_social_feed_cursor.sql` | Helper `is_valid_social_feed_keyset_cursor` |
| S.2.7 | `20260601120000_social_soft_delete_retention.sql` | RPC purge soft-delete + planification pg_cron (free plan → `RAISE WARNING` attendu) |

**Vérification post-migration :**
```bash
# Dashboard → SQL Editor
\i scripts/verify_pg_cron_and_purge.sql
```

Sur Free plan, pg_cron est absent → la migration S.2.7 affichera un `WARNING`. C'est attendu. Voir Phase S.5 pour le fallback scheduler externe.

### Phase S.3 — Déploiement des Edge Functions

```powershell
.\deploy_functions.ps1 -ProjectRef qpogulljnnacrxdjbwiz
```

Ce script lit `supabase/functions/active-edge-functions.json` (déjà mis à jour avec `admin-whoami` et `purge-soft-deleted-social-assets`) et déploie via `--use-api`. Configs `verify_jwt` dans `supabase/config.toml` également à jour.

Edge Functions modifiées (re-déploiement) :
- `social-admin-eradicate-user` (S-09 idempotency, audit log retiré côté Edge — déplacé dans la RPC)
- `social-admin-moderate-user` (S-09 intent/outcome split)
- `social-admin-adjust-post-reactions` (S-09 intent/outcome split)
- `social-report-content` (S-08 caller update)

Edge Functions **nouvelles** (premier déploiement) :
- `admin-whoami` (S-07)
- `purge-soft-deleted-social-assets` (S-18 fallback)

### Phase S.4 — Smoke tests staging

```powershell
$env:SMOKE_SUPABASE_URL = 'https://<projet>.supabase.co'
$env:SMOKE_ADMIN_JWT = '<JWT admin>'
$env:SMOKE_USER_JWT = '<JWT non-admin>'
$env:SMOKE_TARGET_USER_ID = '<uuid user a moderer>'
$env:SMOKE_TARGET_POST_ID = '<uuid post pour reaction adjustment>'
.\scripts\smoke_test_social_security.ps1
```

Couvre S-07, S-09, S-10, S-11, S-15. Tests S-08, S-12, S-18 à faire via SQL/observation.

### Phase S.5 — Coordination n8n (avant retrait du kill-switch)

Voir [n8n/SOCIAL_WEBHOOK_RESPONSE_SIGNING.md](n8n/SOCIAL_WEBHOOK_RESPONSE_SIGNING.md) pour le détail.

| # | Action | Qui |
|---|--------|-----|
| S.5.1 | Configurer chaque workflow n8n qui répond à une Edge Function HMAC pour signer la réponse | **You** (n8n admin) |
| S.5.2 | Test stub local avec curl/PowerShell pour vérifier la signature avant push n8n | **You** |
| S.5.3 | Sur staging : `WEBHOOK_VERIFY_RESPONSE=true` + smoke test social-report-content | **You** |
| S.5.4 | Retirer `WEBHOOK_VERIFY_RESPONSE` en prod (default = check activé quand HMAC outbound on) | **You** |

### Phase S.6 — Scheduler externe pour purge storage (Free plan only)

Supabase Free n'a pas pg_cron. La RPC `purge_old_soft_deleted_social_content` existe mais n'est pas planifiée. Solutions :

**Option A — Task Scheduler Windows (machine locale):**
```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-File C:\path\to\trigger_social_purge.ps1 -SupabaseProjectRef qpogulljnnacrxdjbwiz'
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName 'SocialSoftDeletePurge' -Action $action -Trigger $trigger
```

**Option B — GitHub Actions (recommandé en prod):**
Workflow `.github/workflows/social-purge.yml` qui appelle l'Edge Function via fetch HMAC-signed quotidiennement.

**Option C — Service cron externe (EasyCron, Cronhub, etc.)** qui ping l'Edge Function avec la signature HMAC.

Le script `scripts/trigger_social_purge.ps1` est prêt et inclut le calcul de signature worker. Tester :
```powershell
$env:PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET = '<secret>'
.\scripts\trigger_social_purge.ps1 -SupabaseProjectRef qpogulljnnacrxdjbwiz -RetentionDays 30
```

### Phase S.7 — Activation S-12 mode strict (J+7 mini)

Après ≥7 jours de shadow logging (vérifié dans `social_report_threshold_shadow`) et validation produit des coefficients, déployer :

```sql
\i supabase/migrations/20260605120000_activate_weighted_social_report_thresholds.sql
```

Pré-check obligatoire (cf header de la migration) :
```sql
SELECT
  COUNT(*) FILTER (WHERE raw_would_hide AND NOT weighted_would_hide) AS prevented_by_weighted,
  COUNT(*) FILTER (WHERE NOT raw_would_hide AND weighted_would_hide) AS new_via_weighted,
  COUNT(*) FILTER (WHERE raw_would_hide = weighted_would_hide) AS agreed,
  COUNT(*) AS total_evaluations
FROM public.social_report_threshold_shadow
WHERE evaluated_at >= now() - interval '7 days';
```

Acceptable si `prevented_by_weighted + new_via_weighted < 20%` du total et que `new_via_weighted` ne crée pas une explosion de faux positifs.

### Phase S — Risk assessment

| Sous-phase | Risk | Mitigation |
|---|---|---|
| S.1 secrets | LOW | Kill-switches actifs par défaut |
| S.2 migrations | LOW | Additive (nouvelles colonnes/RPCs/index). Pre-check anti-régression S-15 inclus |
| S.3 deploy EF | MEDIUM | Régression possible sur les flows admin. Smoke test avant prod |
| S.4 smoke staging | NONE | Read + idempotent ops uniquement |
| S.5 n8n cutover | MEDIUM | Kill-switch `WEBHOOK_VERIFY_RESPONSE=false` permet rollback instant |
| S.6 scheduler externe | LOW | Best-effort, TTL bucket en filet de sécurité |
| S.7 S-12 activation | MEDIUM | Rollback : remettre l'ancienne version de la trigger (la shadow logging reste utile) |

### Phase S — Timeline estimée

| Sous-phase | Effort | When |
|---|---|---|
| S.1 secrets | 5 min | Now |
| S.2 migrations | 10 min | Now |
| S.3 deploy EF | 10 min | Now |
| S.4 smoke staging | 30 min | Now |
| S.5 n8n cutover | 1-3h | +1 jour (coord n8n admin) |
| S.6 scheduler externe | 30 min | Now |
| S.7 S-12 activation | 5 min | +7 jours mini |

**Total côté ops:** ~2-4h sur 1-2 semaines, avec 7+ jours d'observation pour S-12.
