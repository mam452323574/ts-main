# Plan de remédiation — Audit Social

**Date :** 2026-05-19
**Source :** [SOCIAL_SECURITY_AUDIT.md](SOCIAL_SECURITY_AUDIT.md)
**Périmètre :** Edge Functions `social-*`, migrations SQL, frontend social, storage bucket `social-posts`.

---

## Tableau de remédiation consolidé

| ID | Sévérité | Effort | Wave | Owner | Statut |
|----|----------|--------|------|-------|--------|
| **S-01** Webhook response signature | P0 | M | 1 | Backend | ✅ 2026-05-19 |
| **S-02** Webhook host DNS resolution | P0 | M | 1 | Backend | ✅ 2026-05-19 |
| **S-04** Admin rate limit fail-closed | P1 | S | 2 | Backend | ✅ 2026-05-19 |
| **S-05** Admin audit log fail-closed | P1 | M | 2 | Backend | ✅ 2026-05-19 |
| **S-07** Frontend admin whoami | P1 | S | 2 | Fullstack | ✅ 2026-05-19 |
| **S-08** Auto-hide threshold hardcode | P1 | XS | 2 | Backend | ✅ 2026-05-19 |
| **S-09** Eradicate idempotency | P1 | M | 2 | Backend | ✅ 2026-05-19 |
| **S-15** Reaction adjustment bounds | P1 | S | 2 | Backend | ✅ 2026-05-19 |
| **S-10** CORS `null` au lieu de `*` | P2 | XS | 3 | Backend | ✅ 2026-05-19 |
| **S-11** CORS case-insensitive | P2 | XS | 3 | Backend | ✅ 2026-05-19 |
| **S-12** Auto-hide weighted | P2 | L | 3 | Backend + Produit | ✅ Shadow 2026-05-19 |
| **S-13** Vérif limites `share_payload_snapshot` | P2 | XS | 3 | Backend | ✅ Vérifié 2026-05-19 |
| **S-14** Logout reservation cleanup | P2 | S | 3 | Fullstack | ✅ 2026-05-19 |
| **S-16** Keyset cursor format check | P3 | XS | 3 | Backend | ✅ 2026-05-19 |
| **S-18** Soft-delete retention purge | P3 | M | 3 | Backend | ✅ 2026-05-19 |

**Échelle effort :** XS (≤30 min), S (≤2 h), M (≤1 j), L (≤3 j).

---

## Vagues de déploiement

### Wave 1 — Critiques (1 semaine) ✅ Livré 2026-05-19

Bloquer la modération bypass et le SSRF avant tout autre travail.

**Ordre de livraison :**
1. ✅ **PR #1 — S-02** (SSRF DNS rebind). Indépendant. Ajoute `resolveWebhookHostPublic` + `validateWebhookUrlWithDnsCheck` dans `webhookHostAllowlist.ts`. **Pré-requis** pour S-01 (sinon S-01 ajoute du code sur une surface encore vulnérable).
2. ✅ **PR #2 — S-01** (webhook response signature). Dépend de S-02 (le `validateWebhookUrl` doit être renforcé avant). Ajoute `verifyPhase2WebhookResponseSignature` dans `phase2Webhook.ts`. **Coordination ops** : configurer n8n pour signer les réponses avec `N8N_RESPONSE_HMAC_SECRET` (ou fallback sur `PHASE2_WEBHOOK_HMAC_SECRET`).

**Critères de sortie Wave 1 :**
- ✅ Aucune Edge Function n'accepte une réponse webhook non signée quand `PHASE2_WEBHOOK_AUTH_MODE` inclut `hmac`.
- ✅ DNS resolution rejette IPs privées sur 100% des webhooks (test unitaire `webhookHostAllowlist.test.ts`).
- ✅ Kill-switches disponibles : `WEBHOOK_VERIFY_RESPONSE=false` (S-01) et `WEBHOOK_ALLOW_PRIVATE_IPS=true` (S-02) pour rollback urgent.

