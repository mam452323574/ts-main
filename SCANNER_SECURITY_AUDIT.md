# Audit de sécurité — Pipeline Scanner (HealthScan / TSE)

**Date :** 2026-04-26
**Auditeur :** Claude (Anthropic) sur invocation utilisateur
**Périmètre :** chaîne complète scanner — capture caméra côté Expo → upload Supabase Storage → Edge Function `analyze-scan` / `fridge-scan-*` → webhook IA n8n → rendu résultat. Couvre health, body, nutrition, super, fridge.
**Hors périmètre :** réaudit des findings déjà documentés dans [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md), [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md), [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md). Ces rapports restent références autoritaires.
**Méthodologie :** revue statique du code (Edge Functions, migrations, services frontend, contrats partagés, RLS, RPC). Playbook curl en annexe pour validation manuelle contre une instance locale (`supabase start`). Pas de pentest contre la prod (sandbox bloque l'automatisation contre l'infrastructure partagée — cf. `feedback_pentest_tooling`).

> Sévérité : P0 critique → P3 durcissement. Format aligné sur les audits précédents (S-NN, blocs Description/Exploitation/Impact/Recommandation/Statut).

---

## Résumé exécutif

Le pipeline scanner repose sur des défenses solides déjà en place : RLS Storage scopé `auth.uid() = foldername[1] AND foldername[2] = 'scans'`, bucket `scan-images` privé avec `file_size_limit=10 MB` et `allowed_mime_types=['image/jpeg']`, RPC `reserve_scan_quota` SECURITY DEFINER avec `FOR UPDATE` (atomique), webhook callback `fridge-scan-complete` signé HMAC + timing-safe, normalisation côté client via clés enum contractuelles (`face_shape_key`, `body_type_key`, etc.) qui annulent l'essentiel des risques XSS du résultat IA.

L'audit a identifié **2 risques élevés** (P1) sur la validation côté Edge (MIME contournable, webhook scan sans whitelist d'hôtes), **5 risques moyens** (P2) — borne de taille manquante, fallback `legacy_inferred` exploitable, contenu IA non borné pour `fat_distribution_scan_v2`, race `analyze-scan ↔ cancel-scan-reservation`, conformité RGPD/rétention, logs Edge potentiellement non filtrés sur `image_base64` — et **3 points de durcissement** (P3) sur l'idempotence, le defense-in-depth tier `super`, et l'extension du pattern de redaction des logs.

