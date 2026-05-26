#!/usr/bin/env sh
# list-webhook-callers.sh — Garde pre-commit / CI pour le response signing n8n.
#
# Lists every Edge Function source file that calls postWebhookJson and verifies
# each is referenced in n8n/RESPONSE_SIGNING_REGISTRY.md. Fails (exit 1) if a
# caller exists in code but has no registry entry — that means a webhook flow
# would silently break the next time PHASE2_WEBHOOK_AUTH_MODE is flipped to a
# mode containing hmac (cf. incident 2026-05-19 webhook_response_unsigned).
#
# Usage:
#   sh scripts/list-webhook-callers.sh
#
# Exit codes:
#   0  all callers are documented in the registry
#   1  at least one caller is missing a registry entry
#   2  configuration error (functions dir / registry file missing)

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/supabase/functions"
REGISTRY="$REPO_ROOT/n8n/RESPONSE_SIGNING_REGISTRY.md"

if [ ! -d "$FUNCTIONS_DIR" ]; then
  printf "ERROR: %s not found.\n" "$FUNCTIONS_DIR" >&2
  exit 2
fi
if [ ! -f "$REGISTRY" ]; then
  printf "ERROR: %s not found.\n" "$REGISTRY" >&2
  exit 2
fi

# Find non-test .ts files calling postWebhookJson(. Exclude the file that
# DEFINES postWebhookJson (_shared/phase2Webhook.ts) — it's not a caller.
CALLERS_FILE="$(mktemp)"
DEFINER="$FUNCTIONS_DIR/_shared/phase2Webhook.ts"
find "$FUNCTIONS_DIR" -type f -name '*.ts' ! -name '*.test.ts' -print 2>/dev/null \
  | while IFS= read -r FILE; do
      [ "$FILE" = "$DEFINER" ] && continue
      if grep -Fq 'postWebhookJson(' "$FILE"; then
        printf '%s\n' "$FILE"
      fi
    done | sort -u > "$CALLERS_FILE"

CALLER_COUNT="$(wc -l < "$CALLERS_FILE" | tr -d ' ')"
if [ "$CALLER_COUNT" -eq 0 ]; then
  printf "OK: no postWebhookJson callers found (sanity-check FUNCTIONS_DIR=%s).\n" "$FUNCTIONS_DIR"
  rm -f "$CALLERS_FILE"
  exit 0
fi

MISSING_FILE="$(mktemp)"
: > "$MISSING_FILE"

while IFS= read -r FILE; do
  # Convert absolute path -> relative path under functions/ (e.g. "_shared/foo.ts").
  REL="${FILE#$FUNCTIONS_DIR/}"
  # The registry references files via either bare name ("foo.ts") or path
  # ("subdir/foo.ts"). Substring match on REL covers both, and is robust to
  # the markdown link / mention format.
  if ! grep -Fq "$REL" "$REGISTRY"; then
    printf '%s\n' "$REL" >> "$MISSING_FILE"
  fi
done < "$CALLERS_FILE"

MISSING_COUNT="$(wc -l < "$MISSING_FILE" | tr -d ' ')"

if [ "$MISSING_COUNT" -gt 0 ]; then
  printf "ERROR: %d postWebhookJson caller(s) NOT listed in %s:\n" \
    "$MISSING_COUNT" "$REGISTRY" >&2
  while IFS= read -r line; do
    printf '  - supabase/functions/%s\n' "$line" >&2
  done < "$MISSING_FILE"
  printf '\n' >&2
  printf "Each caller MUST have a row in the registry before merging.\n" >&2
  printf "See n8n/RESPONSE_SIGNING_REGISTRY.md §'Comment ajouter un nouveau caller'.\n" >&2
  rm -f "$CALLERS_FILE" "$MISSING_FILE"
  exit 1
fi

printf "OK: %d postWebhookJson caller(s) all documented in RESPONSE_SIGNING_REGISTRY.md.\n" \
  "$CALLER_COUNT"
rm -f "$CALLERS_FILE" "$MISSING_FILE"
exit 0
