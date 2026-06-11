param(
    [string]$ResourceGroup = "rg-drive-navigator"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - Deploy Aplicacao ===" -ForegroundColor Cyan

$outputFile = "infra/deployment-output.json"
if (-not (Test-Path $outputFile)) {
    Write-Host "Execute primeiro: npm run deploy:infra" -ForegroundColor Red
    exit 1
}

$outputs = Get-Content $outputFile -Raw | ConvertFrom-Json
$functionAppName = $outputs.functionAppName.value
$staticWebAppName = $outputs.staticWebAppName.value

Write-Host "Instalando dependencias..."
npm install
npm install -w frontend
npm install -w api

Write-Host "Build frontend..."
npm run build -w frontend

Write-Host "Build API..."
npm run build -w api

Write-Host "Deploy Function App: $functionAppName..."
powershell -File scripts/deploy-api.ps1 -FunctionAppName $functionAppName -ResourceGroup $ResourceGroup

Write-Host "Deploy Static Web App: $staticWebAppName..."
$swaToken = az staticwebapp secrets list `
    --name $staticWebAppName `
    --resource-group $ResourceGroup `
    --query "properties.apiKey" -o tsv

if ($swaToken) {
    npx --yes @azure/static-web-apps-cli deploy frontend/dist `
        --deployment-token $swaToken `
        --env production
} else {
    Write-Host "Token SWA nao encontrado. Faca deploy manual via portal." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Deploy concluido ===" -ForegroundColor Green
Write-Host "Frontend: $($outputs.staticWebAppUrl.value)"
Write-Host "API:      $($outputs.functionAppUrl.value)/api/health"
