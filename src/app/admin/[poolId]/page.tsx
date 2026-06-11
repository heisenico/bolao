import type { MatchStatus, PaymentStatus } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAdminPool, OwnershipError } from "@/server/admin";
import { prizeSummary } from "@/server/payments";
import { getMatchesForAdmin, type AdminMatch } from "@/server/results";
import { getPrizeResults } from "@/server/prizes";
import { getDeadlineContext } from "@/server/deadlines";
import { isBlockAOpen } from "@/domain/deadline";
import { env } from "@/lib/env";
import { inviteUrl, whatsappShareUrl } from "@/domain/share";
import {
  PRIZE_LABEL,
  PRIZE_POINTS,
  PRIZE_TYPES,
  TEAM_PRIZE_TYPES,
} from "@/domain/awards";
import { formatCentsBRL } from "@/lib/money";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { SubmitButton } from "@/components/SubmitButton";
import { AppNav } from "@/components/AppNav";
import {
  applyPrizeResultAction,
  applyResultAction,
  cancelMatchAction,
  confirmPaymentAction,
  removeMemberAction,
  revertPaymentAction,
  syncFixturesAction,
  updatePoolPaymentAction,
} from "./actions";

export const dynamic = "force-dynamic";

// Readable pt-BR labels for the raw enum values so the UI never shows the
// underscore form (e.g. "ao_vivo"). Keyed by the Prisma enum, so adding a new
// status is a compile error here.
const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  agendada: "agendada",
  ao_vivo: "ao vivo",
  encerrada: "encerrada",
  adiada: "adiada",
  cancelada: "cancelada",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendente: "pendente",
  pago: "pago",
  confirmado: "confirmado",
};

function formatSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Dropdown label: date — Home vs Away — status/score, so an owner can find the
// right match among 72+ (SPEC §9). Includes the current score once played.
function matchOptionLabel(m: AdminMatch): string {
  const score =
    m.placarHome != null && m.placarAway != null
      ? ` (${m.placarHome}×${m.placarAway})`
      : "";
  return `${formatSaoPaulo(m.dataHora)} — ${m.homeNome} vs ${m.awayNome} — ${MATCH_STATUS_LABEL[m.status]}${score}`;
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const session = await requireSession();
  const { poolId } = await params;

  // Owner-only screen: a non-owner gets a clear "não autorizado" state, never a
  // raw crash (CONTRACT §6, SPEC §8.7). getAdminPool throws OwnershipError for a
  // caller who does not own the pool.
  let pool: Awaited<ReturnType<typeof getAdminPool>>;
  try {
    pool = await getAdminPool(poolId, session.user.id);
  } catch (err) {
    if (err instanceof OwnershipError) {
      return (
        <main className="mx-auto max-w-md px-4 py-10">
          <AppNav poolId={poolId} />
          <div className="rounded-lg border border-border bg-surface-soft p-6 text-center">
            <h1 className="text-2xl font-bold">Não autorizado</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Apenas o organizador do bolão pode acessar a administração.
            </p>
            <a href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-accent-strong underline">
              Voltar ao início
            </a>
          </div>
        </main>
      );
    }
    throw err;
  }

  const summary = await prizeSummary(poolId);
  // ALL matches (group stage included) so the manual fallback works from the
  // tournament's start, not just the knockout phases (SPEC §9). The Bracket
  // keeps using getKnockoutMatches.
  const matches = await getMatchesForAdmin();
  const prizeResults = await getPrizeResults();
  const resultByType = new Map(prizeResults.map((r) => [r.prizeType, r]));
  const teams = await prisma.team.findMany({ orderBy: { nome: "asc" } });

  const { openingKickoffUtc } = await getDeadlineContext();
  const blockAOpen = isBlockAOpen(openingKickoffUtc, new Date());

  // Payment triage groups (the creator's checklist). The owner's own
  // membership is auto-confirmed and carries no actions.
  const isPaidPool = pool.valorEntrada > 0;
  const reported = pool.memberships.filter((m) => m.paymentStatus === "pago");
  const pending = pool.memberships.filter(
    (m) => m.paymentStatus === "pendente"
  );
  const confirmed = pool.memberships.filter(
    (m) => m.paymentStatus === "confirmado"
  );
  const memberName = (m: (typeof pool.memberships)[number]) =>
    m.user.name ?? m.user.email ?? "Participante";

  // Shared <option> list: the result form and the cancel form both pick from
  // the same set of matches, so build the elements once and reuse them.
  const matchOptions = matches.map((m) => (
    <option key={m.id} value={m.id}>
      {matchOptionLabel(m)}
    </option>
  ));

  const join = inviteUrl(env.authUrl(), pool.inviteCode);
  const whatsapp = whatsappShareUrl(`Entra no bolão ${pool.nome}!`, join);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <AppNav poolId={poolId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold break-words">Admin — {pool.nome}</h1>
        {/* Owner-only fixtures sync (CONTRACT §11.6) */}
        <form action={syncFixturesAction}>
          <input type="hidden" name="poolId" value={poolId} />
          <SubmitButton variant="secondary" pendingLabel="Sincronizando...">
            Sincronizar jogos
          </SubmitButton>
        </form>
      </div>

      {/* Prize summary: top 3 humans split 60/30/10, cascading past AIs */}
      <section className="rounded-lg border border-border bg-surface-soft p-4">
        <h2 className="text-lg font-bold">Prêmio</h2>
        <p className="mt-1 text-2xl font-bold text-accent">{formatCentsBRL(summary.total)}</p>
        {summary.winners.length === 0 ? (
          <p className="text-sm text-ink-muted">Premiados atuais: —</p>
        ) : (
          <ol className="mt-1 flex flex-col gap-0.5 text-sm text-ink-muted">
            {summary.winners.map((w) => (
              <li key={w.membershipId} className="break-words">
                {w.humanPrizeRank}º {w.nome} — {w.prizePct}% (
                {formatCentsBRL(Math.round((summary.total * (w.prizePct ?? 0)) / 100))})
              </li>
            ))}
          </ol>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          Participantes IA pontuam no ranking, mas não concorrem ao prêmio. O
          pagamento é feito por PIX, fora do app.
        </p>
      </section>

      {/* Manual result form (CONTRACT §11.1) */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Registrar/corrigir resultado</h2>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Nenhum jogo disponível ainda. Sincronize os jogos.
          </p>
        ) : (
          <form action={applyResultAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="poolId" value={poolId} />
            <label className="flex flex-col text-sm">
              Jogo
              <select name="matchId" className="rounded-md border border-border p-2" required>
                {matchOptions}
              </select>
            </label>
            <label className="flex flex-col text-sm">
              Casa
              <input
                type="number"
                name="placarHome"
                min={0}
                max={99}
                step={1}
                inputMode="numeric"
                required
                className="w-16 rounded-md border border-border p-2"
              />
            </label>
            <label className="flex flex-col text-sm">
              Fora
              <input
                type="number"
                name="placarAway"
                min={0}
                max={99}
                step={1}
                inputMode="numeric"
                required
                className="w-16 rounded-md border border-border p-2"
              />
            </label>
            <SubmitButton pendingLabel="Salvando...">Salvar resultado</SubmitButton>
          </form>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          W.O.: registre o 3×0 oficial aqui como resultado manual normal (CONTRACT §11.8).
        </p>
      </section>

      {/* Cancel a match (status cancelada, void points — CONTRACT §11.8) */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Cancelar jogo</h2>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhum jogo disponível ainda.</p>
        ) : (
          <form action={cancelMatchAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="poolId" value={poolId} />
            <label className="flex flex-col text-sm">
              Jogo
              <select name="matchId" className="rounded-md border border-border p-2" required>
                {matchOptions}
              </select>
            </label>
            <SubmitButton variant="danger" pendingLabel="Cancelando...">
              Cancelar jogo
            </SubmitButton>
          </form>
        )}
      </section>

      {/* FIFA prize settlement: admin-manual after official confirmation. The
          result is GLOBAL (shared across pools), like match results. */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Apurar prêmios da Copa</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Registre o resultado oficial da FIFA. Todos os palpites certos ganham
          os pontos na hora; reenviar corrige a apuração.
        </p>
        <ul className="mt-3 flex flex-col gap-4">
          {PRIZE_TYPES.map((prizeType) => {
            const confirmed = resultByType.get(prizeType);
            return (
              <li key={prizeType}>
                <form
                  action={applyPrizeResultAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="prizeType" value={prizeType} />
                  <label className="flex min-w-0 grow flex-col text-sm">
                    {PRIZE_LABEL[prizeType]} ({PRIZE_POINTS[prizeType]} pts)
                    {TEAM_PRIZE_TYPES.includes(prizeType) ? (
                      <select
                        name="value"
                        required
                        defaultValue={confirmed?.value ?? ""}
                        className="rounded-md border border-border p-2"
                      >
                        <option value="" disabled>
                          Escolha a seleção
                        </option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.nome}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name="value"
                        required
                        maxLength={80}
                        defaultValue={confirmed?.value ?? ""}
                        placeholder="Nome do jogador"
                        className="rounded-md border border-border p-2"
                      />
                    )}
                  </label>
                  <SubmitButton pendingLabel="Apurando...">
                    {confirmed ? "Corrigir" : "Confirmar"}
                  </SubmitButton>
                </form>
                <p className="mt-1 text-xs text-ink-muted">
                  {confirmed
                    ? `Apurado: ${confirmed.value}`
                    : "Aguardando apuração."}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pix payment triage (Addendum 1): reported first (action needed),
          then pending, then confirmed. Status is private — only this screen
          and each member's own banner ever show it. */}
      {isPaidPool ? (
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-lg font-bold">
            Pagamentos
            {reported.length > 0 ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                {reported.length} a confirmar
              </span>
            ) : null}
          </h2>

          {reported.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-sm font-semibold">Avisaram que pagaram</h3>
              <p className="mt-1 text-xs text-ink-muted">
                Confira no extrato do seu banco se o PIX caiu antes de
                confirmar — o app não consegue verificar a transferência.
              </p>
              <ul className="mt-2 divide-y divide-surface-muted">
                {reported.map((m) => (
                  <li
                    key={m.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 break-words text-sm">
                      {memberName(m)}
                      {m.pagamentoReportadoEm ? (
                        <span className="ml-2 text-xs text-ink-muted">
                          avisou em {formatSaoPaulo(m.pagamentoReportadoEm)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-2">
                      <form action={confirmPaymentAction}>
                        <input type="hidden" name="poolId" value={poolId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <SubmitButton pendingLabel="Confirmando...">
                          Confirmar
                        </SubmitButton>
                      </form>
                      <form action={revertPaymentAction}>
                        <input type="hidden" name="poolId" value={poolId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <SubmitButton variant="secondary" pendingLabel="Revertendo...">
                          Marcar como não pago
                        </SubmitButton>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <h3 className="text-sm font-semibold">Ainda não pagaram</h3>
            {pending.length === 0 ? (
              <p className="mt-1 text-sm text-ink-muted">Ninguém pendente. 🎉</p>
            ) : (
              <ul className="mt-2 divide-y divide-surface-muted">
                {pending.map((m) => (
                  <li
                    key={m.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 break-words text-sm">{memberName(m)}</span>
                    {/* Cheap shortcut: confirm directly someone who paid but
                        forgot to tap "já paguei". */}
                    <form action={confirmPaymentAction}>
                      <input type="hidden" name="poolId" value={poolId} />
                      <input type="hidden" name="membershipId" value={m.id} />
                      <SubmitButton variant="secondary" pendingLabel="Confirmando...">
                        Confirmar mesmo assim
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold">Confirmados</h3>
            {confirmed.length === 0 ? (
              <p className="mt-1 text-sm text-ink-muted">Nenhum ainda.</p>
            ) : (
              <ul className="mt-2 divide-y divide-surface-muted">
                {confirmed.map((m) => (
                  <li
                    key={m.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 break-words text-sm">
                      {memberName(m)}
                      {m.userId === pool.ownerId ? (
                        <span className="ml-2 text-xs text-ink-muted">
                          (você, organizador)
                        </span>
                      ) : null}
                    </span>
                    {m.userId !== pool.ownerId ? (
                      <form action={revertPaymentAction}>
                        <input type="hidden" name="poolId" value={poolId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <SubmitButton variant="secondary" pendingLabel="Revertendo...">
                          Marcar como não pago
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-border p-4">
          <h2 className="text-lg font-bold">Pagamentos</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Bolão sem valor de entrada — sem controle de pagamentos.
          </p>
        </section>
      )}

      {/* Entry fee / Pix key editing — only while Block A is open. */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Entrada e PIX</h2>
        {blockAOpen ? (
          <form
            action={updatePoolPaymentAction}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="poolId" value={poolId} />
            <label className="flex flex-col text-sm">
              Valor de entrada (R$)
              <input
                type="text"
                name="valorEntrada"
                inputMode="decimal"
                pattern="\d+([.,]\d{1,2})?"
                defaultValue={(pool.valorEntrada / 100).toFixed(2).replace(".", ",")}
                className="w-28 rounded-md border border-border p-2"
              />
            </label>
            <label className="flex min-w-0 grow flex-col text-sm">
              Chave PIX
              <input
                type="text"
                name="chavePix"
                maxLength={140}
                defaultValue={pool.chavePix ?? ""}
                placeholder="vazio em bolão sem entrada"
                className="rounded-md border border-border p-2"
              />
            </label>
            <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
            <p className="w-full text-xs text-ink-muted">
              Editável até 1h antes da abertura. Quem ainda não pagou passa a
              ver os novos valores.
            </p>
          </form>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">
            O Bloco A encerrou — valor de entrada e chave PIX não mudam mais
            ({formatCentsBRL(pool.valorEntrada)}
            {pool.chavePix ? ` · ${pool.chavePix}` : ""}).
          </p>
        )}
      </section>

      {/* Members (CONTRACT §7). Removal only while Block A is open — late
          entry is forbidden, so a removal after lock could not be undone. */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Participantes</h2>
        <ul className="mt-3 divide-y divide-surface-muted">
          {pool.memberships.map((m) => (
            <li key={m.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-words text-sm">
                {memberName(m)}
                <span className="ml-2 text-xs text-ink-muted">[{PAYMENT_STATUS_LABEL[m.paymentStatus]}]</span>
              </span>
              {m.userId !== pool.ownerId && blockAOpen && (
                <form action={removeMemberAction}>
                  <input type="hidden" name="poolId" value={poolId} />
                  <input type="hidden" name="membershipId" value={m.id} />
                  <SubmitButton variant="danger" pendingLabel="Removendo...">
                    Remover
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        {!blockAOpen ? (
          <p className="mt-2 text-xs text-ink-muted">
            Remoções encerraram junto com o Bloco A.
          </p>
        ) : null}
      </section>

      {/* Invite / share (CONTRACT §8 admin invite section) */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Convidar</h2>
        <p className="mt-2 break-all text-sm text-ink-muted">{join}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyLinkButton url={join} />
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-semibold text-ink"
          >
            Compartilhar no WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
