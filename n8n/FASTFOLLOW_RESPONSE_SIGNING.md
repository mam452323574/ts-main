# Fast-follow — Activer la vérification des réponses webhooks n8n

> **Décision de lancement (2026-05-29)** : on lance avec la vérification des réponses **désactivée** (`WEBHOOK_VERIFY_RESPONSE=false`), puis on l'active une fois n8n confirmé. Contexte complet : [WEBHOOK_RESPONSE_SIGNING.md](WEBHOOK_RESPONSE_SIGNING.md) · registre : [RESPONSE_SIGNING_REGISTRY.md](RESPONSE_SIGNING_REGISTRY.md).
>
> **État vérifié (2026-05-29)** : les 5 workflows ont déjà leur nœud de signature (`Sign Webhook Response (...)` pour coach/coach-conversation/analyse_1/SUPERSCAN ; `Build signed callback` pour fridge-scan-chef). La prep côté JSON est faite — il reste l'import live + le secret + le smoke-test.

## 1. Au lancement (secret Supabase)
- Poser dans les secrets Edge Function (prod) : `WEBHOOK_VERIFY_RESPONSE=false` → plus aucun `502 webhook_response_unsigned`, l'app fonctionne.
- Les requêtes **sortantes** restent signées (`PHASE2_WEBHOOK_AUTH_MODE=hmac`) → webhooks protégés en émission.

## 2. Fast-follow (accès n8n live requis)
1. Importer les 5 `n8n/workflows/*.json` dans n8n.
2. Poser dans n8n : `SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET` (ou réutiliser `COACH_WEBHOOK_HMAC_SECRET`) = **même valeur** que `N8N_RESPONSE_HMAC_SECRET` / `PHASE2_WEBHOOK_HMAC_SECRET` côté Supabase.
3. Sur chaque « Respond to Webhook » : utiliser les headers du nœud de signature précédent.

## 3. Pré-flight — exit 0 obligatoire
```bash
# Secrets Supabase alignés avec le mode hmac
sh scripts/check-webhook-secrets.sh hmac <project-ref>

# Réponses n8n bien signées (4 URLs connues + l'URL de N8N_SOCIAL_REPORT_WEBHOOK_URL)
sh scripts/check-n8n-response-signing.sh \
  https://n8n.basedjew.com/webhook/analyse_1 \
  https://n8n.basedjew.com/webhook/coach \
  https://n8n.basedjew.com/webhook/coach-conversation \
  https://n8n.basedjew.com/webhook/frigo \
  "$N8N_SOCIAL_REPORT_WEBHOOK_URL"
```

## 4. Activer la vérification
- **Retirer** `WEBHOOK_VERIFY_RESPONSE` des secrets prod (le défaut réactive la vérification quand le HMAC sortant est actif).
- Surveiller les logs Edge Function : `webhook_response_unsigned`, `webhook_response_invalid_signature` (la première semaine).
