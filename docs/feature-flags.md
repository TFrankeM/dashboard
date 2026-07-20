# Feature flags dos módulos do dashboard

Cada gráfico/card do dashboard é um **módulo** com uma flag liga/desliga. O site
oficial mostra só os módulos ligados; o **modo laboratório** mostra tudo,
inclusive o que está em desenvolvimento. Promover um módulo a produção é um
clique no painel de administração — sem branch, sem deploy.

## Peças

| Arquivo | Papel |
|---|---|
| `api/_lib/modules.js` | Manifesto: a lista única de módulos (id, rótulo, status, default) |
| `api/_lib/flags-store.js` | Backends de armazenamento (Edge Config, arquivo local, padrões) |
| `api/flags.js` | Endpoint: `GET` público, `PATCH` autenticado |
| `js/flags.js` | Aplica as flags na carga do dashboard (remove módulos desligados) |
| `admin.html` + `js/admin.js` + `css/admin.css` | Painel com os toggles |

O `dashboard.html` marca cada card com `data-module="<id>"`; contêineres que
devem sumir quando ficam vazios (a fileira de métricas) têm `data-module-group`.
Bolinhas da side-nav apontando para seções removidas somem junto.

## Fluxos

- **Produção (Marlos):** `dashboard.html` → módulos desligados são removidos do
  DOM antes de qualquer gráfico inicializar.
- **Laboratório:** `dashboard.html?lab=1` → nada é removido; módulos desligados
  aparecem com contorno tracejado e selo "Em desenvolvimento".
- **Promover/despromover:** `admin.html` → colar o token → clicar no toggle.
  Vale no próximo reload da página (propagação do Edge Config: segundos).
- **Adicionar módulo novo:** registrar em `api/_lib/modules.js` com
  `defaultEnabled: false` e `status: "development"`, marcar o card com
  `data-module`. Ele nasce invisível em produção e visível no lab.

## Configuração na Vercel (uma vez)

1. **Storage → Create → Edge Config** (ex.: `iibex-flags`) e **Connect Project**
   ao `iibex` — isso injeta a env `EDGE_CONFIG` (connection string de leitura).
2. **Account Settings → Tokens →** criar um access token e salvá-lo como env
   `VERCEL_API_TOKEN` no projeto (Production/Preview) — usado pelo `PATCH` para
   gravar no Edge Config. Se o store pertencer a um time, salvar também
   `VERCEL_TEAM_ID`.
3. Definir a env `FLAGS_ADMIN_TOKEN` com um segredo forte (ex.:
   `openssl rand -hex 24`). É esse valor que se cola no `admin.html`.

Sem `EDGE_CONFIG` configurado, o deploy continua funcionando com os padrões do
manifesto (somente leitura). Em desenvolvimento local (sem `VERCEL`), as flags
vivem em `.dev-flags.json` (gitignorado), então o fluxo inteiro funciona offline.

## Segurança

- O `GET /api/flags` é público de propósito (a página precisa dele); expõe
  apenas ids/rótulos/estado.
- O `PATCH` exige `Authorization: Bearer <FLAGS_ADMIN_TOKEN>`, comparado em
  tempo constante. O token nunca é persistido pelo painel (memória da aba).
- `admin.html` tem `noindex` e não é linkado pelas páginas públicas; a proteção
  real é o token. Camada extra opcional: Deployment Protection da Vercel.
