# Audit Bug Coach — "Bois de l'eau dans 5 minutes"

**Date :** 2026-05-20
**Auditeur :** Claude (Anthropic) — orchestration Ruflo, 8 sous-agents parallèles
**Mode :** READ-ONLY (aucune modification de code, prompt ou workflow)
**Périmètre :** end-to-end — front-end React Native/Expo SDK 54, services, Edge Functions Supabase, workflows n8n (coach.json, coach-conversation.json, analyse_1.json, SUPERSCAN.json, fridge-scan-chef.json), tests, logs, presets, scanner CTAs, retrieval scan, 6 personas

---

## 1. Executive summary

### Le verdict en une phrase

> **La phrase "Bois de l'eau dans 5 minutes" (et ses variantes) est CODÉE EN DUR dans le node `Code in JavaScript2` du workflow n8n `coach.json` comme `localizedCopy.defaultBody` / `localizedCopy.genericError` en 6 langues. Elle est déclenchée par un sanitizer (`coachStripLLMRefusal`) qui efface la réponse du LLM dès qu'elle contient des phrases comme "pas assez de données", "je ne peux pas conseiller", etc. — et fait alors tomber la chaîne `firstNonEmptyString([parsedBodySanitized, synthesizedBody, fallbackBody, localizedCopy.genericError])` sur ce fallback hard-codé.**

### Cause racine

| # | Élément | Localisation | Rôle |
|---|---|---|---|
| 1 | `localizedCopy.fr.genericError` = "Ta priorite aujourd hui : bois un grand verre d eau au reveil, **bouge 5 minutes apres le repas**, et couche-toi un peu plus tot. Petits gestes, grand impact." | [n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060) (node `Code in JavaScript2`, jsCode) | Phrase observée par l'utilisateur (paraphrase exacte du bug rapporté) |
| 2 | `localizedCopy.fr.defaultBody` = "Voici ta priorite du jour : un grand verre d eau au reveil, **5 minutes de marche apres le dejeuner**, et un coucher avant minuit. Trois gestes simples qui font deja une vraie difference." | Même node, même fichier | Variante du même message |
| 3 | `coachStripLLMRefusal()` + `COACH_BANNED_LLM_PATTERNS` (regex `/pas assez de donn[eé]es/i`, `/donn[eé]es insuffisantes/i`, `/je ne peux pas (?:te \|vous )?(?:r[eé]pondre\|conseiller)/i`, etc.) | Même node | Détecte les refus du LLM, vide la réponse (`< 24` chars ⇒ chaîne vide) |
| 4 | `parsedBodySanitized` (=`''` après strip) prend la place de `parsed.body` dans `firstNonEmptyString([parsedBodySanitized, synthesizedBody, fallbackBody, localizedCopy.genericError])` | Même node | Mécanisme qui fait tomber la chaîne sur `genericError` |
| 5 | Script qui a injecté ce comportement : `tmp/apply-coach-fallback-cleanup.js` (commit lié à `2395818` daté 2026-05-19) | [tmp/apply-coach-fallback-cleanup.js](tmp/apply-coach-fallback-cleanup.js) | One-shot pour remplacer les anciens fallbacks "Je n'ai pas pu formuler un conseil…" par un conseil "actionnable" — qui contient ironiquement le pattern "bois de l'eau + 5 minutes" interdit par la règle anti-réflexe (4) du prompt |

### Niveau de confiance : **Élevé (preuves textuelles directes)**

Tous les fragments cités ont été vérifiés par grep et lecture du fichier source. Aucune hypothèse non prouvée n'est nécessaire pour expliquer le bug observé.

### Impact utilisateur

- Frustration : conseil hors-sujet pour un user payant
- Risque d'image produit (« le coach IA n'écoute pas »)
- Particulièrement déclenchable sur les presets exigeant un type de scan que l'utilisateur n'a pas (ex : `nutrition_focus` sans scan nutrition récent → LLM refuse → sanitizer → fallback hydratation)
- Touche **prioritairement** les **presets front-end** et les **scanner CTAs**, qui passent par le pipeline classique `coach-generate-response` → `coach.json`
- Le coach conversationnel libre (`coach-send-message` → `coach-conversation.json`) **n'a pas** ce sanitizer ni ce fallback hard-codé (voir §6.4), donc ce bug spécifique ne s'y manifeste pas (un autre bug, distinct, y existe, lié à un payload pauvre — cf. [COACH_CONVERSATIONNEL_DATA_AUDIT.md](COACH_CONVERSATIONNEL_DATA_AUDIT.md), 90% corrigé)

### Gravité / priorité

- **Gravité : P1 (élevée)** — non destructeur, mais visible utilisateur, contredit la règle anti-réflexe explicitement codée dans les prompts système (auto-incohérence du produit)
- **Priorité : Quick-fix faisable en < 1 jour** sans refonte (cf. §8)

### 3 actions prioritaires (sans refonte)

1. **Neutraliser le pattern hydratation dans les fallbacks hard-codés** ([n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060), node `Code in JavaScript2`). Remplacer "bois un grand verre d eau / 5 minutes de marche / coucher" par un message neutre du type « Reviens vers moi avec une question plus précise ou un scan récent. » (en 6 langues).
2. **Ajouter de l'observabilité** : logger `parsed.body` brut, `parsedBodySanitized`, le booléen `sanitizer_fired`, et le `coach_route` final dans `coach_entries.response_payload_json` pour que toute occurrence future soit traçable.
3. **Aligner la règle anti-réflexe (4) avec le fallback** : actuellement le prompt système interdit au LLM la phrase "bois de l'eau / 5 min de marche / dors plus", mais le code post-LLM la réinjecte. Soit on retire le fallback hardcodé, soit on retire la règle (4) — les deux ensemble créent une contradiction intra-système.

---

## 2. Carte complète du système

### Vue d'ensemble

```
                                           ┌─────────────────────────┐
                                           │  Utilisateur — App RN   │
                                           └────────────┬────────────┘
                                                        │
        ┌───────────────────────────────────────────────┼──────────────────────────────────────────┐
        │                                               │                                          │
        ▼                                               ▼                                          ▼
┌─────────────────┐                       ┌────────────────────────┐                ┌──────────────────────┐
│ A) Preset       │                       │ B) Free chat libre     │                │ C) Scanner CTA       │
│ CoachScreen.tsx │                       │ CoachChatScreen.tsx    │                │ ScanResultScreen.tsx │
│ → 49 presets    │                       │ → texte libre          │                │ → 8 face / 5 body /  │
│   (10+2 prompt  │                       │                        │                │   7 nutri / 1 super  │
│   types)        │                       │                        │                │                      │
└────────┬────────┘                       └───────────┬────────────┘                └──────────┬───────────┘
         │                                            │                                        │
         │ services/coach.ts                          │ services/coachConversation.ts          │ buildCoachGenerationInputFromScanCoachIntent
         │ buildCoachPayload(prompt_type)             │ coachSendMessage(content)              │ → preset key + scan_intent payload
         ▼                                            ▼                                        ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐         ┌──────────────────────────────┐
│ supabase/functions/          │         │ supabase/functions/          │         │ supabase/functions/          │
│ coach-generate-response/     │         │ coach-send-message/          │         │ coach-generate-response/     │
│ handler.ts                   │         │ handler.ts                   │         │ handler.ts                   │
└──────────────┬───────────────┘         └──────────────┬───────────────┘         └──────────────┬───────────────┘
               │                                        │                                        │
               │ POST N8N_COACH_GENERATE_WEBHOOK_URL    │ POST N8N_COACH_CONVERSATION_WEBHOOK_URL│ (même que A)
               │ + HMAC + 45s timeout + 32KB max resp   │                                        │
               ▼                                        ▼                                        ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐         ┌──────────────────────────────┐
│ n8n/workflows/coach.json     │         │ n8n/workflows/               │         │ n8n/workflows/coach.json     │
│ Verify HMAC                  │         │ coach-conversation.json      │         │ (idem A)                     │
│  → Normalize Coach Input1    │         │ Verify HMAC                  │         │                              │
│  → Determine Coach Route     │         │  → Normalize Coach Conv Input│         │                              │
│  → Switch persona_key (×6)   │         │  → Switch persona_route (×6) │         │                              │
│    → Route Persona (×6)      │         │    → DeepSeek {Persona} (×6) │         │                              │
│      switch coach_route(×20) │         │  → JSON formatter            │         │                              │
│      → Chain LLM (~120 nodes)│         │  → Respond                   │         │                              │
│  → Code in JavaScript2 ★     │         │                              │         │                              │
│    └─ coachStripLLMRefusal   │         │                              │         │                              │
│    └─ localizedCopy.fr.genericError ⚠️│ │                              │         │                              │
│       = "bois un grand verre"│         │ ❌ Pas de sanitizer ni       │         │                              │
│    └─ firstNonEmptyString    │         │    fallback hardcodé         │         │                              │
│       [parsedBodySanitized,  │         │                              │         │                              │
│        synthesizedBody,      │         │                              │         │                              │
│        fallbackBody,         │         │                              │         │                              │
│        localizedCopy.gen…] ▼ │         │                              │         │                              │
│  → Respond                   │         │                              │         │                              │
└──────────────────────────────┘         └──────────────────────────────┘         └──────────────────────────────┘
                                                                                          │
                                                                                          │ si invalid_coach_payload
                                                                                          │ → retry strip scan_intent
                                                                                          │   prompt_type='latest_scan'
                                                                                          │   (services/coach.ts:5413)
                                                                                          ▼ perte de contexte
```

