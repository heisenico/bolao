# Especificação de Design — Bolão da Copa do Mundo 2026

> Documento de design (saída da fase de *brainstorming*). Aprovado para virar plano de implementação.
> Escopo: v1 funcional, mobile-first, bolão privado entre amigos, sem fins lucrativos.
> Data: 2026-05-31.

---

## 0. Registro de decisões desta revisão (delta sobre o rascunho inicial)

Cinco pontos foram fechados na revisão do design. Onde houver conflito com o texto antigo do rascunho, **vale o que está aqui**.

1. **Pontuação sem palpite = 0 pts, sempre.** Removido o "fallback automático 0×0". Quem não palpita não pontua naquele jogo. (Elimina contradição interna e não premia ausência.)
2. **Rateio do prêmio = vencedor leva tudo.** O 1º colocado (após critérios de desempate) recebe a soma integral das entradas confirmadas. Sem split por colocação na v1.
3. **Trava de deadline validada no servidor por timestamp**, comparando `now()` (UTC) com `match.dataHora − 1h`. `locked` é valor **derivado/cache** para exibição, não a fonte de verdade. `dataHora` armazenada em UTC; exibida em America/São_Paulo.
4. **Agendamento NÃO usa cron nativo da Vercel** (inviável no free — ver §13). Usa **agendador externo gratuito** (cron-job.org) chamando uma rota protegida por token, que só busca durante janelas de jogo.
5. **"Ao vivo" = ranking atualiza logo após cada jogo (~10–15 min do apito final).** A pontuação depende só do **placar final**, então polling minuto-a-minuto dentro da partida não muda nenhum ponto — fica fora de escopo na v1.

---

## 1. Visão geral

Aplicação web **mobile-first** onde um grupo de amigos faz palpites nos jogos da Copa do Mundo FIFA 2026, com pontuação automática conforme os resultados reais, **ranking atualizado logo após cada jogo** e controle de pagamentos via PIX (semi-manual). O visual se inspira na estética do simulador do ge.globo: limpo, cards de seleções, verde de ação, bracket simétrico no mata-mata.

**Princípio guia:** o mais simples e funcional possível. Cada funcionalidade que adiciona risco regulatório ou custo é evitada ou adiada.

---

## 2. Decisões fechadas (não reabrir sem motivo)

| Tema | Decisão |
|---|---|
| Plataforma | Web app responsivo, **mobile-first** (PWA opcional na v2) |
| Acesso | Privado, via **link/código de convite** |
| Login | **Magic link por e-mail** (sem senha, sem SMS) |
| Pontuação | **Simplificada**: placar exato = 3 pts, acerto do vencedor/empate = 1 pt, erro **ou sem palpite** = 0 pts. Sem multiplicadores de fase, sem prêmios FIFA |
| Resultados reais | **API-Football (api-sports.io), plano free**, buscados por **agendador externo** durante janelas de jogo, com **fallback manual** do admin (override tem prioridade) |
| Agendamento | **Agendador externo gratuito** (cron-job.org) → rota `GET /api/poll-scores` protegida por token; **não** usa cron nativo da Vercel (inviável no free) |
| PIX | **Semi-manual**: app registra quem pagou e calcula o rateio; recebimento e repasse executados manualmente pelo organizador |
| Rateio do prêmio | **Vencedor leva tudo** (1º colocado recebe a soma integral das entradas confirmadas) |
| Custódia de dinheiro | **App NÃO opera dinheiro real.** Apenas registra e calcula. Repasse é responsabilidade do organizador |
| Visual | Estética **ge.globo**: verde `#06AA48`, Open Sans, cards, bracket simétrico |

---

## 3. Stack técnica (escolhida pela simplicidade)

