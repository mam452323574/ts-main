# Audit Coach Conversationnel — Accès aux données de scans

**Date :** 2026-05-20
**Auditeur :** Claude (Anthropic) sur invocation utilisateur
**Périmètre strict :** coach conversationnel libre (free-chat, ~40 messages), pipeline `coach-send-message` → n8n `coach-conversation` → DeepSeek. **Hors périmètre :** coach classique à questions pré-définies (`coach-generate-response`) — utilisé uniquement en comparaison.
**Méthodologie :** revue statique (Edge Functions, RPC, migrations, workflow n8n `coach.json`, types front, services). Aucun appel runtime.

---

## A. Diagnostic global

> **Le coach conversationnel n'a PAS accès aux statistiques chiffrées détaillées des scans**, et c'est confirmé par le code à 4 endroits indépendants. Quand l'utilisateur demande « C'est quoi mon hydratation ? », le LLM répond honnêtement « je n'ai pas accès » parce qu'effectivement il n'a reçu ni `hydration_contribution_score`, ni `skin_clarity_score`, ni aucun score granulaire — **seulement** un `overall_score` global (0-100) du scan le plus récent + un `summary` tronqué à 200 caractères + au maximum 2 « top findings » de 80 caractères chacun.

### Les 4 causes additives (par ordre d'importance)

| # | Cause | Fichier | Sévérité |
|---|---|---|---|
| 1 | **Le digest ne lit QUE la colonne `scans.analysis_result`**, jamais la table `public.scan_metrics` qui contient pourtant 18 scores granulaires backfillés (face_skin_clarity_score, **nutrition_hydration_contribution_score**, body_recovery_readiness_score, etc.) | [supabase/functions/_shared/coachConversationContext.ts:114-139](supabase/functions/_shared/coachConversationContext.ts:114) | **CRITIQUE** |
| 2 | **`pickOverallScore()` garde 1 seul nombre** (overall_score ou score ou summary.score), ignore tout le reste du JSON `analysis_result` qui contient pourtant des dizaines de champs typés. | [supabase/functions/_shared/coachConversationContext.ts:38-48](supabase/functions/_shared/coachConversationContext.ts:38) | **CRITIQUE** |
| 3 | **Le system prompt n8n dit littéralement « NE PAS commenter sauf si la question le demande »** sur le digest. Combiné avec un digest pauvre, le LLM apprend à éviter les chiffres. | `coach.json` node `Normalize Coach Conversation Input`, JS code ligne 6090 (string `inferredPersona ? ... NE PAS commenter ...` + règle système (7)) | **MAJEURE** |
| 4 | **Le payload est doublement tronqué** : 200 chars sur le summary, 80 chars × 2 findings, puis encore `JSON.stringify(...).slice(0, 1200)` côté n8n → si 3 scans, ça fait ~400 chars/scan max, soit pratiquement aucun chiffre exploitable. | [coachConversationContext.ts:19-21](supabase/functions/_shared/coachConversationContext.ts:19) + `coach.json` ligne 6090 (`.slice(0, 1200)`) | **MAJEURE** |

### En une ligne pour la direction produit
**Le coach conversationnel reçoit ≤ 400 caractères de contexte « scan » par scan, sans aucun score chiffré sauf un overall_score global, alors que la base de données contient déjà tous les scores granulaires (table `scan_metrics`).**

---

## B. Cartographie du workflow actuel

