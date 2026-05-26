# Coach Conversation — Rollout & runbook

Documente l'état final de l'implémentation Coach Conversation (étapes 1 → 9 du
plan `bon-fait-moi-un-lucky-zebra.md`) et les actions ops requises avant de
flipper le feature flag en prod.

Statut : **code livré, feature flag par défaut OFF**.

## Architecture livrée

### Backend (Supabase)

- 3 migrations (`20260524150000_create_coach_conversation_tables.sql`,
  `20260524160000_create_coach_conversation_quota.sql`,
  `20260524170000_add_coach_chat_feature_flag.sql`).
- 4 nouvelles tables : `coach_conversations`, `coach_conversation_messages`,
  `coach_conversation_message_events`, `coach_free_conversation_state`,
  `coach_conversation_attempts`.
- 10 RPCs (start, send slot reservation, attach, refund, end, archive, lists,
  quota status, rate limit attempt).
- RLS owner-only SELECT + explicit INSERT/UPDATE/DELETE denials côté
  `authenticated` (resolves finding C-06 of `COACH_SECURITY_AUDIT.md`).

### Edge Functions

| Fonction | Path | Rôle |
|---|---|---|
| `coach-start-conversation` | POST | Crée / reprend une conversation + welcome message |
| `coach-send-message` | POST (SSE) | Envoie un message user, stream le retour assistant |
| `coach-end-conversation` | POST | Termine une conversation |
| `coach-archive-conversation` | POST | Archive (masque) une conversation |
| `coach-conversation-quota-status` | POST | Snapshot quota |
| `coach-conversations-list` | POST | Liste paginée des conversations |

Tous protégés par auth Bearer + CORS + feature flag `coach_chat_enabled` +
rate limit `record_coach_conversation_attempt`.

### Frontend

- Nouvelle route `app/coach/chat.tsx` → `screens/CoachChatScreen.tsx`.
- Hero `CoachConversationHeroCard` sur `CoachScreen` (variants free/premium).
- `CoachHistoryScreen` refactoré en 2 tabs (Demandes / Conversations) avec
  archive et bascule "Afficher archivées".
- Composer chat avec micro (Web Speech API V1, native disabled pour V1).
- Service + 7 hooks React Query indépendants des hooks Coach existants.

### n8n

- Nouveau workflow `n8n/workflows/coach-conversation.json` (16 nodes).
- Webhook path `coach-conversation`, modèle DeepSeek `deepseek-v4-flash`,
  `maxTokens=1200`.

## Variables d'environnement Supabase requises (prod)

| Variable | Statut | Notes |
|---|---|---|
| `N8N_COACH_CONVERSATION_WEBHOOK_URL` | **OBLIGATOIRE** | URL publique du workflow conversation |
| `N8N_COACH_CONVERSATION_FALLBACK_WEBHOOK_URL` | optionnel | Fallback si dispo |
| `WEBHOOK_ALLOWED_HOSTS` | OBLIGATOIRE | Doit inclure l'hôte n8n conversation |
| `PHASE2_WEBHOOK_AUTH_MODE` | recommandé `hmac` | Sécurise le webhook (HMAC seul ; bearer drop 2026-05-19) |
| `PHASE2_WEBHOOK_HMAC_SECRET` | requis si `hmac` activé | Identique côté n8n |

## Étapes de rollout

1. **Migrations** : appliquer dans l'ordre via `supabase db push`. Les
   triggers `phase2_set_updated_at` sont déjà disponibles dans le schéma.
2. **Workflow n8n** : importer `coach-conversation.json`, rebrancher les 6
   credentials DeepSeek (placeholder `REBIND_REQUIRED__DeepSeek Api account`).
3. **Edge Functions** : `supabase functions deploy coach-start-conversation
   coach-send-message coach-end-conversation coach-archive-conversation
   coach-conversation-quota-status coach-conversations-list`. Le manifest
   `supabase/functions/active-edge-functions.json` et `supabase/config.toml`
   sont déjà à jour.
4. **Env vars** : positionner les vars listées ci-dessus.
5. **Smoke test interne** :
   - `coach-conversation-quota-status` POST avec un JWT valide → vérifier que
     le retour contient `tier`, `premium_today_limit` (premium) ou
     `free_remaining_messages` (free).
   - `coach-start-conversation` POST `{ persona_key: "gentle_supportive" }`
     → reçoit un `conversation_id`.
   - `coach-send-message` POST avec un payload `{ conversation_id, content,
     client_request_id }` → produit un flux SSE `ready` → `chunk` → `complete`.
