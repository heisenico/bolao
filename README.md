# Bolão da Copa do Mundo 2026 ⚽

```
┌────────────────────────────────────────────┐
│  PLACAR DO DIA                             │
│  BRA 2 × 1 ARG      seu palpite: 2 × 1     │
│  cravada! ✓                +30 pts (final) │
└────────────────────────────────────────────┘
```

Um bolão **entre amigos** para a Copa de 2026: palpites de placar, pontuação
automática contra os resultados reais, ranking com regras oficiais — e até
**IAs convidadas** disputando (sem direito ao prêmio 🤖).

**Ao vivo:** https://bolao-nine-mu.vercel.app

O princípio de tudo: **justiça provável, não prometida**. Prazos travados no
servidor, palpites ocultos até o jogo travar, cada ponto auditável — e o app
**nunca movimenta dinheiro**: ele registra e calcula; o PIX acontece entre
amigos, fora daqui.

## O jogo

1. **Entre pelo link de convite** (login sem senha, por e-mail) — as
   inscrições fecham 1h antes da abertura.
2. **Palpite cada jogo até 10 minutos antes do apito** — dá para criar ou
   mudar o palpite até quase a escalação. Os 4 prêmios da FIFA (campeão,
   artilheiro, goleiro, craque) travam 1h antes da abertura.
3. Em **20/06** abre o mata-mata: palpite cada jogo (até 10 min antes) — e
   crave também o **vice-campeão**.
4. O app busca os resultados sozinho, pontua e atualiza o ranking.
5. No fim, os **3 melhores humanos** dividem o prêmio: **60% / 30% / 10%**.

## Pontuação — "Clássico Gradativo"

| Acerto | Base |
|---|---:|
| 🎯 Placar exato (**cravada**) | **10** |
| 📐 Vencedor + saldo de gols | **5** |
| ✅ Só o vencedor (ou empate com placar errado) | **3** |
| ❌ Errou / não palpitou | **0** |

…multiplicada pela fase:

| Fase | Multiplicador | Cravada vale |
|---|---:|---:|
| Grupos (72 jogos) | 1× | 10 |
| 32 avos e oitavas | 1,5× | 15 |
| Quartas e semis | 2× | 20 |
| 3º lugar e **final** | 3× | **30** |

Detalhes que importam (e estão pinados em teste):

- Palpitou **1×1** e deu **2×2**? Acertou o empate **e** o saldo → **5 pts**, não 3.
- Mata-mata vale o placar de **90' + prorrogação**; **pênaltis nunca contam**
  — por isso **empate é palpite válido** em qualquer fase.
- Não palpitou? Entra um **0×0 automático** (marcado como `automático` no
  app — e se o jogo terminar 0×0, pontua como qualquer cravada).
- Jogo cancelado/W.O.: cancelado zera todo mundo; W.O. entra como resultado
  manual normal (ex.: 3×0).

## Prêmios da Copa (palpites especiais)

| Palpite | Vale | Trava |
|---|---:|---|
| 🏆 Campeão | 30 | junto com a fase de grupos |
| ⚽ Artilheiro | 20 | junto com a fase de grupos |
| 🧤 Melhor goleiro | 15 | junto com a fase de grupos |
| ⭐ Melhor jogador | 15 | junto com a fase de grupos |
| 🥈 Vice-campeão | 10 | abre em 20/06, trava antes dos 32 avos |

Apurados manualmente pelo organizador quando a FIFA confirma; até lá ficam
"aguardando apuração" e não somam no ranking.

## Ranking e desempates

Soma de todos os pontos (jogos + prêmios confirmados). Empatou? Desempata
nesta ordem:

1. Mais **cravadas** (uma cravada na final conta igual a uma nos grupos);
2. Mais **acertos** (qualquer palpite que pontuou);
3. Quem **acertou o campeão**;
4. Quem **entrou primeiro** no bolão.

## IAs convidadas 🤖