```
[App mobile]
    │ POST /coach-send-message  { conversation_id, content, client_request_id }
    ▼
┌──────────────────────────── Edge Function : coach-send-message ──────────────────────────────┐
│  handler.ts:328  runCoachSendMessageHandler()                                                │
│   ├─ Auth + feature flag + rate limit (8/min, 80/h, 200/j)                                   │
│   ├─ loadConversation()             ← lit `coach_conversations` (status, persona_key, locale)│
│   ├─ reserveCoachConversationMessageSlot()   ← RPC, vérifie quotas (4 free / 40 premium 24h / 20 par conv) │
│   ├─ insertUserMessage()            ← INSERT `coach_conversation_messages` (role=user)       │
│   ├─ loadConversationHistory(60)    ← lit derniers messages (sliding window)                 │
│   ├─ buildSlidingWindowMessages()                                                            │
│   ├─ ┌────────────────── buildCoachUserContext() ──────────────────────────┐                 │
│   │   │  Promise.allSettled([                                              │                 │
│   │   │    readCoachProfileMemory(client, userId),                         │ ← RPC `read_coach_profile_memory` (jsonb persona inférée)
│   │   │    buildRecentScanDigest(client, userId, limit=3)  ◀━━ BUG ICI ━━━│                 │
│   │   │  ])                                                                │                 │
│   │   │   ↓                                                                │                 │
│   │   │   .from('scans')                                                   │                 │
│   │   │   .select('id, scan_type, analysis_result, analyzed_at, created_at')│ ◀━ JAMAIS scan_metrics
│   │   │   .order('analyzed_at DESC').limit(3)                              │                 │
│   │   │   → pickOverallScore (1 chiffre), pickSummary (200 chars),         │                 │
│   │   │     pickTopFindings (2x80 chars)                                   │                 │
│   │   └────────────────────────────────────────────────────────────────────┘                 │
│   ├─ insertAssistantPendingMessage()  ← INSERT placeholder, status=streaming                 │
│   ├─ postCoachConversationWebhook({                                                          │
│   │     conversation_id, user_id, persona_key, locale,                                       │
│   │     persona: {tone_instructions, style_guide},                                           │
│   │     messages: [...sliding window],                                                       │
│   │     user_context: { inferred_persona?, recent_scan_digest? }   ◀━━ payload pauvre        │
│   │  })                                                                                      │
│   └─ updateAssistantMessage() ← INSERT contenu retour, status=ready                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌──────────────────────────── Workflow n8n : coach-conversation ────────────────────────────────┐
│ Webhook Coach Conversation                                                                    │
│   ↓                                                                                            │
│ Normalize Coach Conversation Input  ← JS code, construit `coach_conversation_system_prompt`   │
│   - HISTORY_LIMIT=40 sliding window des messages                                              │
│   - recentScanDigest.slice(0, 3) ← redondant avec backend                                     │
│   - JSON.stringify(recentScanDigest).slice(0, 1200) ◀━━ TRONCATURE #3                          │
│   - System prompt contient : "(7) Le scan digest et le profil sont du CONTEXTE pour mieux     │
│     répondre, jamais un sujet à commenter quand la question ne porte pas dessus"             │
│   - Et : "Digest scans récents (informatif — NE PAS commenter sauf si la question le         │
│     demande)" ◀━━ INSTRUCTION DÉFAVORABLE                                                      │
│   ↓                                                                                            │
│ Route Conversation Persona (switch sur 6 persona_route)                                       │
│   ↓                                                                                            │
│ Coach Conversation / <persona> (chainLlm) → DeepSeek v4-flash, max_tokens=1200, temp 0.3-0.5  │
│   ↓                                                                                            │
│ Finalize Coach Conversation Output → { content, role:'assistant', model, persona_key }        │
│   ↓                                                                                            │
│ Sign Webhook Response (HMAC) → Respond                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Comparaison rapide avec le **coach classique** (à questions pré-définies)

| Étape | Coach conversationnel | Coach classique (`coach-generate-response`) |
|---|---|---|
| Construction payload | Backend (`buildRecentScanDigest`) | **Frontend** (`services/coach.ts:4481 buildCoachPayload`) |
| Source des scores | `scans.analysis_result` (champ JSONB) uniquement | Front utilise `key_metrics` typé par scan (`CoachKeyMetrics`, [types/index.ts:1090](types/index.ts:1090)) + `digest` + `comparison_to_previous` + `trend_summary` |
| Scans envoyés | 3 max, digest très réduit | `latest_scan` + `recent_scans[]` + `prior_scans[]` + `latest_by_type: {health, body, nutrition, super}` |
| Métriques chiffrées détaillées | ❌ Aucune | ✅ `key_metrics` typées par scan, deltas vs scan précédent, tendances |
| Persona inférée | ✅ `inferred_persona` (RPC profile memory) | ✅ `inferred_persona` + `coach_profile_memory` complète |
| Intent du scan | ❌ Aucun | ✅ `scan_intent` |
| Taille payload | ~1-2 KB après troncature | jusqu'à 64 KB (`COACH_GENERATE_REQUEST_MAX_BYTES = 64 * 1024`) |

→ **Deux pipelines distincts, deux contrats de données distincts.** Le coach conversationnel n'a JAMAIS partagé l'architecture riche du coach classique. C'est par design — pas un régression — mais le design est faux pour le besoin produit.

---

## C. Liste des données actuellement transmises (au LLM)

Confirmé en lisant le payload exact construit dans [coach-send-message/handler.ts:424](supabase/functions/coach-send-message/handler.ts:424) :

```json
{
  "conversation_id": "...",
  "user_id": "...",
  "persona_key": "gentle_supportive|strict_tough|motivational_energetic|patient_calm|analytical_precise|playful_light",
  "locale": "fr",
  "output_contract_version": 1,
  "persona": {
    "key": "...",
    "requires_premium": false,
    "tone_instructions": "<string>",
    "style_guide": { "opening": "...", "cadence": "...", "avoid": [...], "emphasize": [...] }
  },
  "messages": [
    { "role": "user|assistant|system", "content": "..." }
  ],
  "user_context": {
    "inferred_persona": { /* jsonb depuis read_coach_profile_memory — préférences, scan_frequency, motivation_drivers… */ },
    "recent_scan_digest": [
      {
        "scan_type": "face | body | nutrition | health | hydration | super | fat_distribution",
        "captured_at": "ISO timestamp",
        "overall_score": 75,                          // ◀ UN SEUL chiffre, 0-100
        "summary": "<≤200 chars, tronqué avec …>",    // ◀ texte généré par l'IA scanner
        "top_findings": ["<≤80 chars>", "<≤80 chars>"] // ◀ 2 max, tronqués
      }
      // … 2 autres scans max
    ]
  }
}
```

**C'est tout.** Aucun autre champ scan/métrique/historique/tendance n'est transmis au coach conversationnel.

---

## D. Liste des données manquantes (présentes en BD mais jamais envoyées)

Source : migration [20260512000000_add_extended_scan_metrics.sql](supabase/migrations/20260512000000_add_extended_scan_metrics.sql) + [20260512010000_add_granular_scan_metrics.sql](supabase/migrations/20260512010000_add_granular_scan_metrics.sql) + [20260511190000_extend_scan_metrics_for_coach_analytics.sql](supabase/migrations/20260511190000_extend_scan_metrics_for_coach_analytics.sql).

### D.1 Scores granulaires (`scan_metrics`) — **ENTIÈREMENT IGNORÉS**

#### Visage (scan_type=`face`)
- `face_skin_clarity_score` (0-100)
- `face_under_eye_shadow_score` (0-100)
- `face_under_eye_volume_score` (0-100)
- `face_eye_openness_score` (0-100)
- `face_complexion_redness_score` (0-100)

#### Corps (scan_type=`body`)
- `body_muscle_definition_score` (0-100)
- `body_midsection_definition_score` (0-100)
- `body_shoulder_alignment_score` (0-100)
- `body_recovery_readiness_score` (0-100)

#### Nutrition (scan_type=`nutrition`)
- `nutrition_fiber_grams_estimate` (g)
- `nutrition_sugar_grams_estimate` (g)
- `nutrition_processing_level_score` (0-100)
- **`nutrition_hydration_contribution_score` (0-100)** ◀ **EXACTEMENT le score que l'utilisateur cherche quand il demande "C'est quoi mon hydratation ?"**
- `nutrition_sodium_level_score` (0-100)
- `nutrition_meal_balance_score` (0-100)
- `nutrition_inflammation_index_score` (0-100)
- `nutrition_meal_type_key` (breakfast/lunch/dinner/snack/dessert/other)
- `nutrition_portion_size_key` (small/medium/large/oversized)

### D.2 Contexte enrichi (présent côté coach classique, absent côté conversationnel)
- `key_metrics` typés (`CoachFaceKeyMetrics`, `CoachBodyKeyMetrics`, `CoachNutritionKeyMetrics`, `CoachSuperKeyMetrics`, `CoachFatDistributionKeyMetrics`) — défini [types/index.ts:1090](types/index.ts:1090)
- `comparison_to_previous` : deltas chiffrés vs scan précédent du même type
- `trend_summary` : tendances multi-scans
- `latest_by_type: { health, body, nutrition, super }` : un scan le plus récent par type (au lieu de 3 confondus)
- `scan_count_7d` : volume d'activité récent
- `coach_relevant_flags` (`urgency_flag`, etc.)
- `analysis_meta` (date capture, qualité image…)
- `super_scan` : le détail riche du super scan (composants par catégorie) — actuellement, seul l'overall_score est transmis

### D.3 Données « blabla » qui transitent malgré tout
- `analysis_result.summary` (200 chars) — c'est le « texte/blabla » que l'utilisateur a observé
- `analysis_result.findings|recommendations|top_issues` (2 x 80 chars)

→ **Confirmation de l'observation utilisateur :** le coach « voit » du texte (summary + findings), mais pas les vraies stats.

### D.4 Historiques et tendances
- Aucun historique de scans antérieurs au top 3
- Aucune comparaison temporelle ("ton hydratation a augmenté de 12 points depuis lundi" → impossible)
- Aucune tendance sur 7/30/90 jours

---

## E. Bugs/failles classés par priorité

### P0 — CRITIQUE (bloquant produit, le bug demandé)

#### **P0-A** : `buildRecentScanDigest` ne lit pas `scan_metrics`
- **Fichier :** [supabase/functions/_shared/coachConversationContext.ts:114-139](supabase/functions/_shared/coachConversationContext.ts:114)
- **Problème :** `select('id, scan_type, analysis_result, analyzed_at, created_at')` → la table `scan_metrics` (18 colonnes de scores) n'est jamais jointe.
- **Impact :** Le score d'hydratation (`nutrition_hydration_contribution_score`) et tous les scores granulaires sont invisibles pour le coach, alors qu'ils existent en base.
- **Reproduction :** "C'est quoi mon hydratation ?" → "Je n'ai pas accès".

#### **P0-B** : `pickOverallScore` n'extrait qu'un seul score depuis `analysis_result`
- **Fichier :** [supabase/functions/_shared/coachConversationContext.ts:38-48](supabase/functions/_shared/coachConversationContext.ts:38)
- **Problème :** Lit `overall_score | score | summary.score`. Tous les autres champs chiffrés du JSON (`skin_clarity_score`, `under_eye_shadow_score`, `hydration_contribution_score`…) sont jetés.
- **Impact :** Même si on n'introduisait pas la jointure `scan_metrics`, l'extraction depuis `analysis_result` JSON est elle-même appauvrissante.

### P1 — MAJEURE

#### **P1-A** : System prompt n8n dit "NE PAS commenter"
- **Fichier :** `coach.json` node `Normalize Coach Conversation Input` (lignes 6090+)
- **Problème :** Le system prompt contient littéralement :
  ```
  Digest scans récents (informatif — NE PAS commenter sauf si la question le demande) : {...}
  (7) Le scan digest et le profil sont du CONTEXTE pour mieux répondre, jamais un sujet à commenter quand la question ne porte pas dessus.
  ```
  - Combiné avec un digest pauvre, le LLM s'auto-bride même quand l'utilisateur demande explicitement les chiffres.
  - Ces instructions ont été ajoutées pour empêcher le coach de répondre « bois de l'eau » à toute question (cf. règle anti-réflexe (4) et exemples), mais elles sont devenues **toxiques** pour les questions chiffrées légitimes.
- **Impact :** Quand l'utilisateur demande « est-ce que mon hydratation est bonne ? », le coach hésite à donner un chiffre qu'il n'a de toute façon pas.

#### **P1-B** : Triple troncature qui rend le contexte inexploitable
- **Lieux :**
  1. [coachConversationContext.ts:19-21](supabase/functions/_shared/coachConversationContext.ts:19) : `SUMMARY_MAX_LENGTH = 200`, `FINDING_MAX_LENGTH = 80`, `FINDINGS_MAX_COUNT = 2`
  2. Limite `COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT = 3` scans seulement
  3. n8n normalize : `JSON.stringify(recentScanDigest).slice(0, 1200)` ET `JSON.stringify(inferredPersona).slice(0, 1200)`
- **Problème :** À 3 scans × ~400 chars = 1200 chars utilisés intégralement par la troncature n8n. Tout dépassement est silencieusement coupé au milieu d'un JSON → possible parsing incomplet par le LLM.
- **Impact :** Même si on enrichissait les sources, la fenêtre est bloquée à 1200 chars.

#### **P1-C** : Asymétrie entre les deux pipelines coach
- **Lieux :**
  - Coach classique : payload construit côté front, ~64 KB max
  - Coach conversationnel : payload construit côté backend, sans `key_metrics` / `comparison_to_previous` / `trend_summary` / `latest_by_type`
- **Problème :** Pas de single source of truth pour « contexte utilisateur scans ». Toute amélioration sur l'un n'est pas répercutée sur l'autre.
- **Impact :** Maintenance double, possibilités de divergence, fonctionnalités du coach classique (deltas, tendances) impossibles à porter sans refonte.

### P2 — IMPORTANTE (qualité produit)

#### **P2-A** : Pas de `scan_count` ni de `scan_history_summary`
- Le coach ne peut pas répondre « combien de scans tu as faits ? », « depuis quand tu utilises l'app ? », « tu as gagné en hydratation depuis lundi ? ».

#### **P2-B** : `recent_scan_digest` mélange tous les types de scan
- Le `LIMIT 3` est appliqué globalement → si l'utilisateur fait 3 scans frigo d'affilée, son scan visage de la veille disparaît du digest. Le coach ne saura jamais qu'un scan visage existe.

#### **P2-C** : `user_context` est rebâti à chaque message
- ✅ Bonne nouvelle (pas de perte de contexte sur 40 messages — confirmé [handler.ts:414](supabase/functions/coach-send-message/handler.ts:414) : `buildCoachUserContext()` est appelé pour CHAQUE message).
- ⚠️ Mauvaise nouvelle : 40 appels DB inutiles par conversation alors que le contexte change peu. Pas un bug fonctionnel, mais une opportunité de cache.

#### **P2-D** : Le welcome message du coach (`coach-start-conversation`) ne mentionne aucun scan
- Le user ne sait pas quels scans le coach « voit ». Pas un bug technique, mais un UX miss.

### P3 — SECONDAIRE

#### **P3-A** : Pas de logging du contenu effectivement envoyé au LLM
- En cas de bug en prod, impossible de savoir exactement ce qui a été transmis (le payload contient des PII santé → log redaction nécessaire, mais un summary anonymisé serait précieux).

#### **P3-B** : `output_contract_version: 1` figé
- Pas de mécanisme de versioning du contrat user_context si on enrichit le digest.

---

## F. Recommandations de fix (concrètes, actionnables, sans bla-bla)

### F.1 Quick wins (< 1 jour) — débloquent immédiatement le bug demandé

#### Fix #1 (P0-A + P0-B) : enrichir `buildRecentScanDigest` avec `scan_metrics`

**Fichier à modifier :** [supabase/functions/_shared/coachConversationContext.ts](supabase/functions/_shared/coachConversationContext.ts)

Élargir la requête SQL pour joindre `scan_metrics` :

```ts
const { data, error } = await client
  .from('scans')
  .select(`
    id, scan_type, analysis_result, analyzed_at, created_at,
    scan_metrics (
      face_skin_clarity_score, face_under_eye_shadow_score, face_under_eye_volume_score,
      face_eye_openness_score, face_complexion_redness_score,
      body_muscle_definition_score, body_midsection_definition_score,
      body_shoulder_alignment_score, body_recovery_readiness_score,
      nutrition_fiber_grams_estimate, nutrition_sugar_grams_estimate,
      nutrition_processing_level_score, nutrition_hydration_contribution_score,
      nutrition_sodium_level_score, nutrition_meal_balance_score,
      nutrition_inflammation_index_score, nutrition_meal_type_key,
      nutrition_portion_size_key
    )
  `)
  .eq('user_id', userId)
  ...