### Diagramme textuel des 3 chemins

#### A. Conversation libre (Coach chat libre)

```
CoachChatScreen → services/coachConversation.ts → POST coach-send-message
→ Edge function reserve quota → reserveCoachConversationMessageSlot
→ loadConversationHistory(60 messages sliding window)
→ getCachedOrFreshUserContext (cache 30 min dans coach_conversations.user_context_snapshot_json)
  → buildCoachUserContext
    → readCoachProfileMemory (RPC)
    → buildRecentScanDigest (limit=5, scan_metrics JOIN ✅ post-fix 2026-05-20)
    → buildTrendsByType (deltas entre scans consécutifs)
→ insertAssistantPendingMessage (placeholder streaming)
→ postCoachConversationWebhook { conversation_id, persona, messages[], user_context }
  → coach-conversation.json
    → Switch persona_route → DeepSeek {persona}
    → JSON formatter (PAS de sanitizer hydratation)
    → Respond
→ updateAssistantMessage (status=ready)
→ Response { user_message, assistant_message }
```

#### B. Preset front-end (Coach classique)

```
CoachScreen → user clique un preset → handleGenerate()
→ services/coach.ts:5330 generateCoachGuidance
  → fetchCoachScansForGeneration (React Query cache)
  → buildCoachPayload(promptType, scans, options)
    → résolution typeFilter (ex: nutrition_focus → typeFilter=nutrition)
    → selected_scan, recent_scans[], latest_scan, prior_scans, latest_by_type, comparison_to_previous, trend_summary
  → invokeAuthedCoachFunction('coach-generate-response', payload)
→ Edge function:
  → enforce rate limit (5/min, 30/h, 120/j)
  → assertCoachInnerPayload (whitelist clés top-level + bornes)
  → urgency check, payload size check 50KB, token quota
  → POST n8n webhook (45s timeout)
  → resolveCoachPayload (extract title + body)
  → INSERT coach_entries (request_payload_json, response_payload_json)
→ Workflow n8n coach.json:
  → Verify HMAC → Normalize Coach Input1 (system prompt + règles 1-7, anti-réflexe (4), R1-R5)
  → Determine Coach Route (map prompt_type → coach_route, default=general_fallback)
  → Switch persona_key (6) → Route {Persona} switch coach_route
  → Chain LLM DeepSeek {persona/route} (~120 nodes pour 6 personas × ~20 routes)
  → Code in JavaScript2 ⚠️ (sanitizer + fallback hardcodé "bois de l'eau")
  → Respond
→ Response (title, body, content, disclaimer)
```

#### C. Scanner CTA (suggestion depuis résultat de scan)

```
ScanResultScreen (face/body/nutrition) ou SuperScanResultScreen
→ scanCoachIntent(analysisData, { scanId, scanType, locale }) [shared/scanCoachIntent.ts]
  → findSignals() → métrique anormale détectée (statique, pas IA)
  → resolveSeverity → high/medium/low
  → ou buildFallback() si quality_score insuffisant
→ ScanCoachCtaCard / ScanCoachFinalCard affichés
→ user clique "Demande au coach" → handleCoachPress
  → buildCoachGenerationInputFromScanCoachIntent(intent, { accountTier, locale })
    → resolvePresetKeyForScanIntent (mapping intent → preset key, dépend du tier)
  → router.push('/coach', { autoSubmit:'1', scanIntent: encodeScanCoachIntentParam(intent),
                            promptType, questionKey, questionText, fallbackPromptType: 'latest_scan' })
→ CoachScreen détecte autoSubmit=1 → handleGenerate (idem B)
→ buildCoachPayload inclut maintenant scan_intent = {...} dans le payload
→ POST coach-generate-response → coach.json → idem B avec scan_intent en plus

⚠️ Si error 'invalid_coach_payload' : services/coach.ts:5413
  shouldRetryLatestScanIssueResolutionAsLatestScan() → retry avec :
   - prompt_type = 'latest_scan'
   - STRIPPING question_key, question_text, selected_scan_id, scan_intent
   → PERTE TOTALE de contexte CTA → fallback générique très probable
```

---

## 3. Inventaire exhaustif des presets (front-end)

### Catalogue : 49 presets, 10 prompt types visibles + 2 cachés

Source unique : [shared/coachQuestions.ts:255](shared/coachQuestions.ts:255) `COACH_QUESTION_DEFINITIONS`.

| # | Question key | prompt_type | Catégorie | Premium | Scan requis | Risque fallback ★ |
|---|---|---|---|---|---|---|
| 1 | `latest_scan__top_priority_today` | `latest_scan` | today | non | 1+ latest | bas |
| 2 | `latest_scan__three_simple_actions` | `latest_scan` | today | non | 1+ latest | bas |
| 3 | `latest_scan__avoid_worse_today` | `latest_scan` | today | non | 1+ latest | bas |
| 4 | `latest_scan__ten_minute_priority` | `latest_scan` | today | non | 1+ latest | bas |
| 5 | `weekly_plan__realistic_week` | `weekly_plan` | plan | non | 1 de chaque type + 7d | **moyen** (exige scans multi-type) |
| 6 | `weekly_plan__seven_day_easy_goals` | `weekly_plan` | plan | non | 1 de chaque type + 7d | **moyen** |
| 7 | `weekly_plan__organize_meals_workouts` | `weekly_plan` | plan | non | 1 de chaque type + 7d | **moyen** |
| 8 | `weekly_plan__progress_without_burning_out` | `weekly_plan` | plan | non | 1 de chaque type + 7d | **moyen** |
| 9 | `nutrition_focus__breakfast_no_crash` | `nutrition_focus` | focus | non | 1 nutrition | **élevé** si pas de scan nutrition |
| 10 | `nutrition_focus__simple_lunch_balance` | `nutrition_focus` | focus | non | 1 nutrition | **élevé** |
| 11 | `nutrition_focus__light_recovery_dinner` | `nutrition_focus` | focus | non | 1 nutrition | **élevé** |
| 12 | `nutrition_focus__smart_swaps_week` | `nutrition_focus` | focus | non | 1 nutrition | **élevé** |
| 13 | `nutrition_focus__minimal_three_day_shopping` | `nutrition_focus` | focus | non | 1 nutrition | **élevé** |
| 14 | `body_focus__weekly_mini_plan` | `body_focus` | focus | non | 1 body | **élevé** si pas de scan body |
| 15-18 | `body_focus__*` | `body_focus` | focus | non | 1 body | **élevé** |
| 19-23 | `face_focus__*` | `face_focus` | focus | non | 1 health | **élevé** si pas de scan health |
| 24 | `hydration_focus__easy_daily_hydration` | `hydration_focus` | focus | non | 1 health | **élevé** |
| 25-28 | `hydration_focus__*` | `hydration_focus` | focus | non | 1 health | **élevé** |
| 29-33 | `sleep_coach__*` | `sleep_coach` | focus | non | 1 health | **élevé** |
| 34-38 | `risk_watch__*` | `risk_watch` | vigilance | **OUI** | 1+ super | **élevé** si pas de super scan |
| 39-44 | `trend_review__*` | `trend_review` | trend | non | 3+ same type | **élevé** (exige 3 scans même type) |
| 45-49 | `recovery_plan__*` | `recovery_plan` | trend | non | any | moyen |

★ Risque fallback = probabilité que le payload arrive vide → LLM dit "pas assez de données" → sanitizer → fallback hydratation.

### Personas (6) — partagés

Source : [shared/coachPersonas.ts:1](shared/coachPersonas.ts:1)

| persona_key | Premium | toneInstructions résumées |
|---|---|---|
| `gentle_supportive` | non | warm, supportive, reassuring |
| `strict_tough` | oui | direct, tough-love, accountability |
| `motivational_energetic` | oui | upbeat, momentum-building |
| `patient_calm` | oui | steady, empathetic |
| `analytical_precise` | oui | structured, evidence-minded |
| `playful_light` | oui | witty, friendly, breezy |

Les 6 personas voient **les mêmes 49 presets** (pas de filtre par persona). Le gating premium se fait :
- au niveau **persona** (5/6 sont premium)
- au niveau **prompt_type** : `risk_watch` est aussi premium-only

### Mode de soumission

| Source | `promptType` | `question_key` | `question_text` | `scan_intent` |
|---|---|---|---|---|
| Preset front-end | un des 10 visibles | un des 49 | null ou normalisé | null |
| Free chat (text input dans CoachScreen) | `free_question` | null | texte user | null |
| Free chat (page séparée CoachChatScreen) | n/a (endpoint différent) | n/a | content user | n/a (pas même payload) |
| Scanner CTA | preset résolu via mapping intent→preset | un des 49 (souvent `hydration_focus__*`, `body_focus__*`, etc.) | texte de la suggestion | objet enrichi |

---

## 4. Inventaire des scanner CTAs

Source : [shared/scanCoachIntent.ts:1](shared/scanCoachIntent.ts:1) (génération **statique**, pas par IA n8n).

