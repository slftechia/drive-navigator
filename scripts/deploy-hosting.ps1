param(
    [string]$ApiUrl = "https://drive-navigator-api.onrender.com/api"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - Deploy Hosting (Firebase Spark) ===" -ForegroundColor Cyan

if (-not $ApiUrl) {
    Write-Host "Informe -ApiUrl com a URL da API no Render." -ForegroundColor Red
    exit 1
}

Set-Content -Path "frontend\.env.production" -Value "# API externa (Render)`nVITE_API_URL=$ApiUrl`n" -Encoding UTF8
Write-Host "VITE_API_URL=$ApiUrl"

Write-Host "Build frontend..."
npm run build -w frontend

Write-Host "Deploy Firebase Hosting..."
npx firebase deploy --only hosting

Write-Host ""
Write-Host "=== Concluido ===" -ForegroundColor Green
Write-Host "App:  https://drive-navigator-9c5db.web.app"
Write-Host "API:  $ApiUrl/health"
