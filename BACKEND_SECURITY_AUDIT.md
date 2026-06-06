# Audit Sécurité Backend (suite) — SelfLens / TSE

**Date :** 2026-04-25
**Périmètre :** Edge Functions, migrations SQL, RLS, Storage — au-delà des findings XSS/HTML
**Complément à :** [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md), [XSS_HTML_SECURITY_AUDIT.md](XSS_HTML_SECURITY_AUDIT.md), [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md)

---

## Résumé exécutif

Audit ciblé sur SSRF, SQL injection, IDOR, mass assignment, ReDoS, path traversal, secrets/PII en logs et politiques RLS. **Un finding P0 (RLS user_profiles trop permissive)** non documenté dans les audits précédents, plus 3 findings P1/P2 de durcissement. Le reste relève de defense-in-depth ou est déjà couvert par les audits existants.

### Actions prioritaires

1. **P0** — Restreindre la policy SELECT sur `user_profiles` (actuellement `USING (true)` → leak emails de tous les users) + créer une vue publique pour le feed social.
2. **P1** — Restreindre la résolution d'IP à `cf-connecting-ip` uniquement (ou whitelist trust en dev) pour éviter le bypass de rate limit.
3. **P1** — Ajouter des limites de longueur sur les strings de `share_payload_snapshot` (DoS stockage).
4. **P2** — Documenter le whitelist de hostnames pour les webhooks n8n (defense-in-depth SSRF).

---

## Findings détaillés

### B-01 — RLS `user_profiles` `USING (true)` — leak emails [P0 — Haut]

**Fichier :** [supabase/migrations/20251016135828_fix_rls_performance_and_security_issues.sql:127-130](supabase/migrations/20251016135828_fix_rls_performance_and_security_issues.sql:127)

```sql
CREATE POLICY "Users can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);
```

**Description.** Régression par rapport à la migration initiale ([20251011185556:80-83](supabase/migrations/20251011185556_create_health_scan_tables.sql:80) qui avait `USING (auth.uid() = id)`). Toute la table `user_profiles` est lisible par n'importe quel user authentifié, y compris les colonnes `email`, `subscription_status`, `subscription_expiry_date`, `subscription_platform`, `scan_usage`, `last_scan_date`, `account_tier`, etc.

**Exploitation.** Un attaquant authentifié AAL1 ouvre la console JS d'un client web (ou se sert du JS bundle de l'app) et exécute :

```js
const { data } = await supabase
  .from('user_profiles')
  .select('id, email, subscription_status')
  .limit(10000);
```

→ il récupère la liste complète des emails enregistrés et leur statut d'abonnement. Cas d'usage typique d'énumération + ciblage phishing.

**Impact.**
- Leak PII (emails) de toute la base utilisateurs.
- Énumération du parc abonnés vs gratuit.
- Possible identification de comptes admin (`account_tier = 'admin'`).

**Recommandation.**
1. Créer une vue `user_profiles_public` (DEFINER, expose uniquement `id, username, avatar_url, account_created_at, created_at, scan_count`).
2. Restreindre la policy `user_profiles` à `(select auth.uid()) = id`.
3. Adapter les 2 lectures cross-user côté front : [services/social.ts:1306](services/social.ts:1306) (`fetchSocialPublicProfile`) et [contexts/AuthContext.tsx:1475](contexts/AuthContext.tsx:1475) (recherche par username) → utiliser la vue.

**Statut :** ✅ Corrigé dans cette passe.

---

### B-02 — IP rate limit bypass via `X-Forwarded-For` forgé [P1 — Moyen]

**Fichier :** [supabase/functions/send-verification-email/index.ts:60-67](supabase/functions/send-verification-email/index.ts:60)

```ts
function resolveClientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
```

**Description.** L'ordre de priorité commence par `cf-connecting-ip` (ce qui est correct si Supabase Edge tourne derrière Cloudflare), mais fallback sur `x-forwarded-for` et `x-real-ip` qui sont **trivialement forgables** par tout client si la fonction est invoquée directement (sans passer par Cloudflare).

