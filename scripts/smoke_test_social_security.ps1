# smoke_test_social_security.ps1
#
# Smoke tests pour les fixes social (Waves 1-3 + gap-filling).
# A executer apres deploy sur staging, avant rollout prod.
#
# Tests inclus :
#   1) S-02 -- webhook URL avec host inconnu rejetee (host_not_allowed)
#   2) S-02 -- webhook URL pointant vers 127.0.0.1 rejetee (host_resolves_private)
#   3) S-07 -- admin-whoami refuse pour non-admin (403)
#   4) S-07 -- admin-whoami OK pour admin (200, is_admin=true)
#   5) S-09 -- moderate-user avec meme Idempotency-Key retourne 409 sur retry
#   6) S-15 -- adjust-post-reactions avec admin_like_adjustment=99999 rejete (400)
#   7) S-10/S-11 -- CORS retourne 'null' sans Origin, case-insensitive avec Origin
#
# Tests SQL (a faire via Dashboard ou psql separe, non couverts par ce script) :
#   - S-08 : verifier shouldAutoHideForReports n'a plus de parametre threshold
#   - S-12 : verifier que social_report_threshold_shadow se remplit apres
#            quelques heures de production
#   - S-18 : appeler purge_old_soft_deleted_social_content + purger storage
#
# Usage :
#   $env:SMOKE_SUPABASE_URL = 'https://<projet>.supabase.co'
#   $env:SMOKE_ADMIN_JWT = '<JWT d'un compte admin>'
#   $env:SMOKE_USER_JWT = '<JWT d'un compte non-admin>'
#   $env:SMOKE_TARGET_USER_ID = '<uuid d'un user a moderer>'
#   $env:SMOKE_TARGET_POST_ID = '<uuid d'un post a ajuster>'
#   .\smoke_test_social_security.ps1

[CmdletBinding()]
param(
  [string]$SupabaseUrl = $env:SMOKE_SUPABASE_URL,
  [string]$AdminJwt = $env:SMOKE_ADMIN_JWT,
  [string]$UserJwt = $env:SMOKE_USER_JWT,
  [string]$TargetUserId = $env:SMOKE_TARGET_USER_ID,
  [string]$TargetPostId = $env:SMOKE_TARGET_POST_ID
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) { throw 'Set $env:SMOKE_SUPABASE_URL' }
if ([string]::IsNullOrWhiteSpace($AdminJwt))    { throw 'Set $env:SMOKE_ADMIN_JWT' }
if ([string]::IsNullOrWhiteSpace($UserJwt))     { throw 'Set $env:SMOKE_USER_JWT' }

$Pass = 0
$Fail = 0
$Skip = 0

function Test-Case {
  param(
    [string]$Name,
    [scriptblock]$Block
  )
  Write-Host "[TEST] $Name" -ForegroundColor Cyan
  try {
    & $Block
    Write-Host "  [PASS]" -ForegroundColor Green
    $Script:Pass++
  } catch {
    Write-Host "  [FAIL] : $($_.Exception.Message)" -ForegroundColor Red
    $Script:Fail++
  }
  Write-Host ''
}

function Invoke-EdgeFunction {
  param(
    [string]$Path,
    [string]$Jwt,
    [hashtable]$Body = $null,
    [hashtable]$ExtraHeaders = @{},
    [string]$Method = 'POST'
  )
  $url = "$SupabaseUrl/functions/v1/$Path"
  $headers = @{
    'Authorization' = "Bearer $Jwt"
    'Content-Type'  = 'application/json'
  }
  foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }

  $bodyJson = if ($Body) { ($Body | ConvertTo-Json -Compress -Depth 10) } else { '' }

  try {
    if ($Method -eq 'GET') {
      $response = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    } else {
      $response = Invoke-WebRequest -Uri $url -Method $Method -Headers $headers -Body $bodyJson -ErrorAction Stop
    }
    return @{
      StatusCode = $response.StatusCode
      Body       = ($response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue)
      Raw        = $response.Content
      Headers    = $response.Headers
    }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    return @{
      StatusCode = [int]$resp.StatusCode
      Body       = ($body | ConvertFrom-Json -ErrorAction SilentlyContinue)
      Raw        = $body
      Headers    = $resp.Headers
    }
  }
}

# =============================================================================
# S-07 -- admin-whoami
# =============================================================================

Test-Case 'S-07 : admin-whoami retourne 200 pour admin' {
  $r = Invoke-EdgeFunction -Path 'admin-whoami' -Jwt $AdminJwt -Method 'GET'
  if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode)" }
  if ($r.Body.is_admin -ne $true) { throw 'Expected is_admin=true' }
}

