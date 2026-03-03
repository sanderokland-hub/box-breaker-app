# Deploy Box Breaker Hub: commit, push to GitHub, then SSH to VPS and pull + restart.
# Requires: deploy-config.ps1 with your VPS details (copy from deploy-config.ps1.example).
#
# Usage:
#   .\deploy.ps1                    # commit "Deploy updates" and push + update VPS
#   .\deploy.ps1 "Your message"      # custom commit message

param(
    [string]$Message = "Deploy updates"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

Set-Location $projectRoot

# Load VPS config
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

# 1. Git: stage, commit, push
$status = git status --porcelain
if ($status) {
    Write-Host "Staging and committing..." -ForegroundColor Cyan
    git add -A
    git commit -m "$Message"
    Write-Host "Pushing to origin main..." -ForegroundColor Cyan
    git push origin main
    Write-Host "Pushed." -ForegroundColor Green
} else {
    Write-Host "No local changes to commit. Pushing anyway (in case of unpushed commits)..." -ForegroundColor Yellow
    git push origin main 2>$null
}

# 2. SSH to VPS: pull and restart
$restartCmd = if ($DeployRestartCommand) { $DeployRestartCommand } else { "pm2 restart box-breaker" }
$remoteCmd = "cd $DeployPath && git pull origin main && cd server && npm install --production && $restartCmd"
Write-Host "Updating VPS at ${DeployUser}@${DeployHost}..." -ForegroundColor Cyan
ssh "${DeployUser}@${DeployHost}" $remoteCmd
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. App: https://app.cardgems.com" -ForegroundColor Green
} else {
    Write-Host "SSH or remote command failed. Check deploy-config.ps1 and SSH key." -ForegroundColor Red
    exit 1
}
