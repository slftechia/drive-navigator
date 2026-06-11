param(
    [string]$ResourceGroup = "rg-drive-navigator",
    [string]$Location = "brazilsouth",
    [string]$BaseName = "drive-nav"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - Deploy Infraestrutura Azure ===" -ForegroundColor Cyan

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Faca login: az login" -ForegroundColor Red
    exit 1
}
Write-Host "Subscription: $($account.name)" -ForegroundColor Green

$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "false") {
    Write-Host "Criando Resource Group: $ResourceGroup ($Location)..."
    az group create --name $ResourceGroup --location $Location --output none
} else {
    Write-Host "Resource Group existente: $ResourceGroup"
}

Write-Host "Implantando recursos Bicep..."
$deploymentJson = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file infra/main.bicep `
    --parameters baseName=$BaseName location=$Location `
    --query "properties.outputs" `
    -o json

$deployment = $deploymentJson | ConvertFrom-Json

Write-Host ""
Write-Host "=== Recursos criados ===" -ForegroundColor Green
Write-Host "Function App:  $($deployment.functionAppUrl.value)"
Write-Host "Static Web App: $($deployment.staticWebAppUrl.value)"
Write-Host "Maps Account:  $($deployment.mapsAccountName.value)"
Write-Host "Key Vault:     $($deployment.keyVaultName.value)"

$mapsKey = $deployment.mapsPrimaryKey.value
$funcUrl = $deployment.functionAppUrl.value

$envLines = @(
    "VITE_AZURE_MAPS_KEY=$mapsKey"
    "VITE_API_URL=$funcUrl/api"
)
Set-Content -Path "frontend/.env" -Value ($envLines -join "`n") -Encoding UTF8
Write-Host ""
Write-Host "frontend/.env gerado com chaves Azure Maps" -ForegroundColor Green

$localSettings = Get-Content "api/local.settings.json" -Raw | ConvertFrom-Json
$localSettings.Values.AZURE_MAPS_KEY = $mapsKey
$localSettings.Values.COSMOS_ENDPOINT = $deployment.cosmosEndpoint.value
$localSettings | ConvertTo-Json -Depth 5 | Set-Content "api/local.settings.json" -Encoding UTF8
Write-Host "api/local.settings.json atualizado" -ForegroundColor Green

$outputFile = "infra/deployment-output.json"
$deployment | ConvertTo-Json -Depth 5 | Set-Content $outputFile -Encoding UTF8
Write-Host "Outputs salvos em $outputFile" -ForegroundColor Green

Write-Host ""
Write-Host "Proximo passo: npm run deploy:app" -ForegroundColor Cyan
