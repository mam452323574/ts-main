# Supabase Backend Parity Checklist

This checklist makes the currently active backend surface explicit for this repo.

The canonical deployable Edge Function surface now lives in `supabase/functions/active-edge-functions.json`.

## HealthScan 2026-04-28 Parity Hotfix

The current production bug set depends on these backend checks:

- `coach-quota-status` must be deployed; the Coach screen calls this exact slug for quota reads.
- `check-and-record-scan` must run the `reserve_scan_quota(..., p_check_only := true)` contract that returns `next_recharge_at` and `server_now_ms` so Scanner cards can render 24h recharge timers.
- `app_feature_flags` scope `mobile` must have `social_comments_enabled = true` when free authenticated users are allowed to open/read/write comments.
- Pending migrations should be applied in order, especially `20260428170000_scan_quota_recharge_metadata.sql`, `20260428180000_add_coach_usage_quota.sql`, and `20260428160000_enable_social_comments.sql`.

## Active Edge Functions

These functions are verified from the current client code and active backend flows, and are expected to be deployed together for parity.

| Function | Flow | Verified from repo | Deployment expectation |
| --- | --- | --- | --- |
| `check-and-record-scan` | Scan eligibility and reservation | `services/api.ts` | Required |
| `cancel-scan-reservation` | Scan reservation rollback after upload failure | `services/api.ts` | Required |
| `analyze-scan` | Scan analysis | `services/api.ts` | Required |
| `coach-quota-status` | Coach quota status | `services/coach.ts`, `hooks/queries/useCoachQuota.ts` | Required when Coach is accessible |
| `coach-generate-response` | Coach generation | `services/coach.ts` | Required when `coach_enabled` is on |
| `social-reserve-upload` | Social media upload reservation | `services/social.ts` | Required when `social_enabled` is on |
| `social-create-post` | Social post creation | `services/social.ts` | Required when `social_enabled` is on |
| `social-delete-post` | Social post deletion | `services/social.ts` | Required when the viewer can delete their own social posts |
| `social-create-comment` | Social comment creation | `services/social.ts` | Required when `social_enabled` and `social_comments_enabled` are on |
| `social-update-comment` | Social comment editing | `services/social.ts` | Required when the viewer can edit their own social comments |
| `social-delete-comment` | Social comment deletion | `services/social.ts` | Required when the viewer can delete their own social comments |
| `social-set-reaction` | Canonical social post reactions | `services/social.ts` | Required when `social_enabled` is on |
| `social-set-comment-like` | Canonical social comment likes | `services/social.ts` | Required when `social_enabled` and `social_comments_enabled` are on |
| `social-record-impressions` | Social impression tracking | `services/social.ts`, `screens/SocialScreen.tsx` | Required when `social_enabled` is on |
| `social-report-content` | Social reporting | `services/social.ts` | Required when `social_enabled` is on |
| `social-list-moderation-queue` | Admin moderation queue listing | `services/socialAdmin.ts` | Required for the admin moderation UI when `social_enabled` is on |
| `social-moderate-content` | Admin moderation decisions | `services/socialAdmin.ts` | Required for the admin moderation UI when `social_enabled` is on |
| `social-reclassify-post` | Admin post reclassification | `services/socialAdmin.ts` | Required for the admin moderation UI when category changes are enabled |
| `social-process-moderation-queue` | Async moderation worker and admin-triggered queue processing | `supabase/functions/social-process-moderation-queue`, shared moderation helpers | Required when the moderation worker path is enabled |
| `sync-subscription-status` | Subscription entitlement sync | `contexts/AuthContext.tsx` | Required when RevenueCat-backed subscription sync is in use |
| `revenuecat-webhook` | Subscription webhook ingestion | `supabase/functions/revenuecat-webhook`, shared RevenueCat sync helpers | Required when RevenueCat webhook sync is in use |
| `check-ip-signup` | Signup IP eligibility and recording | `contexts/AuthContext.tsx` | Required |
| `send-verification-email` | Email verification send | `contexts/AuthContext.tsx` | Required |
| `verify-email-code` | Email verification check | `contexts/AuthContext.tsx` | Required |
| `cleanup-orphan-user` | Signup cleanup for unverified orphan users | `contexts/AuthContext.tsx` | Required |

