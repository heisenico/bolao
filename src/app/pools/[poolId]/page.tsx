import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  LOCK_LEAD_MS,
  isKnockoutNotYetOpen,
  isMatchLocked,
} from "@/domain/deadline";
import { getMembership } from "@/server/pools";
import { getDeadlineContext } from "@/server/deadlines";
import { Flag } from "@/components/Flag";
import { AppNav } from "@/components/AppNav";
import { AutoRefresh } from "@/components/AutoRefresh";

function formatSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function PoolDashboardPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const session = await requireSession();

  // Membership guard: only members of this pool may view it. A non-member (or a
  // bad poolId) is sent back to their list instead of seeing another pool's data.
  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { nome: true, ownerId: true, valorEntrada: true },
  });
  if (!pool) redirect("/dashboard");

  const isOwner = pool.ownerId === session.user.id;
  const now = new Date();
  const { openingKickoffUtc } = await getDeadlineContext();

  // Creator's attention badge: how many members reported a Pix and await
  // confirmation. Members never see each other's payment status.
  const aConfirmar = isOwner
    ? await prisma.poolMembership.count({
        where: { poolId, paymentStatus: "pago" },
      })
    : 0;
  const showPaymentBanner =
    pool.valorEntrada > 0 && membership.paymentStatus !== "confirmado";

  const nextMatches = await prisma.match.findMany({
    where: { status: { in: ["agendada", "ao_vivo"] } },
    orderBy: { dataHora: "asc" },
    take: 5,
    include: { homeTeam: true, awayTeam: true },
  });

  const predictions = await prisma.prediction.findMany({
    where: {
      membershipId: membership.id,
      matchId: { in: nextMatches.map((m) => m.id) },
    },
  });
  const predicted = new Set(predictions.map((p) => p.matchId));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav poolId={poolId} />
      <AutoRefresh />
      <h1 className="text-2xl font-bold break-words">{pool.nome}</h1>

      {/* Payment nudge (private to the member): yellow while pendente, neutral
          blue once reported; gone after the organizer confirms. */}
      {showPaymentBanner ? (
        membership.paymentStatus === "pendente" ? (
          <a
            href={`/pools/${poolId}/pagamento`}
            data-payment-banner="pendente"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
          >
            💸 Pagamento pendente — toque para ver o PIX
          </a>
        ) : (
          <a
            href={`/pools/${poolId}/pagamento`}
            data-payment-banner="pago"
            className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
          >
            ⏳ Pagamento informado — aguardando confirmação do organizador.
          </a>
        )
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Próximos jogos</h2>
        {nextMatches.length === 0 ? (
          <p>
            Nenhum jogo agendado ainda. Eles aparecem assim que o organizador
            sincroniza a tabela.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {nextMatches.map((m) => {
              const locked = isMatchLocked(
                m.fase,
                m.dataHora,
                openingKickoffUtc,
                now
              );
              // The real edit deadline: group matches lock together at Block A
              // close (opening kickoff - 1h); knockout 1h before own kickoff.
              const deadline =
                m.fase === "grupos" && openingKickoffUtc
                  ? new Date(openingKickoffUtc.getTime() - LOCK_LEAD_MS)
                  : new Date(m.dataHora.getTime() - LOCK_LEAD_MS);
              const notYetOpen = isKnockoutNotYetOpen(m.fase, now);
              const done = predicted.has(m.id);
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-1 rounded-md border border-border p-4"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex min-w-0 items-center gap-2">
                      <Flag
                        codigoPais={m.homeTeam.codigoPais}
                        bandeira={m.homeTeam.bandeira}
                        className="h-4 w-6 shrink-0 object-cover"
                      />
                      <span className="min-w-0 truncate">{m.homeTeam.nome}</span>
                    </span>
                    <span>x</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate">{m.awayTeam.nome}</span>
                      <Flag
                        codigoPais={m.awayTeam.codigoPais}
                        bandeira={m.awayTeam.bandeira}
                        className="h-4 w-6 shrink-0 object-cover"
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-ink-soft">
                    <span>Jogo: {formatSaoPaulo(m.dataHora)}</span>
                    <span>Prazo: {formatSaoPaulo(deadline)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={done ? "text-accent-strong" : "text-ink-muted"}
                    >
                      {done ? "palpite feito" : "palpite pendente"}
                    </span>
                    <span className="text-ink-muted">
                      {locked
                        ? "travado"
                        : notYetOpen
                          ? "abre 20/06"
                          : "aberto"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <a
          href={`/pools/${poolId}/palpites`}
          className="text-accent-strong underline"
        >
          Fazer/editar palpites
        </a>
        {isOwner ? (
          <>
            <a
              href={`/pools/${poolId}/convite`}
              className="text-accent-strong underline"
            >
              Convite e código do bolão
            </a>
            <a
              href={`/admin/${poolId}`}
              className="inline-flex items-center gap-2 text-accent-strong underline"
            >
              Administrar bolão
              {aConfirmar > 0 ? (
                <span
                  data-badge="a-confirmar"
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 no-underline"
                >
                  {aConfirmar} pagamento{aConfirmar > 1 ? "s" : ""} a confirmar
                </span>
              ) : null}
            </a>
          </>
        ) : null}
      </div>
    </main>
  );
}