- **Framework:** **Next.js (App Router) + TypeScript** — full-stack num só projeto (front + API routes), deploy fácil na Vercel.
- **Estilo:** **Tailwind CSS**.
- **Banco:** **PostgreSQL** gerenciado (ex.: Supabase ou Neon, ambos com free tier) via **Prisma ORM**. SQLite localmente para começar.
- **Auth:** magic link por e-mail — **Auth.js (NextAuth) com Email Provider**, ou Supabase Auth. Envio de e-mail via **Resend** (free tier; requer domínio verificado para enviar a destinatários arbitrários).
- **Resultados:** cliente para **API-Football**, acionado por uma rota `GET /api/poll-scores` (Next.js Route Handler). A rota: (a) é protegida por **token secreto** em header/query; (b) consulta os fixtures e **dá no-op fora das janelas de jogo**; (c) durante janela de jogo, busca jogos encerrados, grava placar, marca `status = encerrada` e dispara o **recálculo de pontos**.
- **Agendamento:** **agendador externo gratuito** (cron-job.org, granularidade de 1 min) chama `/api/poll-scores` a cada ~10–15 min. Alternativa de mesmo papel: GitHub Actions (`schedule`, mín. 5 min) ou Upstash QStash. **Cron nativo da Vercel não é usado** porque o plano Hobby/free limita a 1 execução/dia (ver §13).
- **Tempo real (opcional v2):** o ranking na v1 usa **polling simples no cliente** (ex.: a cada 30–60 s na tela de ranking) para refletir os pontos já recalculados no servidor; WebSocket fica para depois.

---

## 4. Identidade visual (baseada no ge.globo)

- **Fonte:** "Open Sans", sans-serif.
- **Verde de ação:** `#06AA48` (botões primários: "Confirmar palpite", "Entrar").
- **Fundos:** branco `#FFFFFF`, cinza muito claro `#FAFAFA` / `#F3F3F3` para seções.
- **Bordas/divisores:** `#CCCCCC`.
- **Texto:** títulos em cinza-escuro/preto, peso bold, tamanhos grandes para cabeçalhos de seção.
- **Cards de seleção:** linha com bandeira (emoji unicode ou pacote SVG livre), nome do país, controles de palpite à direita.
- **Estilo geral:** minimalista, muito espaço em branco, cantos levemente arredondados, sombras leves.
- **Mobile-first:** tudo desenhado primeiro para tela estreita; grupos viram lista vertical de cards; bracket vira navegação por fase com scroll horizontal.
- **Direitos:** **não copiar** assets, logos ou conteúdo do ge.globo. Inspiração apenas em layout, fluxo e cores. Bandeiras de bibliotecas open-source.

---

## 5. Modelo de dados (entidades principais)

- **User:** id, nome, email, avatar (opcional), createdAt.
- **Pool (bolão):** id, nome, inviteCode, ownerId, valorEntrada (R$), chavePix (texto), createdAt, status (aberto/fechado).
- **PoolMembership:** id, poolId, userId, joinedAt (timestamp p/ desempate), **paymentStatus** (pendente/pago/confirmado), pontuaçãoTotal (derivada).
- **Team:** id, nome, códigoPaís, grupo (A–L), bandeira, apiFootballId.
- **Match:** id, fase (grupos/r32/oitavas/quartas/semi/3lugar/final), homeTeamId, awayTeamId, **dataHora (UTC)**, **placarHome/placarAway** (preenchido depois, nullable), status (agendada/ao_vivo/encerrada/adiada/cancelada), **resultadoFonte (api|manual)**, apiFootballId (p/ casar com a API).
- **Prediction (palpite):** id, membershipId, matchId, palpiteHome, palpiteAway, pontosObtidos, createdAt, updatedAt. (Não há registro "sem palpite": ausência de linha = 0 pts naquele jogo.)
- **PaymentRecord:** id, membershipId, valor, método (PIX), comprovanteRef (opcional), confirmadoPor (adminId), confirmadoEm.

> `locked` **não** é coluna persistida como fonte de verdade — é derivado em tempo de leitura/escrita a partir de `match.dataHora` (ver §6). Sem entidades de prêmios FIFA e sem palpites de posição de grupo na v1 (foco em palpites de placar por jogo). Bracket de mata-mata exibido a partir dos confrontos reais que a API/admin liberam. Copa 2026: 48 seleções, 12 grupos (A–L), 104 jogos, mata-mata a partir do round of 32.

---

## 6. Regras de negócio (v1 simplificada)

**Pontuação por jogo:**
- Placar exato → **3 pts**
- Acertou só o vencedor (ou o empate, sem o placar exato) → **1 pt**
- Errou → **0 pts**
- **Sem palpite registrado → 0 pts** (não há fallback 0×0; ausência de palpite não pontua).

**Mata-mata:** vale o placar do tempo normal + prorrogação; pênaltis não contam (convenção correta).

