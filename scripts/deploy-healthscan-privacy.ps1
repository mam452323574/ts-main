[CmdletBinding()]
param(
    [string]$Server = "root@82.165.218.187",
    [string]$RemoteRoot = "/var/www/healthscan.cloud/html",
    [string]$LocalFile = (Join-Path $PSScriptRoot "..\\website\\privacy-policy\\index.html")
)

$resolvedLocalFile = (Resolve-Path $LocalFile).Path
$remoteDir = "$RemoteRoot/privacy-policy"
$remoteFile = "$remoteDir/index.html"

Write-Host "Deploying $resolvedLocalFile to $Server`:$remoteFile"

ssh $Server "mkdir -p '$remoteDir'"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create remote directory $remoteDir"
}

scp $resolvedLocalFile "${Server}:$remoteFile"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy privacy policy to $remoteFile"
}

ssh $Server "ls -l '$remoteFile'"
if ($LASTEXITCODE -ne 0) {
    throw "Copied file but could not verify remote file"
}

Write-Host ""
Write-Host "Deployment complete."
Write-Host "Verify these URLs next:"
Write-Host "  https://healthscan.cloud/privacy-policy"
Write-Host "  https://www.healthscan.cloud/privacy-policy"