Post reactions are standardized on `social-set-reaction`; the legacy `social-toggle-like` route has been removed from this repo.

The legacy direct purchase helper, push/schedule helpers, and destructive user-deletion function were removed during the security hardening pass.

## Admin Moderation Parity Findings

- The mobile admin surface already calls `social-list-moderation-queue` and `social-moderate-content` through `services/socialAdmin.ts`.
- Repo-side migrations already define the moderation schema used by the admin flow: `social_moderation_queue`, `social_reports`, `social_moderation_events`, and `claim_social_moderation_batch`.
- A runtime `404` on the admin moderation screen indicates missing remote Edge Function deployment parity, not a frontend naming mismatch.
- `PHASE2_SOCIAL_MODERATION_WORKER_TOKEN` is optional for the admin screen and only required when a non-admin automation calls `social-process-moderation-queue` directly.

## Feature Flags and Config Parity

Server-side feature gating is read from `app_feature_flags`.

Client-side feature gating first reads `app_feature_flags` and falls back to the `get_phase2_feature_flags` RPC / `app_config` compatibility view.

Both must exist and remain in sync because:

- edge functions use `app_feature_flags`
- the mobile app can read `app_feature_flags` directly
- the fallback RPC/view remains necessary for older deployments and schema cache recovery

Verified feature/config fields used by the active app/backend flows:

- `social_enabled`
- `social_comments_enabled`
- `coach_enabled`
- `moderation_enabled`
- `entry_offer_enabled`
- `entry_offer_offering_id`
- `rollout_percentage`
- `post_rate_limit_per_day`
- `comment_rate_limit_per_hour`
- `report_rate_limit_per_day`
- `repeated_rejection_threshold`
- `rejected_content_cooldown_hours`
- `coach_cache_ttl_minutes`

## Required Supabase Resources

### Scan flow

Required for the current scan eligibility, upload, analysis, and history flows:

- Table: `user_profiles`
- Table: `scans`
- Table: `scan_metrics`
- Storage bucket: `scan-images`
- View: `user_current_global_score`
- RPC: `get_premium_potential_data`

### Social flow

Required for the current social feed, posting, commenting, reacting, impression, and reporting flows:

- Table: `app_feature_flags`
- View: `app_config`
- Table: `social_posts`
- Table: `social_comments`
- Table: `social_reports`
- Table: `social_moderation_events`
- Table: `social_post_likes`
- Table: `social_comment_likes`
- Table: `social_upload_reservations`
- Storage bucket: `social-posts`
- View: `social_moderation_queue`
- RPC: `get_social_feed_page`
- RPC: `get_social_comments_for_post`
- RPC: `check_social_rate_limit`
- RPC: `get_social_rejection_cooldown`
- RPC: `claim_social_moderation_batch`
- RPC: `record_social_impressions`
- RPC: `set_social_post_reaction`
- RPC: `set_social_comment_like`

### Coach flow

Required for the current coach generation and fallback/cache flow:

- Table: `coach_entries`
- Column: `user_profiles.coach_persona_key`
- Table: `scans`
- RPC: `compute_coach_cache_key`

Coach-specific runtime requirements:

- Edge function: `coach-generate-response`
- Feature flag: `app_feature_flags.scope='mobile'` with `coach_enabled=true`
- Secret: `N8N_COACH_GENERATE_WEBHOOK_URL`
- Set or update `N8N_COACH_GENERATE_WEBHOOK_URL` as a Supabase Edge Function secret before smoke-testing Coach. Secret-only changes are available immediately; redeploy `coach-generate-response` only when the function code itself changes.
- `WEBHOOK_ALLOWED_HOSTS` must include the n8n host used by `N8N_COACH_GENERATE_WEBHOOK_URL`, or the Edge Function will reject the webhook URL.
- `n8n/workflows/coach.json` is an import template: after import, manually rebind the 6 `DeepSeek *` nodes to a real DeepSeek credential before enabling the workflow.

