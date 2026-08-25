# Build 20 App Review Notes

## App Store Connect Review Notes

Use these notes for build 20 after creating the two review accounts. Add the real review-account credentials directly in App Store Connect from the secure password manager or current session; do not commit them in this repo.

```text
SelfLens has fixed the build 19 review issues.

Sign in:
- Sign in with Apple uses the native iOS/iPadOS flow.
- Google and email login are also available.

Review accounts:
- Premium active account: provide credentials in the App Store Connect Review Notes field only.
- Expired subscription account: provide credentials in the App Store Connect Review Notes field only.

Expired subscription account behavior:
- account_tier = free
- subscription_status = expired
- subscription_expiry_date is in the past
- The account can view the paywall, restore purchases, purchase flow, free quotas, and upgrade screen.

Privacy and face data:
- The in-app and web privacy policies now include a dedicated "Face data" section.
- Face data is used only for health analysis, scan history, trends, and coach guidance.
- SelfLens does not use face data for biometric identification, facial authentication, advertising, or AI model training.
- Scan uploads are stored in Supabase, processed through the analysis infrastructure, retained until scan/account deletion, and orphan uploads are purged after 24 hours.

Account deletion:
- Account deletion is available in-app from Settings > Danger zone > Delete account.
- The flow uses two confirmations, deletes scans/images/avatar/profile/associated data/auth account, and signs the user out.

Tracking:
- Tracking is set to No in App Store Connect.
- The app does not request App Tracking Transparency permission.
- Rewarded ads use AppLovin MAX. No ATT prompt is requested, and AppLovin's terms/privacy policy flow is configured with the SelfLens privacy URL.
```

## Expired Review Account Setup

Create or identify the App Review expired-subscription account, then run this with service role privileges:

```sql
update public.user_profiles
set
  account_tier = 'free',
  subscription_status = 'expired',
  subscription_expiry_date = '2026-06-01T00:00:00Z',
  subscription_platform = 'app_store'
where email = '<expired-review-email>';
```

Verify:

```sql
select
  id,
  email,
  account_tier,
  subscription_status,
  subscription_expiry_date,
  subscription_platform
from public.user_profiles
where email = '<expired-review-email>';
```

## Exact Privacy Policy Citations

English:

> Face data includes the face photos you choose to submit, plus the scan results, scores, and metrics derived from those photos.

> SelfLens does not use this data to identify a person, create biometric identification, authenticate a user with facial recognition, serve advertising, or train AI models.

French:

> Les donnees de visage comprennent les photos de visage que vous choisissez de soumettre, ainsi que les resultats, scores et indicateurs derives du scan.

> SelfLens n'utilise pas ces donnees pour identifier une personne, creer une identification biometrique, authentifier un utilisateur par reconnaissance faciale, faire de la publicite ou entrainer des modeles d intelligence artificielle.

## Physical QA Checklist

- Fresh install on iPad, then Apple login.
- Google login.
- Email login.
- Chef camera pre-permission button says "Next", then iOS system camera prompt appears.
- Scanner pre-permission button says "Next", then iOS system camera prompt appears.
- Permanently denied camera state opens Settings instead of re-prompting directly.
- Delete account from Settings and confirm the account can no longer log in.
- Expired account shows paywall, restore purchases, purchase flow, free quotas, and upgrade screen.
- No ATT popup appears.
- App Store Connect privacy answer is Tracking: No.