**Exploitation.** Un attaquant envoie 100 requêtes `POST /send-verification-email` en variant `X-Forwarded-For: 1.2.3.X` à chaque appel → contourne le rate limit IP (5/heure). Permet : flood d'emails de vérification, énumération d'emails (différents codes de retour selon que l'email existe ou pas).

**Recommandation.** Si Supabase Edge est exclusivement derrière Cloudflare en prod, n'accepter QUE `cf-connecting-ip`. Pour du dev/local, gérer via env var `TRUST_X_FORWARDED_FOR_IPS` (whitelist).

**Statut :** ✅ Corrigé dans cette passe (utilise uniquement `cf-connecting-ip` en prod, via flag de runtime).

---

### B-03 — Limites de longueur absentes sur `share_payload_snapshot` [P1 — Moyen]

**Fichier :** [supabase/functions/_shared/phase2Contracts.ts:204-298](supabase/functions/_shared/phase2Contracts.ts:204)

**Description.** `normalizeSharePayloadSnapshot` valide la structure de `share_payload_snapshot` mais ne pose aucune limite de longueur sur les strings (`variantLabel`, `headline`, `footerBrand`, `footerCta`, `statusBadgeLabel`, `accentColor`, `accentColorSecondary`, `metrics[].label`, `metrics[].value`).

**Exploitation.** Un attaquant authentifié crée 1 000 posts sociaux avec `share_payload_snapshot.headline = "a".repeat(1000000)` → 1 GB de stockage métadonnées, dégradation des perfs de la BDD.

**Recommandation.** Borner :
- `variant`, `variantLabel`, `scoreLabel`, `footerBrand`, `footerCta`, `statusBadgeLabel`, `headline` → 200 chars
- `accentColor`, `accentColorSecondary` → regex `^#[0-9a-fA-F]{6}$` (max 7 chars)
- `metrics[].label`, `metrics[].value`, `metrics[].valueVariant` → 100 chars
- `metrics` array → max 10 items

**Statut :** ✅ Corrigé dans cette passe.

---

### B-04 — SSRF webhook n8n sans whitelist hostname [P2 — Faible (defense-in-depth)]

**Fichier :** [supabase/functions/_shared/fridgeScanWebhook.ts:57-63](supabase/functions/_shared/fridgeScanWebhook.ts:57)

```ts
function assertValidWebhookUrl(url: string) {
  try {
    new URL(url);
  } catch {
    throw createFridgeScanWebhookNotConfiguredError();
  }
}
```

**Description.** Les URLs webhook viennent de variables d'environnement (`N8N_FRIDGE_SCAN_WEBHOOK_URL`, `N8N_FRIDGE_SCAN_WEBHOOK_URLS`), donc d'opérateurs qui configurent le serveur, pas d'input utilisateur direct. **Pas de risque SSRF par utilisateur final.** Cependant :

- Si un opérateur fait une typo (ex. `http://localhost:8080`), la fonction enverra les payloads scan (qui contiennent images base64 + métadonnées user) à un endpoint local.
- Si la variable est compromise via une fuite de service-role-key + dashboard Supabase, l'attaquant peut rediriger vers `http://169.254.169.254/...` (AWS metadata leak) ou autre.

**Recommandation.** Ajouter une whitelist regex pour les hostnames acceptés dans `assertValidWebhookUrl` :

```ts
const ALLOWED_WEBHOOK_HOSTS_PATTERN = /^([a-z0-9-]+\.)?(n8n\.basedjew\.com|n8n\.healthscan\.cloud)$/i;
function assertValidWebhookUrl(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw ...; }
  if (parsed.protocol !== 'https:') throw ...;
  if (!ALLOWED_WEBHOOK_HOSTS_PATTERN.test(parsed.hostname)) throw ...;
}
```

**Statut :** ⏳ Non corrigé (defense-in-depth — décision opérateur sur le whitelist exact).

---

### B-05 — `user_id` loggé en clair dans `console.warn` [P3 — Faible]

**Fichier :** [supabase/functions/analyze-scan/index.ts:167-170](supabase/functions/analyze-scan/index.ts:167) (et autres `console.warn` directs)

**Description.** Les logs Edge Functions sont visibles dans le dashboard Supabase pour les opérateurs. Si ces logs sont un jour exfiltrés ou agrégés vers un outil tiers, les `user_id` permettent énumération + corrélation.

**Recommandation.** Remplacer les `console.warn/error` directs par `logPhase2Error()` ([_shared/phase2Observability.ts:109](supabase/functions/_shared/phase2Observability.ts:109)) qui passe par `sanitizeMetadata`. Note : `user_id` n'est pas dans le `SENSITIVE_KEY_PATTERN` actuel — décider s'il doit l'être (ou hasher en short digest pour conserver la corrélation sans exposer l'ID brut).

