[CmdletBinding()]
param(
  [string]$ProjectRef
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Deploy the verified active Supabase Edge Function surface for this repo.
#
# This script intentionally keeps --use-api so bundling does not depend on
# local Docker state. Per-function JWT verification is versioned in
# supabase/config.toml and must be honored by deploys.

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRefPath = Join-Path $scriptRoot 'supabase\.temp\project-ref'
$activeFunctionsManifestPath = Join-Path $scriptRoot 'supabase\functions\active-edge-functions.json'
$functionsRootPath = Join-Path $scriptRoot 'supabase\functions'

function Resolve-ProjectRef {
  param(
    [string]$ExplicitProjectRef,
    [string]$LinkedProjectRefPath
  )

  if ($ExplicitProjectRef -and $ExplicitProjectRef.Trim().Length -gt 0) {
    return $ExplicitProjectRef.Trim()
  }

  if (Test-Path -LiteralPath $LinkedProjectRefPath) {
    $linkedProjectRef = (Get-Content -LiteralPath $LinkedProjectRefPath -ErrorAction Stop |
      Select-Object -First 1).Trim()

    if ($linkedProjectRef.Length -gt 0) {
      return $linkedProjectRef
    }
  }

  throw 'Unable to resolve the Supabase project ref. Pass -ProjectRef <ref> or ensure supabase/.temp/project-ref exists.'
}

function Invoke-SupabaseFunctionsList {
  param(
    [string]$ResolvedProjectRef
  )

  $listOutput = & npx.cmd supabase functions list --project-ref $ResolvedProjectRef 2>$null

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to list deployed functions on project $ResolvedProjectRef"
  }

  return $listOutput
}

