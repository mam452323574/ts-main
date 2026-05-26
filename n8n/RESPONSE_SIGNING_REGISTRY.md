# n8n — Registre du response signing (S-01)

Source de vérité pour le statut de la **signature HMAC sortante n8n** pour chaque workflow appelé via `postWebhookJson`. Indispensable avant tout flip `PHASE2_WEBHOOK_AUTH_MODE=*hmac*`.

**Procédure d'ajout** (voir [WEBHOOK_RESPONSE_SIGNING.md](WEBHOOK_RESPONSE_SIGNING.md) §"Workflow snippet n8n") :
1. Insérer le Function node `sign-webhook-response` AVANT `Respond to Webhook`.
2. Activer `Response Headers → Define Below → Use headers from previous node`.
3. Vérifier que `SOCIAL_WEBHOOK_RESPONSE_HMAC_SECRET` (ou `N8N_RESPONSE_HMAC_SECRET`) est set côté n8n.
4. Smoke test avec `sh scripts/check-n8n-response-signing.sh <URL>` (exit 0).
5. Mettre à jour la ligne ci-dessous (dates + owner).

**Source code des callers** : `grep -n 'postWebhookJson(' supabase/functions/**/*.ts` ou exécuter `sh scripts/list-webhook-callers.sh`.

---

## Registre

| # | Edge Function caller | Fichier source | Workflow n8n (URL/id) | Function node ajouté | Smoke test passé | Owner | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `analyze-scan` | [analyze-scan/index.ts:599](../supabase/functions/analyze-scan/index.ts) | `https://n8n.basedjew.com/webhook/analyse_1` | Oui | En cours | @antigravity | Clé HMAC manquante côté n8n |
| 2 | `social-report-content` | [social-report-content/index.ts:175](../supabase/functions/social-report-content/index.ts) | `reportWebhookUrl` (env) | En cours | En cours | @antigravity | |
| 3 | `coach-generate-response` | [_shared/coachProvider.ts:126](../supabase/functions/_shared/coachProvider.ts) | `https://n8n.basedjew.com/webhook/coach` | Oui | En cours | @antigravity | `maxResponseBytes` enforced |
| 4 | `coach-send-message` | [_shared/coachConversationProvider.ts:115](../supabase/functions/_shared/coachConversationProvider.ts) | `https://n8n.basedjew.com/webhook/coach-conversation` | Oui | En cours | @antigravity | |
| 5 | `analyze-fridge` (fridge scan) | [_shared/fridgeScanWebhook.ts:156](../supabase/functions/_shared/fridgeScanWebhook.ts) | `https://n8n.basedjew.com/webhook/frigo` | Oui | En cours | @antigravity | |

Format des dates : `YYYY-MM-DD`. Owner : pseudo / @user / équipe.

---

## Comment ajouter un nouveau caller

Si tu introduis un nouvel appel à `postWebhookJson(` dans `supabase/functions/`, AVANT le merge :

1. Ajouter une ligne dans le tableau ci-dessus (laisser les colonnes statut vides si non encore configuré).
2. Ouvrir une issue / TODO "Configurer signing n8n pour <ton workflow>" et la résoudre AVANT que `PHASE2_WEBHOOK_AUTH_MODE=hmac` soit actif en prod, OU passer `verifyResponseSignature: false` explicitement à l'appel et documenter le pourquoi.
3. Le pre-commit `sh scripts/list-webhook-callers.sh` doit exit 0 (sinon il refuse le commit).

## Suivi des changements

| Date | Caller | Changement | Auteur |
|------|--------|------------|--------|
| 2026-05-19 | tous | Création du registre suite à l'incident `webhook_response_unsigned` sur `analyze-scan` | (à signer) |
