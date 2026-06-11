param(
    [string]$ProjectId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - Deploy Firebase ===" -ForegroundColor Cyan

if ($ProjectId) {
    $firebaserc = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
    $firebaserc.projects.default = $ProjectId
    $firebaserc | ConvertTo-Json | Set-Content ".firebaserc"
}

Write-Host "Instalando dependencias..."
npm install

Write-Host "Build (frontend + api + functions)..."
npm run build

Write-Host "Deploy Firebase (hosting + functions)..."
npm run deploy

Write-Host ""
Write-Host "=== Deploy concluido ===" -ForegroundColor Green
Write-Host "App: https://<seu-projeto>.web.app"
Write-Host "API: https://<seu-projeto>.web.app/api/health"
