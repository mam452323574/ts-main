# Coach audit 2026-05 — ops runbook

Compagnon opérationnel de [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md). Toutes les étapes côté code sont déjà appliquées dans ce PR ; ce runbook trace ce qu'il reste à exécuter côté ops (Supabase + n8n) après merge.

**TL;DR :** 5 étapes, ~30 min de travail actif + 24 h de fenêtre d'observation pour le HMAC.

---

## Pré-requis

- Accès Supabase CLI authentifié sur le projet prod (`supabase login`).
- Accès admin n8n (UI ou env vars, selon ton déploiement).
- `psql` ou Supabase SQL Editor pour les requêtes Phase A.
- Le secret HMAC pré-généré local dans `secrets/coach_webhook_hmac.txt` (gitignored). Si tu préfères en regénérer un toi-même : `openssl rand -hex 32`.

---

## Étape 1 — Phase A : pré-vérification SQL (read-only)

But : confirmer que les CHECK constraints qui vont être ajoutées (C-09 disclaimer ≤ 1000 chars, N-F metadata ≤ 4 KB) ne violent aucune row existante, et mesurer la volumétrie du backfill C-05.

```bash
# Option A — via Supabase CLI sur le projet linké
supabase db remote sql --linked --file scripts/coach_audit_phase_a_preflight.sql

# Option B — via psql direct
psql "$DATABASE_URL" -f scripts/coach_audit_phase_a_preflight.sql
```

**Critères de passage (lis les NOTICE en sortie) :**
- `rows_over_1000_chars` = 0 → C-09 safe.
- Les 3 lignes `metadata.rows_over_cap` = 0 → N-F safe.
- `authenticated` n'a aucun GRANT INSERT/UPDATE/DELETE sur `coach_entries` → C-06 no-op.
- `rows_with_prompt_type_to_backfill` = volumétrie attendue (informatif).

**Si une violation est détectée :** bumper le seuil dans la migration correspondante AVANT de l'appliquer (ex. `<= 1000` → `<= 2000` pour `coach_entries.disclaimer`).

## Étape 2 — Appliquer les migrations

```bash
# Lance toutes les migrations 2026-05-20-18:00 → 18:06 dans l'ordre
supabase db push

# Sanity check : confirme que les 7 migrations sont marquées appliquées
supabase migration list --linked | grep "20260520180"
```

Les 7 migrations sont **idempotentes** (toutes commencent par `DROP CONSTRAINT IF EXISTS` ou `CREATE OR REPLACE`). Re-runnable sans danger.

## Étape 2.5 — Pré-vol response signing n8n (S-01 inbound)

But : confirmer que **TOUS** les workflows n8n appelés par les Edge Functions signent leur réponse AVANT de flipper `PHASE2_WEBHOOK_AUTH_MODE=*hmac*`. Sans ça, la vérification HMAC inbound activée par défaut au flip rejette chaque réponse avec HTTP 502 `webhook_response_unsigned` (incident 2026-05-19 sur `analyze-scan`, cf. [n8n/RESPONSE_SIGNING_REGISTRY.md](n8n/RESPONSE_SIGNING_REGISTRY.md)).

### 2.5a — Couverture du registre (statique, repo)

```bash
sh scripts/list-webhook-callers.sh
# exit 0 obligatoire. Si exit 1 → ajouter les lignes manquantes dans
# n8n/RESPONSE_SIGNING_REGISTRY.md avant de continuer.
```

### 2.5b — Statut par workflow (manuel, registre)

Ouvrir [n8n/RESPONSE_SIGNING_REGISTRY.md](n8n/RESPONSE_SIGNING_REGISTRY.md). Pour CHAQUE caller listé, vérifier que les colonnes **"Function node ajouté"** et **"Smoke test passé"** sont remplies (date + owner). Sinon : configurer le node de signing avec le template de [n8n/WEBHOOK_RESPONSE_SIGNING.md](n8n/WEBHOOK_RESPONSE_SIGNING.md) §"Workflow snippet n8n".

### 2.5c — Smoke test inbound (live, n8n)

```bash
# Recuperer le secret HMAC partage (Supabase). Puis ping chaque URL n8n.
PHASE2_WEBHOOK_HMAC_SECRET=$(tail -n 1 secrets/coach_webhook_hmac.txt) \
  sh scripts/check-n8n-response-signing.sh \
    https://n8n.example/webhook/scan-analyze \
    https://n8n.example/webhook/social-report-content \
    https://n8n.example/webhook/coach-generate \
    https://n8n.example/webhook/coach-send-message \
    https://n8n.example/webhook/fridge-scan
# exit 0 obligatoire sur les 5 URLs (0 FAIL).
```