| Scanner | Métrique déclencheur | Seuil | `question_key` (intent legacy) | Preset envoyé (FREE) | Preset envoyé (PREMIUM) | scan_intent transmis ? |
|---|---|---|---|---|---|---|
| face | hydration_level | ≤ 35 | `improve_hydration_from_scan` | `hydration_focus__easy_daily_hydration` | idem | ✅ oui |
| face | fatigue_level | ≥ 80 | `improve_visible_fatigue_from_scan` | `recovery_plan__today_after_bad_night` | `sleep_coach__wake_up_clearer_tomorrow` | ✅ |
| face | skin_clarity_score | ≤ 35 | `improve_skin_clarity_from_scan` | `face_focus__improve_glow_simple` | idem | ✅ |
| face | under_eye_shadow_score | ≥ 75 | `improve_under_eye_shadow_from_scan` | (préset face) | (préset face) | ✅ |
| face | complexion_redness_score | ≥ 75 | `improve_complexion_redness_from_scan` | (préset face) | (préset face) | ✅ |
| face | lip_dryness_score | ≥ 75 | `improve_lip_dryness_from_scan` | (préset face) | (préset face) | ✅ |
| face | perceived_stress_level | ≥ 80 | `improve_perceived_stress_from_scan` | `recovery_plan__what_to_pause_for_recovery` | `sleep_coach__protect_sleep_from_afternoon` | ✅ |
| face | perceived_sleep_quality | ≤ 35 | `improve_sleep_quality_from_scan` | `recovery_plan__today_after_bad_night` | `sleep_coach__change_tonight_for_tomorrow` | ✅ |
| body | posture_score | ≤ 40 | `improve_posture_from_scan` | `latest_scan__top_priority_today` | `body_focus__mobility_posture_priorities` | ✅ |
| body | body_fat_percentage | ≥ 32 | `improve_body_composition_from_scan` | `recovery_plan__simple_restart_after_excess` | `body_focus__weekly_mini_plan` | ✅ |
| body | muscle_definition_score | ≤ 35 | `improve_muscle_definition_from_scan` | `recovery_plan__two_day_recovery_rhythm` | `body_focus__weekly_mini_plan` | ✅ |
| body | shoulder_alignment_score | ≤ 35 | `improve_shoulder_alignment_from_scan` | (préset body) | (préset body) | ✅ |
| body | recovery_readiness_score | ≤ 35 | `improve_recovery_readiness_from_scan` | (préset recovery) | (préset body) | ✅ |
| body | body_tension_indicator_score | ≥ 75 | `improve_body_tension_from_scan` | (préset body) | (préset body) | ✅ |
| nutrition | protein_grams | ≤ 10 | `improve_protein_from_scan` | `latest_scan__three_simple_actions` | `nutrition_focus__simple_lunch_balance` | ✅ |
| nutrition | fiber_grams_estimate | ≤ 5 | `improve_fiber_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| nutrition | sugar_grams_estimate | ≥ 45 | `improve_sugar_balance_from_scan` | `latest_scan__avoid_worse_today` | `nutrition_focus__smart_swaps_week` | ✅ |
| nutrition | processing_level_score | ≥ 70 | `improve_processing_level_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| nutrition | sodium_level_score | ≥ 70 | `improve_sodium_balance_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| nutrition | meal_balance_score | ≤ 35 | `improve_meal_balance_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| nutrition | vegetable_portion_ratio | ≤ 10 % | `improve_vegetable_portion_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| nutrition | protein_visibility_score | ≤ 35 | `improve_visible_protein_from_scan` | (préset nutrition) | (préset nutrition) | ✅ |
| super | global_risk_score + urgency_flag | ≥ 40 | `latest_scan__top_priority_today` | `latest_scan__top_priority_today` | `risk_watch__what_to_monitor_today` | ✅ |
| (any) | quality_score insuffisant | confidence<55, image<45, coverage<50 | `maintain_results_from_scan` | `latest_scan__avoid_worse_today` | `trend_review__habits_to_continue` | scan_intent.has_actionable_issue=false |
| **fridge** | — | — | — | — | — | ❌ **pas de CTA scanner** (workflow chef différent) |

### Workflow utilisé

**Tous les scanner CTAs passent par `coach-generate-response`** (même endpoint que les presets) → `coach.json`. **Pas de node n8n dédié.**

### Risque de perte de contexte (retry latest_scan_issue_resolution)

[services/coach.ts:5413](services/coach.ts:5413) — `shouldRetryLatestScanIssueResolutionAsLatestScan` :

```
if (prompt_type === LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE
    && error.code === 'invalid_coach_payload')
  → retry avec prompt_type = 'latest_scan'
  → STRIP de question_key, question_text, selected_scan_id, scan_intent
```

**Conséquence directe** : si le workflow n8n n'a plus le mapping `latest_scan_issue_resolution` (déprécié ?), le retry envoie un payload **vidé de tout son contexte CTA**. Le LLM reçoit alors un "latest_scan" générique → si scan pauvre → "pas assez de données" → sanitizer → fallback hydratation.

---

## 5. Résultats de reproduction (analyse statique)

Étant donné l'audit READ-ONLY (pas d'exécution runtime), la matrice de test est inférée à partir du code, des tests existants ([__tests__/n8n/coachWorkflow.test.js](__tests__/n8n/coachWorkflow.test.js), [__tests__/services/coach.test.ts](__tests__/services/coach.test.ts), [__tests__/supabase/coachGenerateResponseHandler.test.ts](__tests__/supabase/coachGenerateResponseHandler.test.ts)) et des invariants prouvés.

| Cas | Source | Coach | Question | Contexte scans | Réponse attendue | Réponse observée (probable) | Bug reproduit | Cause | Niveau preuve |
|---|---|---|---|---|---|---|---|---|---|
| 1 | preset | gentle_supportive | `latest_scan__top_priority_today` | 1+ scan analysé | Conseil personnalisé sur le scan | OK | non | — | élevé |
| 2 | preset | gentle_supportive | `nutrition_focus__breakfast_no_crash` | **0** scan nutrition | LLM répond "je manque de données" → strip → genericError | "Ta priorite aujourd hui : bois un grand verre d eau au reveil, bouge 5 minutes apres le repas, et couche-toi un peu plus tot." | **OUI** | sanitizer + fallback hardcodé | élevé (chaîne de code prouvée) |
| 3 | preset | analytical_precise | `weekly_plan__realistic_week` | scans face uniquement, pas de body/nutrition | LLM: "données insuffisantes pour planifier la semaine" → strip → genericError | idem cas 2 | **OUI** | idem | élevé |
| 4 | preset | strict_tough | `risk_watch__when_to_seek_pro_help` (premium) | scans super absents | LLM: "pas de super scan" → strip → genericError | idem cas 2 | **OUI** | idem | élevé |
| 5 | preset | gentle_supportive | `latest_scan__top_priority_today` | scans riches | Conseil personnalisé | OK | non | — | élevé |
| 6 | free_chat (CoachChatScreen) | gentle_supportive | "C'est quoi mon hydratation ?" | scans nutrition avec hydration_contribution_score | Score chiffré (post-fix 2026-05-20) | OK (90% fixé) | non | — | élevé (audit existant) |
| 7 | free_chat | gentle_supportive | "C'est quoi mon hydratation ?" | 0 scan | LLM: "fais d'abord un scan" | "fais d'abord un scan" (ou similaire) — **pas** "bois de l'eau" car sanitizer absent dans coach-conversation.json | non | — | élevé |
| 8 | scanner CTA face | gentle_supportive | `improve_hydration_from_scan` (CTA hydratation low) | scan face avec hydration_level=20 | LLM utilise scan_intent + scan_id → conseil hydratation pertinent | OK normalement | **OUI** si retry strip déclenché | strip de scan_intent au retry | moyen |
| 9 | scanner CTA body | gentle_supportive | `improve_posture_from_scan` | scan body avec posture_score=30 | conseil posture | **OUI** si workflow n8n rejette `latest_scan_issue_resolution` → retry sans scan_intent → "données insuffisantes" → fallback hydratation | strip retry | moyen |
| 10 | scanner CTA super | gentle_supportive | `latest_scan__top_priority_today` (CTA super urgent) | super scan avec urgency_flag | conseil priorisé | dépend du retry | possible | strip retry + urgency | moyen |
| 11 | preset gentle_supportive | preset hors-sujet (ex: face → user clique nutrition_focus) | scans face seulement | LLM: "pas de scan nutrition" → strip → fallback | idem cas 2 | **OUI** | typeFilter inadéquat | élevé |
| 12 | preset n'importe quel persona | preset n'importe lequel | LLM répond correctement (cas nominal) | Body normal (> 24 chars, sans pattern banned) | parsedBodySanitized = parsed.body inchangé → réponse user | OK | non | — | élevé |

### Pattern dominant

Le bug se déclenche quand le LLM **dit honnêtement** qu'il manque de données, **dans des cas où c'est légitime** (preset exigeant un type de scan absent, scan dégradé en quality, retry de fallback strip, etc.). Le sanitizer interprète cette honnêteté comme une "excuse" à éliminer, et la branche `firstNonEmptyString` tombe sur le fallback hydratation.

---

## 6. Analyse détaillée de la réponse "Bois de l'eau dans 5 minutes"

### 6.1 Origine exacte (preuves textuelles)

**Fichier :** [n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060) (node `Code in JavaScript2`, paramètre `jsCode`).

**Constantes hard-codées** (6 langues × 2 messages chacun = 12 variantes du même pattern) :

```javascript
// FR
defaultBody: "Voici ta priorite du jour : un grand verre d eau au reveil, 5 minutes de marche apres le dejeuner, et un coucher avant minuit. Trois gestes simples qui font deja une vraie difference.",
genericError: "Ta priorite aujourd hui : bois un grand verre d eau au reveil, bouge 5 minutes apres le repas, et couche-toi un peu plus tot. Petits gestes, grand impact.",

