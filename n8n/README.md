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

## Coach conversation workflow

`n8n/workflows/coach-conversation.json` powers the multi-turn Coach chat
feature. It is independent from `coach.json` — both workflows can run side by
side without interfering, and the existing presets keep working untouched.

Before enabling the Coach chat feature in the app:

1. Import `n8n/workflows/coach-conversation.json` into n8n.
2. Reuse the same DeepSeek credential as `coach.json` (or create a dedicated
   one if you want to track usage separately).
3. Rebind these 6 DeepSeek nodes to that credential:
   - `DeepSeek Conversation Gentle`
   - `DeepSeek Conversation Strict`
   - `DeepSeek Conversation Motivational`
   - `DeepSeek Conversation Calm`
   - `DeepSeek Conversation Analytical`
   - `DeepSeek Conversation Playful`
4. Keep the inbound webhook contract on `POST /webhook/coach-conversation`.
5. On Supabase, set `N8N_COACH_CONVERSATION_WEBHOOK_URL` to your public n8n
   Coach conversation webhook URL.
6. Optionally set `N8N_COACH_CONVERSATION_FALLBACK_WEBHOOK_URL` if you maintain
   a standby instance.
7. Make sure the n8n host is included in `WEBHOOK_ALLOWED_HOSTS` and that
   `PHASE2_WEBHOOK_AUTH_MODE` includes `hmac` in production (the conversation
   tunnel must verify HMAC just like the presets tunnel).
8. Activate the feature flag `coach_chat_enabled` in `app_feature_flags` for
   the rollout scope (`mobile`) when ready.

### Webhook contract

The Edge Function `coach-send-message` POSTs a JSON body shaped like:

```jsonc
{
  "conversation_id": "<uuid>",
  "user_id": "<uuid>",
  "persona_key": "gentle_supportive",
  "locale": "fr",
  "output_contract_version": 1,
  "persona": {
    "key": "gentle_supportive",
    "requires_premium": false,
    "tone_instructions": "...",
    "style_guide": { "opening": "...", "cadence": "...", "avoid": [], "emphasize": [] }
  },
  "messages": [
    { "role": "system",    "content": "Welcome message" },
    { "role": "user",      "content": "First question..." },
    { "role": "assistant", "content": "Previous reply..." },
    { "role": "user",      "content": "Latest question — fed to the LLM" }
  ],
  "user_context": {
    "inferred_persona": { /* small json */ },
    "recent_scan_digest": [ /* up to 3 small digests */ ]
  }
}
```

The workflow returns a single JSON object:

```jsonc
{
  "success": true,
  "content": "Plain-text reply (no Markdown headers, no JSON).",
  "role": "assistant",
  "model": "deepseek-v4-flash",
  "provider": "n8n",
  "persona_key": "gentle_supportive",
  "conversation_id": "<uuid>",
  "generated_at": "<ISO8601>"
}
```

### Streaming

n8n returns the full assistant message synchronously. The Edge Function
`coach-send-message` is responsible for relaying the response to the mobile
client as Server-Sent Events (SSE), chunking the text on the server side. This
keeps the n8n workflow simple and avoids requiring n8n streaming support.

### Recommended smoke test

1. POST a JSON body matching the contract above (with a single user message)
   to the `coach-conversation` webhook in n8n.
2. Confirm a DeepSeek node runs without a credential error.
3. Call `coach-send-message` from Supabase and confirm the corresponding
   `coach_conversation_messages` row transitions from `pending`/`streaming`
   to `ready`.