```

Et étendre `CoachRecentScanDigestEntry` avec un sous-objet `metrics` typé selon `scan_type`.

#### Fix #2 (P1-A) : reformuler l'instruction « NE PAS commenter »

**Fichier à modifier :** `coach.json` — node `Normalize Coach Conversation Input`, lignes 6090+

**Remplacer** :
```
"(7) Le scan digest et le profil sont du CONTEXTE pour mieux répondre, jamais un sujet à commenter quand la question ne porte pas dessus."
"Digest scans récents (informatif — NE PAS commenter sauf si la question le demande) : {...}"
"Contexte utilisateur inféré (informatif — NE PAS commenter sauf si la question le demande) : {...}"
```

**Par** :
```
"(7) Le scan digest et le profil sont des DONNÉES UTILISATEUR — utilise-les pour personnaliser tes réponses. Si l'utilisateur demande un chiffre ('quel est mon score d'hydratation ?'), donne-le DIRECTEMENT depuis le digest. N'invente jamais de chiffre absent du digest."
"Statistiques scans (utilise ces chiffres pour répondre aux questions de l'utilisateur) : {...}"
"Profil utilisateur (utilise pour adapter le ton et les conseils) : {...}"
```

#### Fix #3 (P1-B) : relâcher les troncatures

**Fichiers à modifier :**
- [coachConversationContext.ts](supabase/functions/_shared/coachConversationContext.ts) :
  - `SUMMARY_MAX_LENGTH = 200` → `400`
  - `FINDING_MAX_LENGTH = 80` → `160`
  - `FINDINGS_MAX_COUNT = 2` → `5`
  - `COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT = 3` → conserver mais ajouter un digest **par type** (cf. F.2 ci-dessous)
- `coach.json` node Normalize : `JSON.stringify(...).slice(0, 1200)` → `8000` chars (DeepSeek max_tokens=1200 en sortie, mais le prompt peut être bien plus long ; vérifier la limite réelle du modèle, qui est >32 KB pour deepseek-v4-flash).

### F.2 Refactor structurel (1-2 jours) — alignement avec coach classique

#### Fix #4 (P1-C + P2-B) : passer à un digest **par type** avec scores granulaires

Remplacer `recent_scan_digest: [3 scans confondus]` par une structure type :

```ts
interface CoachUserContextV2 {
  inferred_persona?: { /* same */ };
  scan_summary: {
    total_scans: number;
    scans_last_7d: number;
    scans_last_30d: number;
    most_recent_at: string;
  };
  latest_by_type: {
    face?: FaceScanContext;
    body?: BodyScanContext;
    nutrition?: NutritionScanContext;
    super?: SuperScanContext;
    hydration?: HydrationScanContext;
  };
  recent_trends: {
    [metric_key: string]: { current: number; previous: number; delta: number; samples: number };
  };
}