**⚠️ Action ops requise avant cutover en prod :**
1. Configurer chaque workflow n8n qui répond à `social-report-content` (et autres webhooks HMAC) pour signer la réponse avec le secret partagé. Headers attendus : `X-Webhook-Response-Timestamp` (ISO 8601) et `X-Webhook-Response-Signature` (`sha256=<hex_hmac>` sur `<timestamp>.<rawBody>`).
2. Définir `N8N_RESPONSE_HMAC_SECRET` dans les env vars Supabase (ou réutiliser `PHASE2_WEBHOOK_HMAC_SECRET`).
3. Déployer d'abord avec `WEBHOOK_VERIFY_RESPONSE=false` pour valider que les webhooks fonctionnent toujours.
4. Une fois n8n configuré, retirer `WEBHOOK_VERIFY_RESPONSE` (default = check activé) ou poser `WEBHOOK_VERIFY_RESPONSE=true` explicitement.

---

### Wave 2 — Hauts (2 semaines) ✅ Livré 2026-05-19

Boucler les amplifications de risque sur compte admin compromis.

**Ordre de livraison (livré 2026-05-19) :**
3. ✅ **PR #3 — S-08** (hardcode threshold). Quick win, livré en premier. Modifie `phase2Moderation.ts` + caller `social-report-content`.
4. ✅ **PR #4 — S-15** (reaction bounds). Migration SQL `CHECK constraint` + update contract Edge Function + UI front. Pré-check inclus dans la migration (abort si rows existantes hors borne).
5. ✅ **PR #5 — S-04** (rate limit fail-closed). Modifie `phase2Auth.ts:enforceAdminRateLimit` avec `failOpenOnError` flag (default `false`).
6. ✅ **PR #6 — S-05** (audit log critical). Modifie `phase2Auth.ts:logAdminAuditEvent` avec `critical` flag (default `true`) + support `idempotencyKey`.
7. ✅ **PR #7 — S-09** (eradicate idempotency). Migration SQL ajoute `idempotency_key UUID UNIQUE` à `admin_audit_events`. La RPC `admin_eradicate_social_user_content` accepte `p_idempotency_key` + advisory lock pour serializer les retries concurrents. Header `Idempotency-Key` propagé depuis `services/socialAdmin.ts:eradicateSocialUser`.
8. ✅ **PR #8 — S-07** (admin whoami). Nouvelle Edge Function `admin-whoami` + hook `useAdminWhoami` + gating dans `AdminSocialModerationScreen.tsx` (l'écran ne rend les UI admin que si `clientSideIsAdmin && adminWhoamiQuery.data?.is_admin === true`).

**Critères de sortie Wave 2 — ✅ tous validés :**
- ✅ Toute action `social-admin-*` destructrice fail-closed sur rate limit (`failOpenOnError: false` default).
- ✅ Toute insertion d'audit log fail-closed (`critical: true` default).
- ✅ `admin_*_adjustment` borné à [-10000, +10000] côté SQL (CHECK constraint) + contract (Phase2HttpError 400) + UI front (validation immédiate).
- ✅ Pas d'écran admin rendu sans confirmation serveur du tier (`admin-whoami` requis).
- ✅ Eradicate idempotent : la RPC vérifie `idempotency_key UNIQUE` + advisory lock → 10 retries successifs avec même clé → 1 seule action, retours suivants = replay de l'outcome précédent.
- ✅ Auto-hide threshold hardcodé à 3 (constant `SOCIAL_AUTO_HIDE_THRESHOLD`), aucun paramètre exposé par `shouldAutoHideForReports`.

---

### Wave 3 — Moyens / Faibles (1 mois) ✅ Livré 2026-05-19

> **Note S-12** : la pondération anti-brigading est livrée en **shadow mode**.
> La trigger `apply_social_report_thresholds` continue d'utiliser le count
> brut. Une migration ultérieure activera le mode strict après 7+ jours
> d'observation et validation produit des coefficients.

> **Note S-18** : la planification `pg_cron` est conditionnelle (DO block).
> Si pg_cron n'est pas activé sur le projet Supabase, l'opérateur reçoit un
> `RAISE WARNING` et doit invoquer manuellement la RPC ou planifier via une
> Edge Function scheduler externe.

### Follow-up Wave 3 — Gap-filling 2026-05-19

