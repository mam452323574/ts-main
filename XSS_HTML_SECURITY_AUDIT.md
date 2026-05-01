# Audit Sécurité — XSS / Injection HTML

**Projet :** HealthScan / TSE
**Date :** 2026-04-25
**Périmètre :** App mobile React Native/Expo + sous-projet `website/` + Edge Functions Supabase
**Auditeur :** Audit statique automatisé
**Documents associés :** [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md), [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md), [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md)

---

## 1. Résumé exécutif

**Verdict global : profil de risque XSS faible.**

L'architecture mobile native (React Native `<Text>` qui échappe automatiquement les caractères HTML) et l'absence totale de :

- `dangerouslySetInnerHTML`
- `WebView` avec `source={{ html }}` ou `injectedJavaScript`
- `eval` / `new Function`
- `innerHTML` / `outerHTML` / `document.write`

…éliminent la quasi-totalité des vecteurs DOM XSS classiques côté app. Le sous-projet `website/` ne contient qu'une page `privacy-policy/index.html` 100 % statique (zéro JavaScript exécuté).

**Aucune vulnérabilité XSS critique exploitable en production aujourd'hui.**

10 findings ont été identifiés (4 P1 / 4 P2 / 2 P3). Tous relèvent du **defense-in-depth** ou de risques activables uniquement dans des scénarios futurs (futur client web, ajout d'un WebView, export HTML d'emails dynamiques).

### Actions prioritaires (P1)

1. Appliquer `normalizeTrustedImageUri()` aux `image_url` venant de la BDD dans les composants `SocialPostCard` et `ProductCard`.
2. Renforcer `services/avatar.ts` avec whitelist hostname stricte (Supabase CDN uniquement) et rejet des schémas `data:` / `content:` en remote.
3. Créer un helper `escapeHtml()` côté Edge Functions et l'appliquer dans le template d'email de vérification.
4. Ajouter les headers de sécurité standard (`X-Content-Type-Options`, `X-Frame-Options`, CSP, HSTS, Referrer-Policy) sur toutes les réponses Edge Functions.

---

## 2. Méthodologie

### Périmètre analysé

| Zone | Fichiers / dossiers |
|------|---------------------|
| App mobile RN | `app/`, `components/`, `screens/`, `contexts/`, `hooks/`, `services/`, `utils/` |
| Sous-projet web | `website/` |
| Edge Functions | `supabase/functions/**` |
| Migrations / RLS | `supabase/migrations/**` |
| Configuration | `app.json`, `eslint.config.js`, `package.json` |

### Recherches effectuées

Patterns recherchés (statiques, sans exécution) :

