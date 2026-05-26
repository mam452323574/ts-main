# QA terrain — Coach quota / fallback (staging device)

**Type :** Runbook QA terrain — checklist d'acceptation
**Cible :** Staging Supabase `qpogulljnnacrxdjbwiz`
**Liée à :** commit `f651872 coach(quota): split general/scan_cta buckets + insufficient_data refund`
**Migrations :** `20260526120000_split_coach_quota_buckets.sql` + `20260526160000_release_stuck_coach_pending_entries.sql`
**Edge functions concernées :** `coach-generate-response`, `coach-quota-status`, `coach-screen-snapshot`
**Estimation :** ~45 min à 1h (PREM-4 = 10-15 min à elle seule)

> ⚠️ **Cette checklist DOIT être exécutée par un humain avec device.** Elle nécessite :
> - un device physique ou simulateur Expo (iOS ou Android),
> - les 3 comptes test (free / premium / admin) avec accès,
> - l'accès au [Supabase Dashboard staging](https://supabase.com/dashboard/project/qpogulljnnacrxdjbwiz) pour les logs Edge,
> - l'accès au SQL Editor staging pour les requêtes de reset et de vérification.
>
> Un agent CLI ne peut PAS la remplir. Le verdict **GO / NO-GO PROD** final n'est valide qu'après remplissage manuel de toutes les sections cochables.

---

## 0. Pré-flight (bloquant)

Si l'un de ces 7 points n'est pas ✅, **STOP** : la QA ne mesurerait rien (l'app pointerait sur l'ancien backend).

- [ ] **0.1** — Commit `f651872 coach(quota): split general/scan_cta buckets + insufficient_data refund` est sur `origin/main`
      `git log --oneline origin/main -1` doit afficher `f651872 coach(quota): ...`
- [ ] **0.2** — Migration `20260526120000_split_coach_quota_buckets.sql` appliquée en staging
      ```sql
      SELECT routine_name FROM information_schema.routines
       WHERE routine_name = 'coach_quota_bucket_for_source';
      ```
      Doit retourner 1 ligne.
- [ ] **0.3** — Helper SQL répond correctement
      ```sql
      SELECT public.coach_quota_bucket_for_source('coach_scan_cta_generation');
      ```
      Doit retourner `scan_cta`.