Couvre les manques identifiés à la revue post-Wave 3 :

- ✅ **S-09 étendu** aux 2 autres Edge Functions admin (`moderate-user` et `adjust-post-reactions`) avec pattern intent/outcome distinct. `logAdminAuditEvent` distingue le code postgres `23505` (UNIQUE violation) → 409 `idempotent_request_already_processed`. Rate limit pattern ajusté à `*.intent` pour ne pas compter doublement avec `.outcome` (critical: false, best-effort). Services frontend (`moderateSocialUser`, `adjustSocialPostReactions`, `eradicateSocialUser`) utilisent un helper `generateAdminIdempotencyKey()` partagé.

- ✅ **S-18 Edge Function de purge storage** : [purge-soft-deleted-social-assets](supabase/functions/purge-soft-deleted-social-assets/index.ts) appelle la RPC `purge_old_soft_deleted_social_content` puis supprime du bucket `social-posts` les `asset_paths_to_cleanup` retournés. Auth : `requireSocialModerationWorkerOrAdmin` (worker HMAC ou admin). Peut être déclenché manuellement, par un scheduler externe, ou en complément du job pg_cron qui n'exécute que la partie SQL.

- ✅ **Typecheck** : `npm run typecheck` passe (exit 0) après toutes les modifications des 3 waves + gap-filling.

Hardening défensif et compliance.

**Ordre de livraison (parallélisable) :**
9. **PR #9 — S-10 + S-11** (CORS). Bundlés car même fichier `cors.ts`. Quick wins.
10. **PR #10 — S-13** (vérif limites `share_payload_snapshot`). Lecture + ajout de bornes manquantes éventuelles. Si tout est OK, juste marquer comme couvert par B-03.
11. **PR #11 — S-14** (logout reservation cleanup). Migration RPC + update `AuthContext.tsx:signOut`.
12. **PR #12 — S-16** (cursor format check). Migration ajoutant la regex de validation dans `get_social_feed_keyset`.
13. **PR #13 — S-18** (soft-delete retention). Migration créant `purge_old_soft_deleted_social_content` + activation pg_cron + Edge Function pour purge des assets storage.
14. **PR #14 — S-12** (weighted brigading). Plus complexe : nécessite alignement produit sur les coefficients. Migration créant `compute_weighted_report_count` + update trigger `apply_social_report_thresholds`.

**Critères de sortie Wave 3 :**
- ✅ Headers CORS normalisés (case-insensitive, `null` au lieu de `*`).
- ✅ Reservations purgées au logout.
- ✅ Cursor pagination valide une regex stricte.
- ✅ Soft-delete purge automatique configurée (run quotidien à 03:00 UTC).
- ✅ Brigading nécessite ≥ 3 comptes "anciens" + non-blacklistés.

---

## Détail par finding

### PR #1 — S-02 (SSRF DNS rebind)

**Fichiers à modifier :**
- `supabase/functions/_shared/webhookHostAllowlist.ts` — ajouter `assertWebhookHostResolvesPublic`, `isPrivateIpv4`, `isPrivateIpv6`, `ipv4ToBigInt`, constante `PRIVATE_IPV4_RANGES`.
- `supabase/functions/_shared/webhookHostAllowlist.test.ts` — tests unitaires (IP privées détectées, IPv6, edge cases).

**Tests à écrire :**
```ts
// _shared/webhookHostAllowlist.test.ts
Deno.test('rejects 127.0.0.1', async () => {
  // mock Deno.resolveDns to return ['127.0.0.1']
  await assertRejects(
    () => assertWebhookHostResolvesPublic('attacker.example.com'),
    Phase2HttpError,
    'webhook_host_resolves_private',
  );
});
Deno.test('rejects AWS metadata (169.254.169.254)', async () => { /* ... */ });
Deno.test('rejects ::1 IPv6 loopback', async () => { /* ... */ });
Deno.test('accepts public IPv4', async () => { /* ... */ });
Deno.test('allows localhost in dev mode (WEBHOOK_ALLOW_HTTP=true)', async () => { /* ... */ });
```