interface FaceScanContext {
  captured_at: string;
  overall_score: number;
  metrics: {
    skin_clarity: number | null;
    under_eye_shadow: number | null;
    under_eye_volume: number | null;
    eye_openness: number | null;
    complexion_redness: number | null;
  };
  summary?: string;
  top_findings?: string[];
}
// idem pour body, nutrition, super, hydration
```

#### Fix #5 (P1-C) : centraliser la construction du contexte

Créer `supabase/functions/_shared/coachContextBuilder.ts` partagé entre `coach-generate-response` et `coach-send-message`. Source de vérité unique.

→ Le coach classique côté front (`services/coach.ts:4481`) garde la responsabilité de l'agrégation front, MAIS l'utilitaire `buildCoachUserContextV2()` côté backend devient identique entre les deux endpoints.

### F.3 Améliorations qualité (3-5 jours)

#### Fix #6 (P2-A) : ajouter scan_count + scan_frequency
- RPC `get_user_scan_summary(user_id)` retournant `{ total_scans, scans_last_7d, scans_last_30d, first_scan_at, last_scan_at, by_type: { face: N, body: N, ... } }`.

#### Fix #7 (P2-C) : cacher `user_context` au niveau conversation
- Stocker `user_context_snapshot_json` + `user_context_built_at` dans `coach_conversations`.
- Rebuild seulement si :
  - Un nouveau scan a été enregistré depuis `user_context_built_at`
  - OU `now() - user_context_built_at > 30 min` (heuristique)
- Sinon réutiliser le snapshot.

#### Fix #8 (P2-D) : enrichir le welcome message
- Mentionner les types de scans détectés (« Je vois que tu as fait 3 scans visage récemment et 1 nutrition. Pose-moi tes questions ! »).

#### Fix #9 (P3-A) : logging structuré
- Ajouter `logger.info('coach_context_built', { user_id, request_id, scans_count, has_metrics, payload_bytes })` dans `buildCoachUserContext` — pas le contenu, juste la forme.

#### Fix #10 (P3-B) : bumper `output_contract_version: 2`
- Permet au n8n de router selon la version (compat ascendante avec V1 pendant le rollout).

---

## G. Format recommandé pour le contexte coach

Voici le **format cible** robuste pour le `user_context` envoyé au coach conversationnel. Il est structuré, déterministe, et permet au LLM de retrouver précisément chaque chiffre demandé.

```jsonc
{
  "user_context": {
    "schema_version": 2,
    "generated_at": "2026-05-20T14:32:11.000Z",

    "profile": {
      "tier": "premium",
      "locale": "fr",
      "first_seen_at": "2026-02-01T...",
      "scans_total": 47,
      "scans_last_7d": 5,
      "scans_last_30d": 18,
      "engagement_level": "high"
    },

    "inferred_persona": {
      "primary_motivation": "longevity",
      "scan_frequency_label": "regular",
      "preferred_time_of_day": "morning",
      "data_reliability": { "overall_percent": 78, "caveats": ["sample_low_for_super"] }
    },

    "latest_by_type": {
      "face": {
        "scan_id": "uuid",
        "captured_at": "2026-05-19T08:12:00Z",
        "overall_score": 75,
        "metrics": {
          "skin_clarity_score": 78,
          "under_eye_shadow_score": 62,
          "under_eye_volume_score": 70,
          "eye_openness_score": 81,
          "complexion_redness_score": 88
        },
        "summary": "Peau hydratée, légères ombres sous les yeux dues au manque de sommeil…",
        "top_findings": ["Améliorer la qualité du sommeil", "Hydratation cutanée correcte"]
      },
      "nutrition": {
        "scan_id": "uuid",
        "captured_at": "2026-05-20T12:30:00Z",
        "overall_score": 68,
        "meal_type": "lunch",
        "portion_size": "medium",
        "metrics": {
          "fiber_grams": 8,
          "sugar_grams": 22,
          "processing_level_score": 55,
          "hydration_contribution_score": 75,    // ← LE SCORE QUE L'UTILISATEUR DEMANDE
          "sodium_level_score": 60,
          "meal_balance_score": 72,
          "inflammation_index_score": 65
        },
        "summary": "Salade composée avec poulet, légumes variés…",
        "top_findings": ["Bonne contribution hydratation", "Sodium un peu élevé"]
      },
      "body": { /* idem */ },
      "super": { /* idem, avec sous-scores par catégorie */ },
      "hydration": { /* si scan type dédié existe */ }
    },

    "trends": {
      "face.skin_clarity_score":     { "current": 78, "previous": 71, "delta": +7, "samples": 6, "direction": "improving" },
      "nutrition.hydration_contribution_score": { "current": 75, "previous": 68, "delta": +7, "samples": 4, "direction": "improving" },
      "body.recovery_readiness_score": { "current": 60, "previous": 72, "delta": -12, "samples": 3, "direction": "declining" }
    },

    "priorities": [
      { "metric": "body.recovery_readiness_score", "reason": "decline_last_7d", "severity": "medium" },
      { "metric": "face.under_eye_shadow_score", "reason": "low_value", "severity": "low" }
    ],

    "data_gaps": [
      "no_body_scan_last_14d",
      "no_super_scan_ever"
    ]
  }
}
```

### Pourquoi ce format
- **Plat et déterministe** : le LLM peut interpoler `user_context.latest_by_type.nutrition.metrics.hydration_contribution_score` sans deviner.
- **Stable** : `schema_version` permet une évolution.
- **Économe en tokens** : ~1.5-3 KB en JSON minifié pour un utilisateur typique (vs. 1200 chars actuels tronqués).
- **Aligné** avec le `CoachKeyMetrics` typé du coach classique (`types/index.ts:1090`) → un seul typage TS partagé.

### Réécriture associée du system prompt n8n (extrait)

```
Tu disposes d'un objet `user_context` riche contenant les statistiques utilisateur.
RÈGLES SUR LES DONNÉES :
1. Si l'utilisateur demande un chiffre (ex: "mon score de peau", "mon hydratation"), CITE LE CHIFFRE EXACT depuis `user_context.latest_by_type.<type>.metrics.<metric>` ou `overall_score`.
2. Si le chiffre n'existe pas dans user_context, dis "je n'ai pas encore cette mesure, fais un scan <type> pour l'obtenir" — ne devine jamais.
3. Quand tu donnes des conseils, appuie-toi sur les `trends` et `priorities` du contexte.
4. Ne récite pas tout le contexte — utilise-le pour répondre PRÉCISÉMENT à la question.
5. Pour les tendances ("mon hydratation s'améliore-t-elle ?"), regarde `user_context.trends.nutrition.hydration_contribution_score.direction`.
```

---

## H. Tests à effectuer (checklist d'acceptation)

### H.1 Tests manuels (questions utilisateur → comportement attendu)

Pré-requis : un compte avec au moins 1 scan visage, 1 scan nutrition, 1 scan body dans les 7 derniers jours.

| # | Question utilisateur | Comportement attendu | Comportement actuel (bug) |
|---|---|---|---|
| 1 | « C'est quoi mon hydratation ? » | Cite `nutrition.hydration_contribution_score` ou un score d'hydratation dédié, avec valeur exacte (ex: « 75/100 ») | « Je n'ai pas accès » ❌ |
| 2 | « Quel est mon score de peau ? » | Cite `face.metrics.skin_clarity_score` | « Je n'ai pas accès » ❌ |
| 3 | « Quels sont mes meilleurs et mes pires scores ? » | Cite 2-3 scores avec valeurs, tirés de `latest_by_type` | Réponse générique sans chiffres ❌ |
| 4 | « Qu'est-ce qui s'est amélioré depuis mon dernier scan ? » | Cite un delta depuis `trends.*.delta > 0` | Réponse générique ❌ |
| 5 | « Donne-moi des conseils par rapport à mes statistiques » | Référence ≥ 2 metrics du contexte | Conseils génériques ❌ |
| 6 | « Est-ce que mon hydratation est bonne ? » | Cite la valeur + interprétation (≥75 = bonne, <50 = à améliorer) | Évite de répondre ❌ |
| 7 | « Sur quoi je dois me concentrer en priorité ? » | Cite `priorities[0].metric` | Conseils vagues ❌ |
| 8 | « Combien j'ai fait de scans ? » | Cite `profile.scans_total` | Ne sait pas ❌ |
| 9 | (hors-sujet) « C'est quoi la capitale de l'Italie ? » | « Rome. » | ✅ Déjà couvert par anti-réflexe |
| 10 | « Compare mes scans visage » | Cite `trends.face.*` avec deltas | Pas de comparaison ❌ |

### H.2 Tests automatisés à ajouter

#### Tests Edge Function (Jest)

**Nouveau fichier :** `__tests__/supabase/coachConversationContext.metrics.test.ts`

```ts
describe('buildRecentScanDigest with scan_metrics', () => {
  it('joins scan_metrics and exposes nutrition_hydration_contribution_score', async () => {
    // Arrange: insert 1 scan nutrition with scan_metrics row
    // Act: buildRecentScanDigest(client, userId)
    // Assert: digest[0].metrics.hydration_contribution_score === 75
  });

  it('exposes face metrics correctly', async () => { /* skin_clarity, under_eye_shadow */ });
  it('exposes body metrics correctly', async () => { /* muscle_def, recovery_readiness */ });
  it('returns null metric when scan_metrics row is missing', async () => { /* gracefully */ });
  it('respects per-type latest_by_type structure (no global mix)', async () => { /* face latest stays even if 3 nutrition scans done after */ });
});
```

#### Tests n8n (Jest existing harness)

**Nouveau fichier :** `__tests__/n8n/coachConversationNormalizer.metrics.test.js`

```js
describe('Normalize Coach Conversation Input with rich user_context', () => {
  it('includes hydration_contribution_score in system prompt verbatim', () => {
    const out = runNormalizer({ user_context: { latest_by_type: { nutrition: { metrics: { hydration_contribution_score: 75 } } } } });
    expect(out.coach_conversation_system_prompt).toContain('hydration_contribution_score');
    expect(out.coach_conversation_system_prompt).toContain('75');
  });

  it('does not truncate user_context under 8KB', () => { /* ... */ });
  it('uses USE phrasing instead of NE PAS commenter', () => {
    const out = runNormalizer({ user_context: { /* ... */ } });
    expect(out.coach_conversation_system_prompt).not.toMatch(/NE PAS commenter/);
  });
});
```

#### Tests d'intégration LLM (golden replies)

**Nouveau fichier :** `__tests__/integration/coachConversationGoldenReplies.test.ts`

Pour chaque question H.1, fixer un contexte connu (mocks `scans` + `scan_metrics`), appeler `coach-send-message` (avec n8n mocké ou réel selon env), et vérifier que la réponse contient le chiffre attendu (regex `/75/100|75 ?\/?\s?100|score.*75/i`).

### H.3 Vérifications opérationnelles

- [ ] Migration : pas de migration SQL nécessaire (les tables `scans`, `scan_metrics` existent déjà).
- [ ] Re-déployer `coach-send-message` Edge Function après modification de `coachConversationContext.ts`.
- [ ] Re-importer le workflow n8n `coach.json` après modification du node Normalize.
- [ ] Pas d'impact RLS (la lecture `scans + scan_metrics` est faite par service_role).
- [ ] Tester impact tokens : un user_context V2 ~3 KB + sliding window 40 messages doit rester sous la fenêtre context du modèle DeepSeek (>32K).

---

## I. Critères d'acceptation (Definition of Done)

Le bug est considéré comme corrigé quand **tous** les critères ci-dessous sont vrais :

### Critère 1 — Le coach donne les chiffres exacts
Sur un compte avec au moins 1 scan visage et 1 scan nutrition récents :
- [ ] À la question « C'est quoi mon hydratation ? », la réponse contient un nombre 0-100 correspondant exactement à la valeur en base (`scan_metrics.nutrition_hydration_contribution_score` ou équivalent du scan visage si dédié).
- [ ] À la question « Quel est mon score de peau ? », la réponse contient un nombre 0-100 correspondant à `scan_metrics.face_skin_clarity_score`.
- [ ] À la question « Quel est mon score global du dernier scan visage ? », la réponse contient l'`overall_score` du scan visage le plus récent.

### Critère 2 — Le coach refuse de halluciner
- [ ] Sur un compte sans aucun scan visage, à la question « Quel est mon score de peau ? », le coach répond explicitement « tu n'as pas encore fait de scan visage, lance-en un pour avoir ton score » — il **n'invente pas** de chiffre.

### Critère 3 — Le coach utilise les tendances
- [ ] Sur un compte avec ≥ 2 scans nutrition espacés, à la question « Mon hydratation s'améliore-t-elle ? », le coach cite la direction (`improving` / `declining` / `stable`) et le delta numérique exact.

### Critère 4 — Le coach hiérarchise les priorités
- [ ] À la question « Sur quoi dois-je me concentrer ? », le coach cite au moins 1 metric explicitement (ex: « ton recovery_readiness a baissé de 12 points cette semaine ») et NON pas un conseil générique (« bois de l'eau »).

### Critère 5 — Tests verts
- [ ] Tous les tests Jest existants restent verts (`__tests__/supabase/coachConversation*.test.ts`, `__tests__/n8n/coachConversationNormalizer.test.js`).
- [ ] Les nouveaux tests `coachConversationContext.metrics.test.ts` et `coachConversationNormalizer.metrics.test.js` passent.
- [ ] Les golden replies passent sur ≥ 8/10 questions de la grille H.1.

### Critère 6 — Pas de régression sur le comportement anti-réflexe
- [ ] À la question « C'est quoi la capitale de l'Italie ? », le coach répond toujours « Rome. » et ne pivote pas vers la santé.
- [ ] À la question « Donne-moi un plan sur 2 jours », le coach répond structuré par période avec tirets (R2 préservée).
- [ ] Pas de « bois de l'eau » réflexe sur des questions non-hydratation (R4 préservée).

### Critère 7 — Pas de fuite PII
- [ ] Aucun champ identifiant direct (email, IP, push_token) ne fuit dans le user_context envoyé au LLM (vérifier via `summarizeProviderPayload` ou équivalent).
- [ ] Le logging du build de contexte loggue uniquement des **shapes** (counts, presence), pas les valeurs.

### Critère 8 — Persistance du contexte sur 40 messages
- [ ] Sur une conversation à 20+ messages utilisateur, à la dernière question « Tu te souviens de mon hydratation ? », le coach ressort le bon chiffre (preuve que le contexte n'a pas été perdu).
- [ ] (Si cache implémenté — Fix #7) Vérifier que les nouveaux scans sont bien repris par le contexte après ~30 min ou immédiatement après un nouveau scan.

---

## Annexes

### Annexe 1 — Chemins exacts des fichiers concernés

**Critiques (à modifier) :**
- [supabase/functions/_shared/coachConversationContext.ts](supabase/functions/_shared/coachConversationContext.ts) — Fix #1, #3, #4
- `coach.json` (workflow n8n) — Fix #2, #3 (node `Normalize Coach Conversation Input`)

**À refactoriser (long terme) :**
- [supabase/functions/coach-send-message/handler.ts:414](supabase/functions/coach-send-message/handler.ts:414) — appel `buildCoachUserContext`
- [supabase/functions/_shared/coachConversation.ts](supabase/functions/_shared/coachConversation.ts) — `buildSlidingWindowMessages`
- [types/index.ts:1090](types/index.ts:1090) — partage `CoachKeyMetrics` avec backend

**À enrichir (tests) :**
- `__tests__/supabase/coachConversationContext.test.ts` (existant, à étendre)
- `__tests__/n8n/coachConversationNormalizer.test.js` (existant, à étendre)
- nouveaux fichiers golden replies (cf. H.2)

### Annexe 2 — Schéma de la table `scan_metrics` (récapitulatif)

| Colonne | Type | Description |
|---|---|---|
| `scan_id` | uuid FK scans | clé de jointure |
| `scan_type` | text | face / body / nutrition / health / super |
| `face_skin_clarity_score` | integer | 0-100 |
| `face_under_eye_shadow_score` | integer | 0-100 |
| `face_under_eye_volume_score` | integer | 0-100 |
| `face_eye_openness_score` | integer | 0-100 |
| `face_complexion_redness_score` | integer | 0-100 |
| `body_muscle_definition_score` | integer | 0-100 |
| `body_midsection_definition_score` | integer | 0-100 |
| `body_shoulder_alignment_score` | integer | 0-100 |
| `body_recovery_readiness_score` | integer | 0-100 |
| `nutrition_fiber_grams_estimate` | integer | g |
| `nutrition_sugar_grams_estimate` | integer | g |
| `nutrition_processing_level_score` | integer | 0-100 |
| **`nutrition_hydration_contribution_score`** | integer | 0-100 |
| `nutrition_sodium_level_score` | integer | 0-100 |
| `nutrition_meal_balance_score` | integer | 0-100 |
| `nutrition_inflammation_index_score` | integer | 0-100 |
| `nutrition_meal_type_key` | text | breakfast/lunch/dinner/snack/dessert/other |
| `nutrition_portion_size_key` | text | small/medium/large/oversized |
| `persona_*` (inférence) | divers | cf. migration `20260512020000` |

Source migrations :
- [20260512000000_add_extended_scan_metrics.sql](supabase/migrations/20260512000000_add_extended_scan_metrics.sql)
- [20260512010000_add_granular_scan_metrics.sql](supabase/migrations/20260512010000_add_granular_scan_metrics.sql)
- [20260511190000_extend_scan_metrics_for_coach_analytics.sql](supabase/migrations/20260511190000_extend_scan_metrics_for_coach_analytics.sql)
- [20260512020000_add_persona_inference_to_scan_metrics.sql](supabase/migrations/20260512020000_add_persona_inference_to_scan_metrics.sql)

### Annexe 3 — Audits liés et anti-régression

| Audit | Statut | Lien avec ce bug |
|---|---|---|
| [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md) | Confirmé corrigé | CO-01 prompt injection : préoccupation **opposée** (trop de données IA dans le prompt) — ne contredit pas cet audit. |
| [SCANNER_COACH_AUDIT_2026_05.md](SCANNER_COACH_AUDIT_2026_05.md) | Confirmé corrigé | Décrit le **pont scanner → coach classique** (CO-01..CO-08), pas le pont scanner → coach conversationnel. Le présent audit comble le gap. |
| [COACH_CONVERSATION_ROLLOUT.md](COACH_CONVERSATION_ROLLOUT.md) | Doc opérationnelle | Indique le rollout V1 a livré le code mais n'a JAMAIS spécifié comment le contexte scan serait passé. |

→ **Cet audit est complémentaire et non contradictoire** avec les audits existants.

### Annexe 4 — Estimation effort

| Fix | Effort dev | Effort QA |
|---|---|---|
| F.1 (Quick wins #1+#2+#3) | 0.5j | 0.5j |
| F.2 (Refactor structurel #4+#5) | 2j | 1j |
| F.3 (Améliorations #6 à #10) | 2j | 1j |
| **Total** | **~4.5j** | **~2.5j** |

Le **fix critique du bug demandé** tient en ~0.5j dev + 0.5j QA (juste F.1).

---

**Fin de l'audit.**

Pour une question / une clarification / un fix immédiat, contactez le mainteneur du module Coach Conversation.