> Pré-requis n8n : chaque workflow doit idéalement avoir un IF-node "smoke shortcut" en tête détectant `payload._smoke_test==='check_signing_*'` et répondant `{ok:true,smoke:true}` sans déclencher le reste du workflow. Sans ça, le smoke peut écrire en DB / appeler l'LLM. Documenter le coût par workflow dans le registre.

### 2.5d — Plan B si au moins un workflow n'est pas signé

```bash
# Activer le kill-switch global EN MEME TEMPS (ou AVANT) le flip outbound :
supabase secrets set WEBHOOK_VERIFY_RESPONSE=false --project-ref <your-project-ref>
# Puis ouvrir un ticket de tracking obligatoire : retirer ce flag dès que les
# workflows manquants sont signés. Limite max recommandée : 72 h en mode
# kill-switch (S-01 = surface MITM/DNS-rebind ré-ouverte).
```

**À ne PAS faire** : flipper outbound sans 2.5a/b/c green ET sans kill-switch posé. C'est exactement le scénario qui a produit l'incident `webhook_response_unsigned` du 2026-05-19 sur `analyze-scan` (cf. [n8n/RESPONSE_SIGNING_REGISTRY.md](n8n/RESPONSE_SIGNING_REGISTRY.md) §"Suivi des changements").

## Étape 3 — HMAC : déployer en dual-mode (Edge + n8n)

### 3a — Supabase Edge Function secrets

```bash
# Récupère le secret généré localement (gitignored)
SECRET=$(tail -n 1 secrets/coach_webhook_hmac.txt)

supabase secrets set PHASE2_WEBHOOK_HMAC_SECRET="$SECRET" --project-ref <your-project-ref>

# Pre-flight : confirmer que le secret HMAC est bien remonté côté Supabase
# avant de flipper le mode (évite la régression 2026-05-19, cf.
# OPS_ACTIVATE_COACH_HMAC.md Étape 2).
sh scripts/check-webhook-secrets.sh hmac <your-project-ref> || exit 1

supabase secrets set PHASE2_WEBHOOK_AUTH_MODE=hmac --project-ref <your-project-ref>

# Re-deploy les Edge Functions qui appellent les webhooks coach (pour qu'elles
# voient les nouveaux secrets) :
supabase functions deploy coach-generate-response --project-ref <your-project-ref>
supabase functions deploy coach-send-message --project-ref <your-project-ref>
```

### 3b — n8n env vars (dual-mode)

```bash
# Mirror le même secret côté n8n. Mode dual = log seulement, pas de rejet.
# Dans ton fichier .env ou docker-compose ou Render/Railway/etc :
COACH_WEBHOOK_HMAC_SECRET=<paste from secrets/coach_webhook_hmac.txt>
COACH_WEBHOOK_HMAC_ENFORCE=false       # ← LAISSE FALSE pour 24h
```

Redémarre n8n pour prendre en compte les env vars. Le nœud `Verify Coach Webhook HMAC` (déjà importé dans `coach.json` + `coach-conversation.json`) est actif et log les warnings dans `console.warn`.

### 3c — Observer 24 h

Pendant 24 h, surveille les logs n8n :

```bash
# Si tu tournes n8n via Docker
docker logs n8n 2>&1 | grep "\[coach-webhook-hmac\]"

# Si tu tournes n8n sur Railway/Render/Heroku, utilise leur UI logs +
# filtre sur la string "[coach-webhook-hmac]"
```

**Critère de passage à enforce :** zéro occurrence de `[coach-webhook-hmac]` sur 24 h consécutives.

Si tu vois des warnings :
- `coach_webhook_signature_missing` → l'Edge Function n'envoie pas les headers. Vérifie `PHASE2_WEBHOOK_AUTH_MODE` côté Supabase.
- `coach_webhook_signature_invalid` → désynchro de secret. Vérifie que `PHASE2_WEBHOOK_HMAC_SECRET` (Supabase) === `COACH_WEBHOOK_HMAC_SECRET` (n8n).
- `coach_webhook_timestamp_out_of_skew` → clock skew > 5 min entre Supabase et n8n. Vérifie NTP des deux côtés.

## Étape 4 — Flipper enforce après 24 h propres

```bash
# Une fois la fenêtre d'observation OK, bascule n8n en strict :
COACH_WEBHOOK_HMAC_ENFORCE=true

# Redémarre n8n.
```

À partir de là, toute requête sans signature ou avec signature invalide est rejetée par n8n avec une `Error: coach_webhook_signature_*`. Surveille la cohérence des `error_code` dans `coach_entries` les premières 48 h.

**Rollback urgent :** repasse `COACH_WEBHOOK_HMAC_ENFORCE=false` côté n8n → retour immédiat en dual-mode logging.