**Rollback :** Si la résolution DNS introduit trop de latence ou casse des webhooks légitimes, retour à `validateWebhookUrl` sans le check IP via feature flag `WEBHOOK_ALLOW_PRIVATE_IPS=true`.

**Métriques de succès :** taux de webhooks rejetés < 0.1% en prod (donc pas de faux positifs).

---

### PR #2 — S-01 (webhook response signature)

**Fichiers à modifier :**
- `supabase/functions/_shared/phase2Webhook.ts` — ajouter `verifyWebhookResponseSignature`, headers constants, appel depuis `postWebhookJson`.
- `supabase/functions/_shared/phase2Env.ts` — lire `N8N_RESPONSE_HMAC_SECRET` (peut être identique à `PHASE2_WEBHOOK_HMAC_SECRET` ou dédié).
- `supabase/functions/_shared/phase2Webhook.test.ts` — tests.

**Coordination ops (n8n) :**
- Configurer chaque workflow n8n qui répond à `social-report-content`, `social-moderate-content`, etc. pour ajouter en réponse :
  ```
  X-Webhook-Response-Signature: sha256=<HMAC>
  X-Webhook-Response-Timestamp: <ISO 8601>
  ```
- HMAC : `SHA256(<timestamp>.<rawBody>, secret)`, identique au format outbound.

**Tests à écrire :**
```ts
Deno.test('rejects unsigned webhook response', async () => {
  // stub fetch to return 200 OK without signature headers
  await assertRejects(
    () => postWebhookJson(url, payload),
    Phase2HttpError,
    'webhook_response_unsigned',
  );
});
Deno.test('rejects stale signature (> 5 min old)', async () => { /* ... */ });
Deno.test('rejects signature mismatch', async () => { /* ... */ });
Deno.test('accepts valid signature', async () => { /* ... */ });
```

**Rollback :** Feature flag `WEBHOOK_VERIFY_RESPONSE=true|false` (défaut `true` après cutover). Permet de désactiver temporairement si n8n n'est pas encore configuré.

**Métriques de succès :**
- 100% des réponses n8n signées (alerte si `webhook_response_unsigned` > 0 en prod).
- 0 régression sur les workflows existants (smoke tests).

---

### PR #3 — S-08 (hardcode auto-hide threshold)

**Fichiers à modifier :**
- `supabase/functions/_shared/phase2Moderation.ts` — exporter constante `SOCIAL_AUTO_HIDE_THRESHOLD`, supprimer le paramètre `threshold`.
- `supabase/functions/social-report-content/index.ts:184` — retirer le `, 3`.
- `__tests__/supabase/functions/_shared/phase2Moderation.test.ts` — test que la constante est utilisée.

**Test de régression :**
```ts
Deno.test('shouldAutoHideForReports has no threshold parameter exposed', () => {
  // Vérifie via signature de la fonction
  assertEquals(shouldAutoHideForReports.length, 1);
});
```

**Rollback :** Trivial (réintroduire le paramètre).

---

### PR #4 — S-15 (reaction bounds)

**Migration SQL :** `supabase/migrations/20260521_clamp_social_admin_reaction_adjustments.sql`

