# trigger_social_purge.ps1
#
# S-18 — Fallback pour Supabase Free plan (pg_cron indisponible).
#
# Appelle l'Edge Function `purge-soft-deleted-social-assets` qui :
#   1) Invoque la RPC public.purge_old_soft_deleted_social_content(retention_days)
#      qui hard-delete les social_posts/social_comments soft-deletes > retention_days
#   2) Purge les asset_paths retournes du bucket social-posts
#
# A planifier en cron Windows / Task Scheduler quotidien a 03:00 local
# (ou via un scheduler externe : GitHub Actions, Vercel Cron, EasyCron, etc.)
#
# Auth : signature worker HMAC (cf SOCIAL_SECURITY_AUDIT.md S-09 + worker
# signature dans phase2Auth.ts:requireSocialModerationWorkerOrAdmin).

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseProjectRef,

  [Parameter(Mandatory = $false)]
  [int]$RetentionDays = 30,

  [Parameter(Mandatory = $false)]
  [string]$WorkerHmacSecret = $env:PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($WorkerHmacSecret)) {
  throw 'Set $env:PHASE2_SOCIAL_MODERATION_WORKER_HMAC_SECRET or pass -WorkerHmacSecret.'
}

if ($RetentionDays -lt 7 -or $RetentionDays -gt 365) {
  throw "RetentionDays must be in [7, 365] (got $RetentionDays)."
}

$functionUrl = "https://$SupabaseProjectRef.supabase.co/functions/v1/purge-soft-deleted-social-assets"
$rawBody = (@{ retention_days = $RetentionDays } | ConvertTo-Json -Compress)

# Worker signature : sha256 over "<method>.<pathname>.<timestamp>.<nonce>.<rawBody>"
# (cf phase2Auth.ts:buildSocialModerationWorkerSignaturePayload)
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$nonce = [System.Guid]::NewGuid().ToString()
$uri = [System.Uri]::new($functionUrl)
$payload = "POST." + $uri.AbsolutePath + ".$timestamp.$nonce.$rawBody"

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($WorkerHmacSecret)
$sigBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
$signature = 'sha256=' + ([BitConverter]::ToString($sigBytes).Replace('-', '').ToLowerInvariant())

$headers = @{
  'Content-Type'       = 'application/json'
  'x-worker-timestamp' = $timestamp
  'x-worker-nonce'     = $nonce
  'x-worker-signature' = $signature
}

Write-Output "[trigger_social_purge] Calling $functionUrl with retention_days=$RetentionDays"

try {
  $response = Invoke-RestMethod -Uri $functionUrl -Method Post -Headers $headers -Body $rawBody -ErrorAction Stop
  Write-Output "[trigger_social_purge] OK : posts=$($response.purged_post_count) comments=$($response.purged_comment_count) assets_deleted=$($response.asset_paths_deleted) assets_failed=$($response.asset_paths_failed)"
  exit 0
} catch {
  Write-Error "[trigger_social_purge] FAILED : $($_.Exception.Message)"
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Error "[trigger_social_purge] Response body: $body"
  }
  exit 1
}
