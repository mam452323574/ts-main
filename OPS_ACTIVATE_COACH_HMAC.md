# OPS — Activation HMAC sur les webhooks coach (CO-08 / C-04)

**Statut :** ⏳ pendant ops depuis 2026-04-26 (≈4 semaines).
**Référence audit :** [SCANNER_COACH_AUDIT_2026_05.md §6 CO-08](SCANNER_COACH_AUDIT_2026_05.md), [COACH_SECURITY_AUDIT_2026_05.md C-04](COACH_SECURITY_AUDIT_2026_05.md), [COACH_SECURITY_AUDIT.md C-04](COACH_SECURITY_AUDIT.md).
**Effort estimé :** 2 h ops + 1 h n8n + 30 min validation = ~3.5 h.

## Contexte

Le code HMAC outbound côté Edge Functions est **prêt** ([phase2Webhook.ts:46-105](supabase/functions/_shared/phase2Webhook.ts:46)). La fonction `buildPhase2WebhookHeaders` ajoute déjà les headers `x-webhook-timestamp` + `x-webhook-signature` sur chaque requête sortante **si** `PHASE2_WEBHOOK_AUTH_MODE` inclut `hmac` ET `PHASE2_WEBHOOK_HMAC_SECRET` est défini.

**Côté n8n** : les deux workflows coach ([n8n/workflows/coach.json](n8n/workflows/coach.json), [n8n/workflows/coach-conversation.json](n8n/workflows/coach-conversation.json)) acceptent actuellement le webhook **sans vérification de signature** (`grep -i hmac coach.json` → 0 résultat). Toute requête atteignant l'URL webhook avec le bearer token correct est traitée — vol du bearer = full takeover du workflow LLM coach.

L'activation HMAC ferme cette surface et constitue la **dernière barrière critique** avant que tous les findings P0/P1 coach soient effectivement clos.

## Procédure d'activation

### Étape 1 — Générer le secret HMAC (poste de dev)

```bash
# 32 bytes hex = 256 bits d'entropie cryptographique
openssl rand -hex 32
# Exemple : a1b2c3d4...8090
```

Sauvegarder ce secret dans le gestionnaire de mots de passe d'équipe (1Password / Bitwarden / etc.). Il devra être identique des deux côtés (Supabase + n8n).

### Étape 2 — Configurer les secrets Supabase (Edge Functions)

```bash
# Depuis le poste de l'opérateur, après `supabase login`
supabase secrets set PHASE2_WEBHOOK_AUTH_MODE=bearer+hmac
supabase secrets set PHASE2_WEBHOOK_HMAC_SECRET=<secret-généré-étape-1>

# Vérifier
supabase secrets list | grep PHASE2_WEBHOOK
# Doit afficher PHASE2_WEBHOOK_AUTH_MODE et PHASE2_WEBHOOK_HMAC_SECRET
```

### Étape 3 — Configurer la variable HMAC côté n8n

```bash
# Dans n8n/.env (ou via le mécanisme de secrets du déploiement n8n prod)
PHASE2_WEBHOOK_HMAC_SECRET=<secret-identique-étape-2>

# Si n8n est en docker-compose, restart pour propager
docker compose -f n8n/docker-compose.yml restart n8n
```

Le fichier [n8n/docker-compose.override.yml](n8n/docker-compose.override.yml) ligne 5 propage déjà cette variable au container :
```yaml
PHASE2_WEBHOOK_HMAC_SECRET: ${PHASE2_WEBHOOK_HMAC_SECRET:?Set PHASE2_WEBHOOK_HMAC_SECRET in your n8n .env}
```

### Étape 4 — Ajouter un nœud "Verify HMAC" dans chaque workflow n8n

Dans **chaque** workflow (`coach.json`, `coach-conversation.json`, et tout autre workflow consommant un webhook signé), insérer un nœud **Code** (JavaScript) **immédiatement après** le nœud Webhook d'entrée, **avant** tout traitement métier.

**Code JavaScript du nœud "Verify HMAC"** (à copier-coller dans n8n) :