6. **Flipper le flag** : `UPDATE public.app_feature_flags SET
   coach_chat_enabled = true WHERE scope = 'mobile';`. Le hero apparaîtra
   automatiquement dans `CoachScreen` (rollout instantané, plus de release
   nécessaire).

## Couverture tests

- 22 nouveaux tests Jest (`coachConversationMigration`,
  `coachConversationQuotaMigration`, `coachConversation` service helpers).
- Mock ajouté pour `useCoachConversationQuota` dans `CoachScreen.test.tsx`.
- `tsc --noEmit` propre.
- Suite Coach + Supabase + hooks + composants : 793/797 ✅, 4 fails préexistants
  non liés (scan analysis + accent CoachPersonaDetailsModal + 1 flaky).

## TODO post-V1

- Dictée vocale native (iOS/Android) : installer `expo-speech-recognition`,
  retirer `RECORD_AUDIO` de `blockedPermissions` dans `app.json`, ajouter
  `NSMicrophoneUsageDescription` côté iOS, prebuild EAS + soumission stores.
- Génération de titre auto via LLM (V2) — heuristique 1er user message en
  attendant.
- Tests E2E device réel (matrice QA §17 de l'audit).
- i18n complet pour les 6 locales (FR codé en dur dans `CoachChatScreen.tsx`
  et `CoachConversationsList.tsx` pour V1).

## Fichiers nouveaux ou modifiés (récap)

### Nouveaux

```
supabase/migrations/20260524150000_create_coach_conversation_tables.sql
supabase/migrations/20260524160000_create_coach_conversation_quota.sql
supabase/migrations/20260524170000_add_coach_chat_feature_flag.sql
supabase/functions/coach-start-conversation/index.ts
supabase/functions/coach-send-message/{index,handler}.ts
supabase/functions/coach-end-conversation/index.ts
supabase/functions/coach-archive-conversation/index.ts
supabase/functions/coach-conversation-quota-status/index.ts
supabase/functions/coach-conversations-list/index.ts
supabase/functions/_shared/coachTier.ts
supabase/functions/_shared/coachConversation.ts
supabase/functions/_shared/coachConversationQuota.ts
supabase/functions/_shared/coachConversationProvider.ts
supabase/functions/_shared/coachConversationStream.ts
n8n/workflows/coach-conversation.json
shared/coachConversation.ts
services/coachConversation.ts
screens/CoachChatScreen.tsx
app/coach/chat.tsx
components/coach/CoachConversationCard.tsx
components/coach/CoachConversationsList.tsx
components/coach/CoachConversationHeroCard.tsx
components/coach/chat/CoachChatComposer.tsx
components/coach/chat/CoachConversationStarter.tsx
components/coach/chat/CoachMessageBubble.tsx
components/coach/chat/CoachPremiumUpsellInline.tsx
components/coach/chat/CoachQuotaBanner.tsx
components/coach/chat/CoachTypingIndicator.tsx
hooks/useVoiceDictation.ts
hooks/queries/coachConversationQueryKeys.ts
hooks/queries/useArchiveCoachConversation.ts
hooks/queries/useCoachConversation.ts
hooks/queries/useCoachConversationMessages.ts
hooks/queries/useCoachConversationQuota.ts
hooks/queries/useEndCoachConversation.ts
hooks/queries/useInfiniteCoachConversations.ts
hooks/queries/useSendCoachMessage.ts
hooks/queries/useStartCoachConversation.ts
utils/coachConversationFormatting.ts
__tests__/services/coachConversation.test.ts
__tests__/supabase/coachConversationMigration.test.ts
__tests__/supabase/coachConversationQuotaMigration.test.ts
```

### Modifiés

```
supabase/config.toml                                  (6 nouvelles fonctions)
supabase/functions/active-edge-functions.json         (idem)
supabase/functions/_shared/phase2Config.ts            (coach_chat_enabled flag)
supabase/functions/_shared/phase2Types.ts             (Phase2FeatureFlags)
components/coach/CoachSettingsInline.tsx              (prop showFreeQuestionInput)
screens/CoachScreen.tsx                               (hero + retrait UI free_question)
screens/CoachHistoryScreen.tsx                        (2 tabs)
n8n/README.md                                         (doc workflow conv)
__tests__/screens/CoachScreen.test.tsx                (mock useCoachConversationQuota)
__tests__/supabase/coachGenerateResponseHandler.test.ts (coach_chat_enabled flag)
```
