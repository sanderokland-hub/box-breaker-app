# Update the VPS only: SSH in, git pull, npm install, restart.
# Use this after you've already pushed from GitHub Desktop (or any other way).
# Requires: deploy-config.ps1 (copy from deploy-config.ps1.example).

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$configPath = Join-Path $projectRoot "deploy-config.ps1"

if (-not (Test-Path $configPath)) {
    Write-Host "Missing deploy-config.ps1. Copy deploy-config.ps1.example to deploy-config.ps1 and set your VPS user, host, and path." -ForegroundColor Red
    exit 1
}
. $configPath
if (-not $DeployUser -or -not $DeployHost -or -not $DeployPath) {
    Write-Host "Set DeployUser, DeployHost, and DeployPath in deploy-config.ps1." -ForegroundColor Red
    exit 1
}

$restartCmd = if ($DeployRestartCommand) { $DeployRestartCommand } else { "pm2 restart boxbreakerpro" }
$remoteCmd = "cd $DeployPath && git pull origin main && cd server && npm install --production && $restartCmd"
Write-Host "Updating VPS at ${DeployUser}@${DeployHost}..." -ForegroundColor Cyan
ssh "${DeployUser}@${DeployHost}" $remoteCmd
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. App: https://app.cardgems.com" -ForegroundColor Green
} else {
    Write-Host "SSH or remote command failed." -ForegroundColor Red
    exit 1
}