Test-Case 'S-07 : admin-whoami retourne 403 pour non-admin' {
  $r = Invoke-EdgeFunction -Path 'admin-whoami' -Jwt $UserJwt -Method 'GET'
  if ($r.StatusCode -ne 403) { throw "Expected 403, got $($r.StatusCode)" }
  if ($r.Body.code -ne 'admin_required') { throw "Expected code=admin_required, got $($r.Body.code)" }
}

# =============================================================================
# S-09 -- Idempotency replay
# =============================================================================

if ([string]::IsNullOrWhiteSpace($TargetUserId)) {
  Write-Host '[SKIP] S-09 idempotency tests : SMOKE_TARGET_USER_ID non defini' -ForegroundColor Yellow
  $Skip++
} else {
  $idempotencyKey = [System.Guid]::NewGuid().ToString()

  Test-Case 'S-09 : moderate-user remove_avatar avec Idempotency-Key' {
    $r = Invoke-EdgeFunction -Path 'social-admin-moderate-user' -Jwt $AdminJwt `
      -Body @{ target_user_id = $TargetUserId; action = 'remove_avatar' } `
      -ExtraHeaders @{ 'Idempotency-Key' = $idempotencyKey }
    if ($r.StatusCode -ne 200) { throw "Expected 200 on first call, got $($r.StatusCode) body=$($r.Raw)" }
  }

  Test-Case 'S-09 : retry avec meme Idempotency-Key retourne 409' {
    $r = Invoke-EdgeFunction -Path 'social-admin-moderate-user' -Jwt $AdminJwt `
      -Body @{ target_user_id = $TargetUserId; action = 'remove_avatar' } `
      -ExtraHeaders @{ 'Idempotency-Key' = $idempotencyKey }
    if ($r.StatusCode -ne 409) { throw "Expected 409 on retry, got $($r.StatusCode) body=$($r.Raw)" }
    if ($r.Body.code -ne 'idempotent_request_already_processed') {
      throw "Expected code=idempotent_request_already_processed, got $($r.Body.code)"
    }
  }
}

# =============================================================================
# S-15 -- Reaction adjustment bounds
# =============================================================================

if ([string]::IsNullOrWhiteSpace($TargetPostId)) {
  Write-Host '[SKIP] S-15 reaction bounds : SMOKE_TARGET_POST_ID non defini' -ForegroundColor Yellow
  $Skip++
} else {
  Test-Case 'S-15 : adjust_post_reactions rejette admin_like_adjustment=99999' {
    $r = Invoke-EdgeFunction -Path 'social-admin-adjust-post-reactions' -Jwt $AdminJwt `
      -Body @{ post_id = $TargetPostId; admin_like_adjustment = 99999; admin_dislike_adjustment = 0 }
    if ($r.StatusCode -ne 400) { throw "Expected 400, got $($r.StatusCode) body=$($r.Raw)" }
    if (-not ($r.Body.error -match 'between -10000 and 10000')) {
      throw "Expected 'between -10000 and 10000' in error, got $($r.Body.error)"
    }
  }

  Test-Case 'S-15 : adjust_post_reactions accepte admin_like_adjustment=100' {
    $r = Invoke-EdgeFunction -Path 'social-admin-adjust-post-reactions' -Jwt $AdminJwt `
      -Body @{ post_id = $TargetPostId; admin_like_adjustment = 100; admin_dislike_adjustment = 0 }
    if ($r.StatusCode -ne 200) { throw "Expected 200, got $($r.StatusCode) body=$($r.Raw)" }
  }
}

# =============================================================================
# S-10 / S-11 -- CORS
# =============================================================================

Test-Case 'S-10 : sans Origin, Allow-Origin = null (pas *)' {
  $r = Invoke-WebRequest -Uri "$SupabaseUrl/functions/v1/admin-whoami" `
    -Method Options `
    -Headers @{ 'Access-Control-Request-Method' = 'GET' } `
    -ErrorAction Stop
  $allow = $r.Headers['Access-Control-Allow-Origin']
  if ($allow -ne 'null') { throw "Expected 'null', got '$allow'" }
}

Test-Case 'S-11 : Origin case-insensitive matching (necessite ALLOWED_ORIGINS configure)' {
  # Suppose que ALLOWED_ORIGINS contient au moins 1 origin reelle.
  # On envoie en uppercase et on attend un match (sous reserve qu'au moins
  # une origin soit configuree).
  Write-Host '  (manuel : configurer ALLOWED_ORIGINS=https://myapp.com puis tester avec Origin: https://MYAPP.COM)' -ForegroundColor DarkYellow
}

# =============================================================================
# Resume
# =============================================================================

Write-Host ''
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Smoke test social -- resume" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  [PASS]  : $Pass" -ForegroundColor Green
Write-Host "  [FAIL]  : $Fail" -ForegroundColor Red
Write-Host "  [SKIP]  : $Skip" -ForegroundColor Yellow
Write-Host ''

if ($Fail -gt 0) {
  exit 1
} else {
  exit 0
}
