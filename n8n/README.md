# n8n Workflow Setup

## Coach workflow

`n8n/workflows/coach.json` is an import template, not a ready-to-run workflow.

Before enabling Coach in the app:

1. Import `n8n/workflows/coach.json` into n8n.
2. Create or pick a real DeepSeek credential in n8n.
3. Rebind these 6 nodes to that credential:
   - `DeepSeek Gentle`
   - `DeepSeek Strict`
   - `DeepSeek Motivational`
   - `DeepSeek Calm`
   - `DeepSeek Analytical`
   - `DeepSeek Playful`
4. Keep the inbound webhook contract on `POST /webhook/coach`.
5. On Supabase, set `N8N_COACH_GENERATE_WEBHOOK_URL` to your public n8n Coach webhook URL.
6. On Supabase, include the n8n domain in `WEBHOOK_ALLOWED_HOSTS` or the Edge Function will reject the webhook URL.

Recommended Supabase runtime checks for Coach:

- `coach_enabled=true`
- `N8N_COACH_GENERATE_WEBHOOK_URL=https://<your-n8n>/webhook/coach`
- `WEBHOOK_ALLOWED_HOSTS=<your-n8n-host>`
- If webhook signing is enabled: `PHASE2_WEBHOOK_AUTH_MODE` and `PHASE2_WEBHOOK_HMAC_SECRET` must match the n8n side

Recommended smoke test:

1. Trigger the `coach` webhook in n8n with a minimal payload that includes `persona_key` and a usable `payload.latest_scan`.
2. Confirm a DeepSeek node runs without a credential error.
3. Call `coach-generate-response` from Supabase and confirm the related `coach_entries` row reaches `ready`.
