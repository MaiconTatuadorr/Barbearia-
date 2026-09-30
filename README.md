# Barbearia — Agendamento Online (Cloudflare Pages + D1)

Página exclusiva de agendamento para cabeleireiro/barbeiro: o cliente entra pelo link,
escolhe o serviço, o dia e o horário disponível, e confirma o agendamento. Inclui um
painel administrativo para o profissional gerenciar horários, folgas, serviços e a agenda.

Roda 100% na **Cloudflare** (Pages + Functions + D1), que tem um plano gratuito bem
generoso — sem custo para o volume de uso de uma barbearia comum.

## Funcionalidades

- **Página do cliente (`/`)**: escolha de serviço → dia → horário → dados de contato →
  confirmação. Gera um link exclusivo de cancelamento.
- **Cancelamento pelo cliente (`/cancelar?token=...`)**.
- **Painel do profissional (`/admin`)**: configuração inicial, agenda com filtro por
  data, cancelar/lançar agendamento manual, horário de funcionamento por dia da semana
  (com intervalo de almoço), bloqueio de datas específicas, cadastro de serviços,
  dados de contato exibidos na página pública, troca de senha.
- Verificação de conflito de horário no servidor.

## Tecnologia

- **Cloudflare Pages** hospeda os arquivos estáticos (`public/`).
- **Cloudflare Pages Functions** (`functions/api/[[route]].js`) rodam a API, usando o
  framework [Hono](https://hono.dev).
- **Cloudflare D1** (banco SQLite gerenciado pela Cloudflare) guarda agendamentos,
  horários, serviços etc.
- HTML/CSS/JS puro no front-end (sem build necessário).

## Estrutura

```
functions/
  api/
    [[route]].js   # entrada única das Functions, delega tudo pro Hono
lib/
  app.js           # todas as rotas da API (pública + admin)
  settings.js      # leitura/gravação de configurações no D1
  availability.js  # cálculo dos horários disponíveis
  auth.js          # sessões do painel admin (guardadas no D1)
migrations/
  0001_init.sql    # schema do banco D1 + dados padrão
public/
  index.html       # página de agendamento do cliente
  admin.html        # painel do profissional (acessível em /admin)
  cancelar.html     # página de cancelamento (acessível em /cancelar)
  css/style.css
  js/
wrangler.toml      # configuração do projeto Cloudflare (binding do D1 etc.)
```

## Como publicar de graça na Cloudflare

### 1. Pré-requisitos
- Conta gratuita na Cloudflare: https://dash.cloudflare.com/sign-up
- Node.js instalado no seu computador (ou use o Codespaces/terminal daqui mesmo)

### 2. Login no Wrangler (CLI da Cloudflare)
```bash
npx wrangler login
```
Isso abre o navegador para você autorizar.

### 3. Criar o banco de dados D1
```bash
npx wrangler d1 create barbearia-db
```
O comando devolve um `database_id`. Copie esse ID e cole no arquivo `wrangler.toml`,
no lugar de `COLOQUE_AQUI_O_ID_DO_SEU_BANCO_D1`.

### 4. Aplicar o schema no banco remoto
```bash
npm run db:migrate:remote
```

### 5. Criar o projeto Pages e publicar
```bash
npx wrangler pages project create barbearia-agendamento
npm run deploy
```
Ao final, a Cloudflare mostra a URL pública, algo como
`https://barbearia-agendamento.pages.dev`.

⚠️ **Importante**: depois do primeiro deploy, vá no painel da Cloudflare
(**Workers & Pages → seu projeto → Settings → Functions → D1 database bindings**)
e confirme que o binding `DB` está apontando para o banco `barbearia-db`. Isso também já
é feito automaticamente pelo `wrangler.toml`, mas vale conferir.

### 6. Acessar
- Link para o **cliente agendar**: `https://SEU-PROJETO.pages.dev/`
- Link do **painel do profissional**: `https://SEU-PROJETO.pages.dev/admin`

Na primeira vez que abrir `/admin`, você cria seu nome e uma senha de acesso.

### 7. (Opcional) Domínio próprio
Em **Workers & Pages → seu projeto → Custom domains**, você pode apontar um domínio
seu (ex: `agenda.suabarbearia.com.br`) de graça, direto pela Cloudflare.

## Rodando localmente para testar (opcional)

```bash
npm install
npm run db:migrate:local
npm run dev
```
Abre em `http://localhost:8788`.