- [ ] **0.4** — `coach-generate-response` Edge function redéployée
      [Supabase Dashboard → Edge Functions → coach-generate-response](https://supabase.com/dashboard/project/qpogulljnnacrxdjbwiz/functions/coach-generate-response) → "Last deployed at" plus récent que le push `f651872`.
      Version attendue : **≥ v69**.
- [ ] **0.5** — `coach-quota-status` Edge function redéployée. Version attendue : **≥ v24**.
- [ ] **0.6** — `coach-screen-snapshot` Edge function redéployée. Version attendue : **≥ v13**.
- [ ] **0.7** — Build app staging pointe sur le bon projet
      Vérifier que `EXPO_PUBLIC_SUPABASE_URL` (Expo Dev menu → Settings → ou EAS update preview manifest) contient bien `qpogulljnnacrxdjbwiz`.

---

## 1. Comptes de test à préparer

| Compte | E-mail suggéré | Tier (`user_profiles.account_tier`) | Pré-requis data |
|---|---|---|---|
| FREE | `qa-coach-free@<domain>` | `free` | Au moins **1 scan exploitable** (face, body OU nutrition) récent (< 7j). Idéalement avec une métrique anormale pour déclencher une CTA scanner (`hydration_level ≤ 35` OU `posture_score ≤ 40` OU `protein_grams ≤ 10`). |
| PREMIUM | `qa-coach-premium@<domain>` | `premium` | Idem. S'assurer que `user_profiles.account_tier = 'premium'` (UPDATE manuel SQL Editor staging si nécessaire). |
| ADMIN | `qa-coach-admin@<domain>` | `admin` | Idem. |

Mettre à jour le tier manuellement si besoin :

```sql
UPDATE public.user_profiles SET account_tier = 'premium' WHERE id = '<UID>';
-- ou
UPDATE public.user_profiles SET account_tier = 'admin'   WHERE id = '<UID>';
```

---

## 2. Requêtes SQL de reset (à exécuter entre chaque sous-checklist)

À exécuter dans **Supabase Dashboard → SQL Editor (staging)** avant chaque sous-checklist (FREE, PREMIUM, ADMIN) **et entre chaque rejouage** d'un scénario qui consomme du quota :

```sql
-- Vide les buckets coach + libère le rate limit technique + efface les entries
-- Remplacer <UID> par l'id du compte de test concerné.
DELETE FROM public.coach_usage_events        WHERE user_id = '<UID>';
DELETE FROM public.coach_generation_attempts WHERE user_id = '<UID>';
DELETE FROM public.coach_entries             WHERE user_id = '<UID>';
```

Pour récupérer l'UID depuis l'e-mail :

```sql
SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = 'qa-coach-free@<domain>';
```

---

## 3. Checklist FREE (6 scénarios)

### FREE-1 — Première demande Coach normale

**Préconditions :** general=1/1, scan_cta=1/1 (DELETE events ci-dessus).

**Steps :**
1. Login `qa-coach-free`.
2. Onglet Coach → choisir un preset compatible (ex. `latest_scan__top_priority_today`).
3. Tap "Demander au coach".

**Expected :**
- Pending visible ~1-3 s puis transition vers une réponse personnalisée.
- Body **NON équivalent** à `"Pour avancer sur cette question cette semaine, choisis UN moment-clé que tu peux protéger..."` (= fallback neutre R-22 — c'est un signal que le LLM n'a rien renvoyé d'utile).
- Le compteur quota affiché par l'écran passe à `0 left` (top-level mirror du bucket general).

**Vérif SQL post-test :**
```sql
SELECT source, status, requested_at FROM public.coach_usage_events
 WHERE user_id = '<UID>' ORDER BY requested_at DESC LIMIT 5;
```
→ 1 ligne `source='coach_generation', status='accepted'`.

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Severity if fail | - [ ] P0 · - [ ] P1 · - [ ] P2 |
| Screenshot | - [ ] attached |
| Notes | |

---

### FREE-2 — 2e demande Coach normale → cooldown

**Préconditions :** FREE-1 vient juste de PASS.

**Steps :** retaper le même preset (ou n'importe quel autre preset).

**Expected :**
- Alert affichée : `coach.quota.next_request_in {duration}` ("next request in ~24h") OU `coach.quota.recharge_soon` si `next_recharge_at` null.
- Pas de crash, pas de spinner figé.
- **Texte affiché ne mentionne JAMAIS :** `"bucket"`, `"scan_cta"`, `"quota scanner"`, `"deux quotas"`, `"second quota"`.

**Vérif logs** (Supabase Dashboard → Edge Functions → coach-generate-response → Logs → search `quota-decision`) :
```
{"quota_source":"coach_generation","quota_bucket":"general",...}
```
+ un événement `Phase2HttpError 429 coach_quota_exhausted`.

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Severity if fail | - [ ] P0 · - [ ] P1 · - [ ] P2 |
| Screenshot alert | - [ ] attached |
| Notes | |

---

### FREE-3 — CTA scanner réussit même si general est épuisé

**Préconditions :** FREE-2 PASS (general=0/1, scan_cta=1/1).

**Steps :**
1. Aller sur le résultat d'un scan ayant une CTA visible (ex. scan face avec hydratation basse → `ScanCoachCtaCard`).
2. Tap "Demande au coach".
3. Auto-redirection vers `/coach?autoSubmit=1&scanIntent=...`.

**Expected :**
- L'écran Coach démarre automatiquement la génération **SANS clic supplémentaire**.
- Réponse personnalisée arrive (pas le fallback neutre).
- Bucket `scan_cta` passe à `0/1` (visible côté DB).

**Vérif SQL :**
```sql
SELECT source FROM public.coach_usage_events
 WHERE user_id = '<UID>' AND status = 'accepted'
 ORDER BY requested_at DESC LIMIT 2;
```
→ 2 lignes : `coach_scan_cta_generation` (la plus récente) + `coach_generation` (FREE-1).

**Vérif logs :** `quota-decision` log montre `quota_source: 'coach_scan_cta_generation'`, `quota_bucket: 'scan_cta'`, `has_scan_intent: true`.

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Severity if fail | - [ ] **P0 (= bug principal du ticket !)** · - [ ] P1 · - [ ] P2 |
| Screenshot | - [ ] attached |
| Notes | |

---

### FREE-4 — 2e CTA scanner → cooldown bucket scan_cta

**Préconditions :** FREE-3 PASS (scan_cta=0/1).

**Steps :** revenir sur le même scan result, tap à nouveau la CTA.

**Expected :**
- Alert affiche un cooldown **non-nul** (~24h).
- **CRITIQUE :** ne PAS afficher "next request immédiatement" / null countdown — sinon ça signifie que le bucket scan_cta cooldown ne se propage pas via `projectCoachQuotaForSource`.
- Texte standard, pas de mention de `"scan_cta"` ou `"bucket"`.

**Vérif logs :** 429 details JSON contient :
```
quota_bucket: 'scan_cta'
quota_source: 'coach_scan_cta_generation'
quota_next_recharge_at: '<ISO 8601 ~T+24h>'
```

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Severity if fail | - [ ] P0 · - [ ] P1 · - [ ] P2 |
| Screenshot alert | - [ ] attached |
| Notes | |

---

### FREE-5 — Absence de mention "deux quotas" sur tout le funnel

**Steps :** parcourir l'app : Coach screen + alert FREE-2 + alert FREE-4 + Coach history.

**Expected :** aucune chaîne user-facing ne dit :
- ❌ "deux quotas"
- ❌ "quota scanner"
- ❌ "scan_cta"
- ❌ "second quota"
- ❌ "bucket"

**Méthode :** screenshots des 3 écrans (Coach home, alert quota exhausted general, alert quota exhausted scan_cta) → diff visuel à la copie attendue (`coach.quota.next_request_in`, `coach.quota.recharge_soon`, `coach.quota.exhausted_title`).

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Screenshots | - [ ] Coach home · - [ ] alert general · - [ ] alert scan_cta |
| Notes | |

---

### FREE-6 — insufficient_data ne consomme pas définitivement le quota

**Préconditions :** general=1/1 (DELETE events).

**Méthode pour forcer le cas** (choisir une option) :
- **(a)** preset `nutrition_focus__breakfast_no_crash` (premium-only normalement, mais le check tier passe pour FREE quand persona compatible) → le LLM dira "pas de scan nutrition" si le compte n'a que des scans face.
- **(b)** intercepter via SQL Editor en injectant un workflow n8n test qui retourne `insufficient_data:true` directement.
- **(c) — le plus fiable :** supprimer temporairement tous les scans `nutrition` du user, puis demander un preset `nutrition_focus__*`.

**Steps :** lancer la demande → attendre la fin du pending (~5-10 s) → observer.

**Expected :**
- L'entry passe en `status='error'`, `error_code='coach_insufficient_data'`.
- L'UI affiche un message d'erreur ; **PAS** de fausse réponse "Bois un grand verre d'eau au réveil, marche 5 minutes, couche-toi un peu plus tôt".
- Au refresh suivant (≤ 30 s, le polling `useCoachQuota` refetchInterval), le bucket general remonte à `1/1`.

**Vérif SQL :**
```sql
SELECT status, error_code FROM public.coach_entries
 WHERE user_id = '<UID>' ORDER BY created_at DESC LIMIT 1;

SELECT source, status, metadata FROM public.coach_usage_events
 WHERE user_id = '<UID>' ORDER BY requested_at DESC LIMIT 1;
```
→ entry `error_code = 'coach_insufficient_data'` ; event `status='refunded'`, `metadata.refund_reason='coach_insufficient_data'`.

| Field | Value |
|---|---|
| Observed | _____ |
| Status | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| Severity if fail | - [ ] **P0 (bug fallback persiste !)** · - [ ] P1 · - [ ] P2 |
| Screenshot | - [ ] attached |
| Notes | |

---

## 4. Checklist PREMIUM (4 scénarios)

| ID | Scénario | Expected | SQL vérif | Status |
|---|---|---|---|---|
| **PREM-1** | 3 demandes Coach normales consécutives | Les 3 aboutissent. `coach_usage_events` → 3 rows `source='coach_generation'`, `status='accepted'`. | `SELECT COUNT(*) FROM coach_usage_events WHERE user_id='<UID>' AND source='coach_generation' AND status='accepted' AND requested_at > now() - interval '24 hours';` → **3** | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **PREM-2** | 3 demandes CTA scanner consécutives | 3 réponses. Les events sont en `source='coach_scan_cta_generation'`. | Idem avec `source='coach_scan_cta_generation'` → **3** | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **PREM-3** | Vérifier que les 2 limites sont séparées | Après PREM-1 et PREM-2 cumulés (6 events) : `available` (top-level) = `8-3 = 5` ; `buckets.scan_cta.available = 5`. Aucun blocage. | Trigger un Coach request, lire le JSON `quota` retourné dans Network DevTools | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **PREM-4** | Aller jusqu'à 8 demandes par bucket | 8 OK général + 8 OK scan_cta dans 24h. **9e general** → 429 avec cooldown general. **9e scan_cta** → 429 avec cooldown scan_cta. | `SELECT source, COUNT(*) FROM coach_usage_events WHERE user_id='<UID>' AND status='accepted' AND requested_at > now() - interval '24 hours' GROUP BY source;` → 2 lignes à 8 chacune | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |

**Note temps :** PREM-4 prend ~10-15 min d'exécution. Faisable avec un script de seed si besoin (à demander à l'équipe).

---

## 5. Checklist ADMIN (3 scénarios)

| ID | Scénario | Expected | Vérif | Status |
|---|---|---|---|---|
| **ADM-1** | 10 demandes Coach normales | Toutes aboutissent, jamais de 429 | `coach_usage_events` accumule sans blocage | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **ADM-2** | 10 demandes CTA scanner | Idem | Idem | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **ADM-3** | Logs propres | Le log `quota-decision` montre `quota_source` correct à chaque request (même si admin → unlimited:true côté RPC). | Supabase Dashboard → Edge logs filter `request_id` sur quelques requêtes | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |

---

## 6. Checklist navigation / pending (4 scénarios — les plus difficiles à automatiser)

| ID | Steps | Expected | Status |
|---|---|---|---|
| **NAV-1** | Lancer une génération Coach. Pendant le pending (~10 s), appuyer "back" sur le device. | Pas de crash. Reviendrais sur HomeScreen. | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **NAV-2** | Suite à NAV-1 : ré-entrer dans Coach après ~30 s. | La réponse est affichée OU une entry `ready` est dans Coach history. Aucune entry "stuck pending" >2 min. *(Le filet de sécurité `release_stuck_coach_pending_entries` tourne en pg_cron toutes les 5 min — re-vérifier après 5 min si pending persistant.)* | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **NAV-3** | Lancer une génération. Pendant le pending, fermer l'app complètement (swipe up + kill). | OK, pas de crash, l'app accepte la fermeture. | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |
| **NAV-4** | Rouvrir l'app après ~30 s. | `useCoachScreenSnapshot` repolle, récupère l'entry `ready`. Pas de quota perdu. | - [ ] PASS · - [ ] FAIL · - [ ] BLOCKED |

---

## 7. Logs Supabase staging à inspecter

### Méthode 1 — Dashboard UI (recommandé pour la QA visuelle)

[Supabase Dashboard → qpogulljnnacrxdjbwiz → Edge Functions → coach-generate-response → Logs](https://supabase.com/dashboard/project/qpogulljnnacrxdjbwiz/functions/coach-generate-response/logs)

Filtres / patterns à utiliser :

- [ ] Search : `quota-decision` → vérifier 1 ligne par Coach request avec les 6 champs (`quota_source`, `quota_bucket`, `quota_kind`, `has_scan_intent`, `prompt_type`, `request_id`).
- [ ] Search : `Background generation failed` → ne doit **pas** apparaître plus de quelques fois sur 24 h. Si pics → bug.
- [ ] Search : `coach_insufficient_data` → 1 ligne par cas FREE-6.
- [ ] Search : `quota:refund` → 1 ligne juste avant chaque `coach_insufficient_data`.
- [ ] Search : `CRITICAL` ou `[CRITICAL]` → **doit rester à 0**. Tout match = blocage P0.

### Méthode 2 — CLI (si `supabase` CLI installé localement et token disponible)

```bash
# Note: CLI v2.98 et antérieures n'ont pas `functions logs`.
# v2.101+ pourrait. Sinon utiliser le Dashboard.
npx supabase functions logs coach-generate-response --project-ref qpogulljnnacrxdjbwiz --tail
```

### Pattern attendu pour `[coach-generate-response] quota-decision`

```json
{
  "request_id": "req-<random>",
  "quota_source": "coach_generation | coach_cache | coach_scan_cta_generation | coach_scan_cta_cache",
  "quota_bucket": "general | scan_cta",
  "quota_kind": "generation | cache",
  "has_scan_intent": true | false,
  "prompt_type": "<some string or null>"
}
```

### Patterns d'alerte à examiner

- ❌ `quota_source: undefined` → mauvaise dérivation côté handler.
- ❌ `quota_bucket: undefined` → bug helper SQL.
- ❌ Absence totale de `quota-decision` après une requête Coach connue → le déploiement Edge ne contient pas le nouveau code (étape 0.4 KO).

---

## 8. Bug template (à remplir par le QA pour chaque fail)

```markdown
### BUG #<id>

- **Scénario :** FREE-X / PREMIUM-X / ADM-X / NAV-X
- **Sévérité :** P0 / P1 / P2 / P3
- **Reproductibilité :** 1/1 — 3/3 — flaky
- **Steps to reproduce :**
  1. ...
  2. ...
- **Expected :** ...
- **Observed :** ...
- **Screenshot :** [link]
- **Logs Supabase pertinents :** [snippet]
- **request_id :** ...
- **Workaround :** none / ...
- **Fix proposé :** ...
```

---

## 9. Verdict template (à remplir UNE FOIS la checklist exécutée)

### Résultat par compte

| Compte | Scénarios PASS | Scénarios FAIL | Scénarios BLOCKED | Verdict partiel |
|---|---|---|---|---|
| FREE (6 cas) | __ / 6 | __ | __ | - [ ] ✅ - [ ] ❌ |
| PREMIUM (4 cas) | __ / 4 | __ | __ | - [ ] ✅ - [ ] ❌ |
| ADMIN (3 cas) | __ / 3 | __ | __ | - [ ] ✅ - [ ] ❌ |
| Navigation (4 cas) | __ / 4 | __ | __ | - [ ] ✅ - [ ] ❌ |

### Critères go/no-go prod

- [ ] FREE-1 PASS (réponse réelle non-fallback)
- [ ] FREE-3 PASS (cross-bucket : scan_cta OK quand general épuisé) — **bug principal du ticket**
- [ ] FREE-4 PASS (cooldown bucket scan_cta correct, pas null)
- [ ] FREE-5 PASS (zéro fuite de "deux quotas" / "scan_cta" / "bucket" dans l'UI)
- [ ] FREE-6 PASS (insufficient_data → refund + pas de fallback hydratation)
- [ ] PREM-4 PASS (8+8 séparés respectés)
- [ ] ADM-1, ADM-2 PASS (admin illimité)
- [ ] Aucun `[CRITICAL]` dans les logs durant la QA
- [ ] Aucun bug P0/P1 ouvert

### Verdict final

- [ ] **GO PROD** (tous les critères ci-dessus = ✅, ≤2 bugs P2/P3 acceptés avec ticket suivi)
- [ ] **NO-GO PROD** (≥1 critère KO, OU ≥1 bug P0/P1)
- [ ] **GO PROD AVEC OBSERVATION** (PASS partiel, déploiement progressif 10% → 50% → 100% avec monitoring renforcé)

**Justification du verdict :**
```
________________________________________________________________
________________________________________________________________
________________________________________________________________
```

**Signé :**

```
QA :              ______________________________
Date :            ______________________________
Build version :   ______________________________
Commit SHA :      ______________________________
```

---

## Rollback safety (en cas de NO-GO)

La migration `20260526120000_split_coach_quota_buckets.sql` est **non-destructive** :
- `DROP CONSTRAINT IF EXISTS` puis recréation de la CHECK constraint avec les 4 valeurs.
- `CREATE OR REPLACE FUNCTION` pour les 5 RPCs (build, reserve, attach, refund, bucket helper).
- Aucun `DROP TABLE`, aucun `DELETE FROM`, aucun backfill.

Si rollback nécessaire :
1. Re-exécuter la migration précédente `20260428180000_add_coach_usage_quota.sql` qui restaure le pre-split-bucket schema (single pool).
2. Redéployer les Edge functions depuis le commit précédent (`d9cdf98` ou antérieur).
3. Les events `source='coach_scan_cta_*'` déjà créés restent dans la table mais ne seront plus comptés (le helper post-rollback retournera `general` pour tous).

---

## Références

- Audit produit : `COACH_AUDIT_2026_05_OPS_RUNBOOK.md`
- Audit hydratation : `COACH_BUG_HYDRATATION_AUDIT_2026_05_20.md`
- Migration source : `supabase/migrations/20260526120000_split_coach_quota_buckets.sql`
- Migration filet de sécurité : `supabase/migrations/20260526160000_release_stuck_coach_pending_entries.sql`
- Edge handler : `supabase/functions/coach-generate-response/handler.ts`
- Frontend helpers : `services/coach.ts` (`selectCoachQuotaBucket`, `coachQuotaSourceForRequest`, `mergeCoachQuotaForBucket`, `getCoachQuotaBucketKeyFromError`)
- Frontend screen : `screens/CoachScreen.tsx` (activeCoachQuotaSource / activeCoachQuotaBucket)