Contas como Claude, ChatGPT e Gemini podem disputar de igual para igual —
palpitam, pontuam e aparecem no ranking com selo de IA. Mas **não concorrem
ao prêmio**: se uma IA terminar em 1º, os 3 melhores humanos levam os
60/30/10 do mesmo jeito. A máquina joga pela honra.

## Dinheiro (PIX, semi-manual)

1. O organizador define **valor de entrada** e **chave PIX** ao criar o bolão
   (ou deixa **0** para um bolão sem entrada — todo o fluxo de pagamento some).
2. Cada participante paga por fora — a tela de pagamento mostra o valor, a
   chave com botão de copiar e o **"Já paguei"**. Pagar **nunca trava os
   palpites**: dá para palpitar desde o primeiro segundo.
3. O organizador confere o extrato e confirma (ou marca como não pago, se o
   aviso foi engano). Só entradas confirmadas compõem o prêmio.
4. O status de pagamento é **privado** — cada um vê só o seu; nada de
   constrangimento público.
5. O app **mostra** os premiados e as porcentagens; o repasse é manual, via
   PIX, fora do app.

> O app só registra e calcula — não custodia nem transfere valores.

## Por dentro

**Stack:** Next.js 16 (App Router + Server Actions) · TypeScript · Tailwind ·
Prisma + PostgreSQL ([Neon](https://neon.tech)) · Auth.js (link mágico) ·
[football-data.org](https://www.football-data.org).

**Arquitetura em três camadas, com a regra do jogo isolada:**

```
src/domain/   regras puras (pontuação, prazos, ranking, prêmios) — zero Prisma/Next
src/server/   persistência + liquidação transacional (Prisma)
src/app/      páginas e server actions (App Router)
```

Fairness de verdade, não de banner:

- Prazos em **UTC, no servidor** — cada jogo trava 10 minutos antes do
  próprio apito; o mata-mata abre 20/06 00:00 (Brasília); inscrições, prêmios
  e ajustes do organizador travam 1h antes da abertura (Bloco A). Jogo
  adiado? O prazo segue o novo horário sozinho.
- Palpites **ocultos dos outros até travar** (anti-cópia), revelados só para
  o seu bolão.
- Cada palpite liquidado guarda `hitType` + `pontosBase` + pontos finais —
  o desempate conta **tipos de acerto**, nunca infere de valores de pontos.
- Liquidação **transacional e idempotente**; correção manual do admin nunca
  é sobrescrita pelo robô; `/api/rescore` recalcula tudo de novo se um dia
  for preciso (e dá no mesmo rodar duas vezes).

## Rodando localmente

**Pré-requisitos:** Node 20+, um PostgreSQL (ex.: Neon) e uma chave gratuita
do football-data.org.

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
POLL_SECRET="..."            # token das rotas operacionais
```

> Em desenvolvimento o e-mail não é enviado: o **link mágico aparece no
> console do servidor**. Em produção o envio é via **SMTP do Gmail**
> (`smtp.gmail.com:465`) com uma Senha de app (2FA habilitado) — sem precisar
> de domínio próprio.

## Operação (rotas protegidas por token)

Um agendador externo (ex.: [cron-job.org](https://cron-job.org)) mantém tudo
girando:

| Rota | Quando | O que faz |
|---|---|---|
| `GET /api/sync-fixtures?secret=…` | 1×/dia | sincroniza times e jogos |
| `GET /api/poll-scores?secret=…` | ~10–15 min | liquida jogos encerrados (só age em janela de jogo, poupando a cota da API) |
| `GET /api/rescore?secret=…` | manual, raro | recalcula todos os jogos liquidados com a regra atual (idempotente) |

## Testes

```bash
npm run test:run    # suíte completa (integração usa um schema de teste no Postgres)
npm run test:unit   # só a regra do jogo, sem banco
```

264 testes cobrem da matemática da cravada ao desempate pelo campeão —
incluindo os casos de canto: 1×1 vs 2×2, pênaltis ignorados, 0×0 automático,
W.O. antecipado e recálculo idempotente.

---

Feito entre amigos, para a Copa. Que vença o melhor palpite. 🏆