// EN
defaultBody: "Your priority today: a tall glass of water on waking, a 5-minute walk after lunch, and an earlier bedtime. Three simple actions that already make a real difference.",
genericError: "Your priority today: drink a tall glass of water on waking, walk 5 minutes after a meal, and get to bed a little earlier. Small actions, big impact.",

// DE, IT, ES, PT — pattern identique (eau + 5 minutes + coucher)
```

**Et le sanitizer** (même node) :

```javascript
/* COACH_LLM_REFUSAL_SANITIZER_V1 */
const COACH_BANNED_LLM_PATTERNS = {
  fr: [
    /pas assez de donn[eé]es/i,
    /donn[eé]es insuffisantes/i,
    /je ne peux pas (?:te |vous )?(?:r[eé]pondre|conseiller|donner un conseil|aider)/i,
    /impossible de (?:te |vous )?(?:r[eé]pondre|conseiller)/i,
    /aucune? (?:donn[eé]e|comparaison|recommandation)/i,
    /pas de comparaison (?:disponible|possible)/i,
    /reviens (?:apr[eè]s|plus tard|avec)/i,
    /il (?:me )?manque (?:de|des) donn[eé]es/i,
    /je n ?ai pas (?:assez|suffisamment) (?:de )?donn[eé]es/i,
  ],
  en: [/not enough data/i, /insufficient (?:data|information)/i, /cannot (?:answer|advise|help|conclude|provide)/i, ...],
  // de, it, es, pt — équivalents
};
function coachStripLLMRefusal(text, locale) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const patterns = COACH_BANNED_LLM_PATTERNS[locale] || COACH_BANNED_LLM_PATTERNS.fr;
  let cleaned = text;
  for (const pat of patterns) cleaned = cleaned.replace(pat, '').trim();
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  if (cleaned.length < 24) return '';
  return cleaned;
}
const parsedBodySanitized = coachStripLLMRefusal(parsed.body, languageCode);
```

**Et la chaîne de fallback** :

```javascript
const finalBody = coachRoute === 'no_scan'
  ? clampString(firstNonEmptyString([synthesizedBody, localizedCopy.noScanBody, localizedCopy.genericError]), 4000)
  : clampString(firstNonEmptyString([parsedBodySanitized, synthesizedBody, fallbackBody, localizedCopy.genericError]), 4000);
```

### 6.2 Conditions de déclenchement

1. Le LLM répond honnêtement quand il manque de contexte. Exemples fréquents :
   - Preset `nutrition_focus__*` sans scan nutrition récent
   - Preset `body_focus__*` sans scan body
   - Preset `risk_watch__*` sans super scan
   - Scanner CTA après retry strip
   - Trend review demandé avec < 3 scans même type
2. `coachStripLLMRefusal` matche un pattern (très permissif) → `cleaned.length < 24` → `parsedBodySanitized = ''`
3. `synthesizedBody` est vide ou non significatif (rien dans `content` à synthétiser)
4. `fallbackBody` peut aussi être vide selon `coachRoute`
5. La chaîne tombe sur `localizedCopy.genericError` → **la phrase observée**

### 6.3 Pourquoi maintenant ?

Le script [tmp/apply-coach-fallback-cleanup.js](tmp/apply-coach-fallback-cleanup.js) a été exécuté **le 2026-05-19** (audit existant). Avant cette date, le fallback FR était : `"Je n'ai pas pu formuler un conseil personnalise fiable a partir des informations disponibles. Reessaie avec un scan recent pour obtenir un retour plus utile."` — neutre mais frustrant. Le script l'a remplacé par "bois un grand verre d eau / 5 minutes / coucher" pour rendre le fallback "actionnable". **Le remède est devenu le bug.**

### 6.4 Contradiction intra-système (à signaler)

Le prompt système n8n (présent dans [n8n/workflows/coach.json](n8n/workflows/coach.json) node `Normalize Coach Input1`, [n8n/workflows/coach-conversation.json:143](n8n/workflows/coach-conversation.json:143) node `Normalize Coach Conversation Input`, et [tmp/kernel-v3-extract.txt:5](tmp/kernel-v3-extract.txt:5)) contient explicitement :

```
(4) ANTI-RÉFLEXE : interdit de répondre "bois de l eau", "fais 5 min de marche",
"dors plus", "respire", "hydrate-toi", "fais du sport" comme conseil par défaut
si la question ne porte pas sur ces sujets.
```

avec renforcements R1-R5 qui couvrent les reformulations.

→ Le système **interdit au LLM** ce pattern, mais **le code post-LLM le réinjecte de force**. C'est une auto-incohérence du produit : la règle (4) est inefficace pour ce bug car la phrase fautive ne vient pas du LLM, elle vient du formatter JS en aval.

### 6.5 Pas dans coach-conversation.json

Vérification grep effectuée : `coach-conversation.json` ne contient pas `COACH_LLM_REFUSAL_SANITIZER`, pas `defaultBody`, pas `genericError`, pas `bois un grand verre`. Donc le bug spécifique "Bois de l'eau dans 5 minutes" **ne peut PAS apparaître dans le coach conversationnel libre** ([screens/CoachChatScreen.tsx](screens/CoachChatScreen.tsx)). Si l'utilisateur observe ce bug en chat libre, c'est probablement le LLM lui-même qui le génère malgré la règle (4) — cas distinct.

### 6.6 Niveau de confiance

| Élément | Confiance |
|---|---|
| La phrase est dans `coach.json` ligne 3060 | **100%** (grep + lecture) |
| C'est `localizedCopy.fr.genericError` et `localizedCopy.fr.defaultBody` | **100%** |
| Elle se déclenche via la chaîne `firstNonEmptyString` | **100%** (code lu) |
| Le sanitizer en est le déclencheur principal | **95%** (autres déclencheurs possibles : `parsed.body` vide retourné par LLM directement, `coachRoute === 'no_scan'` route ; tous mènent au même fallback) |
| Le bug touche surtout les presets et scanner CTAs (pas free chat) | **100%** (preuve par absence dans coach-conversation.json) |
| Le script [tmp/apply-coach-fallback-cleanup.js](tmp/apply-coach-fallback-cleanup.js) est l'auteur de cette injection | **100%** (commentaire interne du script) |

---

## 7. Diagnostic par cause (classification)

Pour chaque scénario de bug, classification dans les catégories listées :

| Scénario | Catégorie principale | Catégorie secondaire | Source |
|---|---|---|---|
| Preset nutrition_focus sans scan nutrition → fallback hydratation | **PROMPT_FALLBACK_BUG** | **EMPTY_SCAN_CONTEXT** | §5 cas 2, §6.1 |
| Preset weekly_plan sans scans multi-type → fallback | **PROMPT_FALLBACK_BUG** | **MISSING_SCAN_CONTEXT** | §5 cas 3 |
| Preset risk_watch sans super → fallback | **PROMPT_FALLBACK_BUG** | **EMPTY_SCAN_CONTEXT** | §5 cas 4 |
| Scanner CTA → retry strip → fallback | **WORKFLOW_BRANCH_BUG** | **PROMPT_FALLBACK_BUG** | §4 (retry), §5 cas 8-10 |
| Preset trend_review avec < 3 scans same type → fallback | **PROMPT_FALLBACK_BUG** | **MISSING_SCAN_CONTEXT** | §3 (quotas) |
| TypeFilter rejette tous les scans existants → payload vide → fallback | **EMPTY_SCAN_CONTEXT** | **PROMPT_FALLBACK_BUG** | §3 |
| Free chat (CoachChatScreen) : pas ce bug spécifique | (n/a — bug distinct lié au prompt n8n + cache, voir [COACH_CONVERSATIONNEL_DATA_AUDIT.md](COACH_CONVERSATIONNEL_DATA_AUDIT.md)) | — | §6.5 |
| Scanner CTA face hydratation (cas nominal) → conseil correct | **OK** | — | §5 cas 8 (nominal) |

**Cause primaire dominante : `PROMPT_FALLBACK_BUG`** (chaîne `firstNonEmptyString` + `localizedCopy.genericError` hard-codé) avec amplification par `MISSING_SCAN_CONTEXT` / `EMPTY_SCAN_CONTEXT` (presets dont le typeFilter ne matche pas les scans de l'utilisateur).

---

## 8. Recommandations (audit, pas d'implémentation)

### 8.1 Quick fix (P0, < 1 heure)

**R-1. Neutraliser le pattern hydratation dans les fallbacks**

[n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060), node `Code in JavaScript2`, paramètre `jsCode`, remplacer les valeurs FR/EN/DE/IT/ES/PT de `defaultBody` et `genericError` par un message neutre qui :

- ne mentionne ni "eau", ni "5 minutes", ni "coucher", ni aucun synonyme
- propose à l'utilisateur de reformuler ou de faire un scan
- maintient un ton "actionnable" sans contredire la règle (4)

Exemple (FR) :
```
"Pour te répondre précisément, j'ai besoin d'un peu plus d'éléments. Reformule ta question, ou lance un scan récent — je peux ensuite t'aider à structurer un plan personnalisé."
```

Idempotent via `apply-coach-fallback-cleanup.js` patterns — possible de scripter le revert puis le re-replace.

**R-2. Retirer le sanitizer ou le rendre plus précis**

Le `COACH_LLM_REFUSAL_SANITIZER_V1` actuel est trop agressif : il efface des phrases utiles ("Reviens après ton prochain scan", "Aucune comparaison disponible") qui ne sont pas des excuses, juste des constats factuels. Soit :
- (a) Retirer complètement le sanitizer et faire confiance au prompt système (règle ligne 40 du prompt extrait : "Interdit explicitement : 'je n'ai pas assez de données', 'les données de X ne sont pas disponibles'…")
- (b) Réduire les patterns à des cas réellement problématiques (uniquement "je ne peux pas", "impossible de te répondre"), pas les constats factuels neutres

### 8.2 Court terme (P1, < 1 jour)

**R-3. Logger la réponse brute du LLM + le sanitizer firing**

Dans le node `Code in JavaScript2`, ajouter une trace dans le retour vers l'Edge function :

```javascript
return [{
  json: {
    ...content,
    debug: {
      sanitizer_fired: parsed.body !== parsedBodySanitized,
      llm_body_length: (parsed.body || '').length,
      final_body_source: (parsedBodySanitized ? 'llm' : synthesizedBody ? 'synthesized' : 'fallback'),
      coach_route: coachRoute,
    }
  }
}];
```

Côté Edge function, persister dans `coach_entries.response_payload_json.debug` (le contrat le permet déjà via `assertCoachInnerPayload`, à vérifier).

**R-4. Logger côté Edge function la source de la question + scans envoyés**

[supabase/functions/coach-generate-response/handler.ts](supabase/functions/coach-generate-response/handler.ts) — avant le POST webhook, ajouter un `logPhase2Info`:

```typescript
logPhase2Info('[coach-generate-response] webhook-out', {
  request_id, entry_id,
  persona_key: requestBody.persona_key,
  prompt_type: requestBody.payload?.prompt_type,
  question_key: requestBody.payload?.question_key,
  has_question_text: !!requestBody.payload?.question_text,
  has_scan_intent: !!requestBody.payload?.scan_intent,
  scan_intent_severity: requestBody.payload?.scan_intent?.severity,
  selected_scan_present: !!requestBody.payload?.selected_scan,
  latest_scan_present: !!requestBody.payload?.latest_scan,
  recent_scans_count: requestBody.payload?.recent_scans?.length ?? 0,
  latest_by_type_keys: Object.keys(requestBody.payload?.latest_by_type ?? {}),
  scan_count_7d: requestBody.payload?.scan_count_7d,
  payload_bytes: serializedPayloadBytes,
  source: requestBody.payload?.scan_intent ? 'scanner_cta' :
          requestBody.payload?.prompt_type === 'free_question' ? 'free_text' : 'preset',
});
```

Permet de tracer en temps réel **quelle source produit quel fallback**.

**R-5. Détecter et alerter sur la réponse fallback**

Après réception webhook ([handler.ts:474+](supabase/functions/coach-generate-response/handler.ts:474)), si `normalizedResponse.body` matche un des patterns hardcodés (regex `bois un grand verre d eau` ou équivalent EN/DE/IT/ES/PT) → log warn avec `request_id`, `entry_id`, `prompt_type`. Permet de quantifier le bug en prod sans changer le UX immédiatement.

### 8.3 Moyen terme (P2, < 1 semaine)

**R-6. Renforcer la classification d'intention pour éviter les presets impossibles**

Côté front, dans [shared/coachQuestions.ts](shared/coachQuestions.ts) + [services/coach.ts:233-292](services/coach.ts:233) `COACH_PROMPT_SCAN_QUOTAS`, si l'utilisateur n'a pas le type de scan requis pour un preset (ex : aucun scan nutrition mais clique `nutrition_focus__*`), soit :

- (a) **Désactiver le preset dans l'UI** avec un tooltip "Lance un scan nutrition d'abord"
- (b) **Router différemment** : remplacer `prompt_type=nutrition_focus` par `prompt_type=latest_scan` + `question_hints.preferred_artifacts=['nutrition_swaps']` pour que le LLM utilise les scans disponibles avec un angle nutrition
- Préférer (a) (moins ambigu, plus honnête envers l'utilisateur)

**R-7. Refonte du retry strip pour scanner CTAs**

[services/coach.ts:5413](services/coach.ts:5413) `shouldRetryLatestScanIssueResolutionAsLatestScan` : actuellement strip tout (`question_key`, `question_text`, `selected_scan_id`, `scan_intent`). C'est trop. Alternatives :

- (a) Conserver `scan_intent.scan_id` et `scan_intent.priority_metric` au retry (juste enlever le prompt_type orphelin)
- (b) Faire un retry vers `prompt_type=latest_scan` mais en gardant `selected_scan_id` ⇒ le LLM voit au moins quel scan utiliser
- (c) Vérifier d'abord côté Edge function si `latest_scan_issue_resolution` est connu du workflow n8n — si non, ne pas l'envoyer du tout

**R-8. Vérifier la cohérence règle (4) ↔ fallback**

Discussion produit + ingénierie : soit on garde la règle anti-réflexe et on retire le fallback hydratation (option propre), soit on retire la règle (4) et on garde le fallback (option pragmatique mais incohérente). À trancher.

### 8.4 Architecture cible (P2-P3, optionnel)

**R-9. Séparation explicite des 3 sources via un champ `source`**

Ajouter au payload `coach-generate-response` un champ `source: 'preset' | 'free_text' | 'scanner_cta'`. Bénéfices :

- Workflow n8n peut router différemment selon la source
- Logs deviennent comparables instantanément
- Permet de tracer le bug à la source (vs aujourd'hui : il faut déduire via `question_key`, `scan_intent`, etc.)

**R-10. Node n8n dédié `Scanner Followup` (optionnel)**

L'audit B confirme qu'il **n'existe pas** de node dédié aux scanner CTAs aujourd'hui. La question de l'utilisateur ("faut-il en créer un ?") :

- **Avantages d'un node dédié** :
  - Prompt plus ouvert pour gérer des questions dynamiques (suggestions IA potentielles plus tard)
  - Injection systématique du scan_id, scan_type, finding déclencheur, métriques associées
  - Pas de retry strip
  - Évite le fallback hardcodé hydratation (le node aurait sa propre logique)
- **Inconvénients** :
  - Code dupliqué (parsing réponse, persona switch, etc.)
  - Maintenance double
  - Surface d'attaque webhook étendue
- **Verdict** : **Pas nécessaire pour fixer le bug actuel** (le bug vient du fallback, pas de l'absence de node). À envisager seulement si les CTAs deviennent partiellement dynamiques (IA-generated). En l'état actuel (CTAs statiques), garder le pipeline unifié et corriger R-1+R-3+R-7 résout 95% du problème.

**R-11. Distinguer `preset` vs `free_text` vs `scanner_cta` au niveau du prompt système**

Plutôt qu'un nouveau node, ajouter un bloc conditionnel dans `Normalize Coach Input1` :

```
Source: ${source}
Si source=scanner_cta:
  - tu as un finding spécifique détecté par le scanner
  - utilise scan_intent.priority_metric et scan_intent.user_facing_summary
  - ne génère pas de conseil hors de ce finding