### Subscription and entitlement flow

Required for the current RevenueCat-backed sync surface:

- Table: `user_profiles`
- Columns: `user_profiles.subscription_status`, `user_profiles.subscription_expiry_date`, `user_profiles.subscription_platform`
- Table: `revenuecat_webhook_events`

### Auth and verification flow

Required for the current signup and verification flow:

- Table: `user_profiles`
- Column: `user_profiles.email_verified`
- Table: `verification_codes`
- Supabase Auth MFA TOTP enrollment/challenge
- RPC: `get_auth_gate_profile`
- RPC: `check_ip_signup_allowed`
- RPC: `record_ip_signup`
- RPC: `invalidate_previous_codes`

## Verified Environment Variables and Secrets

Only variables referenced by the current codebase are listed here.

### Required server-side secrets

Always required for the active server surface:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for scan analysis:

- `N8N_SCAN_ANALYZE_WEBHOOK_URL`

Required for RevenueCat-backed subscription sync:

- `REVENUECAT_API_KEY`
- `REVENUECAT_WEBHOOK_AUTHORIZATION`

Required for email verification:

- `RESEND_API_KEY`
- `EMAIL_VERIFICATION_CODE_PEPPER`

Required for fridge-scan callbacks:

- `PHASE2_WEBHOOK_AUTH_MODE=hmac`
- `PHASE2_WEBHOOK_HMAC_SECRET`

### Required only when feature-gated flows are enabled

Required when `coach_enabled=true`:

- `N8N_COACH_GENERATE_WEBHOOK_URL`

Required when `social_enabled=true` and `moderation_enabled=true` for post creation:

- `N8N_SOCIAL_CREATE_POST_WEBHOOK_URL`

Required when `social_enabled=true`, `social_comments_enabled=true`, and `moderation_enabled=true` for comment creation:

- `N8N_SOCIAL_CREATE_COMMENT_WEBHOOK_URL`

### Optional but verified server-side variables

- `PHASE2_SOCIAL_MODERATION_WORKER_TOKEN` - Optional for admin-triggered moderation, required when a non-admin automated worker calls `social-process-moderation-queue`
- `N8N_SOCIAL_REPORT_WEBHOOK_URL`
- `N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL`
- `REVENUECAT_API_BASE_URL`
- `REVENUECAT_PREMIUM_ENTITLEMENT_ID`
- `REVENUECAT_WEBHOOK_SECRET`
- `ALLOWED_ORIGINS`

### Verified public app runtime env

Required for the mobile app to boot and reach Supabase:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional public runtime config used by active code:

- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- `EXPO_PUBLIC_APTABASE_APP_KEY`
- `EXPO_PUBLIC_APTABASE_HOST`

## Deploy Commands

Run these from the repository root.

### Current social backend recovery

The currently linked project is `qpogulljnnacrxdjbwiz`.

This project currently requires backend parity recovery before frontend social flows can be trusted, because the remote project was confirmed to be missing:

- migration `20260414153000_social_pending_author_interactions`
- migration `20260416120000_social_comment_likes`
- Edge Function `social-set-comment-like`
- Edge Function `social-update-comment`
- Edge Function `social-delete-post`
- Edge Function `social-delete-comment`
- Edge Function `social-reclassify-post`
- table `public.social_comment_likes`
- column `public.social_comments.like_count`
- RPC `public.set_social_comment_like(uuid, uuid, boolean)`
- the updated `public.get_social_comments_for_post(uuid)` contract with `like_count` and `viewer_has_liked`

Run the recovery steps in this exact order.

#### 1. Verify the linked migration state

```powershell
npx.cmd supabase migration list --linked
```

Expected for the current drift:

- `20260414153000` present locally and missing remotely
- `20260416120000` present locally and missing remotely