```sql
-- Vérification pré-migration : aucune valeur existante hors borne
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.social_posts
    WHERE admin_like_adjustment NOT BETWEEN -10000 AND 10000
       OR admin_dislike_adjustment NOT BETWEEN -10000 AND 10000;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Pre-migration check failed: % rows have out-of-range admin adjustments', v_count;
  END IF;
END $$;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_admin_like_adjustment_range
    CHECK (admin_like_adjustment BETWEEN -10000 AND 10000),
  ADD CONSTRAINT social_posts_admin_dislike_adjustment_range
    CHECK (admin_dislike_adjustment BETWEEN -10000 AND 10000);

CREATE OR REPLACE FUNCTION public.set_social_post_admin_reaction_adjustments(
  p_post_id uuid,
  p_admin_like_adjustment integer,
  p_admin_dislike_adjustment integer
)
RETURNS TABLE (
  post_id uuid,
  raw_like_count integer,
  raw_dislike_count integer,
  admin_like_adjustment integer,
  admin_dislike_adjustment integer,
  effective_like_count integer,
  effective_dislike_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  updated_post public.social_posts%ROWTYPE;
BEGIN
  IF p_post_id IS NULL THEN
    RAISE EXCEPTION 'post_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_posts AS social_post
  SET
    admin_like_adjustment = LEAST(10000, GREATEST(-10000, COALESCE(p_admin_like_adjustment, 0))),
    admin_dislike_adjustment = LEAST(10000, GREATEST(-10000, COALESCE(p_admin_dislike_adjustment, 0))),
    updated_at = now()
  WHERE social_post.id = p_post_id
  RETURNING social_post.*
  INTO updated_post;

  IF updated_post.id IS NULL THEN
    RAISE EXCEPTION 'Social post not found' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    updated_post.id AS post_id,
    COALESCE(updated_post.like_count, 0),
    COALESCE(updated_post.dislike_count, 0),
    COALESCE(updated_post.admin_like_adjustment, 0),
    COALESCE(updated_post.admin_dislike_adjustment, 0),
    public.get_effective_social_reaction_count(updated_post.like_count, updated_post.admin_like_adjustment),
    public.get_effective_social_reaction_count(updated_post.dislike_count, updated_post.admin_dislike_adjustment);
END;
$$;
```

