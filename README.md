# Barbearia — Agendamento Online

Página exclusiva de agendamento para cabeleireiro/barbeiro: o cliente entra pelo link,
escolhe o serviço, o dia e o horário disponível, e confirma o agendamento. Inclui um
painel administrativo para o profissional gerenciar horários de funcionamento, folgas,
serviços e a agenda.

## Funcionalidades

- **Página do cliente (`/`)**: escolha de serviço → dia → horário → dados de contato →
  confirmação. Gera um link exclusivo de cancelamento para o cliente.
- **Cancelamento pelo cliente (`/cancelar?token=...`)**: o cliente pode cancelar o próprio
  horário sem precisar falar com o barbeiro.
- **Painel do profissional (`/admin`)**:
  - Configuração inicial (nome + senha de acesso).
  - Agenda com filtro por data, cancelamento e lançamento manual de horários.
  - Horário de funcionamento por dia da semana (com intervalo de almoço opcional).
  - Bloqueio de datas específicas (folgas, feriados, viagens).
  - Cadastro de serviços (nome, duração, preço).
  - Dados de contato exibidos na página pública (endereço, WhatsApp, Instagram).
  - Troca de senha.
- Verificação de conflito de horário no servidor (evita dois clientes marcando o mesmo
  horário ao mesmo tempo).

## Como rodar

```bash
npm install
npm start
```

O servidor sobe em `http://localhost:3000`.

- Link para o **cliente agendar**: `http://localhost:3000/`
- Link do **painel do profissional**: `http://localhost:3000/admin`

Na primeira vez que abrir `/admin`, você vai criar seu nome e uma senha de acesso.
Depois disso, use essa senha para entrar sempre que quiser gerenciar a agenda.

## Tecnologia

- Node.js + Express (servidor e API)
- SQLite (`better-sqlite3`) para armazenar agendamentos, horários, serviços etc. — os
  dados ficam salvos em `data/barbearia.db` (não é enviado ao Git).
- HTML/CSS/JS puro no front-end (sem build necessário).

## Estrutura

```
src/
  server.js        # ponto de entrada do servidor
  db.js            # conexão SQLite e criação das tabelas
  availability.js  # cálculo dos horários disponíveis
  routes/
    public.js      # API pública (cliente)
    admin.js        # API do painel (protegida por sessão)
public/
  index.html       # página de agendamento do cliente
  admin.html       # painel do profissional
  cancelar.html    # página de cancelamento
  css/style.css
  js/
    booking.js
    admin.js
    cancel.js
data/              # banco de dados SQLite (gerado automaticamente)
```
