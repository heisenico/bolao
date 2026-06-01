# Bolão da Copa do Mundo 2026 ⚽

Aplicação web **mobile-first** para um grupo de amigos fazer **palpites nos jogos da Copa do Mundo FIFA 2026**, com pontuação automática, ranking ao vivo e controle de pagamentos via PIX.

Acesse aqui: https://bolao-nine-mu.vercel.app/dashboard

## Funcionalidades

- **Login sem senha** — link mágico por e-mail (Auth.js).
- **Bolão privado** — criar ou entrar por **link de convite**, com valor de entrada e chave PIX.
- **Palpites de placar** por jogo. Cada palpite:
  - pode ser editado até **1h antes do apito**, depois trava;
  - fica **oculto dos outros** até o jogo travar (anti-cópia).
- **Pontuação automática:**
  - placar exato → **3 pts**
  - acertou só o vencedor/empate → **1 pt**
  - errou ou não palpitou → **0 pts**
- **Resultados reais** via [football-data.org](https://www.football-data.org) (busca automática) + **correção manual** pelo admin.
- **Ranking ao vivo** com desempate: cravadas → acertos de vencedor → ordem de entrada.
- **Bracket do mata-mata** (32-avos → final), com bandeiras e grupos.
- **Painel do admin** (organizador): confirmar pagamentos, corrigir/cancelar resultados, ver o prêmio (**vencedor leva tudo**), gerenciar participantes e compartilhar o convite (WhatsApp/copiar link).

## Como funciona o PIX (semi-manual)

1. O organizador define o **valor de entrada** e a **chave PIX** ao criar o bolão.
2. O participante paga por fora e marca **"já paguei"**.
3. O organizador confere e clica **"Confirmar pagamento"**.
4. O app calcula o **prêmio** (soma das entradas confirmadas) e mostra o ganhador.
5. O **repasse ao ganhador é manual**, feito pelo organizador via PIX, fora do app.

> O app só **registra e calcula** — não custodia nem transfere valores. Não é aconselhamento jurídico.

## Tecnologias

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL ([Neon](https://neon.tech)) · Auth.js (link mágico) · football-data.org.

## Rodando localmente

**Pré-requisitos:** Node 20+, um PostgreSQL (ex.: Neon) e uma chave gratuita do football-data.org.

```bash
npm install
npx prisma migrate deploy   # cria as tabelas
npm run dev                 # http://localhost:3000
```

Variáveis de ambiente (`.env` e `.env.local`):

```bash
# .env
DATABASE_URL="postgresql://...?pgbouncer=true"   # conexão pooled (app)
DIRECT_URL="postgresql://..."                    # conexão direta (migrations)

# .env.local
AUTH_SECRET="..."            # gere com: npx auth secret
SMTP_USER=""                 # Gmail SMTP (e-mail completo); vazio em dev = link mágico vai pro console
SMTP_PASS=""                 # Gmail App Password (requer 2FA habilitado na conta)
AUTH_EMAIL_FROM="..."        # remetente dos e-mails; em prod use o mesmo endereço Gmail do SMTP_USER
AUTH_URL="http://localhost:3000"
FOOTBALL_DATA_KEY="..."      # football-data.org
POLL_SECRET="..."            # token das rotas de atualização de resultados
```

> Em desenvolvimento o e-mail não é enviado: o **link mágico aparece no console do servidor**. Cole-o no navegador para entrar.
>
> Em produção o e-mail é enviado via **SMTP do Gmail** (`smtp.gmail.com:465`). Habilite a verificação em duas etapas (2FA) na conta Google e gere uma **Senha de app** (App Password) para usar em `SMTP_PASS`. Use o mesmo endereço de e-mail em `SMTP_USER` e `AUTH_EMAIL_FROM`. Não é necessário ter domínio próprio.

## Resultados automáticos

Um agendador externo (ex.: [cron-job.org](https://cron-job.org)) chama as rotas protegidas por token:

- `GET /api/sync-fixtures?secret=POLL_SECRET` — **1×/dia**, sincroniza times e jogos.
- `GET /api/poll-scores?secret=POLL_SECRET` — **a cada ~10–15 min**, busca resultados e recalcula os pontos (só age durante janelas de jogo).

## Testes

```bash
npm run test:run    # suíte completa (integração usa um schema de teste no Postgres)
npm run test:unit   # só lógica pura, sem banco
```