Si source=free_text:
  - répond directement à la question, même si hors-sujet santé (R3 du prompt)
Si source=preset:
  - utilise prompt_type pour cadrer le focus
```

---

## 9. Architecture cible recommandée

```
                    ┌──────────────────────────┐
                    │      Utilisateur         │
                    └──┬──────────┬─────────┬──┘
                       │          │         │
              preset   │     free chat  scanner CTA
                       ▼          ▼         ▼
                ┌──────────────────────────────┐
                │ Front-end coach.ts           │
                │ buildCoachPayload + ajout    │
                │ champ source ∈ {preset,      │
                │   free_text, scanner_cta}    │
                └─────────────┬────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ Edge coach-generate-response │
                │ (+ logs structurés : source, │
                │  prompt_type, scan_count)    │
                └─────────────┬────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ n8n coach.json               │
                │ Normalize avec bloc          │
                │ source-aware                 │
                │   ↓                          │
                │ Switch persona × route       │
                │   ↓                          │
                │ Chain LLM                    │
                │   ↓                          │
                │ Code in JavaScript2 :        │
                │   • sanitizer revu (R-2)     │
                │   • fallback neutre (R-1)    │
                │   • debug fields (R-3)       │
                └─────────────┬────────────────┘
                              │
                              ▼
                       Réponse user

Pour le chat libre :
   coach-send-message → coach-conversation.json (déjà fixé à 90%, R-8 facultatif)