#### 2. Apply the missing migrations

```powershell
npx.cmd supabase db push --linked
```

These migrations restore:

- pending-author interactions on `set_social_post_reaction`
- `social_comments.like_count`
- table `social_comment_likes`
- RPC `set_social_comment_like`
- the updated `get_social_comments_for_post` contract with `like_count` and `viewer_has_liked`

#### 3. Deploy the verified active edge-function surface

```powershell
.\deploy_functions.ps1 -ProjectRef qpogulljnnacrxdjbwiz
```

#### 4. Verify the deployed runtime

```powershell
npx.cmd supabase functions list --project-ref qpogulljnnacrxdjbwiz
```

The output must include:

- `social-reserve-upload`
- `social-create-post`
- `social-delete-post`
- `social-create-comment`
- `social-update-comment`
- `social-delete-comment`
- `social-set-reaction`
- `social-set-comment-like`
- `social-record-impressions`
- `social-report-content`
- `social-list-moderation-queue`
- `social-moderate-content`
- `social-reclassify-post`
- `social-process-moderation-queue`

#### 5. Verify the repaired SQL surface

```powershell
npx.cmd supabase db query "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'social_comments' order by ordinal_position;" --linked --output table
npx.cmd supabase db query "select to_regclass('public.social_comment_likes') as social_comment_likes, to_regprocedure('public.set_social_comment_like(uuid,uuid,boolean)') as set_social_comment_like, to_regprocedure('public.get_social_comments_for_post(uuid)') as get_social_comments_for_post, to_regprocedure('public.set_social_post_reaction(uuid,uuid,text)') as set_social_post_reaction;" --linked --output table
npx.cmd supabase db query "select proname, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('get_social_comments_for_post','set_social_post_reaction') order by proname;" --linked --output json
```

The checks must confirm:

- `social_comments.like_count` exists, is `integer`, `NOT NULL`, and defaults to `0`
- `public.social_comment_likes` exists
- `public.set_social_comment_like(uuid, uuid, boolean)` exists
- `public.get_social_comments_for_post(uuid)` returns `like_count` and `viewer_has_liked`
- `public.set_social_post_reaction(uuid, uuid, text)` contains the pending-author interaction rule

#### 6. Smoke-test the social flows

- like on an approved post
- dislike on an approved post
- neutral after like or dislike
- like on your own pending post
- open comments without an infinite spinner
- like and unlike a comment when the UI exposes it

### 1. Link the target Supabase project

```powershell
npx.cmd supabase link --project-ref <your-project-ref>
```

### 2. Apply migrations

```powershell
npx.cmd supabase db push --linked
```

### 3. Set core secrets

```powershell
npx.cmd supabase secrets set `
  SUPABASE_URL="https://<your-project-ref>.supabase.co" `
  SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>" `
  N8N_SCAN_ANALYZE_WEBHOOK_URL="https://<your-n8n>/webhook/scan-analyze"
```

### 4. Set social and coach secrets

Only set the secrets for the flows you are enabling.

```powershell
npx.cmd supabase secrets set `
  N8N_COACH_GENERATE_WEBHOOK_URL="https://<your-n8n>/webhook/coach" `
  N8N_SOCIAL_CREATE_POST_WEBHOOK_URL="https://<your-n8n>/webhook/social-create-post" `
  N8N_SOCIAL_CREATE_COMMENT_WEBHOOK_URL="https://<your-n8n>/webhook/social-create-comment" `
  N8N_SOCIAL_REPORT_WEBHOOK_URL="https://<your-n8n>/webhook/social-report" `
  N8N_SCAN_ANALYZE_SUPER_WEBHOOK_URL="https://<your-n8n>/webhook/scan-analyze-super" `
  ALLOWED_ORIGINS="https://<your-web-domain>,http://localhost:8081,http://localhost:19006"
