# Drive Navigator

App de roteiro personalizado para motoristas — stack **100% gratuita** (sem Blaze).

## Arquitetura em producao

| Camada | Servico | Plano | Custo |
|--------|---------|-------|-------|
| **Frontend + PWA** | Firebase Hosting (Spark) | Gratis | R$ 0 |
| **API** | Render Web Service | Free | R$ 0 |
| **Mapas** | MapLibre + OpenFreeMap (OSM) | Gratis | R$ 0 |
| **Rotas / busca / POIs** | OSRM, Photon, Nominatim, Overpass | Gratis | R$ 0 |

**URLs atuais:**

- App: https://drive-navigator-9c5db.web.app
- API: https://drive-navigator-api.onrender.com/api/health *(apos deploy no Render)*

## Desenvolvimento local

```powershell
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:7071/api/health

## Deploy — API no Render (sem cartao no Firebase)

1. Crie conta em https://render.com
2. **New +** → **Web Service**
3. Conecte um repositorio Git **ou** use as configuracoes manuais:
   - **Root Directory:** `api`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - **Name:** `drive-navigator-api` *(para bater com a URL configurada no app)*
4. Aguarde o deploy ficar **Live**
5. Teste: https://drive-navigator-api.onrender.com/api/health

> Tambem existe `render.yaml` na raiz para deploy via Blueprint.

Se a URL do Render for diferente, atualize e redeploy o frontend:

```powershell
powershell -File scripts\deploy-hosting.ps1 -ApiUrl https://SUA-URL.onrender.com/api
```

## Deploy — Frontend no Firebase (Spark)

```powershell
npx firebase login
npx firebase use drive-navigator-9c5db
powershell -File scripts\deploy-hosting.ps1
```

## Funcionalidades (MVP)

- Planejamento de rota com destino personalizado
- Mapa interativo (MapLibre + OpenStreetMap)
- POIs na rota: postos, restaurantes, hoteis
- Monitoramento de autonomia do veiculo
- Alertas de radar/lombada (OSM)
- GPS em tempo real e navegacao turn-by-turn
- PWA instalavel no celular

## Limites do tier gratuito

- **Render Free** — servico "dorme" apos ~15 min sem uso (primeira requisicao demora ~30s)
- **Firebase Spark** — 10 GB hosting, transferencia diaria limitada
- **OSRM / Overpass** — uso moderado; rotas muito longas podem demorar

## Proximas fases

- [ ] Firestore — historico de viagens
- [ ] Firebase Auth — login de usuarios
- [ ] FCM — notificacoes push
