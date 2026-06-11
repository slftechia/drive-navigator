param(
    [string]$ApiUrl = "https://drive-navigator-api.onrender.com/api"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Drive Navigator - API no Render (gratis, sem Blaze) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Crie conta em https://render.com (plano Free, sem cartao na maioria dos casos)"
Write-Host "2. Dashboard -> New + -> Blueprint"
Write-Host "3. Conecte este repositorio Git OU crie Web Service manual:"
Write-Host "   - Root Directory: api"
Write-Host "   - Runtime: Node"
Write-Host "   - Build:  npm install && npm run build"
Write-Host "   - Start:  npm start"
Write-Host "   - Health: /api/health"
Write-Host ""
Write-Host "   (Alternativa: use o arquivo render.yaml na raiz do projeto)"
Write-Host ""
Write-Host "4. Aguarde o deploy e copie a URL (ex: https://drive-navigator-api.onrender.com)"
Write-Host "5. Rode este script com a URL real:"
Write-Host "   powershell -File scripts\deploy-hosting.ps1 -ApiUrl https://SUA-URL.onrender.com/api"
Write-Host ""

if ($ApiUrl -match "onrender\.com") {
    Write-Host "Configurando frontend com API: $ApiUrl" -ForegroundColor Green
    Set-Content -Path "frontend\.env.production" -Value "# API Render`nVITE_API_URL=$ApiUrl`n" -Encoding UTF8
    npm run build -w frontend
    npx firebase deploy --only hosting
    Write-Host ""
    Write-Host "App:  https://drive-navigator-9c5db.web.app" -ForegroundColor Green
    Write-Host "API:  $ApiUrl/health" -ForegroundColor Green
}
