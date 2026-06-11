param(
    [string]$ProjectId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - Setup Firebase ===" -ForegroundColor Cyan

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Host "Node/npx nao encontrado." -ForegroundColor Red
    exit 1
}

$loginCheck = npx firebase projects:list 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -and $loginCheck -notmatch "Project Display Name") {
    Write-Host ""
    Write-Host "Firebase CLI nao autenticado." -ForegroundColor Yellow
    Write-Host "Execute no terminal (abrira o navegador):" -ForegroundColor Yellow
    Write-Host "  npx firebase login" -ForegroundColor White
    Write-Host ""
    Write-Host "Depois rode este script novamente." -ForegroundColor Yellow
    exit 1
}

if ($ProjectId) {
    $firebaserc = @{ projects = @{ default = $ProjectId } } | ConvertTo-Json
    Set-Content -Path ".firebaserc" -Value $firebaserc -Encoding UTF8
    Write-Host "Projeto definido: $ProjectId"
} else {
    Write-Host "Projetos disponiveis:"
    npx firebase projects:list
    $current = (Get-Content ".firebaserc" -Raw | ConvertFrom-Json).projects.default
    Write-Host "Projeto atual em .firebaserc: $current"
}

Write-Host ""
Write-Host "Build..."
npm run build

Write-Host ""
Write-Host "Deploy (hosting + functions)..."
npx firebase deploy --only hosting,functions

Write-Host ""
Write-Host "=== Concluido ===" -ForegroundColor Green
$proj = (Get-Content ".firebaserc" -Raw | ConvertFrom-Json).projects.default
Write-Host "App:  https://${proj}.web.app"
Write-Host "API:  https://${proj}.web.app/api/health"
