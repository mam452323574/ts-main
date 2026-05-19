#!/usr/bin/env bash
set -u
PROJECT_REF=qpogulljnnacrxdjbwiz
LOG=tmp/deploy_functions.log
SUMMARY=tmp/deploy_summary.tsv
: > "$LOG"
: > "$SUMMARY"
ok=0; ko=0; failures=()
while IFS= read -r slug; do
  [ -z "$slug" ] && continue
  echo "==> deploying $slug" | tee -a "$LOG"
  start=$(date +%s)
  if npx supabase functions deploy "$slug" --project-ref "$PROJECT_REF" --use-api >>"$LOG" 2>&1; then
    end=$(date +%s); dur=$((end-start))
    printf '%s\tOK\t%ss\n' "$slug" "$dur" | tee -a "$SUMMARY"
    ok=$((ok+1))
  else
    end=$(date +%s); dur=$((end-start))
    printf '%s\tFAIL\t%ss\n' "$slug" "$dur" | tee -a "$SUMMARY"
    failures+=("$slug")
    ko=$((ko+1))
  fi
done < tmp/active_slugs.txt
echo "--- DONE ok=$ok ko=$ko ---" | tee -a "$LOG"
if [ $ko -gt 0 ]; then
  printf 'FAILED: %s\n' "${failures[@]}" | tee -a "$LOG"
  exit 2
fi
