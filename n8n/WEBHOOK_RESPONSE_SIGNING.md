# n8n — Configuration de la signature des réponses webhook (S-01)

> **Audit source :** [SOCIAL_SECURITY_AUDIT.md](../SOCIAL_SECURITY_AUDIT.md) §S-01.
> **À configurer avant** de retirer `WEBHOOK_VERIFY_RESPONSE=false` côté Supabase.
> **Workflows concernés :** **TOUS** les callers de `postWebhookJson` dans `supabase/functions/` quand `PHASE2_WEBHOOK_AUTH_MODE` contient `hmac`. Source de vérité : [RESPONSE_SIGNING_REGISTRY.md](RESPONSE_SIGNING_REGISTRY.md). Au 2026-05-19, ce sont :
> - `analyze-scan` (scan health/pro) — pool `N8N_SCAN_ANALYZE_WEBHOOK_URLS`
> - `social-report-content` — endpoint report
> - `coach-generate-response`
> - `coach-send-message` (coach conversation)
> - `analyze-fridge` (fridge scan)
>
> **Avant tout flip `PHASE2_WEBHOOK_AUTH_MODE=*hmac*` :** exécuter `sh scripts/check-n8n-response-signing.sh` sur les 5 URLs (exit 0 obligatoire) — sinon HTTP 502 `webhook_response_unsigned` immédiat sur le flow concerné.

---

## Pourquoi

Sans signature de réponse, un MITM (ou n8n compromis, ou DNS rebind) peut renvoyer `{"workflow_status":"dismissed"}` et bypass la modération sociale. Voir le scénario d'exploitation S-01.

**Side de Supabase Edge Function** : déjà déployé. `verifyPhase2WebhookResponseSignature` dans `phase2Webhook.ts` vérifie le HMAC sur la réponse. Active par défaut quand `PHASE2_WEBHOOK_AUTH_MODE` inclut `hmac`. Kill-switch : `WEBHOOK_VERIFY_RESPONSE=false` (à utiliser temporairement pendant la migration n8n).

**Side de n8n** : il faut signer chaque réponse avec le même secret HMAC partagé.

---

## Headers attendus sur la réponse n8n

| Header | Valeur | Notes |
|--------|--------|-------|
| `X-Webhook-Response-Timestamp` | ISO 8601 UTC | Tolérance 5min côté Edge Function |
| `X-Webhook-Response-Signature` | `sha256=<hex_hmac>` | HMAC-SHA256 sur `<timestamp>.<rawBody>` |

`<rawBody>` = le body brut JSON de la réponse, **identique caractère par caractère** à ce que le client reçoit. Pas de re-stringification après signing.

---

## Secret HMAC à configurer

Définir dans n8n (Credentials → Header Auth ou Variables) :

- **Nom :** `SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET` (ou réutiliser le secret outbound `PHASE2_WEBHOOK_HMAC_SECRET`)
- **Valeur :** **identique** à `N8N_RESPONSE_HMAC_SECRET` côté Supabase (ou `PHASE2_WEBHOOK_HMAC_SECRET` si on réutilise le même).

> Si vous réutilisez `PHASE2_WEBHOOK_HMAC_SECRET` pour les deux sens (entrant + sortant), c'est OK — le `phase2Webhook.ts` a un fallback `N8N_RESPONSE_HMAC_SECRET ?? authConfig.hmacSecret` qui couvre ce cas.

---

## Workflow snippet n8n

Ajouter un nœud **Function** juste avant le **Respond to Webhook** final :

```javascript
// n8n Function node — sign-webhook-response
// Input: items[0].json = body to send back
// Output: items[0].json (unchanged) + items[0].headers with signature

const crypto = require('crypto');

const secret = $env.SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET;
if (!secret) {
  throw new Error('SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET not configured');
}

// IMPORTANT : meme stringification que ce qu'on enverra. Ne PAS modifier
// le body entre le sign et le respond.
const rawBody = JSON.stringify($input.first().json);
const timestamp = new Date().toISOString();
const payload = `${timestamp}.${rawBody}`;
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

return [{
  json: $input.first().json,
  binary: $input.first().binary,
  // n8n passe les headers via la propriete `headers` sur l'item.
  headers: {
    'X-Webhook-Response-Timestamp': timestamp,
    'X-Webhook-Response-Signature': sig,
    'Content-Type': 'application/json; charset=utf-8',
  },
}];
```

Le nœud **Respond to Webhook** suivant doit avoir l'option **"Response Headers"** réglée sur **"Define Below"** et coché **"Use headers from previous node"** (ou équivalent selon la version n8n).

---

## Test rapide — simulation côté CLI

Pour vérifier ta config n8n en local avant de pousser :

```bash
# Bash / WSL
SECRET="ton-secret-shared"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
RAW_BODY='{"workflow_status":"reviewing","moderation_provider":"n8n"}'
SIG=$(printf '%s.%s' "$TIMESTAMP" "$RAW_BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -i -X POST https://<projet>.supabase.co/functions/v1/social-report-content \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"target_type":"post","target_post_id":"<uuid>","reason_code":"spam_repeat"}'
```

Côté n8n stub : configurer une réponse statique avec les bons headers et le rawBody ci-dessus. Si tout est OK, l'Edge Function accepte la réponse. Si la signature ne matche pas : `502 webhook_response_invalid_signature`.

```powershell
# PowerShell équivalent
$secret = 'ton-secret-shared'
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$rawBody = '{"workflow_status":"reviewing","moderation_provider":"n8n"}'
$payload = "$timestamp.$rawBody"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
$sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
$sig = 'sha256=' + ([BitConverter]::ToString($sigBytes).Replace('-', '').ToLowerInvariant())
Write-Output "X-Webhook-Response-Timestamp: $timestamp"
Write-Output "X-Webhook-Response-Signature: $sig"
```

---

## Rollout recommandé (pas d'incident en prod)

1. **Code Supabase déjà déployé** avec `WEBHOOK_VERIFY_RESPONSE=false` (kill-switch ON) → comportement actuel inchangé, aucune réponse webhook vérifiée.
2. **Configurer chaque workflow n8n** (Function node + sign + headers) — peut être fait progressivement.
3. **Smoke test staging** : 1 seul workflow signé, `WEBHOOK_VERIFY_RESPONSE=true` sur staging uniquement → vérifier que le webhook accepte la signature.
4. **Une fois tous les workflows n8n configurés** : retirer `WEBHOOK_VERIFY_RESPONSE` de l'env prod (default = check activé quand HMAC outbound est on).
5. **Surveiller `webhook_response_unsigned` / `webhook_response_invalid_signature`** dans les logs Edge Function la première semaine.

---

## Annexe — Vérif que le pattern HMAC matche bien

Edge Function : [phase2Webhook.ts:createPhase2WebhookSignature](../supabase/functions/_shared/phase2Webhook.ts) :

```ts
// Outbound (Supabase → n8n) ET Inbound (n8n → Supabase) utilisent la même fonction.
async function createPhase2WebhookSignature(timestamp, rawBody, secret) {
  // HMAC-SHA256 sur `${timestamp}.${rawBody}`, retourne `sha256=<hex>`
}
```

Vérification : [phase2Webhook.ts:verifyPhase2WebhookResponseSignature](../supabase/functions/_shared/phase2Webhook.ts) appelle `createPhase2WebhookSignature` avec le timestamp du header + le rawText reçu, et `timingSafeEqual` compare avec le header `X-Webhook-Response-Signature`.

Donc côté n8n : signer exactement `<timestamp>.<rawBody>` (séparateur littéral `.`), HMAC-SHA256, hex lowercase, prefix `sha256=`.