**Deadline (validação no servidor):** cada palpite pode ser criado/editado livremente **até 1h antes do apito** daquele jogo. A regra é imposta **no servidor na hora de gravar**, comparando `now()` (UTC) com `match.dataHora − 1h`; gravações após o limite são **rejeitadas**. `locked` é um booleano **derivado** (`now() ≥ dataHora − 1h`) usado só para a UI (desabilitar campos) — não é o que garante a trava.

**Palpites ocultos:** o palpite de cada participante fica oculto aos outros **até o travamento do jogo** (anti-cópia). Imposto na **camada de consulta**: a API nunca retorna palpites de terceiros enquanto `now() < dataHora − 1h`.

**Ranking e desempate (nesta ordem):**
1. Mais pontos totais
2. Mais placares exatos (cravadas)
3. Mais acertos de vencedor
4. Menor `joinedAt` (quem entrou primeiro)

**Entrada:** permitida até 1h antes do 1º jogo da Copa; depois o bolão fecha.

**Imutabilidade:** regras travadas após o 1º jogo.

**Jogos adiados:** palpites valem, deadline acompanha a nova `dataHora`. **Cancelados:** palpites anulados, 0 pts. **W.O.:** resultado oficial (3×0) tratado como real.

---

## 7. Fluxo de pagamento PIX (semi-manual — sem operar dinheiro)

1. Organizador define `valorEntrada` ao criar o bolão e cadastra **a própria chave PIX** (texto exibido ao participante).
2. Ao entrar, participante vê instrução de pagamento (chave PIX + valor) e marca "já paguei" (status → *pendente de confirmação*).
3. Organizador confere o recebimento na conta dele e clica **"Confirmar pagamento"** (status → *confirmado*). Opcional: campo para anexar referência do comprovante.
4. App **calcula o prêmio** = soma das entradas **confirmadas**. Regra de rateio: **vencedor leva tudo** — ao fim do torneio, o app mostra ao organizador o **1º colocado** (após desempates) e o **valor total** a repassar.
5. O repasse ao ganhador é feito **manualmente** pelo organizador, via PIX, fora do app.

> O app nunca movimenta, custodia ou repassa dinheiro. Ele só **registra e calcula**. Isso mantém o projeto fora de zona de risco regulatório/fiscal. **Não é aconselhamento jurídico** — para qualquer movimentação de valores de terceiros, vale consultar um contador.

---

## 8. Telas principais (mobile-first)

1. **Entrada/Login** — campo de e-mail, botão verde "Entrar com link mágico", confirmação "verifique seu e-mail".
2. **Entrar no bolão** — via código/link de convite; mostra valor de entrada e instrução PIX.
3. **Dashboard** — ranking resumido (top + sua posição), próximos jogos com status do seu palpite (feito/pendente), aviso de deadline.
4. **Palpites por rodada** — lista de jogos da fase atual; cada card: bandeiras, nomes, campos de placar, estado (editável/travado), indicador feito/pendente.
5. **Bracket de mata-mata** — visualização do chaveamento (a partir do round of 32); mobile: navegação por fase + scroll horizontal; desktop: dois lados convergindo para a final.
6. **Ranking detalhado** — posição, avatar, nome, pontos, nº de cravadas; destaque para o líder.
7. **Admin do bolão** — registrar/corrigir resultados (fallback manual, vira `resultadoFonte = manual`), confirmar pagamentos, ver o ganhador e o valor do prêmio, gerenciar participantes, link de convite e botões de compartilhar (WhatsApp/copiar link).

---

## 9. Integração com API-Football e agendamento

- **Sync inicial (1×/dia, 1 chamada):** sincronizar **fixtures** e **teams** da Copa 2026 (`apiFootballId` em `Match`/`Team`). `league=1, season=2026`. Isso também define as **janelas de jogo** (quando começar/parar de buscar placares).
- **Polling de resultados:** o agendador externo chama `GET /api/poll-scores` a cada **~10–15 min**; a rota só age **dentro das janelas de jogo**, busca jogos encerrados, grava placar, marca `status = encerrada` e dispara o **recálculo de pontos** de todas as `Prediction` daquele jogo. Fora de janela, **no-op** (preserva cota).
- **Orçamento de cota:** API-Football free = **100 req/dia** (reseta 00:00 UTC). Buscar encerrados a cada ~10–15 min só nas janelas + 1 sync diário mantém o uso **bem abaixo de 100/dia**. Cachear respostas; nunca pollar 24/7.
- **Fallback manual:** admin pode inserir/sobrescrever qualquer placar; a sobrescrita manual tem **prioridade** sobre a API (`resultadoFonte = manual` não é revertido pelo polling).
- **Plano B documentado (não construir na v1):** se o teto de 100/dia apertar, trocar/duplicar a fonte por **football-data.org free** (10 req/min, sem teto diário, cobre a Copa). Mantido como contingência, fora do escopo de implementação inicial (YAGNI).
- **Segurança da rota:** `/api/poll-scores` é pública (chamada por serviço externo), então exige um **token secreto** (header/query) validado no servidor.

