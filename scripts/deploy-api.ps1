param(
    [string]$ResourceGroup = "rg-drive-navigator",
    [string]$FunctionAppName = "drive-nav-api-dn001"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$apiDir = Join-Path $root "api"
$deployDir = Join-Path $apiDir ".deploy"

Write-Host "=== Deploy API (pacote isolado) ===" -ForegroundColor Cyan

Write-Host "Build TypeScript..."
Push-Location $root
npm run build -w api
if ($LASTEXITCODE -ne 0) { throw "Falha no build da API (exit $LASTEXITCODE)" }
Pop-Location

if (Test-Path $deployDir) {
    Remove-Item $deployDir -Recurse -Force
}
New-Item -ItemType Directory -Path $deployDir | Out-Null

Copy-Item (Join-Path $apiDir "dist") (Join-Path $deployDir "dist") -Recurse
Copy-Item (Join-Path $apiDir "host.json") $deployDir
Copy-Item (Join-Path $apiDir "package.json") $deployDir

Write-Host "Instalando dependencias de producao..."
Push-Location $deployDir
npm install --omit=dev --no-workspaces --no-package-lock
Pop-Location

Write-Host "Publicando $FunctionAppName..."
Push-Location $deployDir
npx --yes azure-functions-core-tools@4 azure functionapp publish $FunctionAppName --javascript
Pop-Location

Write-Host "=== API publicada ===" -ForegroundColor Green
