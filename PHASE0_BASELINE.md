# Phase 0 Baseline Alignment

## Scope
- Real source repo: `repo/` (`C:\Users\maloh\OneDrive\Bureau\1-main (3)\1-main`)
- Wrapper repo only: `C:\Users\maloh\OneDrive\Documents\Playground`
- Goal of this phase: make the local repo state understandable and internally coherent without changing product behavior beyond tiny drift fixes

## Audited File Status
### Tracked And Modified
- `app/(tabs)/_layout.tsx`
- `components/AvatarPicker.tsx`
- `services/api.ts`
- `supabase/functions/check-and-record-scan/index.ts`

### Untracked With No Git History
- `app/(tabs)/social.tsx`
- `app/coach.tsx`
- `app/post-signup-onboarding.tsx`
- `screens/SocialScreen.tsx`
- `screens/CoachScreen.tsx`
- `screens/PostSignupOnboardingScreen.tsx`
- `supabase/functions/analyze-scan/index.ts`

### Deleted Locally
- `services/n8nWebhook.ts`

## Referenced-By-Code Or Tests But Absent From Git History
These files are already part of the current local architecture even though they were not previously tracked in git history:

### Frontend Routes And Screens
- `app/(tabs)/social.tsx`
- `app/coach.tsx`
- `app/post-signup-onboarding.tsx`
- `app/entry-offer.tsx`
- `app/social-comments.tsx`
- `app/social-compose.tsx`
- `screens/SocialScreen.tsx`
- `screens/CoachScreen.tsx`
- `screens/PostSignupOnboardingScreen.tsx`
- `screens/EntryOfferScreen.tsx`
- `screens/SocialCommentsScreen.tsx`
- `screens/SocialComposerScreen.tsx`

### Frontend Support Modules
- `hooks/usePostSignupOnboardingPending.ts`
- `hooks/queries/useFeatureFlags.ts`
- `hooks/queries/useCoachEntries.ts`
- `hooks/queries/useCoachGeneration.ts`
- `hooks/queries/useGrowthExperience.ts`
- `hooks/queries/useSocialComments.ts`
- `hooks/queries/useSocialFeed.ts`
- `hooks/queries/useSocialMutations.ts`
- `services/appConfig.ts`
- `services/analytics.ts`
- `services/coach.ts`
- `services/growthExperience.ts`
- `services/purchasesRuntime.ts`
- `services/revenueCatOfferings.ts`
- `services/runtimeConfig.ts`
- `services/social.ts`
- `services/socialDraftStore.ts`
- `contexts/StartupDiagnosticsContext.tsx`
- `components/AppScreen.tsx`
- `components/ProfileAvatar.tsx`
- `components/coach/CoachPersonaCard.tsx`
- `components/coach/CoachPromptCard.tsx`
- `components/entryOffer/EntryOfferWheel.tsx`
- `components/social/SocialCategoryPill.tsx`
- `components/social/SocialIdentityRow.tsx`
- `components/social/SocialModerationBadge.tsx`
- `components/social/SocialPostCard.tsx`
- `constants/social.ts`
- `shared/coachPersonas.ts`
- `utils/androidRouteChrome.ts`
- `utils/coachPersona.ts`
- `utils/entryOfferSession.ts`
- `utils/featureRollout.ts`
- `utils/observability.ts`
- `utils/postSignupOnboarding.ts`
- `utils/runtimeCapabilities.ts`
- `utils/shareStory.ts`
- `utils/subscription.ts`