---

## 10. Fora de escopo na v1 (registrado para depois)

- Prêmios FIFA (campeão, artilheiro, luvas, bola de ouro).
- Palpites de posição de grupo (1º/2º/3º) e "sorteio aleatório" por grupo.
- Multiplicadores de fase.
- Split do prêmio por colocação (top 3 etc.) — v1 é vencedor-leva-tudo.
- **Placar provisório em tempo real (in-play):** adiciona custo/cota sem alterar pontuação (que é sobre placar final).
- PIX automatizado (recebimento via webhook PSP e/ou repasse via API).
- Notificações push/e-mail de lembrete de deadline.
- WebSocket para ranking ao vivo (polling basta na v1).
- Badges/medalhas de gamificação.
- Construção da fonte football-data.org (mantida só como Plano B).

---

## 11. Riscos e pontos de atenção

- **Jurídico/fiscal (PIX):** mitigado mantendo o app fora da custódia; ainda assim, recomendado validar com contador.
- **Cota da API-Football (100/dia):** mitigado por polling só em janela de jogo + cache + fallback manual; Plano B (football-data.org) documentado.
- **Dependência do agendador externo:** se cron-job.org falhar, placares atrasam; mitigado pelo **fallback manual** do admin (pode lançar o placar na mão a qualquer momento).
- **Fairness:** garantido por palpites ocultos + lock por deadline imposto no servidor + timestamps de auditoria.
- **Privacidade:** coletar o mínimo (e-mail e nome); não armazenar dados sensíveis nem de pagamento.

---

## 12. Próximo passo no workflow Superpowers

Com este design aprovado, a etapa seguinte é **writing-plans**: quebrar em tarefas de 2–5 min com caminhos de arquivo exatos, código e passos de verificação, seguidas de **TDD** (RED-GREEN-REFACTOR) e revisão entre tarefas. Ordem de implementação sugerida:
1. Auth (magic link) + modelo de dados (Prisma).
2. Criar/entrar em bolão (inviteCode, valorEntrada, chavePix).
3. Palpites + lock por deadline (validação server-side em UTC).
4. Sync de fixtures/teams + rota `/api/poll-scores` (token) + recálculo de pontos.
5. Ranking + desempate.
6. Admin + PIX semi-manual (confirmar pagamento, ganhador/prêmio, override de resultado).
7. Bracket de mata-mata.

---

## 13. Fatos verificados (pesquisa de 2026-05-31)

**Vercel Cron no plano Hobby/free — confiança: verificada.** Limitado a **1 execução/dia**; qualquer expressão sub-diária **falha no deploy** ("Hobby accounts are limited to daily cron jobs."), e a precisão é horária (±59 min). Polling de minutos só no **Pro** (pago). Por isso a v1 usa **agendador externo**.
Fontes: <https://vercel.com/docs/cron-jobs/usage-and-pricing> (atualizado 2026-03-04), <https://vercel.com/docs/cron-jobs>.

**API-Football free — confiança: alta.** Cobre a Copa 2026 (`league=1, season=2026`): fixtures (104 jogos), teams, e placares via `fixtures?live=all`. Sem paywall de cobertura. Gargalo real = **100 req/dia** (reseta 00:00 UTC); polling de 1 em 1 min é inviável no free. Solução: buscar **encerrados** a cada ~10–15 min só em janela de jogo.
Fontes: <https://www.api-football.com/pricing>, <https://www.api-football.com/news/post/how-ratelimit-works>, guia oficial WC2026 <https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports>.

**Alternativa free (Plano B) — football-data.org:** 10 req/min, **sem teto diário**, cobre a Copa (fixtures/resultados/tabela).
Fonte: <https://docs.football-data.org/general/v4/policies.html>, <https://www.football-data.org/pricing>.