```javascript
const crypto = require('crypto');

const TOLERANCE_MS = 5 * 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';

const headers = $input.first().json.headers ?? {};
const rawBody = $input.first().json.body
  ? JSON.stringify($input.first().json.body)
  : '';

const timestamp = headers['x-webhook-timestamp'];
const signature = headers['x-webhook-signature'];
const secret = $env.PHASE2_WEBHOOK_HMAC_SECRET;

if (!secret) {
  throw new Error('PHASE2_WEBHOOK_HMAC_SECRET missing on n8n side');
}
if (!timestamp || !signature) {
  throw new Error('Webhook missing x-webhook-timestamp or x-webhook-signature');
}

// Anti-replay : timestamp dans une fenêtre de 5 min
const tsDate = new Date(timestamp);
if (Number.isNaN(tsDate.getTime())) {
  throw new Error('Invalid x-webhook-timestamp format');
}
const drift = Math.abs(Date.now() - tsDate.getTime());
if (drift > TOLERANCE_MS) {
  throw new Error(`Webhook timestamp drift ${drift}ms exceeds tolerance`);
}

// Recalcul de la signature : HMAC-SHA256("<timestamp>.<rawBody>", secret)
const expected = SIGNATURE_PREFIX + crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

// Comparaison constant-time pour éviter le timing attack
const expectedBuf = Buffer.from(expected);
const signatureBuf = Buffer.from(signature);
if (
  expectedBuf.length !== signatureBuf.length ||
  !crypto.timingSafeEqual(expectedBuf, signatureBuf)
) {
  throw new Error('Webhook signature mismatch');
}

// OK — propager le payload original
return $input.all();
```

**Configuration du nœud :**
- Type : `Code`
- Mode : `Run Once for All Items`
- Language : `JavaScript`
- Output : remplace l'item d'entrée par `return $input.all()` après check

### Étape 5 — Signer aussi la RÉPONSE côté n8n (optionnel mais recommandé)

Le code Edge ([phase2Webhook.ts:112-180](supabase/functions/_shared/phase2Webhook.ts:112)) vérifie déjà `verifyPhase2WebhookResponseSignature` sur les headers `x-webhook-response-timestamp` + `x-webhook-response-signature` retournés par n8n. Si l'option `verifyResponseSignature=true` est passée par le caller (utilisée pour fridge-scan-complete déjà), n8n doit signer sa réponse.

**Code JavaScript du nœud "Sign Response"** (à placer juste avant le nœud "Respond to Webhook") :

```javascript
const crypto = require('crypto');

const SIGNATURE_PREFIX = 'sha256=';
const secret = $env.PHASE2_WEBHOOK_HMAC_SECRET;

const timestamp = new Date().toISOString();
const rawBody = JSON.stringify($input.first().json);

const signature = SIGNATURE_PREFIX + crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

return [{
  json: $input.first().json,
  // n8n "Respond to Webhook" lit `headers` pour les ajouter à la réponse HTTP
  headers: {
    'x-webhook-response-timestamp': timestamp,
    'x-webhook-response-signature': signature,
  },
}];
```

Puis dans le nœud "Respond to Webhook" : activer "Response Headers" → "From Source Data" → champ `headers`.

### Étape 6 — Déployer

```bash
# Déployer les Edge Functions affectées (rien à modifier dans le code, juste
# pour qu'elles relisent les nouveaux secrets)
supabase functions deploy coach-generate-response
supabase functions deploy coach-conversation-send
supabase functions deploy fridge-scan-submit
# (toute fonction utilisant phase2Webhook.ts)
```

Côté n8n : importer les workflows modifiés via l'UI ou l'API n8n. Activer chaque workflow.

### Étape 7 — Validation