### Backend Functions And Shared Helpers
- Canonical deployable Edge Function surface: `supabase/functions/active-edge-functions.json`
- `supabase/functions/analyze-scan/index.ts`
- `supabase/functions/cancel-scan-reservation/index.ts`
- `supabase/functions/coach-generate-response/index.ts`
- `supabase/functions/social-create-comment/index.ts`
- `supabase/functions/social-create-post/index.ts`
- `supabase/functions/social-delete-comment/index.ts`
- `supabase/functions/social-delete-post/index.ts`
- `supabase/functions/social-record-impressions/index.ts`
- `supabase/functions/social-reclassify-post/index.ts`
- `supabase/functions/social-report-content/index.ts`
- `supabase/functions/social-reserve-upload/index.ts`
- `supabase/functions/social-set-comment-like/index.ts`
- `supabase/functions/social-set-reaction/index.ts` (canonical post reaction route)
- `supabase/functions/social-update-comment/index.ts`
- `supabase/functions/_shared/phase2Auth.ts`
- `supabase/functions/_shared/phase2Config.ts`
- `supabase/functions/_shared/phase2Contracts.ts`
- `supabase/functions/_shared/phase2Env.ts`
- `supabase/functions/_shared/phase2Errors.ts`
- `supabase/functions/_shared/phase2Moderation.ts`
- `supabase/functions/_shared/phase2Observability.ts`
- `supabase/functions/_shared/phase2Social.ts`
- `supabase/functions/_shared/phase2Types.ts`
- `supabase/functions/_shared/phase2Utils.ts`
- `supabase/functions/_shared/phase2Webhook.ts`
- `supabase/functions/_shared/revenueCat.ts`
- `supabase/functions/_shared/scanAnalysis.ts`
- `supabase/functions/_shared/scanReservations.ts`

### Schema And Verification Files
- `supabase/migrations/20260406120000_phase2_backend_foundations.sql`
- `supabase/migrations/20260406210000_phase3_social_mvp_and_moderation.sql`
- `supabase/migrations/20260406223000_phase5_phase6_phase7.sql`
- `supabase/migrations/20260407120000_phase1_hardening.sql`
- `supabase/migrations/20260407183000_social_phase2_hardening.sql`
- `supabase/migrations/20260407200000_phase3_profile_identity_sync.sql`
- `supabase/migrations/20260407213000_add_coach_personas.sql`
- `__tests__/app/AndroidThemeResources.test.ts`
- `__tests__/app/FeatureFlagRoutes.test.tsx`
- `__tests__/app/RootLayout.test.tsx`
- `__tests__/app/ShareStoryScreen.test.tsx`
- `__tests__/app/TabLayout.test.tsx`
- `__tests__/constants/routes.test.ts`
- `__tests__/screens/CoachScreen.test.tsx`
- `__tests__/screens/EntryOfferScreen.test.tsx`
- `__tests__/screens/SocialCommentsScreen.test.tsx`
- `__tests__/screens/SocialComposerScreen.test.tsx`
- `__tests__/screens/SocialScreen.test.tsx`
- `__tests__/services/coach.test.ts`
- `__tests__/services/growthExperience.test.ts`
- `__tests__/services/runtimeConfig.test.ts`
- `__tests__/services/social.test.ts`
- `__tests__/supabase/phase2Env.test.ts`

## Current Local Baseline
### Frontend
- The tracked app shell already registers `coach`, `post-signup-onboarding`, `social-compose`, and `social-comments`, and the tab layout already registers `social`.
- The current local entrypoints redirect to or render the local social, coach, and onboarding flows.
- The `AvatarPicker` is part of both settings and post-signup onboarding.

### Scan Flow
- Local client scan eligibility uses Supabase Edge Function `check-and-record-scan`.
- Local client analysis uses Supabase Edge Function `analyze-scan`.
- The legacy direct client webhook service `services/n8nWebhook.ts` is deleted locally and should stay deleted.
- Local storage contract is consistent: client uploads to `${userId}/scans/${scanId}.jpg`, which matches backend `buildCanonicalScanImagePath`.

### Backend And Schema
- Local edge functions depend on phase 2 shared helpers and migrations that are present locally but were previously untracked.
- Local social, coach, growth, and feature-flag behavior assumes the April 2026 migration set exists in the target Supabase project.

## Remaining Runtime Or Deployment Uncertainties
- Local code and tests indicate the intended backend contract, but deployed Supabase Edge Functions may still be older than the local sources.
- Local code expects the April 2026 migrations to exist remotely; production parity for tables, RPCs, views, triggers, and policies still needs environment validation.
- `analyze-scan` depends on server env such as `N8N_SCAN_ANALYZE_WEBHOOK_URL` and optional super-scan webhook configuration; actual deployed values were not validated in this phase.
- Feature-flag data currently comes from `app_config` compatibility behavior backed by newer schema; the deployed database may still differ.

## Verification Snapshot
- `npm run typecheck`
- Focused route, onboarding, avatar, API, runtime-config, phase2-env, social, coach, and entry-offer Jest suites
- Baseline drift fixed in this phase:
  - neutralized local scan-analysis method naming around `analyze-scan`
  - removed stale test expectation for a deleted local super-scan fallback path
