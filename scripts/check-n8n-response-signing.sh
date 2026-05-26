#!/usr/bin/env sh
# check-n8n-response-signing.sh — Smoke test for n8n inbound response signing (S-01).
#
# For each n8n webhook URL provided, this script:
#   1. Computes an outbound signature (X-Webhook-Signature) over a smoke payload
#      so the request passes n8n's hmac auth gate.
#   2. POSTs the payload.
#   3. Asserts the response carries the headers Edge Functions require:
#        X-Webhook-Response-Timestamp (ISO 8601 UTC)
#        X-Webhook-Response-Signature (sha256=<64 hex chars>)
#
# Without these, the Edge Function rejects the response with HTTP 502
# webhook_response_unsigned (see supabase/functions/_shared/phase2Webhook.ts:131).
#
# IMPORTANT — n8n-side pre-requisite:
#   Each workflow SHOULD have an IF-node "smoke shortcut" at the top of the
#   workflow that detects payload._smoke_test=='check_signing_<nonce>' and
#   responds immediately with { ok:true, smoke:true } WITHOUT executing the
#   rest of the workflow (avoid DB writes, LLM calls, coach side effects, etc).
#   Without that IF-node, the smoke may trigger real processing. Document the
#   per-workflow cost in n8n/RESPONSE_SIGNING_REGISTRY.md.
#
# Usage:
#   PHASE2_WEBHOOK_HMAC_SECRET=<secret> sh scripts/check-n8n-response-signing.sh URL1 [URL2 ...]
#   PHASE2_WEBHOOK_HMAC_SECRET=<secret> sh scripts/check-n8n-response-signing.sh < urls.txt
#
# Exit codes:
#   0  every URL returned valid X-Webhook-Response-Signature headers
#   1  at least one URL failed signing or was unreachable
#   2  invalid arguments or missing dependencies

set -eu

usage() {
  printf 'Usage: %s URL1 [URL2 ...]   (or pipe URLs via stdin, one per line)\n' "$0" >&2
  printf 'Env:   PHASE2_WEBHOOK_HMAC_SECRET must be set.\n' >&2
  exit 2
}

for cmd in curl openssl xxd date mktemp grep sed tr; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf "ERROR: required command '%s' not found in PATH.\n" "$cmd" >&2
    exit 2
  fi
done

if [ -z "${PHASE2_WEBHOOK_HMAC_SECRET:-}" ]; then
  printf "ERROR: env PHASE2_WEBHOOK_HMAC_SECRET is required.\n" >&2
  exit 2
fi
SECRET="$PHASE2_WEBHOOK_HMAC_SECRET"

# Collect URLs from args, or stdin (one per line, # for comments) if no args.
URLS=""
if [ $# -gt 0 ]; then
  for u in "$@"; do URLS="$URLS $u"; done
else
  if [ -t 0 ]; then usage; fi
  while IFS= read -r line; do
    line="$(printf '%s' "$line" | tr -d '\r')"
    case "$line" in
      ''|\#*) continue ;;
    esac
    URLS="$URLS $line"
  done
fi
if [ -z "${URLS# }" ]; then usage; fi

# Smoke payload (unique per run; nonce prevents replay collisions).
NONCE="$(date +%s)-$$"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
PAYLOAD="{\"_smoke_test\":\"check_signing_${NONCE}\"}"

# Outbound signature so n8n hmac auth accepts the request. Same format as
# buildPhase2WebhookHeaders (sha256=<hex>, signing "<ts>.<rawBody>").
SIG_HEX="$(printf '%s.%s' "$TIMESTAMP" "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)"
SIG="sha256=${SIG_HEX}"

FAILED=0
TOTAL=0
for URL in $URLS; do
  TOTAL=$((TOTAL + 1))
  HEADERS_FILE="$(mktemp)"
  HTTP_STATUS=0

  if HTTP_STATUS="$(curl -sS -D "$HEADERS_FILE" -o /dev/null -w '%{http_code}' \
      -X POST "$URL" \
      -H 'Content-Type: application/json' \
      -H "X-Webhook-Timestamp: $TIMESTAMP" \
      -H "X-Webhook-Signature: $SIG" \
      -d "$PAYLOAD" --max-time 15)"; then
    :
  else
    printf "FAIL: %s — curl error (network / timeout / TLS)\n" "$URL" >&2
    FAILED=$((FAILED + 1))
    rm -f "$HEADERS_FILE"
    continue
  fi

  RESP_TS="$(grep -i '^x-webhook-response-timestamp:' "$HEADERS_FILE" | head -n1 | sed 's/^[^:]*:[[:space:]]*//;s/[[:space:]]*$//' | tr -d '\r')"
  RESP_SIG="$(grep -i '^x-webhook-response-signature:' "$HEADERS_FILE" | head -n1 | sed 's/^[^:]*:[[:space:]]*//;s/[[:space:]]*$//' | tr -d '\r')"
  rm -f "$HEADERS_FILE"

  if [ -z "$RESP_TS" ] || [ -z "$RESP_SIG" ]; then
    TS_STATE="$( [ -n "$RESP_TS" ] && printf 'present' || printf 'missing' )"
    SIG_STATE="$( [ -n "$RESP_SIG" ] && printf 'present' || printf 'missing' )"
    printf "FAIL: %s — http=%s response headers missing (ts=%s sig=%s)\n" \
      "$URL" "$HTTP_STATUS" "$TS_STATE" "$SIG_STATE" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  # Signature must be of the form: sha256=<64 lowercase hex chars>
  SIG_HEX_RECV="${RESP_SIG#sha256=}"
  if [ "$SIG_HEX_RECV" = "$RESP_SIG" ]; then
    printf "FAIL: %s — response signature missing 'sha256=' prefix (got %.20s...)\n" \
      "$URL" "$RESP_SIG" >&2
    FAILED=$((FAILED + 1))
    continue
  fi
  if ! printf '%s' "$SIG_HEX_RECV" | grep -Eq '^[0-9a-fA-F]{64}$'; then
    printf "FAIL: %s — response signature is not a valid sha256 hex (got %.20s...)\n" \
      "$URL" "$SIG_HEX_RECV" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  printf "OK:   %s (http=%s, ts=%s, sig=%.16s...)\n" "$URL" "$HTTP_STATUS" "$RESP_TS" "$RESP_SIG"
done

printf '\n--- Summary: %d/%d URLs signed correctly ---\n' "$((TOTAL - FAILED))" "$TOTAL"

if [ "$FAILED" -gt 0 ]; then
  printf '\n' >&2
  printf 'Each failing URL means the n8n workflow does NOT sign its response.\n' >&2
  printf 'Flipping PHASE2_WEBHOOK_AUTH_MODE to a mode containing hmac WITHOUT\n' >&2
  printf "first fixing these will cause HTTP 502 webhook_response_unsigned on\n" >&2
  printf "every webhook call for these flows. See n8n/WEBHOOK_RESPONSE_SIGNING.md.\n" >&2
  exit 1
fi

exit 0