```

Coach reminder:

- If `coach_enabled=true`, `coach-generate-response` will return `coach_webhook_not_configured` until `N8N_COACH_GENERATE_WEBHOOK_URL` is set.
- After setting that secret, you can smoke-test immediately. Redeploy `coach-generate-response` only if you changed the function code.

### 4b. Optionally set the moderation worker bearer token

Only set this when a non-admin automated caller will invoke `social-process-moderation-queue` directly. The admin moderation screen does not require `PHASE2_SOCIAL_MODERATION_WORKER_TOKEN`.

```powershell
npx.cmd supabase secrets set `
  PHASE2_SOCIAL_MODERATION_WORKER_TOKEN="<strong-random-token>"
```

### 5. Set subscription and email secrets

Only set the RevenueCat webhook authorization secret if you are validating webhook authorization headers.

```powershell
npx.cmd supabase secrets set `
  REVENUECAT_API_KEY="<your-revenuecat-api-key>" `
  REVENUECAT_API_BASE_URL="https://api.revenuecat.com" `
  REVENUECAT_PREMIUM_ENTITLEMENT_ID="premium" `
  REVENUECAT_WEBHOOK_AUTHORIZATION="Bearer <your-webhook-token>" `
  REVENUECAT_WEBHOOK_SECRET="<your-webhook-secret>" `
  RESEND_API_KEY="<your-resend-api-key>"
```

### 6. Deploy the verified active edge functions

`deploy_functions.ps1` is the canonical deploy script for the verified active edge-function surface.

The canonical function list is stored in `supabase/functions/active-edge-functions.json`, and `deploy_functions.ps1` reads that manifest directly before deploying.

It currently deploys:

- `check-and-record-scan`
- `cancel-scan-reservation`
- `analyze-scan`
- `coach-generate-response`
- `social-reserve-upload`
- `social-create-post`
- `social-delete-post`
- `social-create-comment`
- `social-update-comment`
- `social-delete-comment`
- `social-set-reaction`
- `social-set-comment-like`
- `social-record-impressions`
- `social-report-content`
- `social-list-moderation-queue`
- `social-moderate-content`
- `social-reclassify-post`
- `social-process-moderation-queue`
- `sync-subscription-status`
- `revenuecat-webhook`
- `check-ip-signup`
- `send-verification-email`
- `verify-email-code`
- `cleanup-orphan-user`

Run it with the linked project ref from `supabase/.temp/project-ref`, or override the target explicitly:

```powershell
.\deploy_functions.ps1
.\deploy_functions.ps1 -ProjectRef <your-project-ref>
.\deploy_functions.ps1 -ProjectRef qpogulljnnacrxdjbwiz
```

The script also performs a post-deploy `npx.cmd supabase functions list --project-ref ...` verification and fails if any expected slug is still missing on the remote runtime.

### 7. Post-deploy verification

List the deployed remote slugs and verify the active social surface is present:

```powershell
npx.cmd supabase functions list --project-ref <your-project-ref>
```

The output should include:

- `social-reserve-upload`
- `social-create-post`
- `social-delete-post`
- `social-create-comment`
- `social-update-comment`
- `social-delete-comment`
- `social-set-reaction`
- `social-set-comment-like`
- `social-record-impressions`
- `social-report-content`
- `social-list-moderation-queue`
- `social-moderate-content`
- `social-reclassify-post`
- `social-process-moderation-queue`

Run the SQL checks for the social schema immediately after deployment:

```powershell
npx.cmd supabase db query "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'social_comments' order by ordinal_position;" --linked --output table
npx.cmd supabase db query "select to_regclass('public.social_comment_likes') as social_comment_likes, to_regprocedure('public.set_social_comment_like(uuid,uuid,boolean)') as set_social_comment_like, to_regprocedure('public.get_social_comments_for_post(uuid)') as get_social_comments_for_post, to_regprocedure('public.set_social_post_reaction(uuid,uuid,text)') as set_social_post_reaction;" --linked --output table
npx.cmd supabase db query "select proname, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('get_social_comments_for_post','set_social_post_reaction') order by proname;" --linked --output json
```

