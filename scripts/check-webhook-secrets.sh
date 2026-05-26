#!/usr/bin/env sh
# check-webhook-secrets.sh — Pre-flight validator for PHASE2_WEBHOOK_AUTH_MODE.
#
# Confirms that the Supabase Edge Function secrets required by a target
# PHASE2_WEBHOOK_AUTH_MODE are already set BEFORE flipping the mode. If any
# required secret is missing, exits non-zero so the caller (runbook, CI) can
# abort the activation. Without this check, flipping the mode causes every
# Edge Function calling getPhase2WebhookAuthConfig() to fail with HTTP 500
# `invalid_webhook_auth_configuration` on the next cold start.
#
# Usage: scripts/check-webhook-secrets.sh <target-mode> <project-ref>
#   <target-mode>  none | bearer | header | hmac
#                  | bearer+header | bearer+hmac | header+hmac
#                  | bearer+header+hmac
#   <project-ref>  Supabase project ref (e.g. qpogulljnnacrxdjbwiz)
#
# Exit codes:
#   0  all required secrets are present
#   1  one or more required secrets missing
#   2  invalid arguments or supabase CLI failure
#
# The accepted modes mirror parsePhase2WebhookAuthMethods() in
# supabase/functions/_shared/phase2Env.ts. Keep them in sync.

set -eu

usage() {
  printf 'Usage: %s <target-mode> <project-ref>\n' "$0" >&2
  printf '  target-mode: none | bearer | header | hmac | bearer+header | bearer+hmac | header+hmac | bearer+header+hmac\n' >&2
  exit 2
}

if [ $# -ne 2 ]; then
  usage
fi

TARGET_MODE="$1"
PROJECT_REF="$2"

case "$TARGET_MODE" in
  none|bearer|header|hmac|bearer+header|bearer+hmac|header+hmac|bearer+header+hmac)
    ;;
  *)
    printf "ERROR: invalid mode '%s'. Allowed:\n" "$TARGET_MODE" >&2
    printf '  none | bearer | header | hmac | bearer+header | bearer+hmac | header+hmac | bearer+header+hmac\n' >&2
    exit 2
    ;;
esac

if [ "$TARGET_MODE" = "none" ]; then
  printf "OK: mode 'none' requires no auth secrets.\n"
  exit 0
fi

REQUIRED=""
case "$TARGET_MODE" in
  *bearer*) REQUIRED="$REQUIRED PHASE2_WEBHOOK_BEARER_TOKEN" ;;
esac
case "$TARGET_MODE" in
  *header*) REQUIRED="$REQUIRED PHASE2_WEBHOOK_SECRET_HEADER_NAME PHASE2_WEBHOOK_SECRET_HEADER_VALUE" ;;
esac
case "$TARGET_MODE" in
  *hmac*) REQUIRED="$REQUIRED PHASE2_WEBHOOK_HMAC_SECRET" ;;
esac

if ! command -v supabase >/dev/null 2>&1; then
  printf "ERROR: 'supabase' CLI not found in PATH.\n" >&2
  exit 2
fi

if ! SECRETS_LIST="$(supabase secrets list --project-ref "$PROJECT_REF" 2>&1)"; then
  printf "ERROR: 'supabase secrets list --project-ref %s' failed:\n" "$PROJECT_REF" >&2
  printf '%s\n' "$SECRETS_LIST" >&2
  exit 2
fi

MISSING=""
for secret in $REQUIRED; do
  # Word-anchored match so PHASE2_WEBHOOK_BEARER_TOKEN_OLD does not satisfy
  # PHASE2_WEBHOOK_BEARER_TOKEN.
  if ! printf '%s\n' "$SECRETS_LIST" | grep -Eq "(^|[[:space:]|])${secret}([[:space:]|]|\$)"; then
    MISSING="$MISSING $secret"
  fi
done

if [ -n "$MISSING" ]; then
  printf "ERROR: target mode '%s' requires secrets that are NOT set in project '%s':\n" \
    "$TARGET_MODE" "$PROJECT_REF" >&2
  for s in $MISSING; do
    printf '  - %s\n' "$s" >&2
  done
  printf '\n' >&2
  printf 'Set the missing secrets BEFORE running `supabase secrets set PHASE2_WEBHOOK_AUTH_MODE=%s`,\n' "$TARGET_MODE" >&2
  printf "otherwise every Edge Function calling getPhase2WebhookAuthConfig() will 500 with\n" >&2
  printf "'invalid_webhook_auth_configuration' on the next cold start.\n" >&2
  exit 1
fi

# S-01 — Inbound response signing: informational check.
# phase2Webhook.ts resolves the verification secret as:
#   N8N_RESPONSE_HMAC_SECRET ?? PHASE2_WEBHOOK_HMAC_SECRET
# So a dedicated inbound secret is optional, but using the same key for outbound
# and inbound couples key rotation. Warn (non-blocking) if the dedicated secret
# is absent.
case "$TARGET_MODE" in
  *hmac*)
    if ! printf '%s\n' "$SECRETS_LIST" | grep -Eq "(^|[[:space:]|])N8N_RESPONSE_HMAC_SECRET([[:space:]|]|\$)"; then
      printf "WARNING: N8N_RESPONSE_HMAC_SECRET is not set in project '%s'.\n" "$PROJECT_REF" >&2
      printf "         Edge Function will fall back to PHASE2_WEBHOOK_HMAC_SECRET for\n" >&2
      printf "         inbound response verification (same key for outbound + inbound).\n" >&2
      printf "         OK to flip, but couples key rotation. See n8n/WEBHOOK_RESPONSE_SIGNING.md.\n" >&2
    fi
    ;;
esac

printf "OK: all secrets required for mode '%s' are set in project '%s'.\n" "$TARGET_MODE" "$PROJECT_REF"

# S-01 — n8n-side check is NOT covered by this script.
case "$TARGET_MODE" in
  *hmac*)
    printf '\n'
    printf 'NOTE: this script verifies SUPABASE secrets only. n8n-side configuration\n'
    printf '      (response signing Function node + matching secret) is NOT checked\n'
    printf '      and MUST be verified separately:\n'
    printf '         sh scripts/check-n8n-response-signing.sh\n'
    printf '      A flip to a mode containing hmac without n8n response signing causes\n'
    printf '      HTTP 502 webhook_response_unsigned on every webhook call.\n'
    printf '      See n8n/WEBHOOK_RESPONSE_SIGNING.md and n8n/RESPONSE_SIGNING_REGISTRY.md.\n'
    ;;
esac

exit 0