function Get-ActiveFunctionSlugs {
  param(
    [string]$ManifestPath
  )

  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Active Edge Functions manifest not found at $ManifestPath"
  }

  try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -ErrorAction Stop |
      ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Failed to parse active Edge Functions manifest at $ManifestPath"
  }

  if (-not $manifest -or -not $manifest.functions) {
    throw "Active Edge Functions manifest at $ManifestPath must expose a top-level `"functions`" array"
  }

  $functionSlugs = @(
    $manifest.functions |
      ForEach-Object {
        if ($_ -is [string]) {
          $_.Trim()
        } else {
          ''
        }
      } |
      Where-Object { $_.Length -gt 0 }
  )

  if ($functionSlugs.Count -eq 0) {
    throw "Active Edge Functions manifest at $ManifestPath did not contain any function slugs"
  }

  $duplicateSlugs = @(
    $functionSlugs |
      Group-Object |
      Where-Object { $_.Count -gt 1 } |
      Select-Object -ExpandProperty Name
  )

  if ($duplicateSlugs.Count -gt 0) {
    $duplicateLabel = $duplicateSlugs -join ', '
    throw "Active Edge Functions manifest at $ManifestPath contains duplicate slugs: $duplicateLabel"
  }

  return $functionSlugs
}

function Assert-LocalFunctionSlugsExist {
  param(
    [string[]]$FunctionSlugs,
    [string]$FunctionsRootPath
  )

  $missingLocalFunctionPaths = @()

  foreach ($functionSlug in $FunctionSlugs) {
    $localFunctionPath = Join-Path $FunctionsRootPath $functionSlug

    if (-not (Test-Path -LiteralPath $localFunctionPath)) {
      $missingLocalFunctionPaths += $functionSlug
    }
  }

  if ($missingLocalFunctionPaths.Count -gt 0) {
    $missingLabel = $missingLocalFunctionPaths -join ', '
    throw "Active Edge Functions manifest references local functions that do not exist: $missingLabel"
  }
}

function Get-NormalizedFileContent {
  param(
    [string]$LiteralPath
  )

  return (
    (Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop) `
      -replace "`r`n", "`n" `
      -replace "`r", "`n"
  )
}

function Assert-DownloadedFileMatchesLocal {
  param(
    [string]$LocalPath,
    [string]$DownloadedPath,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $DownloadedPath)) {
    throw "Downloaded verification file missing for ${Label}: $DownloadedPath"
  }

  $localContent = Get-NormalizedFileContent -LiteralPath $LocalPath
  $downloadedContent = Get-NormalizedFileContent -LiteralPath $DownloadedPath

  if ($localContent -ne $downloadedContent) {
    throw "Remote bundle drift detected for $Label"
  }
}

function Assert-DownloadedFileContainsNamedExports {
  param(
    [string]$DownloadedPath,
    [string[]]$ExpectedExports,
    [string]$Label
  )

  $downloadedContent = Get-NormalizedFileContent -LiteralPath $DownloadedPath
  $exportedNames = @(
    [regex]::Matches(
      $downloadedContent,
      'export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)'
    ) |
      ForEach-Object { $_.Groups[1].Value } |
      Where-Object { $_.Length -gt 0 } |
      Sort-Object -Unique
  )

  $missingExports = @(
    $ExpectedExports |
      Where-Object { $exportedNames -notcontains $_ }
  )

  if ($missingExports.Count -gt 0) {
    $missingLabel = $missingExports -join ', '
    throw "Downloaded bundle for $Label is missing expected exports: $missingLabel"
  }
}

function Get-FunctionBundleVerificationRule {
  param(
    [string]$FunctionName
  )

  switch ($FunctionName) {
    'coach-generate-response' {
      return [PSCustomObject]@{
        AdditionalFunctionFileChecks = @(
          'handler.ts'
        )
        SharedFileChecks = @(
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Contracts.ts'
            RequiredSharedExports = @(
              'parseCoachGenerateRequest'
            )
          }
        )
      }
    }
    'social-update-comment' {
      return [PSCustomObject]@{
        SharedFileChecks = @(
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Social.ts'
            RequiredSharedExports = @(
              'assertEditableSocialComment',
              'assertNoRecentDuplicateCommentExcluding',
              'getSocialCommentSnapshotForUser',
              'getSocialRejectionCooldown'
            )
          }
        )
      }
    }
    'social-delete-comment' {
      return [PSCustomObject]@{
        SharedFileChecks = @(
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Social.ts'
            RequiredSharedExports = @(
              'assertDeletableSocialComment'
            )
          }
        )
      }
    }
    'social-record-impressions' {
      return [PSCustomObject]@{
        SharedFileChecks = @(
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Auth.ts'
            RequiredSharedExports = @(
              'createServiceRoleClient',
              'ensureUserProfileExistsForAuthenticatedUser',
              'requireAuthenticatedUser'
            )
          },
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Contracts.ts'
            RequiredSharedExports = @(
              'parseSocialRecordImpressionsRequest'
            )
          }
        )
      }
    }
    'social-record-post-views' {
      return [PSCustomObject]@{
        SharedFileChecks = @(
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Auth.ts'
            RequiredSharedExports = @(
              'createServiceRoleClient',
              'ensureUserProfileExistsForAuthenticatedUser',
              'requireAuthenticatedUser'
            )
          },
          [PSCustomObject]@{
            SharedFileRelativePath = 'supabase\functions\_shared\phase2Contracts.ts'
            RequiredSharedExports = @(
              'parseSocialRecordPostViewsRequest'
            )
          }
        )
      }
    }
    default {
      return $null
    }
  }
}

function Remove-VerificationDirectorySafely {
  param(
    [string]$VerificationRoot
  )

  if (-not $VerificationRoot -or -not (Test-Path -LiteralPath $VerificationRoot)) {
    return
  }

  $resolvedVerificationRoot = [System.IO.Path]::GetFullPath($VerificationRoot)
  $resolvedTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())

  if (
    $resolvedVerificationRoot.StartsWith(
      $resolvedTempRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    Remove-Item -LiteralPath $resolvedVerificationRoot -Recurse -Force
  }
}

function Invoke-FunctionBundleVerification {
  param(
    [string]$ResolvedProjectRef,
    [string]$FunctionName,
    [string]$ScriptRoot
  )

  $rule = Get-FunctionBundleVerificationRule -FunctionName $FunctionName
  if ($null -eq $rule) {
    return
  }

  $additionalFunctionFileChecks = @()
  if ($rule.PSObject.Properties.Name -contains 'AdditionalFunctionFileChecks') {
    $additionalFunctionFileChecks = @($rule.AdditionalFunctionFileChecks)
  }

  $sharedFileChecks = @()
  if ($rule.PSObject.Properties.Name -contains 'SharedFileChecks') {
    $sharedFileChecks = @($rule.SharedFileChecks)
  }

  $verificationRoot = Join-Path (
    [System.IO.Path]::GetTempPath()
  ) ("supabase-edge-verify-{0}-{1}" -f $FunctionName, [guid]::NewGuid().ToString('N'))

  New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null

  try {
    Write-Host "   verifying remote bundle for $FunctionName"
    & npx.cmd supabase functions download $FunctionName --project-ref $ResolvedProjectRef --use-api --workdir $verificationRoot

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to download function bundle for verification: $FunctionName"
    }

    $localFunctionPath = Join-Path $ScriptRoot "supabase\functions\$FunctionName\index.ts"
    $downloadedFunctionPath = Join-Path $verificationRoot "supabase\functions\$FunctionName\index.ts"

    Assert-DownloadedFileMatchesLocal `
      -LocalPath $localFunctionPath `
      -DownloadedPath $downloadedFunctionPath `
      -Label "$FunctionName index.ts"

    foreach ($additionalFunctionFilePath in $additionalFunctionFileChecks) {
      $localAdditionalFunctionPath = Join-Path $ScriptRoot "supabase\functions\$FunctionName\$additionalFunctionFilePath"
      $downloadedAdditionalFunctionPath = Join-Path $verificationRoot "supabase\functions\$FunctionName\$additionalFunctionFilePath"

      Assert-DownloadedFileMatchesLocal `
        -LocalPath $localAdditionalFunctionPath `
        -DownloadedPath $downloadedAdditionalFunctionPath `
        -Label "$FunctionName $additionalFunctionFilePath"
    }

    foreach ($sharedFileCheck in $sharedFileChecks) {
      $localSharedPath = Join-Path $ScriptRoot $sharedFileCheck.SharedFileRelativePath
      $downloadedSharedPath = Join-Path $verificationRoot $sharedFileCheck.SharedFileRelativePath
      $sharedBundleLabel = "$FunctionName shared bundle: $($sharedFileCheck.SharedFileRelativePath)"

      Assert-DownloadedFileMatchesLocal `
        -LocalPath $localSharedPath `
        -DownloadedPath $downloadedSharedPath `
        -Label $sharedBundleLabel

      $requiredSharedExports = @($sharedFileCheck.RequiredSharedExports)
      if ($requiredSharedExports.Count -gt 0) {
        Assert-DownloadedFileContainsNamedExports `
          -DownloadedPath $downloadedSharedPath `
          -ExpectedExports $requiredSharedExports `
          -Label $sharedBundleLabel
      }
    }
  } finally {
    Remove-VerificationDirectorySafely -VerificationRoot $verificationRoot
  }
}

function Get-DeployedFunctionSlugsFromListOutput {
  param(
    [string[]]$ListOutput
  )

  $slugs = @()

  foreach ($line in $ListOutput) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $columns = $line -split '\|'
    if ($columns.Length -lt 3) {
      continue
    }

    $slug = $columns[2].Trim()
    if ([string]::IsNullOrWhiteSpace($slug) -or $slug -eq 'SLUG') {
      continue
    }

    if ($slugs -notcontains $slug) {
      $slugs += $slug
    }
  }

  return $slugs
}

$resolvedProjectRef = Resolve-ProjectRef -ExplicitProjectRef $ProjectRef -LinkedProjectRefPath $projectRefPath
$functions = @(Get-ActiveFunctionSlugs -ManifestPath $activeFunctionsManifestPath)
Assert-LocalFunctionSlugsExist -FunctionSlugs $functions -FunctionsRootPath $functionsRootPath

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  throw 'npx not found in PATH. Install Node.js first.'
}

Push-Location $scriptRoot
try {
  Write-Host "Deploying the verified active Supabase Edge Function surface on project $resolvedProjectRef..."
  Write-Host "Using manifest: $activeFunctionsManifestPath"

  foreach ($functionName in $functions) {
    Write-Host "-> $functionName"
    & npx.cmd supabase functions deploy $functionName --project-ref $resolvedProjectRef --use-api

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to deploy function: $functionName"
    }

    Invoke-FunctionBundleVerification `
      -ResolvedProjectRef $resolvedProjectRef `
      -FunctionName $functionName `
      -ScriptRoot $scriptRoot
  }

  Write-Host "Verifying deployed function slugs on project $resolvedProjectRef..."
  $listOutput = Invoke-SupabaseFunctionsList -ResolvedProjectRef $resolvedProjectRef
  $deployedSlugs = @(Get-DeployedFunctionSlugsFromListOutput -ListOutput $listOutput)
  $missingFunctions = @($functions | Where-Object { $deployedSlugs -notcontains $_ })

  if ($missingFunctions.Count -gt 0) {
    Write-Host 'Supabase functions list output:'
    foreach ($line in $listOutput) {
      Write-Host $line
    }

    $missingFunctionsLabel = $missingFunctions -join ', '
    throw "Post-deploy verification failed on project $resolvedProjectRef. Missing slugs: $missingFunctionsLabel"
  }

  Write-Host 'Verified deployed slugs:'
  foreach ($functionName in $functions) {
    Write-Host "  - $functionName"
  }

  Write-Host 'Done.'
  Write-Host "Deployed the verified active Supabase Edge Function surface on project $resolvedProjectRef"
} finally {
  Pop-Location
}