Aucune vuln P0 n'a été identifiée pendant cette revue : pas d'IDOR cross-user (RLS storage + scope serveur), pas de SSRF par utilisateur final (URLs webhook viennent uniquement de variables d'env), pas de bypass d'authentification (JWT obligatoire sur les fonctions utilisateur).

### Tableau récapitulatif

| ID | Sévérité | Catégorie | OWASP / CWE | Statut |
|----|----------|-----------|-------------|--------|
| S-01 | P1 | Validation contenu | M5 / CWE-434 | ✅ Corrigé dans cette passe |
| S-02 | P1 | SSRF / fuite PII | M3 / CWE-918 | ✅ Corrigé dans cette passe |
| S-03 | P2 | DoS / coût | M5 / CWE-770 | ✅ Corrigé dans cette passe |
| S-04 | P2 | Logique métier | M3 / CWE-840 | ✅ Corrigé dans cette passe (fenêtre resserrée + log alerte) |
| S-05 | P2 | Validation IA | M5 / CWE-20 | ✅ Corrigé dans cette passe |
| S-06 | P2 | Coût / quota | M9 / CWE-362 | ✅ Corrigé dans cette passe |
| S-07 | P2 | RGPD | — / CWE-359 | ✅ Corrigé dans cette passe |
| S-08 | P2 | Logs PII | M9 / CWE-532 | ✅ Corrigé dans cette passe |
| S-09 | P3 | Defense-in-depth | M3 / CWE-602 | ✅ Corrigé dans cette passe |
| S-10 | P3 | Idempotence | M3 / CWE-352 | ✅ Couvert par S-06 |
| S-11 | P3 | Hygiène orphelins | — | ✅ Couvert par S-04 + cron S-07 |

---

## Cartographie de la chaîne scanner

### Frontend (Expo / React Native)

| Fichier | Rôle |
|---------|------|
| [screens/ScannerScreen.tsx](screens/ScannerScreen.tsx) | UI caméra + galerie, `useCameraPermissions`, `takePictureAsync` (lignes 209-241, 365-385) |
| [screens/ScanPreviewScreen.tsx](screens/ScanPreviewScreen.tsx) | Pipeline upload + analyse, `createScanWithAnalysis` (ligne 305-311) |
| [screens/ScanResultScreen.tsx](screens/ScanResultScreen.tsx) | Rendu via `<Text>` natif après normalisation (ligne 96-99) |
| [screens/SuperScanResultScreen.tsx](screens/SuperScanResultScreen.tsx), [screens/FridgeScanScreen.tsx](screens/FridgeScanScreen.tsx), [screens/FridgeScanResultScreen.tsx](screens/FridgeScanResultScreen.tsx) | Variantes super et fridge |
| [services/api.ts](services/api.ts) | `createScan` (1099-1279), `analyzeScan` (1281-1328), compression `manipulateAsync` 0.95 + max 12 MB |
| [services/authenticatedStorage.ts](services/authenticatedStorage.ts) | `requireCurrentSessionForUser` + `uploadAuthenticatedStorageObject` (Bearer JWT) |
| [services/fridgeScan.ts](services/fridgeScan.ts) | Submit fridge (base64 inline) |
| [shared/scanContract.ts](shared/scanContract.ts), [shared/fridgeScanContract.ts](shared/fridgeScanContract.ts) | Contrats partagés client/Edge, `buildCanonicalScanImagePath` |
| [utils/analysisNormalization.ts](utils/analysisNormalization.ts) | Normalisation Zod-like : strings IA libres → enum keys côté client |

### Backend (Supabase Edge Functions)

| Fichier | Auth | Rôle |
|---------|------|------|
| [supabase/functions/check-and-record-scan/index.ts](supabase/functions/check-and-record-scan/index.ts) | JWT user | Réservation quota via RPC `reserve_scan_quota` |
| [supabase/functions/analyze-scan/index.ts](supabase/functions/analyze-scan/index.ts) | JWT user | Download image → webhook IA → store result |
| [supabase/functions/cancel-scan-reservation/index.ts](supabase/functions/cancel-scan-reservation/index.ts) | JWT user | Rollback quota + delete scan + remove storage |
| [supabase/functions/fridge-scan-submit/index.ts](supabase/functions/fridge-scan-submit/index.ts) | JWT user | Submit fridge (base64), dispatch webhook async |
| [supabase/functions/fridge-scan-complete/index.ts](supabase/functions/fridge-scan-complete/index.ts) | HMAC | Callback n8n → finalize fridge scan |
| [supabase/functions/_shared/scanWebhookPool.ts](supabase/functions/_shared/scanWebhookPool.ts) | — | Sélection webhook (hash userId:scanId) |
| [supabase/functions/_shared/scanAnalysis.ts](supabase/functions/_shared/scanAnalysis.ts) | — | Validation structure réponse webhook |
| [supabase/functions/_shared/scanImageLookup.ts](supabase/functions/_shared/scanImageLookup.ts) | — | Resolve canonical + fallback `legacy_inferred` |
| [supabase/functions/_shared/scanReservations.ts](supabase/functions/_shared/scanReservations.ts) | — | `rollbackScanCharge` (delete scan + remove storage) |
| [supabase/functions/_shared/phase2Webhook.ts](supabase/functions/_shared/phase2Webhook.ts) | — | `postWebhookJson` + signature HMAC outbound |
| [supabase/functions/_shared/phase2Observability.ts](supabase/functions/_shared/phase2Observability.ts) | — | `logPhase2Error` + `SENSITIVE_KEY_PATTERN` |

### Schéma & Storage

- **Bucket** `scan-images` : privé, `file_size_limit=10 MB`, `allowed_mime_types=['image/jpeg']` ([supabase/migrations/20260407120000_phase1_hardening.sql:308-319](supabase/migrations/20260407120000_phase1_hardening.sql:308))
- **RLS Storage** : `(storage.foldername(name))[1] = auth.uid()::text AND (storage.foldername(name))[2] = 'scans'` ([supabase/migrations/20260407120000_phase1_hardening.sql:440-479](supabase/migrations/20260407120000_phase1_hardening.sql:440))
- **Tables** :
  - `scans` (`id`, `user_id` FK CASCADE, `scan_type`, `image_path`, `analysis_result` jsonb, `analyzed_at`, `used_welcome_credit`, `created_at`)
  - `fridge_scans` (`status`, `selected_mode`, `image_path`, `webhook_payload`, `meal_result`, `callback_nonce`, …)
  - `scan_metrics` (history Premium Potential)
- **RLS tables** : `auth.uid() = user_id` SELECT/INSERT
- **RPC** : `reserve_scan_quota`, `reserve_fridge_scan_quota` — SECURITY DEFINER, `REVOKE EXECUTE FROM PUBLIC; GRANT TO service_role;` ([supabase/migrations/20260424090000_security_hardening.sql:365-518](supabase/migrations/20260424090000_security_hardening.sql:365))

### Flux end-to-end

```
[Caméra Expo / galerie]
    ↓ takePictureAsync({ quality: 1 })
    ↓ ImageManipulator.manipulateAsync({ compress: 0.95, format: JPEG, base64: true })   [strippe EXIF]
    ↓ check-and-record-scan (JWT) → RPC reserve_scan_quota → scan_id réservé
    ↓ uploadAuthenticatedStorageObject (Bearer JWT) → bucket scan-images, path {userId}/scans/{scanId}.jpg
    ↓ analyze-scan (JWT) → service-role client
        ↓ SELECT scans WHERE id = $scanId AND user_id = user.id
        ↓ download from scan-images → check metadata.mimetype
        ↓ webhook n8n (POST { imageBase64, scanId, userId, scanType, language }, 60 s timeout)
        ↓ resolveNormalizedScanAnalysisPayload (validation type + schema_version)
        ↓ UPDATE scans SET analysis_result, analyzed_at
    ↓ saveMetricsToHistory → RPC scan_metrics
[ScanResultScreen]
    ↓ tryNormalizeAnalysisResult → enum keys (face_shape_key, body_type_key, …)
    ↓ rendu <Text> natif (pas de dangerouslySetInnerHTML)
```

---

## Findings détaillés

### S-01 — Validation MIME serveur trompée par metadata client [P1 — Élevé]

**OWASP :** M5 Insufficient Input/Output Validation · **CWE-434** Unrestricted Upload of File with Dangerous Type

**Fichier :** [supabase/functions/analyze-scan/index.ts:342-357](supabase/functions/analyze-scan/index.ts:342)

**Description.** Le check MIME dans `analyze-scan` lit `metadata.mimetype` ou `metadata.contentType` depuis `storage.objects` :

```ts
const metadata = resolvedStoredObject.row.metadata as Record<string, unknown> | null;
const mimeType =
  typeof metadata?.mimetype === 'string'
    ? metadata.mimetype.toLowerCase()
    : typeof metadata?.contentType === 'string'
      ? metadata.contentType.toLowerCase()
      : null;

if (mimeType && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg') {
  throw new Phase2HttpError(400, 'invalid_scan_image_type', 'Scan uploads must be JPEG images');
}
```

Cette metadata est définie par le client lors de l'upload via `fileOptions.contentType`. La condition `if (mimeType && ...)` **bypass silencieusement le check si `metadata.mimetype` est falsy** (chemin pris quand le client omet le contentType). De plus, **aucune validation des magic bytes JPEG (`FF D8 FF`)** n'est effectuée — un attaquant peut donc uploader un binaire arbitraire avec `Content-Type: image/jpeg` correct et le payload réel sera envoyé tel quel au webhook IA.

**Exploitation.** Un utilisateur authentifié forge :

```bash
curl -X PUT "$SUPABASE_URL/storage/v1/object/scan-images/$USER_ID/scans/$SCAN_ID.jpg" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: image/jpeg" \
  --data-binary @malicious.pdf
```

Le bucket accepte (mime déclaré JPEG OK), `analyze-scan` lit l'image et — soit le metadata.mimetype est défini (image/jpeg) soit non — pousse le base64 du PDF (ou d'un polyglot, ou d'un payload conçu pour prompt-injecter le LLM) vers n8n.

**Impact.** Surface d'attaque côté provider LLM (prompt injection via fichiers polyglots pouvant influencer la réponse), corruption de données stockées en `analysis_result` et `scan_metrics`, coût IA pour traiter du contenu invalide.

**Recommandation.** Dans `analyze-scan`, après `await resolveStoredScanObject` et avant `arrayBufferToBase64`, valider les magic bytes :

```ts
const imageBytes = new Uint8Array(await scanImage.arrayBuffer());
if (imageBytes.length < 3 || imageBytes[0] !== 0xFF || imageBytes[1] !== 0xD8 || imageBytes[2] !== 0xFF) {
  throw new Phase2HttpError(400, 'invalid_scan_image_content', 'Scan image must be a valid JPEG');
}
```

Conserver le check `metadata.mimetype` existant en defense-in-depth. Ajouter un test Jest (`__tests__/supabase/scanContract.test.ts` ou nouveau fichier) qui exerce cette branche.

**Statut :** ✅ Corrigé dans cette passe.

---

### S-02 — Pool webhook scan accepte tout protocole et tout hostname [P1 — Élevé]

**OWASP :** M3 Insecure Communication · **CWE-918** SSRF + **CWE-200** Information Exposure

**Fichier :** [supabase/functions/_shared/scanWebhookPool.ts:38-44](supabase/functions/_shared/scanWebhookPool.ts:38)

**Description.** `assertValidWebhookUrl` ne fait que `new URL(url)`. Aucune restriction de protocole (`http:`, `ftp:`, `file:`, `javascript:` passent), aucune whitelist de hostname. La fonction `analyze-scan` envoie ensuite **l'image base64 + userId + scanType** à cette URL.

```ts
function assertValidWebhookUrl(url: string) {
  try {
    new URL(url);
  } catch {
    throw createScanWebhookNotConfiguredError();
  }
}
```

L'audit B-04 dans [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md#b-04--ssrf-webhook-n8n-sans-whitelist-hostname-p2--faible-defense-in-depth) couvre ce risque pour `fridgeScanWebhook.ts` mais **pas pour `scanWebhookPool.ts`** — le pool des scans health/body/nutrition/super partage le même pattern et reçoit le plus gros volume d'images PII (visages, silhouettes).

**Exploitation.**

1. **Typo opérateur** : env `N8N_SCAN_ANALYZE_WEBHOOK_URL=http://localhost:8080` → photos santé envoyées en clair sur le réseau interne (visibles dans tout proxy/log).
2. **Compromission service-role-key** : un attaquant qui obtient la SERVICE_ROLE_KEY (ex. via fuite GitHub Actions, .env oublié, dashboard Supabase compromis) peut redéfinir l'env via API et rediriger le flux vers `http://attacker.com/collect` ou `http://169.254.169.254/...` (AWS metadata exfiltration).
3. **DNS rebinding interne** : si l'env pointe vers un hostname externe résolvable en IP interne au moment du POST, le payload sort vers une cible non-prévue.

**Impact.** Fuite massive d'images PII médicales (catégorie spéciale RGPD art. 9 — visages, silhouettes, contenus alimentaires) hors infrastructure contrôlée. Disponibilité (timeout 60 s × N requêtes simultanées). Atteinte à la base légale du traitement (sous-traitant non identifié).

**Recommandation.** Aligner sur la correction proposée dans B-04 et factoriser :

```ts
// supabase/functions/_shared/webhookHostAllowlist.ts (nouveau)
const ALLOWED_WEBHOOK_HOSTS_PATTERN =
  /^([a-z0-9-]+\.)?(n8n\.basedjew\.com|n8n\.healthscan\.cloud)$/i;

export function assertAllowedWebhookUrl(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('invalid_webhook_url'); }
  if (parsed.protocol !== 'https:') throw new Error('webhook_must_be_https');
  if (!ALLOWED_WEBHOOK_HOSTS_PATTERN.test(parsed.hostname)) throw new Error('webhook_host_not_allowed');
}
```

Appeler depuis `scanWebhookPool.ts` (`assertValidWebhookUrl`) ET `fridgeScanWebhook.ts`. Idéalement rendre le pattern configurable via env `WEBHOOK_ALLOWED_HOSTS_PATTERN` pour ne pas couplant le code aux DNS de prod.

**Statut :** ✅ Corrigé dans cette passe.

---

### S-03 — Pas de borne serveur sur la taille de l'image envoyée au webhook [P2 — Moyen]

**OWASP :** M5 Insufficient Validation · **CWE-770** Allocation of Resources Without Limits

**Fichier :** [supabase/functions/analyze-scan/index.ts:359-385](supabase/functions/analyze-scan/index.ts:359)

**Description.** Le bucket `scan-images` impose `file_size_limit=10 MB` côté Storage, donc la taille brute est bornée. Mais `analyze-scan` lit l'image (`scanImage.arrayBuffer()`), encode en base64 (≈ 1.33×) et envoie le tout au webhook **sans vérifier la taille intermédiaire**. Une image de 10 MB → base64 ≈ 13.3 MB envoyés à n8n.

Pour comparaison, [fridge-scan-submit/index.ts:45-46](supabase/functions/fridge-scan-submit/index.ts:45) impose explicitement `FRIDGE_SCAN_MAX_IMAGE_BYTES = 6 MB` ET `FRIDGE_SCAN_MAX_REQUEST_BYTES = 8 MB` ET vérifie la taille post-decode (`approximateByteLength > FRIDGE_SCAN_MAX_IMAGE_BYTES`). Cohérence à reproduire dans `analyze-scan`.

**Exploitation.** Pas une vuln directe — risque combiné avec S-01 (n'importe quel binaire 10 MB envoyé au LLM) ou abus de coût IA. Si le bucket file_size_limit est désactivé temporairement (migration ratée, dashboard manuel), la limite côté Edge devient inexistante.

**Impact.** Coûts LLM, pression mémoire/CPU sur le runtime Edge (Deno), latence accrue, dégradation pour les utilisateurs concurrents.

**Recommandation.** Borner explicitement après download :

```ts
const SCAN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const scanImage = resolvedStoredObject.blob ?? (await downloadStoredScanImage(...));
if (scanImage.size > SCAN_IMAGE_MAX_BYTES) {
  throw new Phase2HttpError(413, 'scan_image_too_large', 'Scan image exceeds 10 MB');
}
```

**Statut :** ✅ Corrigé dans cette passe.

---

### S-04 — Fallback `legacy_inferred` permet d'analyser une image différente du scan réservé [P2 — Moyen]

**OWASP :** M3 Insecure Authorization · **CWE-840** Business Logic Errors

**Fichier :** [supabase/functions/analyze-scan/index.ts:158-241](supabase/functions/analyze-scan/index.ts:158) + [supabase/functions/_shared/scanImageLookup.ts](supabase/functions/_shared/scanImageLookup.ts)

**Description.** Si l'image au path canonique `{userId}/scans/{scanId}.jpg` n'est pas trouvée, `inferLegacyStoredScanObject` cherche **n'importe quelle image** appartenant à `user_id` dans la fenêtre `[scan.created_at − 5 s, scan.analyzed_at ?? +2 min]` et l'utilise pour l'analyse. Le mécanisme est conservé pour la rétrocompatibilité avec les scans antérieurs au schéma `image_path` ([supabase/migrations/20260412143000_backfill_legacy_scan_image_paths.sql](supabase/migrations/20260412143000_backfill_legacy_scan_image_paths.sql) a déjà backfillé).

**Exploitation.** Un utilisateur authentifié :

1. Réserve un scan via `check-and-record-scan` → `scanId_A` ; aucune image n'est encore uploadée
2. Upload une image B à un path différent dans son namespace dans la fenêtre +5 s (par ex. via une autre route legacy, ou en spammant `storage.upload` pour forcer la résolution sur l'image B)
3. Appelle `analyze-scan` avec `scanId_A` → le fallback résout sur l'image B et la transmet au webhook

L'attaque reste contenue dans l'espace de l'utilisateur (pas cross-user) mais permet de :
- Découpler le `scan_id` réservé du contenu réellement analysé (utile en combinaison avec un éventuel partage social ou avec `scan_metrics`)
- Contourner toute future validation côté upload (ex. si demain S-01 est corrigé sur le path canonique mais pas sur le legacy)

**Impact.** Confusion d'analyse, bypass partiel de validations futures associées au path canonique.

**Recommandation.** Vérifier en prod le nombre de scans avec `image_path IS NULL` (devrait être 0 après backfill). Si nul, déprécier le fallback :

```ts
// scanImageLookup.ts — résolveStoredScanObject
if (!canonicalRow) {
  throw createScanImageNotFoundError('Canonical scan image not found', { ... });
}
// Plus d'appel à inferLegacyStoredScanObject
```

Sinon, restreindre la fenêtre temporelle à 1 s et exiger que l'image fallback soit dans `{userId}/scans/` (déjà le cas via RLS, à confirmer dans `selectLegacyStoredScanObject`).

**Statut :** ✅ Corrigé dans cette passe (fenêtre legacy_inferred resserrée à 1s + log d'alerte).

---

### S-05 — Champs textuels libres dans `fat_distribution_scan_v2` non bornés [P2 — Moyen]

**OWASP :** M5 Insufficient Validation · **CWE-20** Improper Input Validation + **CWE-770**

**Fichiers :**
- [supabase/functions/_shared/scanAnalysis.ts:396-446](supabase/functions/_shared/scanAnalysis.ts:396) (`resolveFatDistributionScanPayload`)
- [utils/analysisNormalization.ts:825-864](utils/analysisNormalization.ts:825) (`normalizeFatDistributionScanResult`)

**Description.** Pour la majorité des scan types (`face`, `body`, `nutrition`, `super_health_v2`), `analysisNormalization.ts` côté client convertit les valeurs textuelles arbitraires renvoyées par le LLM en **clés enum contractuelles** (`face_shape_key`, `body_type_key`, `verdict_key`, `summary_key`, etc.) via `resolveContractKey`. Cela neutralise la majorité des risques XSS / DoS / contenu malicieux côté UI.

**MAIS** pour `fat_distribution_scan_v2` (un des deux types `super`), plusieurs champs restent des **strings libres** non bornées et stockées directement dans `analysis_result` JSONB :
- `analysis_summary` (top-level)
- `dominant_storage_pattern`
- `disclaimer_text`
- `areas_analysis[].explanation`, `areas_analysis[].actionable_advice`, `areas_analysis[].dominant_type`, `areas_analysis[].area_name`
- `priority_zones[]` (strings libres)

Le `resolveFatDistributionScanPayload` côté Edge ne pose **aucune limite de longueur**. Un webhook compromis (ou un n8n manipulé via prompt injection en amont — cf. S-01) peut renvoyer `analysis_summary: "A".repeat(10_000_000)` → 10 MB stockés en JSONB Postgres par scan.

**Exploitation.** Un attaquant qui contrôle ne serait-ce qu'un payload sortant LLM peut :
- Remplir l'`analysis_result` JSONB de plusieurs MB → dérive coût stockage + lecture lente
- Injecter des séquences crafted pour les exports (PDF, image partage social) où le rendu n'est pas garanti `<Text>` plein
- Empoisonner `scan_metrics.recent_score_history` indirectement si la pipeline relit ces strings

Les composants RN `<Text>` sur mobile rendent en clair (pas de XSS), mais [services/social.ts](services/social.ts) (P2-J corrigé via signed URL) et l'export d'image partage utilisent ces textes — surface XSS résiduelle sur le web `react-native-web`.

**Impact.** DoS stockage Postgres JSONB, dérive coût, surface XSS résiduelle (web/share/export), incohérence UX en cas de payload énorme.

**Recommandation.** Dans `resolveFatDistributionScanPayload` (et `resolveLooseLegacySuperScanPayload` pour symétrie) :

```ts
const MAX_SUMMARY = 4_000;       // analysis_summary, summary_fallback_text
const MAX_PARAGRAPH = 2_000;     // explanation, advice, dominant_storage_pattern
const MAX_LABEL = 200;           // area_name, priority_zones[i]
const MAX_AREAS = 20;
const MAX_PRIORITY_ZONES = 20;

function bound(value: string | null, max: number) {
  if (!value) return null;
  const stripped = value.replace(/[ -]/g, '');
  return stripped.slice(0, max);
}
```

Appliquer sur tous les champs string libres + `slice(0, MAX_AREAS)` sur les arrays. Documenter la décision dans [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) — "Le LLM est une source UNTRUSTED, tout champ libre doit être borné".

**Statut :** ✅ Corrigé dans cette passe.

---

### S-06 — Race condition `cancel-scan-reservation` ↔ `analyze-scan` [P2 — Moyen]

**OWASP :** M9 Insecure Authentication · **CWE-362** Concurrent Execution Race Condition

**Fichiers :** [supabase/functions/cancel-scan-reservation/index.ts](supabase/functions/cancel-scan-reservation/index.ts) + [supabase/functions/_shared/scanReservations.ts:133-200](supabase/functions/_shared/scanReservations.ts:133) + [supabase/functions/analyze-scan/index.ts:283-417](supabase/functions/analyze-scan/index.ts:283)

**Description.** Pas de lock atomique partagé entre les deux fonctions. Séquence exploitable :

1. T₀ : `analyze-scan` débute, lit `scanRow`, télécharge l'image, lance `postWebhookJson` (timeout 60 s en cours)
2. T₁ : Le client appelle `cancel-scan-reservation` en parallèle → `rollbackScanCharge` :
   - Restaure `scan_usage` et `welcome_credits` (quota remboursé)
   - `DELETE FROM scans WHERE id = $scanId`
   - `storage.from('scan-images').remove([canonicalPath])`
3. T₂ : Webhook IA répond, `analyze-scan` tente `UPDATE scans SET analysis_result WHERE id = $scanId AND user_id = $userId`
4. L'UPDATE n'affecte 0 lignes (scan supprimé en T₁) → `Phase2HttpError(500, 'scan_persistence_failed')` → `pendingRollback` est déclenché → second `rollbackScanCharge` qui crédite à nouveau (la `restoreScanReservationProfile` re-restaure le snapshot, donc cumul de crédits)

**Exploitation.** Boucle automatisée : reserve → analyze (background) → cancel après 1 s → reserve à nouveau immédiatement. Pour un scan de 60 s côté webhook, l'attaquant peut empiler 60 analyses pour 1 quota effectivement consommé. Le LLM provider est facturé 60×.

**Impact.** Abus crédits IA (coût direct chez le provider — OpenAI, Anthropic, etc.), quota effectivement non borné, pression sur l'infrastructure n8n.

**Recommandation.** Introduire une machine d'état explicite `scans.status` :

```sql
ALTER TABLE scans ADD COLUMN status text NOT NULL DEFAULT 'reserved'
  CHECK (status IN ('reserved', 'analyzing', 'analyzed', 'failed', 'cancelled'));
```

Dans `analyze-scan`, **avant** l'appel webhook :

```ts
const { data: claim, error } = await client
  .from('scans')
  .update({ status: 'analyzing' })
  .eq('id', scanId)
  .eq('user_id', user.id)
  .eq('status', 'reserved')   // transition atomique
  .select('id')
  .maybeSingle();

if (!claim) {
  // soit déjà analyzing (concurrent), soit cancelled, soit déjà analyzed
  throw new Phase2HttpError(409, 'scan_analysis_in_progress', '...');
}
```

Dans `cancel-scan-reservation`, vérifier `status = 'reserved'` (idempotent : si `analyzing`, refuser ; si `analyzed`, no-op ; si `cancelled`, no-op).

Cron de nettoyage : `analyzing` → `failed` après 5 min (orphelins des timeouts client/webhook).

**Statut :** ✅ Corrigé dans cette passe.

---

### S-07 — Conformité RGPD : pas de TTL des scans, pas d'effacement Storage à la suppression de compte [P2 — Moyen]

**Catégorie :** Privacy / Conformité · **CWE-359** Exposure of Private Information

**Fichiers :** [supabase/migrations/20251011185556_create_health_scan_tables.sql](supabase/migrations/20251011185556_create_health_scan_tables.sql) + [PRIVACY_POLICY.md](PRIVACY_POLICY.md) + [supabase/functions/cleanup-orphan-user/index.ts](supabase/functions/cleanup-orphan-user/index.ts)

**Description.** Les images scan sont des **données biométriques / liées à la santé** (RGPD art. 9, catégorie spéciale). Aujourd'hui :

1. **Pas de TTL automatique** sur `scans` ni sur les objets du bucket `scan-images`. Une photo de visage prise en 2026 reste indéfiniment.
2. **`scans.user_id REFERENCES user_profiles(id) ON DELETE CASCADE`** ([20251011185556:127](supabase/migrations/20251011185556_create_health_scan_tables.sql:127)) — donc supprimer `user_profiles` cascade vers `scans`. **MAIS** `storage.objects` n'a **pas** de FK vers `scans`. La suppression utilisateur ne nettoie donc **pas automatiquement les fichiers Storage**. À confirmer dans `cleanup-orphan-user` qu'un cleanup explicite est appelé sur le bucket.
3. **Pas d'endpoint utilisateur** `delete-scan` visible — un utilisateur ne peut pas supprimer un scan individuel via une UI gouvernée par le serveur. À confirmer côté UI.
4. **Pas de registre de partage** documenté indiquant que les images sont transférées au sous-traitant n8n / au LLM provider (RGPD art. 30).

**Impact.** Non-conformité RGPD art. 5(1)(e) (limitation conservation), art. 17 (droit à l'effacement), art. 30 (registre des activités de traitement). Risque opérationnel CNIL en cas de plainte/contrôle.

**Recommandation.**

1. **Endpoint `delete-scan`** (Edge Function, JWT user) qui :
   - Vérifie `user_id` du scan
   - DELETE FROM scans
   - storage.from('scan-images').remove([canonicalPath])
   - Best-effort sur `scan_metrics`
2. **Cron `pg_cron` mensuel** : suppression `scans` + objets Storage > 12 mois (ou TTL configurable côté profil).
3. **Hook suppression compte** : étendre `cleanup-orphan-user` (ou `delete-account` Edge function s'il existe) pour purger `scan-images/{userId}/**` après cascade.
4. **Mettre à jour [PRIVACY_POLICY.md](PRIVACY_POLICY.md)** avec : durée de conservation, base légale (consentement art. 9(2)(a) ou intérêt vital art. 9(2)(c)), liste des sous-traitants (n8n, LLM provider — préciser le pays / mécanismes de transfert).
5. **Tests intégration** : créer scan, supprimer compte, vérifier `count(*) FROM storage.objects WHERE bucket_id='scan-images' AND name LIKE '$userId/%' = 0`.

**Statut :** ✅ Corrigé dans cette passe.

---

### S-08 — Logs Edge potentiellement exposent `image_base64` non filtré [P2 — Moyen]

**OWASP :** M9 Insecure Logging · **CWE-532** Insertion of Sensitive Information into Log File

**Fichier :** [supabase/functions/_shared/phase2Observability.ts:14-15](supabase/functions/_shared/phase2Observability.ts:14)

**Description.** `SENSITIVE_KEY_PATTERN` filtre actuellement :

```ts
/(token|secret|password|authorization|cookie|payload|details|webhook_text|response_text|raw_body|request_body|text|content_text|email)/i
```

Ce pattern attrape `payload`, `raw_body`, `text`, mais **n'inclut PAS** `image_base64`, `imageBase64`, `image`, `body` (seul). Si une fonction passe par erreur un contexte du genre `{ image_base64: bytes, scan_id: ... }` à `logPhase2Error`, le base64 entier (jusqu'à 13.3 MB) atterrit dans les logs Supabase Dashboard.

À l'inverse `summarizeWebhookResult` ne propage que `webhook_status` et `response_body_present` plus le `summarizeProviderPayload` qui ne lit que les clés whitelisted (`status`, `code`, `error_code`, `result`, etc.). C'est OK. Mais la défense repose sur le fait qu'**aucun call site** ne passe `image_base64` dans le metadata de `logPhase2Error` — fragile en cas de refactor.

**Exploitation.** Chaîne : un opérateur (ou attaquant ayant compromis le dashboard Supabase via service-role-key fuitée) lit les logs Edge et reconstitue les images PII des utilisateurs.

**Impact.** Fuite de PII médicales via canal opérationnel (logs Supabase ne sont pas chiffrés au repos par défaut, et leur rétention n'est pas RGPD-compliant à moins d'une configuration explicite).

**Recommandation.**

1. Étendre `SENSITIVE_KEY_PATTERN` :

```ts
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|payload|details|webhook_text|response_text|raw_body|request_body|text|content_text|email|image_?base64|image_?bytes|image_?data|^body$)/i;
```

2. Ajouter un test unitaire dans `__tests__/supabase/observability.test.ts` qui invoque `logPhase2Error('test', new Error('e'), { image_base64: 'AAAA', user_id: 'uid' })` et confirme que `image_base64` est absent du log produit.

3. Auditer `fridge-scan-complete` : la fonction lit `rawBody` puis le passe à `assertAuthorizedFridgeScanCallback` pour vérifier la HMAC. En cas d'erreur HMAC, `logPhase2Error('[fridge-scan-complete] Request failed', error, { request_id })` — le `rawBody` n'est pas dans le contexte, OK. Mais en cas d'exception non-Phase2, vérifier qu'aucun `console.error(req)` n'embarque le body.

**Statut :** ✅ Corrigé dans cette passe.

---

### S-09 — Defense-in-depth `super` scan : pas de re-check tier dans `analyze-scan` [P3 — Faible]

**OWASP :** M3 Insecure Authorization · **CWE-602** Client-Side Enforcement of Server-Side Security

**Fichiers :** [supabase/functions/check-and-record-scan/index.ts:287-298](supabase/functions/check-and-record-scan/index.ts:287) + [supabase/functions/analyze-scan/index.ts:296-302](supabase/functions/analyze-scan/index.ts:296)

**Description.** Le check `super → free = refusé` se fait **uniquement** dans `check-and-record-scan` (ou dans la RPC `reserve_scan_quota`). Dans `analyze-scan`, le seul check est `scanRow.scan_type === requestedScanType` (anti-type-mismatch). Si une régression future permettait à un user `free` d'avoir un scan `super` réservé en DB (race condition, bug dans la RPC, accès direct à la table en service-role), `analyze-scan` n'opposerait aucun barrage tier.

Aujourd'hui non exploitable (cohérence des deux fonctions + RLS), mais c'est un trou de defense-in-depth typique : tout refactor futur de la RPC ou de `check-and-record-scan` peut ouvrir le bypass.

**Recommandation.** Dans `analyze-scan`, après lookup `scanRow`, ajouter (uniquement si `requestedScanType === 'super'`) :

```ts
if (requestedScanType === 'super') {
  const { data: profile } = await client
    .from('user_profiles')
    .select('account_tier')
    .eq('id', user.id)
    .single();
  if (profile?.account_tier === 'free') {
    throw new Phase2HttpError(403, 'super_scan_premium_required', 'Super scan requires premium');
  }
}
```

**Statut :** ⏳ À corriger (defense-in-depth).

---

### S-10 — `analyze-scan` retry → double facturation IA [P3 — Faible]

**OWASP :** M3 Insufficient Authentication · **CWE-352 partiel** (replay côté client)

**Fichier :** [supabase/functions/analyze-scan/index.ts:305-385](supabase/functions/analyze-scan/index.ts:305)

**Description.** `isStoredScanAnalysisComplete(scanRow)` rend la fonction idempotente une fois `analysis_result` et `analyzed_at` posés. Mais entre la réservation et la fin de l'analyse, **rien ne dédupe les invocations concurrentes** : un client qui timeout côté UI à 30 s (alors que webhook=60 s) puis retry `analyze-scan` déclenche un second appel webhook IA pour le même `scan_id`. L'utilisateur est facturé 2× côté provider (LLM crédits) pour 1 résultat final.

**Exploitation.** Pas vraiment malveillante (auto-DoS du compte plutôt que abus inter-comptes), mais combinée à S-06 (cancel race) elle amplifie les abus de coût.

**Recommandation.** Couverte par la machine d'état proposée dans S-06 : la transition `reserved → analyzing` (CAS atomique) bloque tout `analyze-scan` concurrent avec `409 scan_analysis_in_progress`. Le client interprète ce code comme "polling jusqu'à `analyzed`".

**Statut :** ✅ Couvert par S-06.

---

### S-11 — Hygiène : nettoyage Storage incomplet en cas de rollback (paths non canoniques) [P3 — Faible]

**Fichier :** [supabase/functions/_shared/scanReservations.ts:133-200](supabase/functions/_shared/scanReservations.ts:133)

**Description.** `rollbackScanCharge` supprime correctement `scans` row + `storage.objects` au **path canonique** (`{userId}/scans/{scanId}.jpg`). Bonne couverture. **Mais** :

1. Si l'attaque S-04 (legacy_inferred) est réalisée, l'image est uploadée à un path non canonique → le rollback ne la supprime pas → orphelin Storage.
2. `console.error('[scan-reservations] Failed to remove refunded scan image:', removeStorageError)` ([scanReservations.ts:198](supabase/functions/_shared/scanReservations.ts:198)) — ce log direct embarque potentiellement le path complet (donc `userId`). Voir B-05 / S-08.

**Recommandation.**

1. Une fois S-04 résolu (déprécier legacy_inferred), le risque d'orphelins par cette voie disparaît.
2. Cron mensuel : SELECT `storage.objects` du bucket `scan-images` sans `scans.image_path` correspondant → DELETE.
3. Migrer le `console.error` vers `logPhase2Error` (couvert par B-05 + S-08).

**Statut :** ✅ Corrigé dans cette passe (fenêtre legacy_inferred resserrée à 1s + log d'alerte).

---

## Findings écartés après vérification

| Reporté / hypothèse | Sévérité initiale | Raison du rejet |
|---|---|---|
| RLS storage cross-user `scan-images` | P0 | Policies correctes : `(storage.foldername(name))[1] = auth.uid()::text AND ...[2] = 'scans'` ([20260407120000:440-479](supabase/migrations/20260407120000_phase1_hardening.sql:440)). Pas d'IDOR cross-user. |
| EXIF non strippée | P1 | Confirmé déjà résolu côté FRONTEND_SECURITY_AUDIT — `manipulateAsync({ format: JPEG })` re-encode et strippe ([api.ts:1185](services/api.ts:1185)). |
| `reserve_scan_quota` race | P1 | RPC SECURITY DEFINER avec `FOR UPDATE` sur `user_profiles` ([20260424090000:400](supabase/migrations/20260424090000_security_hardening.sql:400)). Atomique. Grants restreints à `service_role`. |
| Path traversal `analyze-scan` | P1 | `objectPath` dérivé en interne via `buildCanonicalScanImagePath(user.id, scanRow.id)` — pas d'input utilisateur (B-04 faux positif déjà documenté). |
| XSS via `analysis_result` côté mobile | P1 | Rendu `<Text>` natif après normalisation `tryNormalizeAnalysisResult` qui convertit en enum keys (sauf `fat_distribution_scan_v2` — voir S-05). |
| Webhook callback `fridge-scan-complete` non signé | P0 | HMAC + timestamp 5 min + comparaison constante ([fridge-scan-complete:54-101](supabase/functions/fridge-scan-complete/index.ts:54)). Robuste. |
| OAuth state PRNG (P0-2 frontend) | P0 | Déjà corrigé dans Phase 1 frontend (cf. FRONTEND_SECURITY_AUDIT) — polyfill `react-native-get-random-values`. |
| Tokens AsyncStorage (P0-1 frontend) | P0 | Déjà corrigé dans Phase 1 frontend — `expo-secure-store`. |
| RLS user_profiles `USING (true)` (B-01) | P0 | Déjà documenté + corrigé dans BACKEND_SECURITY_AUDIT — pas de duplication. |

---

## Plan de remédiation priorisé

| ID | Sévérité | Effort estimé | Bénéfice |
|----|----------|---------------|----------|
| S-01 | P1 | 30 min | Bloque polyglots / file upload non-JPEG |
| S-02 | P1 | 1 h | Anti-SSRF + protection PII médicales sortant |
| S-03 | P2 | 15 min | Borne taille = borne coût LLM |
| S-04 | P2 | 1-2 h (vérif prod incluse) | Élimine bypass de validation par fallback |
| S-05 | P2 | 1 h | Borne stockage JSONB + XSS résiduel web |
| S-06 | P2 | 2-3 h (migration + refactor) | Élimine race + abus quota IA |
| S-07 | P2 | 4-8 h | Conformité RGPD (réduit risque CNIL) |
| S-08 | P2 | 1 h | Empêche fuite PII via logs |
| S-09 | P3 | 30 min | Defense-in-depth tier |
| S-10 | P3 | — | Couvert par S-06 |
| S-11 | P3 | — | Couvert par S-04 + cron de cleanup |

### Dans la journée

1. S-01 (magic bytes) + S-03 (borne taille) — patch trivial dans `analyze-scan`
2. S-08 (étendre regex sensible) + test unitaire `__tests__/supabase/observability.test.ts`

### Cette semaine

3. S-02 (whitelist hostname) — factoriser `_shared/webhookHostAllowlist.ts` et appliquer scan + fridge
4. S-09 (re-check tier super) — 5 lignes de defense-in-depth
5. S-05 (bornes textuelles `fat_distribution_scan_v2`)

### Avant production large / audit RGPD

6. S-06 (machine d'état `scans.status`) — migration + refactor
7. S-04 (déprécier legacy_inferred) — vérifier prod avant
8. S-07 (delete-scan endpoint + cron + politique de confidentialité)

---

## Playbook tests locaux

Le sandbox Claude bloque l'automatisation contre la prod (cf. `feedback_pentest_tooling`) — ce playbook se lance manuellement contre `supabase start` (instance locale 127.0.0.1).

### Setup

```bash
# Démarrer Supabase local
cd supabase && supabase start
# → Note SUPABASE_URL=http://127.0.0.1:54321, ANON_KEY, SERVICE_ROLE_KEY

# Pousser les migrations (recrée bucket scan-images, RLS, RPC)
supabase db reset

# Mock webhook n8n simple (Node.js)
node -e "require('http').createServer((q,r)=>{q.on('data',()=>{}).on('end',()=>{r.writeHead(200,{'Content-Type':'application/json'});r.end('{\"scan_type\":\"face\",\"face_score\":80,\"face_shape_key\":\"oval\",\"perceived_age\":30,\"skin_quality_score\":70,\"symmetry_percentage\":85,\"fatigue_level\":3,\"collagen_level\":7,\"hydration_level\":6,\"photogenic_score\":75}')})}).listen(9999)" &

# Configurer la fonction
supabase secrets set N8N_SCAN_ANALYZE_WEBHOOK_URL=http://127.0.0.1:9999
supabase functions serve analyze-scan check-and-record-scan
```

### Cas de test

| ID | Étapes | Avant fix | Après fix |
|----|--------|-----------|-----------|
| **S-01** | (1) `check-and-record-scan` pour obtenir `scan_id`. (2) `curl -X PUT $SUPABASE_URL/storage/v1/object/scan-images/$USER/scans/$SCAN.jpg -H "Authorization: Bearer $JWT" -H "Content-Type: image/jpeg" --data-binary @malicious.pdf` (3) `POST $SUPABASE_URL/functions/v1/analyze-scan {"scan_id":"...","scan_type":"health"}` | webhook reçoit le PDF base64 (succès, payload corrompu) | `400 invalid_scan_image_content` |
| **S-02** | `supabase secrets set N8N_SCAN_ANALYZE_WEBHOOK_URL=http://localhost:9999`, redeploy, appel `analyze-scan` | tente le POST HTTP → succès local | `503 scan_webhook_not_configured` |
| **S-03** | Forcer un upload de 11 MB via service-role (bypass bucket file_size_limit) puis `analyze-scan` | webhook reçoit ~14 MB base64 | `413 scan_image_too_large` |
| **S-04** | Réserver scan A. Upload une image B à `{user}/scans/<random>.jpg`. Appeler `analyze-scan` avec scan_id_A. | webhook reçoit l'image B | `404 scan_image_not_found` |
| **S-05** | Mock webhook : `{ scan_type: "fat_distribution_scan_v2", analysis_summary: "A".repeat(1_000_000), areas_analysis: [{...}, ...×100] }` | 1 MB stocké dans `analysis_result` | summary tronqué à 4000 chars, areas limités à 20 |
| **S-06** | `analyze-scan` (mock webhook lent 30 s) puis `cancel-scan-reservation` 2 s plus tard, en parallèle | quota cumulé / orphelin | `409 scan_analysis_in_progress` côté cancel, ou `200` cancel + analyze rejette `404` |
| **S-07** | `DELETE FROM auth.users WHERE id=$USER` → `SELECT count(*) FROM scans WHERE user_id=$USER` ET `SELECT count(*) FROM storage.objects WHERE bucket_id='scan-images' AND name LIKE '$USER/%'` | scans=0 mais storage.objects > 0 | scans=0 ET storage.objects=0 |
| **S-08** | Provoquer une erreur webhook (timeout) → `supabase functions logs analyze-scan \| grep image_base64` | base64 visible dans les logs si call site fautif | 0 occurrence |
| **S-09** | User `free` → patch DB `INSERT INTO scans (user_id, scan_type) VALUES ('$USER', 'super')` (en service-role) → `analyze-scan` | analyse part | `403 super_scan_premium_required` |

### Régression

```bash
npm test -- --runInBand __tests__/supabase/scan
npm test -- --runInBand __tests__/services/scanEligibility
npx supabase db lint --linked --level warning
npm run typecheck
```

---

## Annexes

### Contrôles positifs observés

- ✅ RLS storage scoped `auth.uid() AND foldername[2] = 'scans'`
- ✅ Bucket `scan-images` privé + `file_size_limit=10 MB` + `allowed_mime_types=['image/jpeg']`
- ✅ RPC `reserve_scan_quota` SECURITY DEFINER + FOR UPDATE atomique + grants service_role only
- ✅ `analyze-scan` `requireAuthenticatedUser` + `assertNoUnknownKeys` + `assertUuidLike`
- ✅ Idempotence `analyze-scan` via `isStoredScanAnalysisComplete`
- ✅ `fridge-scan-complete` HMAC + timestamp 5 min + `timingSafeEqual`
- ✅ `fridge-scan-submit` borne explicite 6 MB pré-decode
- ✅ EXIF strippée côté client par `manipulateAsync({ format: JPEG })`
- ✅ Normalisation client `analysisNormalization.ts` → enum keys (sauf `fat_distribution_scan_v2`)
- ✅ Rendu `<Text>` natif sur mobile (pas de DOM, pas de XSS)
- ✅ Authenticated upload via Bearer JWT + `requireCurrentSessionForUser` (anti-mismatch)
- ✅ Webhook outbound HMAC signé si configuré ([phase2Webhook.ts:69-80](supabase/functions/_shared/phase2Webhook.ts:69))

### Fichiers critiques de référence

```
supabase/functions/
├── check-and-record-scan/index.ts          (réservation quota)
├── analyze-scan/index.ts                    (★ orchestration IA — surface principale)
├── cancel-scan-reservation/index.ts         (rollback)
├── fridge-scan-submit/index.ts              (pipeline fridge)
├── fridge-scan-complete/index.ts            (callback HMAC)
└── _shared/
    ├── scanWebhookPool.ts                   (★ S-02 hostname allowlist)
    ├── scanAnalysis.ts                      (★ S-05 bornes contenu)
    ├── scanImageLookup.ts                   (★ S-04 legacy_inferred)
    ├── scanReservations.ts                  (rollback + S-11 orphelins)
    ├── phase2Webhook.ts                     (HMAC outbound)
    └── phase2Observability.ts               (★ S-08 SENSITIVE_KEY_PATTERN)

supabase/migrations/
├── 20251011185556_create_health_scan_tables.sql  (CREATE TABLE scans + FK CASCADE)
├── 20260407120000_phase1_hardening.sql           (★ bucket scan-images + RLS storage)
├── 20260420130000_add_fridge_scan_pipeline.sql   (fridge_scans table)
├── 20260424090000_security_hardening.sql         (★ RPC reserve_*_quota SECURITY DEFINER)

shared/
├── scanContract.ts                          (buildCanonicalScanImagePath, isAppScanType)
└── fridgeScanContract.ts                    (FRIDGE_SCAN_PREMIUM_DAILY_LIMIT, …)

services/
├── api.ts                                   (createScan, analyzeScan, MAX_SCAN_IMAGE_SIZE_BYTES=12 MB)
├── authenticatedStorage.ts                  (uploadAuthenticatedStorageObject)
└── fridgeScan.ts

utils/
└── analysisNormalization.ts                 (★ S-05 normalisation client)

screens/
├── ScannerScreen.tsx                        (capture)
├── ScanPreviewScreen.tsx                    (upload + suivi)
└── ScanResultScreen.tsx                     (rendu via <Text>)
```

### Audits associés

- [SECURITY_AUDIT_SUPABASE.md](SECURITY_AUDIT_SUPABASE.md) — Edge Functions, secrets, CORS, advisors
- [BACKEND_SECURITY_AUDIT.md](BACKEND_SECURITY_AUDIT.md) — RLS, SSRF (B-04 fridge), IDOR, mass assignment
- [FRONTEND_SECURITY_AUDIT.md](FRONTEND_SECURITY_AUDIT.md) — stockage, OAuth, gates, EXIF, signed URLs
- [TRUST_BOUNDARIES.md](TRUST_BOUNDARIES.md) — frontières client / Edge / DB
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md) — mise à jour S-07 (rétention, cron orphelins, suppression compte)

---

## Fichiers modifiés / créés dans cette passe

```
A  supabase/functions/_shared/webhookHostAllowlist.ts                 (S-02)
M  supabase/functions/_shared/scanWebhookPool.ts                       (S-02)
M  supabase/functions/_shared/fridgeScanWebhook.ts                     (S-02)
M  supabase/functions/_shared/phase2Observability.ts                   (S-08)
M  supabase/functions/_shared/scanAnalysis.ts                          (S-05)
M  supabase/functions/_shared/scanImageLookup.ts                       (S-04)
M  supabase/functions/analyze-scan/index.ts                            (S-01+S-03+S-06+S-09)
M  supabase/functions/cancel-scan-reservation/index.ts                 (S-06)
A  supabase/functions/delete-scan/index.ts                             (S-07)
M  supabase/functions/cleanup-orphan-user/index.ts                     (S-07 — purge_user_scan_data)
M  supabase/config.toml                                                 (S-07 delete-scan verify_jwt)
M  supabase/functions/active-edge-functions.json                        (S-07)
A  supabase/migrations/20260426150000_scanner_status_machine.sql       (S-06)
A  supabase/migrations/20260426160000_cleanup_orphan_scan_images.sql   (S-07 cron + RPC purge)
M  shared/scanContract.ts                                              (S-01+S-03+S-07 constantes)
M  services/api.ts                                                     (S-06 polling 409)
M  PRIVACY_POLICY.md                                                   (S-07 rétention + cron + droit effacement)
A  __tests__/supabase/phase2Observability.test.ts                      (S-08)
A  __tests__/supabase/webhookHostAllowlist.test.ts                     (S-02)
M  __tests__/supabase/scanContract.test.ts                             (S-01+S-03)
M  __tests__/supabase/scanAnalysis.test.ts                             (S-05)
M  __tests__/supabase/scanImageLookup.test.ts                          (S-04)
M  SCANNER_SECURITY_AUDIT.md                                           (statuts ⏳ → ✅)
```

## Vérifications effectuées

- ✅ Magic bytes JPEG (FF D8 FF) validés côté Edge avant envoi au webhook IA
- ✅ Allowlist hostname webhook (env `WEBHOOK_ALLOWED_HOSTS`) appliquée au pool scan ET fridge — protocole HTTPS forcé sauf localhost+`WEBHOOK_ALLOW_HTTP=true`
- ✅ Borne taille image (10 MB) post-download dans `analyze-scan`
- ✅ Re-check `account_tier` pour `super` dans `analyze-scan` (defense-in-depth)
- ✅ Fenêtre `legacy_inferred` resserrée à 1 s + log d'alerte structuré quand le fallback est déclenché
- ✅ Bornes longueurs sur tous les champs textuels libres de `fat_distribution_scan_v2` et `super_health_v2` (4000 / 2000 / 200) + strip caractères de contrôle + cap 20 items sur `areas_analysis` et `priority_zones`
- ✅ Machine d'état `scans.status` (`reserved | analyzing | analyzed | failed | cancelled`) avec transitions atomiques via RPC `claim_scan_for_analysis`, `finalize_scan_analysis`, `cancel_reserved_scan` (toutes SECURITY DEFINER, grants service_role)
- ✅ Polling 409 `scan_analysis_in_progress` côté client (jusqu'à 30 × 1.5 s) → résolution idempotente via `analyzed` côté Edge
- ✅ Edge Function `delete-scan` user-facing (RGPD art. 17) avec purge `scans` + `scan_metrics` + Storage best-effort
- ✅ Cron `pg_cron` horaire `cleanup_orphan_scan_images` (orphelins > 24h) avec batch 1000
- ✅ RPC `purge_user_scan_data` invoquée par `cleanup-orphan-user` à la suppression de compte
- ✅ `SENSITIVE_KEY_PATTERN` étendu pour matcher `image_base64`, `imageBase64`, `image_bytes`, `image_data`, `image_blob`, `image_buffer`, `image_content`, `^body$`, `^image$`
- ✅ Politique de confidentialité mise à jour (FR + EN) : rétention, cron orphelins, droit à l'effacement, base légale RGPD art. 9

## Reste à faire (post-déploiement)

- Configurer `WEBHOOK_ALLOWED_HOSTS` (et éventuellement `N8N_SCAN_ANALYZE_WEBHOOK_URL[S]`) dans les secrets Supabase avant redéploiement de `analyze-scan` / `fridge-scan-submit`. Sans cette env, les fonctions retourneront `503 scan_webhook_not_configured` (échec sécurisé).
- Redéployer : `supabase functions deploy analyze-scan cancel-scan-reservation delete-scan cleanup-orphan-user fridge-scan-submit fridge-scan-complete`
- Appliquer les 2 nouvelles migrations : `supabase db push`
- Vérifier que `pg_cron` s'est bien activée (via `SELECT * FROM pg_extension WHERE extname='pg_cron';`). Si non, activer manuellement et relancer la migration.
- Vérifier en prod le compteur `SELECT count(*) FROM scans WHERE image_path IS NULL;` — si > 0, monitorer les logs `legacy_inferred fallback` pour suivre la convergence.

### Références externes

- OWASP Mobile Top 10 (2024) — <https://owasp.org/www-project-mobile-top-10/>
- CWE Top 25 — <https://cwe.mitre.org/top25/>
- RGPD art. 9 (catégories spéciales de données) — <https://gdpr-info.eu/art-9-gdpr/>
- Supabase Storage RLS — <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase Edge Functions Webhooks — <https://supabase.com/docs/guides/functions>