```bash
# 1. Sans HMAC — doit échouer (test négatif)
curl -X POST "$N8N_COACH_WEBHOOK_URL" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -d '{"payload":{}}'
# → Attendu : erreur n8n "Webhook missing x-webhook-timestamp or x-webhook-signature"

# 2. Avec HMAC invalide — doit échouer
TS="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
curl -X POST "$N8N_COACH_WEBHOOK_URL" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -H "x-webhook-timestamp: $TS" \
  -H "x-webhook-signature: sha256=baadbeef" \
  -d '{"payload":{}}'
# → Attendu : erreur n8n "Webhook signature mismatch"

# 3. Via l'app (test end-to-end) — doit réussir
# Déclencher un appel coach depuis l'app mobile.
# Vérifier supabase logs coach-generate-response → status 200.
# Vérifier n8n execution log → "Verify HMAC" node green.
```

### Étape 8 — Mettre à jour les statuts

Une fois validé en prod :

1. Éditer [COACH_SECURITY_AUDIT.md](COACH_SECURITY_AUDIT.md) ligne 33 — C-04 statut `⏳ Config ops` → `✅ Activé YYYY-MM-DD`.
2. Éditer [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md) ligne 31 — C-04 idem.
3. Éditer [SCANNER_COACH_AUDIT_2026_05.md](SCANNER_COACH_AUDIT_2026_05.md) §3.2 ligne C-04 + §6 CO-08 — passer de ⏳ à ✅.
4. Sauvegarder le secret dans le gestionnaire d'équipe avec un tag `rotate-by:YYYY-MM-DD+12mo`.

## Rotation du secret HMAC

Le secret doit être tourné **annuellement** (ou immédiatement si compromission suspectée).

**Procédure de rotation sans interruption :**

1. Générer nouveau secret `SECRET_NEW`.
2. Modifier le nœud "Verify HMAC" côté n8n pour accepter `SECRET_OLD` OU `SECRET_NEW` pendant la fenêtre de transition (logique OR sur 2 comparaisons HMAC).
3. Déployer côté n8n.
4. `supabase secrets set PHASE2_WEBHOOK_HMAC_SECRET=$SECRET_NEW` côté Supabase.
5. Redéployer les Edge Functions.
6. Attendre 1 h (toutes les requêtes en vol terminées).
7. Retirer `SECRET_OLD` du nœud n8n. Déployer.

## Rollback (si le HMAC casse en prod)

```bash
# Si une régression côté n8n bloque les appels coach légitimes, désactiver
# immédiatement le check pour rétablir le service :
supabase secrets set PHASE2_WEBHOOK_AUTH_MODE=bearer
supabase functions deploy coach-generate-response coach-conversation-send
# Les Edge Functions arrêtent d'envoyer la signature → n8n n'attend plus la valider
# (à condition que le nœud n8n "Verify HMAC" soit conditionnel — sinon il
# rejettera quand même les requêtes sans signature).
```

**Mieux** : avant le go-live, déployer le nœud n8n en mode "log-only" (loggue les mismatches mais ne rejette pas). Observer 24h. Puis basculer en mode strict.

## Dépendances et risques

- **Bloquant** : `PHASE2_WEBHOOK_HMAC_SECRET` doit être strictement identique des deux côtés (sensibilité de comparaison constant-time).
- **Bloquant** : drift d'horloge système entre Supabase Edge runtime et n8n doit rester < 5 min (NTP requis sur les deux). Si dérive > 5 min, le check rejette des requêtes légitimes.
- **Non-bloquant** : le secret peut être différent par environnement (dev / staging / prod) — recommandé.

## Liens

- Code Edge HMAC outbound : [supabase/functions/_shared/phase2Webhook.ts:46-105](supabase/functions/_shared/phase2Webhook.ts:46)
- Code Edge HMAC vérification réponse : [supabase/functions/_shared/phase2Webhook.ts:112-180](supabase/functions/_shared/phase2Webhook.ts:112)
- Validation config : [supabase/functions/_shared/phase2Env.ts:78-150](supabase/functions/_shared/phase2Env.ts:78)
- Workflow coach n8n : [n8n/workflows/coach.json](n8n/workflows/coach.json)
- Workflow coach-conversation n8n : [n8n/workflows/coach-conversation.json](n8n/workflows/coach-conversation.json)
- Documentation déploiement n8n : [n8n/README.md](n8n/README.md)
- Variables env n8n template : [n8n/.env.example](n8n/.env.example)