If comments still spin forever and the client surfaces `social_comments_schema_mismatch`, treat that as a backend parity failure first. Do not add a frontend fallback to mask the missing RPC fields.

## Manual Post-Deploy Smoke Checks

### Scan smoke checks

- Sign in and trigger scan eligibility from the app; confirm `check-and-record-scan` returns an allowed response for an eligible user.
- Complete a scan upload and analysis; confirm `analyze-scan` finishes and the related `scans` row contains `analysis_result` and `analyzed_at`.
- Confirm scan history still reads from `scan_metrics`, `user_current_global_score`, and `get_premium_potential_data`.

### Coach smoke checks

- Set `coach_enabled=true` in `app_feature_flags`.
- Open the coach flow and request guidance.
- Confirm `coach-generate-response` succeeds and a `coach_entries` row is created or refreshed.

### Social smoke checks

- Set `social_enabled=true` in `app_feature_flags`.
- Create a post with and without an uploaded asset; confirm `social-create-post` works and uploaded media lands in `social-posts`.
- Delete your own post; confirm `social-delete-post` succeeds and the post disappears from the feed.
- If comments are enabled, set `social_comments_enabled=true` and create a comment; confirm `social-create-comment` succeeds.
- Edit your own comment; confirm `social-update-comment` succeeds and the returned server snapshot is the source of truth.
- Delete your own comment; confirm `social-delete-comment` succeeds and the comment disappears from the thread.
- React to a post with `like`, then `dislike`, then `neutral`; confirm `social-set-reaction` succeeds for all three transitions.
- React to your own pending post; confirm the pending-author interaction contract now succeeds.
- Open a comment thread and confirm the screen no longer hangs behind a spinner because `get_social_comments_for_post` now returns `like_count` and `viewer_has_liked`.
- If comment likes are exposed in the UI, like and unlike a comment; confirm `social-set-comment-like` succeeds and the server response is the source of truth.
- Scroll the feed; confirm `social-record-impressions` succeeds.
- Report a post or comment; confirm `social-report-content` creates a `social_reports` row.
- Confirm the feed and comments still read through `get_social_feed_page` and `get_social_comments_for_post`.

### Admin moderation smoke checks

- Sign in with an admin account and open the admin moderation screen; confirm `social-list-moderation-queue` loads instead of returning `404`.
- Approve, reject, hide, or restore a reported post/comment; confirm `social-moderate-content` updates the target row, linked `social_reports`, and creates a `social_moderation_events` row.
- Change a post category from the admin moderation UI; confirm `social-reclassify-post` succeeds and the returned category snapshot matches the server response.
- Optionally call `social-process-moderation-queue` as an admin dry run or with `PHASE2_SOCIAL_MODERATION_WORKER_TOKEN`; confirm the queue path reads `social_moderation_queue` and claims rows through `claim_social_moderation_batch`.

### Auth smoke checks

- Attempt signup from a fresh network and confirm `check-ip-signup` does not block the request unexpectedly.
- Send a verification email and confirm `send-verification-email` succeeds.
- Verify a code and confirm `verify-email-code` marks `user_profiles.email_verified=true`.
- Create and then abandon a signup before verification, then confirm `cleanup-orphan-user` can clean up the orphan account path.

### Subscription smoke checks

- Sign in with a user that has a RevenueCat subscriber record and confirm `sync-subscription-status` updates `user_profiles.subscription_status`, `subscription_expiry_date`, and `subscription_platform`.
- If RevenueCat webhooks are enabled, send a RevenueCat test event and confirm `revenuecat-webhook` creates or updates `revenuecat_webhook_events`.

## Parity Verification Warning

Repo presence does not guarantee remote deployment.

Repo migrations do not guarantee the target Supabase project already has the matching tables, buckets, views, RPCs, triggers, or policies.

After every deploy, verify the linked remote Supabase project for:

- deployed edge functions
- migrated schema objects
- storage buckets and policies
- feature flag rows in `app_feature_flags`
- `app_config` compatibility view parity
- required secrets on the target project
