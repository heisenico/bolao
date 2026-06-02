import type { MatchStatus, PaymentStatus } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { getAdminPool, OwnershipError } from "@/server/admin";
import { prizeSummary } from "@/server/payments";
import { getMatchesForAdmin, type AdminMatch } from "@/server/results";
import { env } from "@/lib/env";
import { inviteUrl, whatsappShareUrl } from "@/domain/share";
import { formatCentsBRL } from "@/lib/money";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { SubmitButton } from "@/components/SubmitButton";
import { AppNav } from "@/components/AppNav";
import {
  applyResultAction,
  cancelMatchAction,
  confirmPaymentAction,
  removeMemberAction,
  syncFixturesAction,
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
          <AppNav />
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
      <AppNav />
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

      {/* Prize summary (winner-takes-all, CONTRACT §4) */}
      <section className="rounded-lg border border-border bg-surface-soft p-4">
        <h2 className="text-lg font-bold">Prêmio</h2>
        <p className="mt-1 text-2xl font-bold text-accent">{formatCentsBRL(summary.total)}</p>
        <p className="text-sm text-ink-muted break-words">
          Ganhador atual: {summary.winner ? summary.winner.nome : "—"}
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

      {/* Members + payments (CONTRACT §7) */}
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-bold">Participantes</h2>
        <ul className="mt-3 divide-y divide-surface-muted">
          {pool.memberships.map((m) => (
            <li key={m.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-words text-sm">
                {m.user.name ?? m.user.email}
                <span className="ml-2 text-xs text-ink-muted">[{PAYMENT_STATUS_LABEL[m.paymentStatus]}]</span>
              </span>
              <span className="flex gap-2">
                {m.paymentStatus !== "confirmado" && (
                  <form action={confirmPaymentAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton pendingLabel="Confirmando...">Confirmar pagamento</SubmitButton>
                  </form>
                )}
                {m.userId !== pool.ownerId && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <SubmitButton variant="danger" pendingLabel="Removendo...">
                      Remover
                    </SubmitButton>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
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