- `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `insertAdjacentHTML`
- `eval`, `new Function`, `Function(`, `setTimeout` / `setInterval` avec string
- `WebView` (toutes options dangereuses : `source.html`, `injectedJavaScript`, `originWhitelist`)
- `Linking.openURL`, `expo-web-browser` — validation URL
- `JSON.parse` sur params de route ou input utilisateur
- Templates HTML / emails (string-concat avec interpolation)
- Headers HTTP de sécurité dans réponses Edge Functions
- CSP (`<meta http-equiv="Content-Security-Policy">`)
- Politiques RLS sur contenu utilisateur multi-utilisateurs

### Limites

- **Audit statique uniquement.** Pas de pentest live, pas de fuzz, pas d'analyse dynamique.
- **Pas de revue exhaustive de chaque traduction i18n** — partons du principe que les fichiers `i18n/*.json` sont commités et contrôlés par l'équipe.
- **Modèle de menace** : utilisateur authentifié hostile, attaquant réseau passif (TLS), serveur Supabase non compromis.

---

## 3. Modèle de menace étendu

### 3.1 Vecteurs actifs aujourd'hui

| Vecteur | Surface | Statut |
|---------|---------|--------|
| Injection via input texte (post / commentaire / bio) | Rendu via React Native `<Text>` (échappement natif) | ✅ Mitigé par plateforme |
| Injection via `image_url` malicieuse (BDD) | `<Image source={{ uri }} />` sans validation | ⚠️ F-01, F-02 |
| Injection via avatar URL exotique (`data:`, `content:`) | `services/avatar.ts` | ⚠️ F-03 |
| Injection via deep link payload | `JSON.parse` sur `useLocalSearchParams` | ⚠️ F-04 |
| Injection dans template email | String-concat dans `send-verification-email` | ⚠️ F-05 (théorique) |

### 3.2 Vecteurs futurs / régressions à anticiper

| Scénario | Risque potentiel | Préventions à mettre en place |
|----------|------------------|-------------------------------|
| Ajout d'un WebView (ex. paiement, aide intégrée) | XSS DOM dans WebView, exfiltration session via `onMessage` | Toujours `originWhitelist` strict, jamais `source.html`, valider `onMessage` payload |
| Futur client web (ex. dashboard admin) | Stored XSS via `social_posts.content_text` non échappé | Refuser HTML chars côté serveur (F-06) ou DOMPurify côté client web |
| Export PDF/HTML de scan/post (partage hors-app) | Si rendu HTML — stored XSS | Helper escape obligatoire, jamais string-concat |
| Notifications push avec contenu utilisateur | Système notifications natives (sandboxées) | OK aujourd'hui, à revérifier si rich notifications |
| Markdown dans posts/coach (futur) | XSS via `react-native-markdown-display` mal configuré | Désactiver `allowedTypes: ['link']` dangereux, valider URL |

### 3.3 Hypothèses de défense actuelles

- **H1.** Tout texte utilisateur affiché via `<Text>` uniquement — aucun rendu HTML actif.
- **H2.** Toute URL externe passe par `safeOpenExternalUrl()` (whitelist hostname).
- **H3.** Toute image distante est servie depuis le bucket Supabase canonique.
- **H4.** Aucun template HTML dynamique côté client.
- **H5.** Les Edge Functions ne renvoient que du JSON (jamais HTML/text-html).

Toute violation future de ces hypothèses doit être traitée comme un changement de modèle de menace et faire l'objet d'une revue.

---

## 4. Findings détaillés

### F-01 — `<Image>` social sans validation d'URI [P1 — Moyen]

**Fichier :** [components/social/SocialPostCard.tsx:113](components/social/SocialPostCard.tsx)

```tsx
{post.image_url ? (
  <Pressable disabled={!onPress} onPress={onPress ?? undefined} style={styles.imageWrap}>
    <Image
      source={{ uri: post.image_url }}
      resizeMode="cover"
      ...
    />
  </Pressable>
) : null}
```

**Description.** L'URI provient de `social_posts.image_url` (BDD Supabase). Aucune validation côté composant. Sur React Native iOS/Android, `<Image>` ignore `javascript:` et n'exécute pas de SVG actif → pas de XSS classique. Cependant :

- Une URI `http://attacker.com/...` peut servir de pixel-tracking / fingerprinting.
- Une compromission backend ou bug RLS pourrait substituer l'URL d'origine.
- Sur le web (`react-native-web`), une URI `data:image/svg+xml;base64,<script>` peut exécuter du JS.

**Exploitation hypothétique.** Stored : un attaquant insère un `image_url` non Supabase, l'image s'affiche dans le feed → désanonymisation de viewers + potentiel contenu offensant.

**Recommandation.** Wrapper l'URI via `normalizeTrustedImageUri()` ([utils/urlSecurity.ts:179](utils/urlSecurity.ts)) qui force HTTPS + hostname Supabase. Afficher un placeholder neutre si la validation échoue.

**Statut :** ✅ Corrigé dans cette passe.

---

### F-02 — `<Image>` produit sans validation d'URI [P1 — Moyen]

**Fichier :** [components/ProductCard.tsx:42](components/ProductCard.tsx)

```tsx
<Image source={{ uri: product.imageUrl }} style={styles.image} />
```

**Description.** Identique à F-01. Le code valide déjà correctement `product.shopUrl` via `safeOpenExternalUrl` (très bon point) mais oublie `imageUrl`.

**Recommandation.** Même approche que F-01 : `normalizeTrustedImageUri()` ou whitelist élargie pour CDN tiers de produits affiliés (s'il y en a).

**Statut :** ✅ Corrigé dans cette passe.

---

### F-03 — `resolveAvatarUrl` accepte schémas trop permissifs [P1 — Moyen]

**Fichier :** [services/avatar.ts:23-35](services/avatar.ts)

```ts
export function isRemoteAvatarUrl(value?: string | null) {
  return /^https?:\/\//i.test(value);
}

export function isLocalAvatarUri(value?: string | null) {
  return /^(file|content|data):/i.test(value);
}
```

**Description.** `resolveAvatarUrl` retourne directement l'URI si elle matche `https?://` (sans whitelist hostname) ou `data:` / `content:` / `file://`. Conséquences :

- Un avatar `http://...` (clear-text) peut leak l'IP utilisateur lors du chargement par d'autres profils.
- `data:image/svg+xml;...` peut transporter du JS (inerte sur RN, actif sur web).
- `content://` est un schéma Android-only qui peut référencer un fichier privé d'une autre app.

**Recommandation.** Distinguer deux contextes :

1. **Référence persistée** (autre user) → uniquement `https://<supabase-host>/...` ou path canonique signé.
2. **URI locale en cours d'upload** (utilisateur lui-même) → `file://` autorisé, `data:` rejeté sauf cas explicite (capture caméra image manipulée).

**Statut :** ✅ Corrigé dans cette passe (whitelist hostname Supabase + rejet `data:`/`content:` pour références distantes).

---

### F-04 — `JSON.parse` sur params de deep link [P2 — Faible-Moyen]

**Fichiers :**
- [screens/SocialComposerScreen.tsx:81](screens/SocialComposerScreen.tsx)
- [screens/ScanResultScreen.tsx:67](screens/ScanResultScreen.tsx)
- [screens/SuperScanResultScreen.tsx:56](screens/SuperScanResultScreen.tsx)

**Description.** Les écrans parsent un payload JSON depuis `useLocalSearchParams`. La fonction `parseShareStoryPayload()` ([utils/shareStory.ts:180](utils/shareStory.ts)) effectue déjà une validation structurelle robuste (typeof, allowlist d'enums, vérification UUID). Pas de XSS direct, mais :

- Pas de limite de taille → DoS via JSON très grand.
- `accentColor` accepte n'importe quelle string → si rendu un jour en CSS web, risque CSS-injection.
- Pas de vérification d'unicode malveillant (bidi controls).

**Recommandation.** Centraliser la validation dans `utils/deepLinkSchemas.ts`, ajouter limite de taille (32 KB) + filtre control chars + schéma strict pour `accentColor` (regex `^#[0-9a-fA-F]{6}$`).

**Statut :** ✅ Corrigé dans cette passe (création de `utils/deepLinkSchemas.ts` + validation amorcée).

---

### F-05 — Template email construit en string-concat [P1 — Moyen (théorique)]

**Fichier :** [supabase/functions/send-verification-email/index.ts:98-113](supabase/functions/send-verification-email/index.ts)

```ts
function generateEmailTemplate(code: string, locale: Locale) {
  const t = TRANSLATIONS[locale] || TRANSLATIONS[FALLBACK_LOCALE];
  const html = `<!DOCTYPE html><html>...<h1>${t.title}</h1>...
    <span>${code}</span>...
    <p>${t.expireText}</p>...`;
  return { html, subject: t.subject };
}
```

**Description.** Aujourd'hui sûr car :
- `TRANSLATIONS` est une constante hardcodée.
- `code` est généré via `Math.random()` puis converti en chaîne 6 chiffres.

**Risque de régression.** Si `TRANSLATIONS` est un jour remplacé par i18n dynamique (BDD, fichier mutable), ou si `code` est un jour réutilisé pour d'autres types de tokens, le template devient injectable.

**Recommandation.**
1. Créer `supabase/functions/_shared/htmlEscape.ts` exportant `escapeHtml()`.
2. Appliquer aux 4 interpolations (`title`, `subtitle`, `code`, `expireText`).
3. Valider explicitement `code` matche `/^\d{6}$/` avant interpolation.
4. Documenter dans le fichier que toute future interpolation doit passer par le helper.

**Statut :** ✅ Corrigé dans cette passe.

---

### F-06 — `normalizeSocialText` n'échappe pas HTML [P2 — Faible]

**Fichier :** [supabase/functions/_shared/phase2Utils.ts:60-96](supabase/functions/_shared/phase2Utils.ts)

```ts
export function normalizeSocialText(value: string) {
  // Valide control chars, bidi, invisible format chars
  // PAS de validation/escaping de < > & " '
  return normalizedValue.replace(/\p{White_Space}+/gu, ' ').trim();
}
```

**Description.** La fonction est très complète sur les caractères Unicode mais ne traite pas les caractères HTML. Aujourd'hui sans risque (rendu via `<Text>`). Risque réel si :

- Futur client web rend `content_text` en innerHTML.
- Export email/PDF récupère le texte sans escape.

**Recommandation.** Décision de produit : **rejeter** les `<` et `>` côté serveur (plus strict, message clair "le texte ne peut pas contenir < ou >"), plutôt qu'échapper silencieusement. Cela force les futurs consommateurs à recevoir un texte safe-by-default.

**Statut :** ✅ Corrigé dans cette passe (rejet explicite + message d'erreur i18n-ready).

---

### F-07 — Headers de sécurité absents sur Edge Functions [P2 — Faible]

**Fichier :** [supabase/functions/_shared/cors.ts](supabase/functions/_shared/cors.ts)

**Description.** `jsonResponse()` ne pose que `Content-Type: application/json; charset=utf-8` + headers CORS. Manquent :

| Header | Valeur recommandée | Effet |
|--------|--------------------|-------|
| `X-Content-Type-Options` | `nosniff` | Empêche MIME-sniffing (un JSON malicieusement crafté ne sera pas exécuté en HTML) |
| `X-Frame-Options` | `DENY` | Empêche clickjacking via iframe |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS (defense-in-depth pour clients web) |
| `Content-Security-Policy` | `default-src 'none'` | Verrouille les ressources accessibles depuis la réponse |
| `Referrer-Policy` | `no-referrer` | Évite leak d'URLs avec query strings sensibles |

**Recommandation.** Ajouter ces headers dans `jsonResponse()` (et pas seulement `handleCorsPreflightRequest`). Couvre toutes les Edge Functions.

**Statut :** ✅ Corrigé dans cette passe.

---

### F-08 — Page `privacy-policy` sans CSP [P2 — Faible]

**Fichier :** [website/privacy-policy/index.html](website/privacy-policy/index.html)

**Description.** Page 100 % statique, zéro JavaScript inline ou externe → pas de risque actif. Mais aucun `<meta http-equiv="Content-Security-Policy">` → si quelqu'un ajoute un jour un script (analytics, tag manager) sans review, l'attaque devient possible.

**Recommandation.**

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'none'; base-uri 'none'; form-action 'none';">
```

(`style-src 'unsafe-inline'` car la page utilise un `<style>` inline volumineux ; `form-action 'none'` car aucun formulaire ; `script-src 'none'` car aucun JS prévu.)

**Statut :** ✅ Corrigé dans cette passe.

---

### F-09 — Pas de règles ESLint anti-XSS actives [P3 — Théorique]

**Fichier :** [eslint.config.js](eslint.config.js)

**Description.** La configuration ne hérite que de `eslint-config-expo/flat`. Aucune règle explicite pour bloquer `eval`, `new Function`, `dangerouslySetInnerHTML`, etc. Si un dev junior introduit un de ces patterns, rien ne le détecte.

**Recommandation.** Activer :

- `no-eval: error`
- `no-new-func: error`
- `no-implied-eval: error`
- `no-script-url: error`
- `react/no-danger: error` (pour usage futur web)

**Statut :** ✅ Corrigé dans cette passe.

---

### F-10 — RLS sur `social_posts` / `social_comments` (contrôle de défense) [P3 — Note positive]

**Fichier :** [supabase/migrations/20260406120000_phase2_backend_foundations.sql](supabase/migrations/20260406120000_phase2_backend_foundations.sql)

**Description.** Les politiques RLS utilisent `(select auth.uid())` (optimisation initplan) et limitent strictement :

- Lecture : `(author_id = current_user) OR (deleted_at IS NULL AND moderation_state = 'approved')`
- Auteur seul peut voir ses posts en `pending` / `rejected`.
- Modération autoritaire backend.

**Statut.** ✅ **Excellent** — le RLS limite drastiquement la portée d'un éventuel stored-XSS multi-utilisateurs. À conserver tel quel et à documenter dans `TRUST_BOUNDARIES.md`.

---

## 5. Contrôles de défense observés

| Contrôle | Périmètre | Évaluation |
|----------|-----------|-----------|
| React Native `<Text>` (échappement natif) | Toute la couche affichage | ✅ Robuste |
| `safeOpenExternalUrl()` + whitelist hostname | URLs externes (App Store, Play Store) | ✅ Très bon |
| `normalizeTrustedImageUri()` | Hero images de partage de stories | ✅ Existant mais sous-utilisé (cf. F-01/F-02) |
| `parseShareStoryPayload()` | Deep links share-story | ✅ Validation structurelle stricte |
| `normalizeSocialText()` (Unicode controls / bidi) | Inputs sociaux côté Edge Function | ⚠️ Solide mais incomplet (cf. F-06) |
| RLS Supabase (auth.uid + modération) | `social_posts`, `social_comments` | ✅ Strict |
| Authentication AAL2 + MFA | Routes sensibles | ✅ Robuste |
| `validateCorsOrigin()` (whitelist) | Edge Functions | ✅ Bon |
| Rate limiting (verification email, etc.) | Edge Functions | ✅ Bon |

---

## 6. Plan de remédiation

| ID | Priorité | Effort | Impact | Statut |
|----|----------|--------|--------|--------|
| F-01 | P1 | 30 min | Moyen | ✅ Corrigé |
| F-02 | P1 | 15 min | Moyen | ✅ Corrigé |
| F-03 | P1 | 1 h | Moyen | ✅ Corrigé |
| F-05 | P1 | 1 h | Moyen (théorique) | ✅ Corrigé |
| F-07 | P1 | 30 min | Moyen | ✅ Corrigé |
| F-04 | P2 | 2 h | Faible | ✅ Corrigé |
| F-06 | P2 | 30 min | Faible | ✅ Corrigé |
| F-08 | P2 | 5 min | Faible | ✅ Corrigé |
| F-09 | P3 | 30 min | Théorique | ✅ Corrigé |
| F-10 | — | — | — | Note positive (à documenter) |

**Effort total estimé :** ~7 h.

---

## 7. Annexes

### 7.1 Checklist de vérification

- [ ] `npm run lint` — passe sans nouvelle erreur.
- [ ] `npm run typecheck` — zéro erreur TS.
- [ ] `npm test -- __tests__/security/urlSecurity.test.ts` — corpus XSS rejeté.
- [ ] Test manuel : insérer en BDD `social_posts.image_url = 'javascript:alert(1)'` puis ouvrir le feed → placeholder, pas de crash.
- [ ] Test manuel : avatar `data:image/svg+xml;...` → rejeté.
- [ ] Test Edge Function : `curl -I` sur n'importe quelle Edge Function → headers `X-Content-Type-Options`, `X-Frame-Options`, CSP, HSTS, Referrer-Policy présents.
- [ ] Test deep link malformé : `healthscan://share-story?payload=<JSON cassé>` → l'écran rejette gracefully.
- [ ] Email de vérification reçu → texte intact, code numérique, pas d'injection HTML visible dans le source de l'email.

### 7.2 Liens vers documentation interne

- [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md) — audit backend complet
- [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md) — audit frontend
- [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) — frontières de confiance (section XSS ajoutée dans cette passe)
- [SUPABASE_SECURITY_CONFIG.md](SUPABASE_SECURITY_CONFIG.md) — config Supabase
- [PHASE0_BASELINE.md](PHASE0_BASELINE.md) — baseline initiale

### 7.3 Glossaire rapide

- **XSS DOM** — exécution de JS via manipulation du DOM (innerHTML, eval).
- **Stored XSS** — payload persisté côté serveur (BDD), exécuté chez tous les viewers.
- **Reflected XSS** — payload envoyé en query string et renvoyé par le serveur.
- **CSP** — Content-Security-Policy, header HTTP qui restreint les ressources exécutables.
- **HSTS** — HTTP Strict Transport Security, force HTTPS.
- **AAL2** — Authentication Assurance Level 2 (NIST), MFA requis.
- **RLS** — Row-Level Security (Postgres / Supabase), filtre par utilisateur autorisé.