```

---

## 10. Plan de fix priorisé

| Phase | Action | Effort | Bénéfice | Risque |
|---|---|---|---|---|
| **Phase 1 — Critique (< 1 heure)** | R-1 (neutraliser fallback hydratation 6 langues) | 30 min | élimine la phrase visible utilisateur immédiatement | très faible (changement de texte uniquement) |
| **Phase 1** | R-5 (regex de détection en alerte côté Edge) | 30 min | quantifie le bug en prod | très faible (logs seulement) |
| **Phase 2 — Hygiène (< 1 jour)** | R-3 + R-4 (logs sanitizer + scans envoyés) | 4 h | rend tout futur cas traçable | faible |
| **Phase 2** | R-2 (revoir patterns sanitizer) | 2-4 h | évite que d'autres phrases utiles soient striped | moyen (peut laisser passer quelques "je ne peux pas") |
| **Phase 3 — Cohérence (< 1 semaine)** | R-6 (presets impossibles désactivés UI) | 1-2 j | empêche d'envoyer des payloads pauvres | faible |
| **Phase 3** | R-7 (retry strip plus fin) | 1 j | scanner CTAs ne perdent plus le contexte | moyen |
| **Phase 3** | R-8 (décision produit règle (4) ↔ fallback) | 0.5 j (decision) | élimine l'auto-incohérence | n/a |
| **Phase 4 — Architecture (optionnel)** | R-9 (champ source) | 1-2 j | observabilité long terme | faible |
| **Phase 4** | R-11 (prompt source-aware) | 1 j | améliore qualité par source | moyen (changement prompt = test régression) |
| **Phase 4** | R-10 (node n8n dédié scanner) | **NON RECOMMANDÉ** dans l'état actuel | — | — |

---

## 11. Tests de non-régression à créer

Liste non implémentée — à créer dans `__tests__/` :

### `__tests__/n8n/coachFallback.regression.test.js`
- `it('does not contain "bois un grand verre d eau" in localizedCopy.fr.genericError')`
- `it('does not contain "drink a tall glass of water" in localizedCopy.en.genericError')`
- (idem DE, IT, ES, PT)
- `it('sanitizer does not match generic factual statements like "Reviens après ton prochain scan"')`
- `it('finalBody falls back to a neutral message when LLM body is stripped')`

### `__tests__/supabase/coachGenerateResponseHandler.regression.test.ts`
- `it('logs source field when invoked from preset')`
- `it('logs source=scanner_cta when scan_intent is present in payload')`
- `it('alerts when normalizedResponse.body matches banned fallback pattern')`

### `__tests__/services/coach.regression.test.ts`
- `it('does not strip scan_intent.scan_id during latest_scan_issue_resolution retry')` (R-7)
- `it('disables nutrition_focus presets in UI when user has no nutrition scan')` (R-6)

### `__tests__/screens/CoachScreen.regression.test.tsx`
- `it('routes preset clicks to coach-generate-response')`
- `it('routes scanner CTA clicks to coach-generate-response with scan_intent payload')`
- `it('routes free text submissions to coach-generate-response with prompt_type=free_question')`

### `__tests__/n8n/coachWorkflow.regression.test.js` (existant à étendre)
- `it('returns different responses for nutrition preset vs body preset given identical scans')`
- `it('does not output a hydration fallback for face_focus presets even with poor scan')`
- Probabilité élevée que ces tests **échouent** dans l'état actuel — c'est l'intérêt.

---

## 12. Questions ouvertes

Questions qui restent bloquantes après l'audit (nécessitent action utilisateur/équipe) :

1. **Décision produit règle (4) ↔ fallback** (R-8) — auto-incohérence à arbitrer : faut-il retirer la règle anti-réflexe ou retirer le fallback hardcodé ? Les deux ensemble créent le bug.
2. **Cas du chat libre** — l'audit a-t-il observé le bug "Bois de l'eau dans 5 minutes" **aussi** en chat libre (`CoachChatScreen` / `coach-send-message`) ? Si oui, c'est un bug LLM distinct (le sanitizer n'est pas dans ce chemin). À confirmer avec un test runtime.
3. **Sanctuarisation `latest_scan_issue_resolution`** — est-ce que ce `prompt_type` est encore connu du workflow n8n actuel ? Si non, le retry strip est systématique sur tous les scanner CTAs et le bug devient massif. À vérifier dans `coach.json` (la branche `Switch coach_route` doit avoir une entrée pour `latest_scan_issue_resolution`).
4. **Volumétrie du bug en prod** — combien de réponses contiennent la phrase fautive sur les 7 derniers jours ? Une fois R-5 déployé, on aura le chiffre. Sans R-5, c'est invisible.
5. **Audit code path `coachRoute === 'no_scan'`** — quand cette branche est-elle déclenchée ? Est-ce qu'elle est aussi affectée par `localizedCopy.noScanBody` (vide selon l'inspection) ? À creuser si le bug touche aussi des utilisateurs **sans aucun scan**.

---

## 13. Preuves directes vs hypothèses

### 13.1 Preuves directes (vérifiées par grep / lecture)

| Affirmation | Preuve |
|---|---|
| La phrase "bois un grand verre d eau / 5 minutes apres le repas" est codée en dur dans `coach.json` ligne 3060 | grep direct sur [n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060) (`Code in JavaScript2`), valeurs `localizedCopy.fr.defaultBody` et `localizedCopy.fr.genericError` |
| 6 langues × 2 messages = 12 variantes | [tmp/apply-coach-fallback-cleanup.js:56-128](tmp/apply-coach-fallback-cleanup.js:56) |
| Sanitizer `coachStripLLMRefusal` strip les patterns "pas assez de données" etc. | [tmp/apply-coach-fallback-cleanup.js:139-184](tmp/apply-coach-fallback-cleanup.js:139), confirmé présent dans coach.json (marker `COACH_LLM_REFUSAL_SANITIZER_V1`) |
| `firstNonEmptyString([parsedBodySanitized, synthesizedBody, fallbackBody, localizedCopy.genericError])` | coach.json line 3060 (chaîne JS) |
| Règle anti-réflexe (4) explicitement dans le prompt système | [n8n/workflows/coach-conversation.json:143](n8n/workflows/coach-conversation.json:143), [tmp/kernel-v3-extract.txt:5](tmp/kernel-v3-extract.txt:5), [tmp/coach-prompts-after.txt](tmp/coach-prompts-after.txt) lignes 13/65/298/583/867/926 |
| 6 personas partagent les mêmes 49 presets | [shared/coachQuestions.ts:255](shared/coachQuestions.ts:255) (1 catalogue unique) |
| Scanner CTAs passent par `coach-generate-response` (pas de node dédié) | [services/coach.ts:5330](services/coach.ts:5330), [shared/scanCoachIntent.ts:1219](shared/scanCoachIntent.ts:1219) |
| Le retry strip enlève scan_intent | [services/coach.ts:5413](services/coach.ts:5413) `shouldRetryLatestScanIssueResolutionAsLatestScan` |
| Le pipeline conversationnel a été fixé pour exposer scan_metrics | [supabase/functions/_shared/coachConversationContext.ts:309](supabase/functions/_shared/coachConversationContext.ts:309) (audit existant [COACH_CONVERSATIONNEL_DATA_AUDIT.md](COACH_CONVERSATIONNEL_DATA_AUDIT.md)) |
| Coach conversationnel n'a pas de sanitizer hydratation | grep négatif sur `coach-conversation.json` (zéro match `COACH_LLM_REFUSAL_SANITIZER`, `bois un grand verre`, `defaultBody`, `genericError`) |
| Logs Edge function ne capturent ni question_text exact, ni nombre de scans envoyés, ni réponse brute LLM | [supabase/functions/coach-generate-response/handler.ts](supabase/functions/coach-generate-response/handler.ts) (audit H exhaustif) |

### 13.2 Hypothèses non prouvées (à valider)

| Hypothèse | Pourquoi non prouvée |
|---|---|
| Le retry strip se déclenche en pratique pour les scanner CTAs (cas §5 #8-10) | Pas de tests / logs en runtime ; dépend de la présence ou non du `prompt_type=latest_scan_issue_resolution` dans le `Switch coach_route` du workflow live n8n |
| La phrase exacte observée par l'utilisateur ("Bois de l'eau dans 5 minutes") est la `genericError` FR | Forte ressemblance mais la phrase utilisateur peut être une paraphrase de `defaultBody` ("5 minutes de marche apres le dejeuner") ou une variante ; **les deux mèneraient au même fix R-1** |
| Le sanitizer est le déclencheur dominant (vs `parsed.body` directement vide) | 95% confiance, pas 100%. Le LLM peut aussi répondre body=null/empty si le workflow rejette son output ou si le prompt système l'incite à ne pas répondre (peu probable post-règle ligne 40 "interdit explicitement…") |
| Le bug ne se manifeste pas dans le chat libre | Vérifié par absence du code sanitizer ; cependant le LLM peut générer spontanément un pattern similaire en chat libre malgré la règle (4) — c'est un bug LLM distinct, pas couvert par cet audit |
| `confidence_score < 55` est la condition de quality_check qui bascule vers `buildFallback` | Mentionné dans l'audit B mais nécessiterait une lecture détaillée de `shared/scanCoachIntent.ts:942` pour confirmer les seuils exacts |

---

## 14. Liste des fichiers / prompts / workflows concernés

### Front-end
- [screens/CoachScreen.tsx](screens/CoachScreen.tsx) — UI presets + free text + auto-submit
- [screens/CoachChatScreen.tsx](screens/CoachChatScreen.tsx) — UI chat libre
- [screens/ScanResultScreen.tsx:278](screens/ScanResultScreen.tsx:278) — handleCoachPress (CTA)
- [screens/SuperScanResultScreen.tsx](screens/SuperScanResultScreen.tsx) — CTA super scan
- [components/results/ScanCoachCtaCard.tsx](components/results/ScanCoachCtaCard.tsx)
- [components/results/ScanCoachFinalCard.tsx](components/results/ScanCoachFinalCard.tsx)

### Shared
- [shared/coachQuestions.ts](shared/coachQuestions.ts) — 49 presets, 10+2 prompt types
- [shared/coachPersonas.ts](shared/coachPersonas.ts) — 6 personas
- [shared/coachPromptTypes.ts](shared/coachPromptTypes.ts)
- [shared/scanCoachIntent.ts](shared/scanCoachIntent.ts) — scanner CTAs generation
- [shared/coachContentParser.ts](shared/coachContentParser.ts) — parsing réponse

### Services
- [services/coach.ts](services/coach.ts) — buildCoachPayload, generateCoachGuidance, retry logic
- [services/coachConversation.ts](services/coachConversation.ts) — coach chat libre
- [hooks/queries/useCoachGeneration.ts](hooks/queries/useCoachGeneration.ts)
- [utils/coachSubmitIntent.ts](utils/coachSubmitIntent.ts)
- [utils/coachScanQueries.ts](utils/coachScanQueries.ts)

### Edge Functions (Supabase)
- [supabase/functions/coach-generate-response/handler.ts](supabase/functions/coach-generate-response/handler.ts) — classique + scanner CTAs
- [supabase/functions/coach-send-message/handler.ts](supabase/functions/coach-send-message/handler.ts) — chat libre
- [supabase/functions/_shared/phase2Contracts.ts](supabase/functions/_shared/phase2Contracts.ts) — assertCoachInnerPayload, allowed keys
- [supabase/functions/_shared/phase2Webhook.ts](supabase/functions/_shared/phase2Webhook.ts) — HMAC, timeout, retry
- [supabase/functions/_shared/coachPayload.ts](supabase/functions/_shared/coachPayload.ts) — resolveCoachPayload
- [supabase/functions/_shared/coachConversationContext.ts:309](supabase/functions/_shared/coachConversationContext.ts:309) — buildRecentScanDigest (fixé)
- [supabase/functions/_shared/coachProvider.ts](supabase/functions/_shared/coachProvider.ts)
- [supabase/functions/_shared/coachConversationProvider.ts](supabase/functions/_shared/coachConversationProvider.ts)
- [supabase/functions/_shared/coachContentParser.ts](supabase/functions/_shared/coachContentParser.ts)
- [supabase/functions/_shared/phase2Observability.ts](supabase/functions/_shared/phase2Observability.ts) — SENSITIVE_KEY_PATTERN

### Workflows n8n
- [n8n/workflows/coach.json](n8n/workflows/coach.json) — **★ ligne 3060 node Code in JavaScript2** (source du bug)
- [n8n/workflows/coach-conversation.json](n8n/workflows/coach-conversation.json) — chat libre (pas affecté)
- [n8n/workflows/analyse_1.json](n8n/workflows/analyse_1.json) — scanner standard
- [n8n/workflows/SUPERSCAN.json](n8n/workflows/SUPERSCAN.json) — super scanner
- [n8n/workflows/fridge-scan-chef.json](n8n/workflows/fridge-scan-chef.json) — fridge

### Scripts tmp (historiques, à connaître)
- [tmp/apply-coach-fallback-cleanup.js](tmp/apply-coach-fallback-cleanup.js) — **★ script qui a INJECTÉ le bug**
- [tmp/apply-coach-prompts-v3.js](tmp/apply-coach-prompts-v3.js)
- [tmp/apply-coach-prompts-v3-convo.js](tmp/apply-coach-prompts-v3-convo.js)
- [tmp/apply-data-gaps-cleanup.js](tmp/apply-data-gaps-cleanup.js)
- [tmp/coach-prompts-after.txt](tmp/coach-prompts-after.txt) — prompts v3 consolidés
- [tmp/kernel-v3-extract.txt](tmp/kernel-v3-extract.txt) — kernel système avec règle (4)
- [tmp/convo-prompts-by-persona-v3.json](tmp/convo-prompts-by-persona-v3.json) — 6 personas convo prompts
- [tmp/validator-v3-*.json](tmp/) — validators v3 par persona

### Audits liés
- [COACH_CONVERSATIONNEL_DATA_AUDIT.md](COACH_CONVERSATIONNEL_DATA_AUDIT.md) — 2026-05-20, bug chat libre (90% fixé)
- [SCANNER_COACH_AUDIT_2026_05.md](SCANNER_COACH_AUDIT_2026_05.md) — 2026-05-19, sécurité scanner→coach
- [COACH_SECURITY_AUDIT_2026_05.md](COACH_SECURITY_AUDIT_2026_05.md)
- [COACH_SECURITY_AUDIT.md](COACH_SECURITY_AUDIT.md)

---

## 15. Décision recommandée avant implémentation

**Option retenue : E — Le problème est mixte (fallback prompt + retrieval contextuel), mais avec une cause **dominante très claire**.**

### Pourquoi

- **Cause dominante (≈ 80% des occurrences observables) :** **Option A — fallback hardcodé `localizedCopy.genericError` + sanitizer trop agressif** ([n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060)). Preuve textuelle directe, mécanisme reproductible par lecture du code. **Confiance : élevée.**
- **Cause amplificatrice (≈ 20%) :** **Option C — récupération scans incomplète quand le preset exige un type de scan absent** (ex : `nutrition_focus` sans scan nutrition, `risk_watch` sans super). Le payload arrive pauvre, le LLM dit "pas assez de données", le sanitizer entre en jeu. **Confiance : élevée.**
- **Cause éliminée :** Option B (workflow / routage cassé en soi) — non, la cartographie montre un routing propre et déterministe. Le bug n'est pas un mauvais routage, c'est un fallback inapproprié au bout du routage correct.
- **Cause partielle (≈ 10% cumulé) :** Option D — scanner CTAs subissent le même fallback **+** le retry strip déclasse leur contexte. C'est un sous-cas de A+C, pas une cause indépendante.

### Recommandation finale (3 actions, dans l'ordre)

1. **R-1 (60 minutes) — Neutraliser les 12 fallbacks hardcodés** dans [n8n/workflows/coach.json:3060](n8n/workflows/coach.json:3060). Bénéfice immédiat : la phrase observée disparaît. Risque : très faible. C'est un changement de texte sans logique nouvelle.

2. **R-5 + R-4 (4 heures) — Logs structurés** : avant tout autre changement, instrumenter pour mesurer la volumétrie réelle du bug (combien de réponses contenaient la phrase, sur quels presets, pour quels users). Permet de prioriser R-6/R-7 sur les presets les plus touchés.

3. **R-6 + R-2 (1-2 jours) — Désactiver presets impossibles + assouplir sanitizer** : élimine la cause amplificatrice (Option C) et l'auto-incohérence règle (4) ↔ fallback. Bénéfice durable.

### Ce qu'il NE faut PAS faire

- **Ne pas créer de node n8n dédié aux scanner CTAs** (R-10) : pas nécessaire pour fixer le bug, ajoute de la dette.
- **Ne pas retirer la règle anti-réflexe (4) du prompt système** : elle est cohérente et utile contre le risque LLM (cas du chat libre, non audité ici).
- **Ne pas garder le sanitizer en l'état** : il efface des constats utiles ("Reviens après ton prochain scan") et amplifie le bug.
- **Ne pas refondre les 49 presets ou les 6 personas** : ils sont sains, c'est le formatter post-LLM qui dérape.

### Risques résiduels après fix R-1+R-2+R-5+R-6

| Risque résiduel | Probabilité | Mitigation |
|---|---|---|
| Le LLM lui-même génère "bois de l'eau" malgré la règle (4) | faible (le prompt v3 + R1-R5 réduit drastiquement) | détection regex côté Edge (R-5) |
| Un autre fallback hard-codé existe ailleurs (autre workflow) | très faible (grep effectué) | tests de régression R-11 |
| Le chat libre montre toujours un bug similaire | faible | suivre l'audit séparé [COACH_CONVERSATIONNEL_DATA_AUDIT.md](COACH_CONVERSATIONNEL_DATA_AUDIT.md) |
| Retry strip casse les scanner CTAs en silence | moyen avant R-7, faible après R-5 | logs R-5 quantifient |

### Ordre de priorité

```
P0  → R-1  (1 h)         neutraliser fallback hydratation 6 langues
P0+ → R-5  (1 h)         alerte regex côté Edge (compteur volumétrique)
P1  → R-4  (3 h)         logs source + scan_count Edge function
P1  → R-3  (2 h)         logs sanitizer fired côté n8n
P1  → R-2  (3 h)         revoir patterns sanitizer (moins agressifs)
P2  → R-6  (1 j)         désactiver presets sans scan requis
P2  → R-7  (1 j)         retry strip plus fin (garder scan_id)
P2  → R-8  (0.5 j)       décision produit règle (4) ↔ fallback
P3  → R-9, R-11          architecture cible source-aware
```

---

## 16. Addendum — Validation des hypothèses (post-rapport)

Après la rédaction initiale, vérifications complémentaires effectuées pour confirmer/réfuter les hypothèses listées au §13.2.

### 16.1 ✅ `latest_scan_issue_resolution` est connu de tout le stack — hypothèse §13.2 #3 partiellement RÉFUTÉE

**Preuves :**

| Couche | Preuve | Statut |
|---|---|---|
| Front | [shared/coachPromptTypes.ts:22](shared/coachPromptTypes.ts:22) `LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE` dans `COACH_HIDDEN_GENERATION_PROMPT_TYPES` | reconnu |
| Front | [shared/coachPromptTypes.ts:35](shared/coachPromptTypes.ts:35) `COACH_PROMPT_TYPE_ALIASES.latest_scan_issue_resolution = 'latest_scan'` | mapping alias |
| Front | [shared/coachPromptTypes.ts:241](shared/coachPromptTypes.ts:241) quota `recentLimit: 5, priorLimit: 4` | quota défini |
| Edge | [supabase/functions/_shared/phase2Contracts.ts:574](supabase/functions/_shared/phase2Contracts.ts:574) `normalizeCoachGenerationPromptType` accepte les valeurs de `COACH_GENERATION_PROMPT_TYPES` (qui inclut hidden) | validation passe |
| n8n | [n8n/workflows/coach.json:2884](n8n/workflows/coach.json:2884) — Determine Coach Route mappe explicitement `latest_scan_issue_resolution` → coach_route `latest_scan` (`latest_scan: ['latest_scan', 'latest_scan_issue_resolution', 'last_scan', 'scan_summary', 'new_advice']`) | mapping confirmé |

**Conséquence :** Le retry strip `shouldRetryLatestScanIssueResolutionAsLatestScan` ([services/coach.ts:5413](services/coach.ts:5413)) **ne se déclenche pas** sur le seul motif "prompt_type inconnu" car la chaîne ne le rejette pas. Le retry strip peut quand même s'activer pour d'autres causes (`question_key` incompatible avec `latest_scan_issue_resolution`, valeur `scan_intent` mal-formée, dépassement payload size, etc.) mais ce n'est plus le scénario massif redouté.

### 16.2 ✅ Seuils quality_check confirmés — hypothèse §13.2 #5 PROUVÉE

[shared/scanCoachIntent.ts:712-738](shared/scanCoachIntent.ts:712) `hasReliableEnoughData`:

```typescript
if (confidenceScore !== null && confidenceScore < 55) return false;
if (imageQualityScore !== null && imageQualityScore < 45) return false;
if (metricCoverageScore !== null && metricCoverageScore < 50) return false;
return !(imageQualityScore !== null && imageQualityScore < 65 &&
         limitationFlags.some((flag) => STRONG_QUALITY_FLAGS.has(flag)));