**Statut :** ⏳ Non corrigé (impact opérationnel à valider — perdre les `user_id` complique le debug).

---

### B-06 — Pas de limite de profondeur JSON [P3 — Faible]

**Fichier :** [supabase/functions/_shared/phase2Utils.ts:197](supabase/functions/_shared/phase2Utils.ts:197)

```ts
return JSON.parse(rawBody);
```

**Description.** Aucune limite de profondeur. Un attaquant authentifié peut envoyer `{"a":{"a":{"a":...}}}` avec 10 000 niveaux → consommation mémoire/CPU.

**Atténuation existante.** `maxBytes` est borné côté lecture du body (ex. 32 KB pour les fonctions sociales). Donc la profondeur réelle est limitée par la taille.

**Recommandation.** Pas d'action immédiate — bornes de taille suffisent en pratique. À surveiller si une fonction critique relève `maxBytes`.

---

### B-07 — Mass assignment : risque de drift futur [P3 — Faible]

**Fichier :** [supabase/functions/social-update-comment/index.ts:156-172](supabase/functions/social-update-comment/index.ts:156)

**Description.** Aujourd'hui les `update({...})` listent explicitement les colonnes — pas de mass assignment exploitable. Mais si une nouvelle colonne sensible est ajoutée à `social_comments` sans review, elle sera par défaut absente du whitelist mais le pattern reste fragile.

**Recommandation.** Documenter dans [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) la règle : tout INSERT/UPDATE depuis une Edge Function doit lister explicitement ses colonnes — interdiction de `update(body)` ou `insert(body)` direct.

**Statut :** ⏳ Documentation à ajouter.

---

## Findings exclus / faux positifs

- **Path traversal `analyze-scan`** : `objectPath` est dérivé en interne via `buildCanonicalScanImagePath(user.id, scanRow.id)` ([supabase/functions/analyze-scan/index.ts:304](supabase/functions/analyze-scan/index.ts:304)) — pas un input utilisateur. ❌ Faux positif.
- **Race condition sur quotas scans** : nécessite un audit live de `reserve_scan_quota` RPC pour confirmer la présence d'un `SELECT FOR UPDATE`. Non vérifiable en statique.
- **ReDoS sur regex UUID** : pattern non-backtracking + array bornés → pas de risque pratique.
- **Webhook signature replay (5min window)** : déjà mitigé par nonces uniques + comparaison constante ([fridge-scan-complete/index.ts](supabase/functions/fridge-scan-complete/index.ts)).

---

## Plan de remédiation

| ID | Priorité | Effort | Impact | Statut |
|----|----------|--------|--------|--------|
| B-01 | P0 | 1 h | Haut (leak emails) | ✅ Corrigé |
| B-02 | P1 | 30 min | Moyen | ✅ Corrigé |
| B-03 | P1 | 30 min | Moyen | ✅ Corrigé |
| B-04 | P2 | 30 min | Faible | ⏳ À discuter avec ops |
| B-05 | P3 | 1 h | Faible | ⏳ Décision produit |
| B-06 | P3 | — | Théorique | Pas d'action |
| B-07 | P3 | 30 min | Théorique | ⏳ Doc à ajouter |

---

## Vérification

1. **Migration RLS** : vérifier en local avec `npx supabase db reset` que la policy `Users can view own profile` remplace bien l'ancienne `Users can view profiles`.
2. **Test cross-user** : connecté en User A, tenter `supabase.from('user_profiles').select('email').neq('id', userA.id)` → doit retourner 0 lignes.
3. **Test vue publique** : connecté en User A, `supabase.from('user_profiles_public').select('username, avatar_url').eq('id', userB.id)` → doit retourner les données publiques de B.
4. **Tests unitaires** : `npx jest` complet — pas de régression.
5. **TypeCheck + Lint** : `npm run typecheck && npm run lint` — 0 erreurs.

---

## Annexes

### Tables auditées (leakable via RLS user_profiles avant correctif)

| Colonne | Sensibilité |
|---------|------------|
| `email` | PII — leak permet phishing ciblé |
| `subscription_status` | Métier — révèle le profil commercial |
| `subscription_expiry_date` | Métier |
| `subscription_platform` | Métier |
| `account_tier` | Sensible — révèle les comptes admin |
| `last_scan_date` | Comportemental |
| `scan_usage` | Comportemental |
| `account_created_at` | Public OK |
| `username` | Public OK |
| `avatar_url` | Public OK |
| `scan_count` | Public OK (visible feed) |