## Étape 5 — n8n logging hygiene (N-E)

Une seule fois, configure n8n pour limiter la rétention des executions (PII) :

```bash
# Env vars n8n :
N8N_LOG_LEVEL=warn
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=72                # heures
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
```

Redémarre n8n. Détails dans [SUPABASE_SECURITY_CONFIG.md](SUPABASE_SECURITY_CONFIG.md) section "n8n logging hygiene (N-E)".

---

## Vérification finale post-rollout

```bash
# 1. Health-check les fonctions Edge
curl -i -X POST \
  https://<your-project>.supabase.co/functions/v1/coach-quota-status \
  -H "Authorization: Bearer <a valid user JWT>"
# → 200 expected

# 2. Test du rate limit snapshot (N-D)
for i in {1..35}; do
  curl -s -X POST https://<your-project>.supabase.co/functions/v1/coach-screen-snapshot \
    -H "Authorization: Bearer <jwt>" -d '{}' | jq '.code // empty'
done
# → la 31e doit retourner "coach_snapshot_rate_limit_exceeded"

# 3. Test du rate limit profile-sync (N-C)
for i in {1..15}; do
  curl -s -X POST https://<your-project>.supabase.co/functions/v1/coach-sync-profile-memory \
    -H "Authorization: Bearer <jwt>" -d '{}' | jq '.code // empty'
done
# → la 11e doit retourner "coach_profile_sync_rate_limit_exceeded"

# 4. SQL spot-check sur le backfill C-05
psql "$DATABASE_URL" -c "
  SELECT
    COUNT(*) FILTER (WHERE prompt_type IS NULL) AS still_null,
    COUNT(*) AS total
  FROM public.coach_entries
  WHERE request_payload_json ? 'prompt_type';
"
# → still_null doit être 0 (ou très petit, restant celui qui avait un prompt_type hors whitelist)
```

---

## Checklist finale

- [ ] Étape 1 — Phase A SQL exécutée, tous les seuils OK.
- [ ] Étape 2 — 7 migrations 2026-05-20-18:00 appliquées en prod.
- [ ] Étape 2.5a — `sh scripts/list-webhook-callers.sh` exit 0 (tous les callers dans le registre).
- [ ] Étape 2.5b — `n8n/RESPONSE_SIGNING_REGISTRY.md` : colonnes "Function node ajouté" + "Smoke test passé" remplies pour chaque caller.
- [ ] Étape 2.5c — `sh scripts/check-n8n-response-signing.sh` exit 0 sur les 5 URLs (OU kill-switch `WEBHOOK_VERIFY_RESPONSE=false` posé avec ticket de retrait < 72 h).
- [ ] Étape 3a — `PHASE2_WEBHOOK_HMAC_SECRET` set, pre-flight `sh scripts/check-webhook-secrets.sh hmac <ref>` exit 0, puis `PHASE2_WEBHOOK_AUTH_MODE=hmac` set dans Supabase.
- [ ] Étape 3a — Edge Functions `coach-generate-response` + `coach-send-message` redéployées.
- [ ] Étape 3b — `COACH_WEBHOOK_HMAC_SECRET` + `COACH_WEBHOOK_HMAC_ENFORCE=false` set dans n8n.
- [ ] Étape 3c — 24 h d'observation, zéro `[coach-webhook-hmac]` warning.
- [ ] Étape 4 — `COACH_WEBHOOK_HMAC_ENFORCE=true` flippé.
- [ ] Étape 5 — `N8N_LOG_LEVEL=warn` + retention 72h appliqués.
- [ ] Vérif post-rollout : rate limits N-C/N-D testés, backfill C-05 confirmé.
- [ ] `secrets/coach_webhook_hmac.txt` supprimé localement après confirmation que les env vars prod tiennent (le secret vit désormais dans Supabase + n8n, pas en local).

---

## Annexe — Quels findings restent ⏳

| ID | Pourquoi reporté | Action proposée |
|---|---|---|
| **C-07** | Trigger d'audit sur `user_profiles.coach_persona_key` — risque faible, ergonomie discutable, hors scope du PR | Passe dédiée si besoin (estimé 2 h) |
| **Test mock pré-existant** | `__tests__/supabase/coachGenerateResponseHandler.test.ts` a 7 tests qui échouent suite à un audit antérieur (CO-04 / SCANNER_COACH_AUDIT_2026_05) qui n'a pas mis à jour son fixture. | Ajouter `rpc: jest.fn(() => Promise.resolve({ data: { allowed: true }, error: null }))` au mock de `createCoachEntryUpdateClient` à `coachGenerateResponseHandler.test.ts:285`. ~5 min. |