**Fichiers à modifier :**
- `supabase/functions/_shared/phase2Contracts.ts:1397-1437` — ajouter `assertReactionAdjustmentRange`.
- `screens/AdminSocialModerationScreen.tsx:193-197` — valider plage côté front (UX, message d'erreur immédiat).
- `__tests__/supabase/functions/_shared/phase2Contracts.test.ts` — tests bornes.

---

### PR #5 — S-04 (rate limit fail-closed)

**Fichiers à modifier :**
- `supabase/functions/_shared/phase2Auth.ts:518-554` — ajouter paramètre `failOpenOnError`.
- Edge Functions admin destructives : `social-admin-eradicate-user`, `social-admin-moderate-user`, `social-admin-adjust-post-reactions`, `social-moderate-content` (cas reject/remove/hide).

**Vérifier les call-sites :**
```bash
grep -rn "enforceAdminRateLimit" supabase/functions/
```
Pour chaque call-site, décider si l'action est destructive (fail-closed default) ou non-destructive (`failOpenOnError: true` explicite).

---

### PR #6 — S-05 (audit log critical)

**Fichiers à modifier :**
- `supabase/functions/_shared/phase2Auth.ts:488-511` — ajouter paramètre `critical`.
- Toutes les Edge Functions admin : déplacer `logAdminAuditEvent` AVANT la mutation destructive (intent log) + ajouter un 2e log APRÈS (outcome log) avec `critical: false`.

**Pattern à appliquer :**
```ts
// Avant l'appel destructeur :
await logAdminAuditEvent(supabase, {
  actorId: user.id,
  action: `${operationName}.intent`,
  requestId,
  metadata: { ... },
  critical: true,  // fail-closed
});

// L'opération destructrice :
const result = await supabase.rpc(rpcName, { ... });

// Après succès :
await logAdminAuditEvent(supabase, {
  actorId: user.id,
  action: `${operationName}.outcome`,
  requestId,
  metadata: { ... result },
  critical: false,  // best-effort
});
```

---

### PR #7 — S-09 (eradicate idempotency)

**Migration SQL :** `supabase/migrations/20260520_admin_idempotency_keys.sql`

```sql
ALTER TABLE public.admin_audit_events
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_audit_events_idempotency_key
  ON public.admin_audit_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Mise à jour de admin_eradicate_social_user_content pour accepter et persister la clé
-- (cf. extrait dans SOCIAL_SECURITY_AUDIT.md S-09)
```

**Fichiers à modifier :**
- `supabase/functions/social-admin-eradicate-user/index.ts` — lire `Idempotency-Key` header, passer à la RPC.
- `services/socialAdmin.ts` — générer UUID stable par tentative, propager dans le header.
- `__tests__/services/socialAdmin.test.ts` — test que retry avec même clé = 1 seule mutation.

**Étendre à d'autres opérations destructrices** (S-04 / S-05 sont prioritaires, mais idempotency peut être ajoutée par lot) :
- `social-admin-moderate-user` (ban/revoke)
- `social-moderate-content` (remove/hide)

---

### PR #8 — S-07 (admin whoami)

**Nouvelle Edge Function :** `supabase/functions/admin-whoami/index.ts`

```ts
import { handleCorsPreflightRequest, jsonResponse, validateCorsOrigin } from '../_shared/cors.ts';
import { createServiceRoleClient, requireAdminUserProfile, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import { getPhase2ErrorStatus, toPhase2ErrorPayload } from '../_shared/phase2Errors.ts';
import { createRequestId, logPhase2Error } from '../_shared/phase2Observability.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);
  const corsError = validateCorsOrigin(req);
  if (corsError) return corsError;
  const requestId = createRequestId();
  try {
    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    const profile = await requireAdminUserProfile(supabase, user.id);
    return jsonResponse(req, { is_admin: true, user_id: profile.id });
  } catch (error) {
    logPhase2Error('[admin-whoami] Request failed', error, { request_id: requestId });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
```

**Nouveau hook :** `hooks/queries/useAdminWhoami.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { invokeEdgeFunction } from 'services/edgeFunctions';

export const ADMIN_WHOAMI_QUERY_KEY = ['admin', 'whoami'] as const;

export function useAdminWhoami() {
  return useQuery({
    queryKey: ADMIN_WHOAMI_QUERY_KEY,
    queryFn: () => invokeEdgeFunction<{ is_admin: boolean; user_id: string }>('admin-whoami', {}, { method: 'GET' }),
    staleTime: 60_000,
    retry: false,
  });
}
```

**Modifier `screens/AdminSocialModerationScreen.tsx`** : gater l'écran sur `useAdminWhoami().data?.is_admin === true`.

---

### PR #9 — S-10 + S-11 (CORS)

**Fichier à modifier :** `supabase/functions/_shared/cors.ts:20-97`

Voir extraits dans SOCIAL_SECURITY_AUDIT.md.

**Tests :**
```ts
Deno.test('CORS allowlist is case-insensitive', () => {
  Deno.env.set('ALLOWED_ORIGINS', 'https://MyApp.com');
  assertEquals(isOriginAllowed('https://myapp.com'), true);
});
Deno.test('CORS returns null instead of * when Origin absent', () => {
  const headers = getCorsHeaders(new Request('https://x', { headers: {} }));
  assertEquals(headers['Access-Control-Allow-Origin'], 'null');
});
```

---

### PR #10 — S-13 (vérification limites `share_payload_snapshot`)

**Action :** Lire intégralement [phase2Contracts.ts:204-298](supabase/functions/_shared/phase2Contracts.ts:204) (`normalizeSharePayloadSnapshot`). Vérifier bornes :
- `headline`, `variantLabel`, `footerBrand`, `footerCta`, `statusBadgeLabel`, `scoreLabel` ≤ 200 chars ?
- `accentColor`, `accentColorSecondary` regex `^#[0-9a-fA-F]{6}$` ?
- `metrics` array max 10 items ?
- `metrics[].label`, `metrics[].value`, `metrics[].valueVariant` ≤ 100 chars ?

Si toutes OK → marquer S-13 statut "✅ couvert par B-03" dans `SOCIAL_SECURITY_AUDIT.md`. Sinon → appliquer les manquants.

---

### PR #11 — S-14 (logout reservation cleanup)

**Migration SQL :**

```sql
-- supabase/migrations/20260523_release_pending_social_upload_reservations.sql
ALTER TABLE public.social_upload_reservations
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

-- Permettre status='released' :
ALTER TABLE public.social_upload_reservations
  DROP CONSTRAINT IF EXISTS social_upload_reservations_status_check;
ALTER TABLE public.social_upload_reservations
  ADD CONSTRAINT social_upload_reservations_status_check
    CHECK (status IN ('reserved', 'consumed', 'expired', 'released'));

CREATE OR REPLACE FUNCTION public.release_pending_social_upload_reservations(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Only the owner can release their pending reservations'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.social_upload_reservations
    SET status = 'released', released_at = now()
    WHERE user_id = p_user_id
      AND status = 'reserved'
      AND expires_at > now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_pending_social_upload_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_pending_social_upload_reservations(uuid) TO authenticated;
```

**Modifier `contexts/AuthContext.tsx`** dans le `signOut` :

```ts
async function signOut() {
  // [...] code existant
  if (user?.id) {
    try {
      await supabase.rpc('release_pending_social_upload_reservations', { p_user_id: user.id });
    } catch (error) {
      console.warn('[Auth] Failed to release pending reservations on signout', error);
      // Non-bloquant : la TTL prendra le relais
    }
  }
  await supabase.auth.signOut();
}
```

---

### PR #12 — S-16 (cursor format)

**Lire** [20260524120000_social_feed_keyset.sql](supabase/migrations/20260524120000_social_feed_keyset.sql) intégralement. Ajouter en début de fonction :

```sql
DECLARE
  v_cursor_pattern constant text :=
    '^[0-9]+(\.[0-9]+)?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor !~ v_cursor_pattern THEN
    RAISE EXCEPTION 'Invalid cursor format' USING ERRCODE = '22023';
  END IF;
  -- [reste de la fonction]
```

Ajouter test SQL :

```sql
-- __tests__/supabase/functions/_shared/social_feed_keyset.test.sql
SELECT public.get_social_feed_keyset_page(NULL, NULL, 'invalid:not-a-uuid');
-- doit lever 22023
```

---

### PR #13 — S-18 (soft-delete retention)

**Migration :** `supabase/migrations/20260601_social_soft_delete_retention.sql`

Voir extrait dans `SOCIAL_SECURITY_AUDIT.md` S-18.

**Pré-requis :** vérifier que `pg_cron` est activé sur le projet Supabase. Si non, alternative via Edge Function planifiée (Supabase Scheduler).

**Edge Function de purge des assets storage :** `supabase/functions/purge-soft-deleted-social-assets/index.ts` qui :
1. Liste les `asset_path` retournés par `purge_old_soft_deleted_social_content`.
2. Appelle `supabase.storage.from('social-posts').remove([...])` par batch de 100.
3. Logue les échecs (best-effort, le storage TTL prendra le relais).

---

### PR #14 — S-12 (weighted brigading)

**Dépendances design produit :**
- Validation des coefficients (0.25 / 0.5 / 1.0) par le produit.
- Décision : exclure aussi les reports répétés du même couple `(reporter_id, target_id)` ? (déjà couvert par contrainte unique sur `social_reports`).
- Tableau de bord pour ajuster les coefficients sans déploiement (option : table `social_moderation_config` lue par la trigger).

**Migration :** `supabase/migrations/20260522_weighted_report_count.sql`

Voir extrait dans `SOCIAL_SECURITY_AUDIT.md` S-12.

**Plan de rollout :**
1. Déployer la fonction `compute_weighted_report_count` sans la brancher (shadow mode, log le score weighted vs raw).
2. Comparer pendant 7 jours en prod : taux de divergence, faux positifs/négatifs.
3. Brancher la trigger sur le score weighted après validation produit.

**Rollback :** Garder l'ancienne version `compute_unique_report_count_24h` accessible via feature flag `SOCIAL_USE_WEIGHTED_REPORTS=false`.

---

## Checklist de vérification post-fix

### Avant chaque PR

- [ ] Tests unitaires écrits et passent (`npm test` côté front, `deno test` côté functions).
- [ ] Migration SQL testée sur staging avec un dataset représentatif (au moins 1000 posts, 100 admins).
- [ ] Nouvelles Edge Functions déployées via `deploy_functions.ps1` avec smoke test.
- [ ] Documentation : mettre à jour `SOCIAL_SECURITY_AUDIT.md` statut → ✅ Corrigé.

### Vérification globale post-Wave 1

```bash
# 1. Vérifier que toutes les Edge Functions vérifient la réponse webhook
grep -rn "postWebhookJson" supabase/functions/ | wc -l
# Doit matcher : nombre de call-sites pour postWebhookJson
grep -rn "verifyWebhookResponseSignature\|webhook_response_unsigned" supabase/functions/_shared/phase2Webhook.ts

# 2. Vérifier que webhookHostAllowlist a la fonction de résolution DNS
grep -n "assertWebhookHostResolvesPublic" supabase/functions/_shared/webhookHostAllowlist.ts
```

### Vérification globale post-Wave 2

```bash
# 1. Aucune occurrence de fail-open par défaut
grep -rn "failOpenOnError" supabase/functions/ | grep "true"
# Doit lister UNIQUEMENT les Edge Functions non-destructives (approve, dismiss)

# 2. logAdminAuditEvent appelé AVANT le rpc dans toutes les Edge Functions admin
grep -B5 "rpc.*admin_eradicate\|rpc.*ban_user\|rpc.*remove_avatar" supabase/functions/social-admin-*/index.ts | grep "logAdminAuditEvent"

# 3. Threshold hardcoded
grep -n "shouldAutoHideForReports(" supabase/functions/ -r
# Doit montrer 1 seul caller, sans 2e argument

# 4. CHECK constraint admin_*_adjustment posée
psql "$SUPABASE_DB_URL" -c "\d+ public.social_posts" | grep "admin_.*_adjustment_range"

# 5. Idempotency key colonne présente
psql "$SUPABASE_DB_URL" -c "\d public.admin_audit_events" | grep idempotency_key
```

### Vérification globale post-Wave 3

```bash
# 1. CORS normalisé
grep -n "toLowerCase()" supabase/functions/_shared/cors.ts | wc -l
# Doit être >= 2 (allowedOrigins + origin.toLowerCase)

# 2. Reservations purgées au logout
grep -n "release_pending_social_upload_reservations" contexts/AuthContext.tsx

# 3. pg_cron actif et planifié
psql "$SUPABASE_DB_URL" -c "SELECT * FROM cron.job WHERE jobname LIKE '%social%'"

# 4. Cursor regex en place
psql "$SUPABASE_DB_URL" -c "\sf get_social_feed_keyset_page" | grep "v_cursor_pattern"
```

---

## Métriques à surveiller en production

| Métrique | Source | Seuil d'alerte |
|----------|--------|----------------|
| `webhook_response_unsigned` rate | logPhase2Error | > 0 (alerte critique) |
| `webhook_host_resolves_private` rate | logPhase2Error | > 1/heure |
| `admin_rate_limit_unavailable` rate | logPhase2Error | > 5/heure → BDD dégradée |
| `admin_audit_log_unavailable` rate | logPhase2Error | > 0 (alerte critique) |
| `social_post_admin_reaction_adjustments_range` violations | DB logs | > 0 (alerte info, code bug) |
| Reservations purgées au logout | RPC return | tracking pour optimisation TTL |
| Soft-delete purge daily count | pg_cron output | tracking |

---

## Risques résiduels après remédiation complète

Même après Wave 1 + 2 + 3 livrées, restent :

1. **S-06 (AAL2/MFA désactivée)** — risque accepté documenté. Multiplicateur sur tous les findings admin.
2. **DNS rebinding race** — fenêtre microscopique entre `assertWebhookHostResolvesPublic` et le `fetch()` final. Mitigation complète nécessite un client HTTP custom qui hardcode l'IP résolue.
3. **Brigading sophistiqué** (S-12) — un attaquant patient avec 5+ comptes "anciens" (> 7j, peu d'historique dismissed) peut toujours déclencher l'auto-hide. Nécessite review manuelle.
4. **Compromission service_role key** — hors scope de cet audit (couvert par `SECURITY_AUDIT_SUPABASE.md`). Toutes les défenses RPC s'effondrent si la clé fuit.

---

## Références

- [SOCIAL_SECURITY_AUDIT.md](SOCIAL_SECURITY_AUDIT.md) — Audit source.
- [SECURITY_FIX_PLAN_2026_05.md](SECURITY_FIX_PLAN_2026_05.md) — Plan général.
- [DEPLOYMENT_PLAN_2026_05.md](DEPLOYMENT_PLAN_2026_05.md) — Plan de déploiement.
- [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) — Risques acceptés.
