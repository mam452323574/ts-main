#!/usr/bin/env sh
SECRET="cf9ec7310bbd7b164649b3e3ba178759b033eab75ec3be661f8d77f75ff56cf0"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
PAYLOAD="{\"_smoke_test\":\"check_signing_test\"}"
SIG_HEX="$(printf '%s.%s' "$TIMESTAMP" "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)"
SIG="sha256=${SIG_HEX}"

echo "TIMESTAMP: $TIMESTAMP"
echo "SIG: $SIG"

echo "=== Calling analyse_1 ==="
curl -i -X POST "https://n8n.basedjew.com/webhook/analyse_1" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$PAYLOAD"

echo "=== Calling coach-conversation ==="
curl -i -X POST "https://n8n.basedjew.com/webhook/coach-conversation" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$PAYLOAD"

echo "=== Calling frigo ==="
curl -i -X POST "https://n8n.basedjew.com/webhook/frigo" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$PAYLOAD"