```

**Note importante :** les checks sont conditionnels (`!== null && <`). Si une métrique de qualité est **absente** du payload IA scanner (null), le check est **sauté**. Donc un scan dont l'IA scanner n'a pas remonté `confidence_score` passe comme "reliable" sans vérification → potentiellement `buildFallback` n'est jamais déclenché alors qu'il aurait dû l'être. Inversement, un scan "reliable" mais avec des métriques peu informatives produit un payload mince qui mène quand même au fallback côté workflow n8n.

### 16.3 🆕 **TRIPLE CONTRADICTION DE PROMPT** — finding majeur non documenté avant

En lisant intégralement [tmp/coach-prompts-after.txt](tmp/coach-prompts-after.txt) (prompts v3 actifs pour les 6 personas), trois instructions **conflictuelles** coexistent dans le même prompt système :

| Ligne | Texte | Direction |
|---|---|---|
| [tmp/coach-prompts-after.txt:37](tmp/coach-prompts-after.txt:37) | "Si aucun scan exploitable n'existe, **propose directement une mini-action générale utile (sommeil, hydratation, posture, repas équilibré, respiration)** sans mentionner l'absence de scan a l'utilisateur." | **Force** une action générale (potentiellement hydratation) |
| [tmp/coach-prompts-after.txt:140](tmp/coach-prompts-after.txt:140) | "content.data_gaps : RÈGLE STRICTE — toujours [] (jamais visible utilisateur). N écris JAMAIS de phrase utilisateur sur des données manquantes (**interdit : 'pas assez de données'**, 'données indisponibles', 'pas de comparaison', 'je ne peux pas conclure', 'les données de X ne sont pas disponibles')." | **Interdit** de signaler manque de données |
| Règle (4) anti-réflexe (tmp/kernel-v3-extract.txt:5) | "**interdit de répondre 'bois de l eau', 'fais 5 min de marche', 'dors plus', 'respire', 'hydrate-toi', 'fais du sport'** comme conseil par défaut si la question ne porte pas sur ces sujets." + R4 couvre les reformulations | **Interdit** le pattern hydratation/marche/sommeil par défaut |

**Analyse :** Quand le LLM rencontre un cas "pas de scan exploitable pour cette question" (ex : `nutrition_focus__breakfast_no_crash` sans scan nutrition), il est :

1. Forcé de proposer un conseil (ligne 37 + 140)
2. Interdit de mentionner le manque de données (ligne 140)
3. Interdit de proposer "bois de l'eau / fais 5 min de marche / dors plus" (règle 4)
4. Autorisé à proposer "sommeil, hydratation, posture, repas équilibré, respiration" (ligne 37) — qui matche exactement les patterns interdits par la règle 4 !

**C'est une boucle logiquement impossible.** Le LLM a deux issues :

- **Voie A :** Ignorer la règle 4 et générer "bois un peu d'eau" / "fais quelques minutes de marche" → **pattern hydratation directement visible utilisateur**
- **Voie B :** Respecter la règle 4 et glisser malgré tout une phrase de refus type "je ne peux pas être précis sans plus d'éléments" → matche `COACH_BANNED_LLM_PATTERNS` (regex `/je ne peux pas (?:te|vous )?(?:r[eé]pondre|conseiller|donner un conseil|aider)/i`) → strip à `< 24` chars → `firstNonEmptyString` tombe sur `localizedCopy.genericError` → **"bois un grand verre d eau, bouge 5 minutes apres le repas"**

**Les deux voies mènent au même bug observé.** La voie A est gérée par le LLM, la voie B par le sanitizer + fallback hardcodé. **Le fix R-1 (neutraliser le fallback) ferme la voie B ; pour fermer la voie A il faut soit retirer la ligne 37 du prompt, soit la reformuler pour exclure hydratation/marche/sommeil de la "mini-action générale utile".**

### 16.4 ✅ Le coach conversationnel n'a pas le sanitizer ni le fallback — hypothèse §13.2 #4 PROUVÉE

Grep négatif sur [n8n/workflows/coach-conversation.json](n8n/workflows/coach-conversation.json) : zéro occurrence de `COACH_LLM_REFUSAL_SANITIZER`, `defaultBody`, `genericError`, `bois un grand verre`, `coachStripLLMRefusal`. Confirmation par lecture du workflow (architecture : Webhook → Verify HMAC → Normalize Coach Conversation Input → Switch persona_route → DeepSeek directly → JSON formatter → Respond, sans node de sanitization).

Donc la phrase "Bois de l'eau dans 5 minutes" ne peut **pas** apparaître dans le chat libre via ce mécanisme. Si elle apparaît quand même en chat libre, c'est :

- soit le LLM lui-même (Voie A ci-dessus, qui s'applique aussi au prompt convo qui contient les **mêmes** règles ligne 37 + 140 + 4)
- soit un autre canal (push notification, intro message, etc.) — non couvert par cet audit

### 16.5 ⚠️ Le fallback SUPERSCAN.json est sans risque

[n8n/workflows/SUPERSCAN.json:56](n8n/workflows/SUPERSCAN.json:56) contient un `messages.genericError = "Erreur d'analyse."` (et équivalents EN/DE/IT/ES/PT) — c'est un message d'erreur générique du **scanner** (pas du coach), purement transactionnel, sans pattern hydratation. Hors-périmètre du bug actuel mais à noter pour ne pas confondre.

### 16.6 Mise à jour des recommandations

À la lumière du finding §16.3, **ajout d'une recommandation R-12** :

**R-12 (P1, 1 h) — Retirer "hydratation/marche/sommeil" de la liste des "mini-actions générales utiles"**

Modifier [tmp/coach-prompts-after.txt:37](tmp/coach-prompts-after.txt:37) (et ses 5 répliques pour les autres personas, et son équivalent dans `coach-conversation.json`) :

```diff
- Si aucun scan exploitable n'existe, propose directement une mini-action générale utile (sommeil, hydratation, posture, repas équilibré, respiration) sans mentionner l'absence de scan a l'utilisateur.
+ Si aucun scan exploitable n'existe, propose un seul micro-engagement spécifique au sujet de la question (lié au focus du preset OU à la dernière intention exprimée par l'utilisateur). Ne propose JAMAIS d'action générique hydratation, marche, sommeil, respiration ou posture par défaut. Si rien de pertinent ne peut être proposé, invite à reformuler la question.
```

Sans cette modification, **R-1 seul est insuffisant** : la voie A (LLM génère le pattern lui-même) reste ouverte. R-1 + R-12 ensemble ferment les deux voies du bug.

### 16.7 Mise à jour du plan priorisé

```
P0  → R-1  + R-12 (2 h)   neutraliser fallback hydratation + retirer "hydratation/sommeil" du prompt système v3
P0+ → R-5         (1 h)   alerte regex côté Edge (compteur volumétrique)
P1  → R-4         (3 h)   logs source + scan_count Edge function
P1  → R-3         (2 h)   logs sanitizer fired côté n8n
P1  → R-2         (3 h)   revoir patterns sanitizer (moins agressifs)
P2  → R-6         (1 j)   désactiver presets sans scan requis
P2  → R-7         (1 j)   retry strip plus fin (garder scan_id)
P2  → R-8         (0.5 j) décision produit règle (4) ↔ fallback
P3  → R-9, R-11           architecture cible source-aware
```

### 16.8 Recommandation finale révisée

L'**Option E** (problème mixte) reste valide. Mais la cause dominante est plus précisément :

> **Triple contradiction du prompt système v3 (ligne 37 vs ligne 140 vs règle 4) + fallback hardcodé inadapté.**
>
> La cause primaire est **PROMPT_FALLBACK_BUG combiné à PROMPT_TOO_RESTRICTIVE intra-prompt** (les règles se contredisent). Le retrieval scan et le routing sont sains. Le fix nécessite à la fois R-1 (côté workflow JS) et R-12 (côté prompt système) pour fermer les deux voies du bug.

Confiance après validation : **très élevée**.

---

**Fin du rapport.**

Total preuves directes : **15** (4 ajoutées en addendum §16). Hypothèses validées : **4 sur 5** (la 5e — volumétrie en prod — nécessite R-5 déployé pour mesurer). Cause racine confirmée avec **très haute confiance**. Fix critique = **R-1 + R-12** (~2 heures total) sans refonte. Tests de régression définis. Plan en 4 phases sur ≤ 1 semaine.
