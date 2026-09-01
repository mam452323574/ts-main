#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <jpeg-reference-path>" >&2
  exit 2
fi

reference_image=$1
runtime_env=${SELFLENS_FUNCTIONS_ENV_FILE:-/root/supabase/docker/selflens-functions.env}
core_env=${SELFLENS_CORE_ENV_FILE:-/root/supabase/docker/.env}
base_url=${SELFLENS_SUPABASE_URL:-https://supabase.basedjew.com}

if [[ ! -f "$reference_image" ]]; then
  echo "reference image not found" >&2
  exit 2
fi
if [[ ! -f "$runtime_env" ]]; then
  echo "functions environment file not found" >&2
  exit 2
fi

read_env_value() {
  local key=$1
  local file=$2
  local value
  value=$(sed -n "s/^${key}=//p" "$file" | tail -n 1)
  value=${value#\"}
  value=${value%\"}
  value=${value#\'}
  value=${value%\'}
  printf '%s' "$value"
}

SUPABASE_ANON_KEY=$(read_env_value SUPABASE_ANON_KEY "$runtime_env")
SUPABASE_SERVICE_ROLE_KEY=$(read_env_value SUPABASE_SERVICE_ROLE_KEY "$runtime_env")
if [[ -z "$SUPABASE_ANON_KEY" && -f "$core_env" ]]; then
  SUPABASE_ANON_KEY=$(read_env_value ANON_KEY "$core_env")
fi
if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" && -f "$core_env" ]]; then
  SUPABASE_SERVICE_ROLE_KEY=$(read_env_value SERVICE_ROLE_KEY "$core_env")
fi

: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

smoke_dir=$(mktemp -d /tmp/selflens-scan-fallback-smoke.XXXXXX)
smoke_suffix=$(date -u +%Y%m%d%H%M%S)-$$
email="scan-smoke-${smoke_suffix}@example.com"
password="SelfLensSmoke9-${smoke_suffix}!"
user_id=''
access_token=''
scan_id=''

cleanup() {
  set +e
  if [[ -n "$scan_id" && -n "$access_token" ]]; then
    curl -sS --max-time 20 \
      -X POST "$base_url/functions/v1/delete-scan" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "authorization: Bearer $access_token" \
      -H 'content-type: application/json' \
      --data "{\"scan_id\":\"$scan_id\"}" \
      -o /dev/null
  fi
  if [[ -n "$user_id" ]]; then
    curl -sS --max-time 20 \
      -X DELETE "$base_url/rest/v1/user_profiles?id=eq.$user_id" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -o /dev/null
    curl -sS --max-time 20 \
      -X DELETE "$base_url/auth/v1/admin/users/$user_id" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -o /dev/null
  fi
  if [[ "$smoke_dir" == /tmp/selflens-scan-fallback-smoke.* ]]; then
    rm -rf -- "$smoke_dir"
  fi
}
trap cleanup EXIT

signup_status=$(curl -sS --max-time 30 \
  -o "$smoke_dir/signup.json" \
  -w '%{http_code}' \
  -X POST "$base_url/functions/v1/secure-signup" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')")
if [[ "$signup_status" != 201 ]]; then
  echo "signup_status=$signup_status code=$(jq -r '.code // "unknown"' "$smoke_dir/signup.json")" >&2
  exit 1
fi
user_id=$(jq -r '.user_id // empty' "$smoke_dir/signup.json")
if [[ -z "$user_id" ]]; then
  echo "secure-signup returned no user id" >&2
  exit 1
fi

login_status=$(curl -sS --max-time 30 \
  -o "$smoke_dir/login.json" \
  -w '%{http_code}' \
  -X POST "$base_url/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')")
if [[ "$login_status" != 200 ]]; then
  echo "login_status=$login_status code=$(jq -r '.error_code // .code // "unknown"' "$smoke_dir/login.json")" >&2
  exit 1
fi
access_token=$(jq -r '.access_token // empty' "$smoke_dir/login.json")
if [[ -z "$access_token" ]]; then
  echo "login returned no access token" >&2
  exit 1
fi

profile_status=$(curl -sS --max-time 30 \
  -o "$smoke_dir/profile.json" \
  -w '%{http_code}' \
  -X POST "$base_url/rest/v1/user_profiles" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'content-type: application/json' \
  -H 'prefer: return=minimal' \
  --data "$(jq -nc --arg id "$user_id" --arg email "$email" '{id:$id,email:$email,email_verified:true,language_code:"fr"}')")
if [[ "$profile_status" != 201 ]]; then
  echo "profile_status=$profile_status code=$(jq -r '.code // "unknown"' "$smoke_dir/profile.json")" >&2
  exit 1
fi

reserve_status=$(curl -sS --max-time 30 \
  -o "$smoke_dir/reserve.json" \
  -w '%{http_code}' \
  -X POST "$base_url/functions/v1/check-and-record-scan" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $access_token" \
  -H 'content-type: application/json' \
  --data '{"scan_type":"health"}')
if [[ "$reserve_status" != 200 ]]; then
  echo "reserve_status=$reserve_status code=$(jq -r '.code // "unknown"' "$smoke_dir/reserve.json")" >&2
  exit 1
fi
scan_id=$(jq -r '.scan_id // empty' "$smoke_dir/reserve.json")
if [[ -z "$scan_id" ]]; then
  echo "scan reservation returned no scan id" >&2
  exit 1
fi

object_path="$user_id/scans/$scan_id.jpg"
upload_status=$(curl -sS --max-time 30 \
  -o "$smoke_dir/upload.json" \
  -w '%{http_code}' \
  -X POST "$base_url/storage/v1/object/scan-images/$object_path" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $access_token" \
  -H 'content-type: image/jpeg' \
  -H 'x-upsert: false' \
  --data-binary "@$reference_image")
if [[ "$upload_status" != 200 ]]; then
  echo "upload_status=$upload_status code=$(jq -r '.error // .code // "unknown"' "$smoke_dir/upload.json")" >&2
  exit 1
fi

analysis_started=$(date +%s%3N)
analysis_status=$(curl -sS --max-time 125 \
  -o "$smoke_dir/analyze.json" \
  -w '%{http_code}' \
  -X POST "$base_url/functions/v1/analyze-scan" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $access_token" \
  -H 'content-type: application/json' \
  --data "{\"scan_id\":\"$scan_id\",\"scan_type\":\"health\",\"language\":\"fr\"}")
analysis_duration_ms=$(( $(date +%s%3N) - analysis_started ))
analysis_success=$(jq -r '.success == true' "$smoke_dir/analyze.json" 2>/dev/null || echo false)
analysis_scan_type=$(jq -r '.scan.analysis_result.scan_type // "none"' "$smoke_dir/analyze.json" 2>/dev/null || echo none)

echo "scan_id=$scan_id"
echo "analysis_status=$analysis_status"
echo "analysis_success=$analysis_success"
echo "analysis_scan_type=$analysis_scan_type"
echo "analysis_duration_ms=$analysis_duration_ms"

if [[ "$analysis_status" != 200 || "$analysis_success" != true || "$analysis_scan_type" != face ]]; then
  echo "analysis_code=$(jq -r '.code // "unknown"' "$smoke_dir/analyze.json" 2>/dev/null || echo unknown)" >&2
  exit 1
fi
