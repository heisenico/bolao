import type { MatchPhase, Prediction } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  KNOCKOUT_OPENS_AT_UTC,
  isKnockoutNotYetOpen,
  isMatchLocked,
  isPredictionOpen,
} from "@/domain/deadline";
import { getMembership } from "@/server/pools";
import { getVisiblePredictions } from "@/server/predictions";
import { Flag } from "@/components/Flag";
import { PalpiteRow } from "@/components/PalpiteRow";
import { AppNav } from "@/components/AppNav";

const PHASE_ORDER: MatchPhase[] = [
  "grupos",
  "r32",
  "oitavas",
  "quartas",
  "semi",
  "terceiro",
  "final",
];

// Same naming convention as the Bracket's PHASE_LABEL.
const PHASE_LABEL: Record<MatchPhase, string> = {
  grupos: "Fase de grupos",
  r32: "32 avos",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  terceiro: "3º lugar",
  final: "Final",
};

type MatchWithTeams = Awaited<
  ReturnType<
    typeof prisma.match.findMany<{
      include: { homeTeam: true; awayTeam: true };
    }>
  >
>[number];

/** Display-only match header (teams + score inputs disabled), for locked rows. */
function LockedMatchCard({
  match,
  pred,
  children,
}: {
  match: MatchWithTeams;
  pred: Prediction | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <Flag
            codigoPais={match.homeTeam.codigoPais}
            bandeira={match.homeTeam.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
          <span className="truncate">{match.homeTeam.nome}</span>
        </span>
        <input
          type="number"
          inputMode="numeric"
          defaultValue={pred?.palpiteHome ?? ""}
          disabled
          aria-label={`Placar de ${match.homeTeam.nome}`}
          className="w-14 rounded-md border border-border px-2 py-1 text-center"
        />
        <span>x</span>
        <input
          type="number"
          inputMode="numeric"
          defaultValue={pred?.palpiteAway ?? ""}
          disabled
          aria-label={`Placar de ${match.awayTeam.nome}`}
          className="w-14 rounded-md border border-border px-2 py-1 text-center"
        />
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{match.awayTeam.nome}</span>
          <Flag
            codigoPais={match.awayTeam.codigoPais}
            bandeira={match.awayTeam.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
        </span>
      </div>
      {children}
    </div>
  );
}

export default async function PalpitesPage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { poolId } = await params;
  const { erro } = await searchParams;
  const session = await requireSession();

  // Membership guard: only members of this pool may predict in it.
  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const now = new Date();
  const knockoutWindowOpen = now.getTime() >= KNOCKOUT_OPENS_AT_UTC.getTime();

  // Current phase = the earliest phase that still has an unfinished match.
  const upcoming = await prisma.match.findFirst({
    where: { status: { in: ["agendada", "ao_vivo"] } },
    orderBy: { dataHora: "asc" },
  });
  const currentPhase = upcoming?.fase ?? "grupos";

  // Visible phases: the current one, plus every later knockout phase once the
  // Block B window is open — the knockout picks open on 20/06 while the group
  // stage is still running, so both must show at once. Earlier (finished)
  // phases drop off, as before.
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const candidatePhases = PHASE_ORDER.filter((fase, idx) => {
    if (idx < currentIdx) return false;
    if (fase === currentPhase) return true;
    return fase !== "grupos" && knockoutWindowOpen;
  });

  const matches = await prisma.match.findMany({
    where: { fase: { in: candidatePhases } },
    orderBy: { dataHora: "asc" },
    include: { homeTeam: true, awayTeam: true },
  });

  const predictions = await prisma.prediction.findMany({
    where: {
      membershipId: membership.id,
      matchId: { in: matches.map((m) => m.id) },
    },
  });
  const byMatch = new Map(predictions.map((p) => [p.matchId, p]));

  // For locked matches, reveal every member's prediction (contract §6
  // reveal-after-lock). Every match locks 10 minutes before its own kickoff.
  const lockedMatches = matches.filter((m) =>
    isMatchLocked(m.fase, m.dataHora, now)
  );
  const revealedByMatch = new Map<
    string,
    {
      membershipId: string;
      nome: string;
      palpiteHome: number;
      palpiteAway: number;
      palpiteAutomatico: boolean;
    }[]
  >();
  const visibleByMatch = await Promise.all(
    lockedMatches.map((m) => getVisiblePredictions(m.id, membership.id, now))
  );
  const allMembershipIds = [
    ...new Set(visibleByMatch.flat().map((p) => p.membershipId)),
  ];
  const members = await prisma.poolMembership.findMany({
    where: { id: { in: allMembershipIds } },
    include: { user: true },
  });
  const nameById = new Map(
    members.map((mem) => [
      mem.id,
      mem.user.name ?? mem.user.email ?? "Participante",
    ])
  );
  lockedMatches.forEach((m, i) => {
    // getVisiblePredictions already scopes the reveal to this pool's members.
    revealedByMatch.set(
      m.id,
      visibleByMatch[i].map((p) => ({
        membershipId: p.membershipId,
        nome: nameById.get(p.membershipId) ?? "Participante",
        palpiteHome: p.palpiteHome,
        palpiteAway: p.palpiteAway,
        palpiteAutomatico: p.palpiteAutomatico,
      }))
    );
  });

  const phaseSections = candidatePhases
    .map((fase) => ({
      fase,
      matches: matches.filter((m) => m.fase === fase),
    }))
    .filter((s) => s.matches.length > 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav poolId={poolId} />
      <h1 className="text-2xl font-bold">Palpites</h1>
      {erro === "travado" ? (
        <p
          role="alert"
          className="rounded-md bg-surface-muted p-3 text-sm text-danger"
        >
          Jogo travado: o prazo para palpitar já encerrou.
        </p>
      ) : null}

      {phaseSections.length === 0 ? (
        <p>
          Nenhum jogo nesta fase ainda. Os jogos aparecem assim que o
          organizador sincroniza a tabela.
        </p>
      ) : (
        phaseSections.map(({ fase, matches: phaseMatches }) => (
          <section key={fase} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{PHASE_LABEL[fase]}</h2>

            {phaseMatches.map((m) => {
              const open = isPredictionOpen(m.fase, m.dataHora, now);
              const pred = byMatch.get(m.id);

              if (open) {
                return (
                  <PalpiteRow
                    key={m.id}
                    poolId={poolId}
                    matchId={m.id}
                    grupo={m.homeTeam.grupo}
                    home={{
                      nome: m.homeTeam.nome,
                      codigoPais: m.homeTeam.codigoPais,
                      bandeira: m.homeTeam.bandeira,
                    }}
                    away={{
                      nome: m.awayTeam.nome,
                      codigoPais: m.awayTeam.codigoPais,
                      bandeira: m.awayTeam.bandeira,
                    }}
                    hasPrediction={!!pred}
                    defaultHome={pred?.palpiteHome ?? null}
                    defaultAway={pred?.palpiteAway ?? null}
                  />
                );
              }

              // Knockout match before the Block B window: visible, not editable
              // yet, nothing to reveal (nobody could have picked).
              if (isKnockoutNotYetOpen(m.fase, now)) {
                return (
                  <LockedMatchCard key={m.id} match={m} pred={pred}>
                    <p className="text-sm text-ink-muted">
                      Palpites do mata-mata abrem em 20/06 (00h, horário de
                      Brasília).
                    </p>
                  </LockedMatchCard>
                );
              }

              // Locked match: display-only (no submit), with the reveal of every
              // member's prediction (contract §6 reveal-after-lock).
              const revealed = revealedByMatch.get(m.id) ?? [];
              return (
                <LockedMatchCard key={m.id} match={m} pred={pred}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className={pred ? "text-accent-strong" : "text-ink-muted"}
                      >
                        {pred ? "feito" : "pendente"}
                      </span>
                      {m.homeTeam.grupo ? (
                        <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                          Grupo {m.homeTeam.grupo}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink-muted">travado</span>
                  </div>

                  <section className="mt-1 flex flex-col gap-1 border-t border-surface-muted pt-2 text-sm">
                    <h3 className="font-semibold text-ink-soft">
                      Palpites dos participantes
                    </h3>
                    {revealed.length === 0 ? (
                      <p className="text-ink-muted">
                        Ninguém palpitou neste jogo.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {revealed.map((r) => (
                          <li
                            key={r.membershipId}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="min-w-0 break-words text-ink-soft">
                              {r.nome}
                              {r.membershipId === membership.id ? " (você)" : ""}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 font-semibold">
                              {r.palpiteAutomatico ? (
                                <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-normal text-ink-muted">
                                  automático
                                </span>
                              ) : null}
                              {r.palpiteHome} x {r.palpiteAway}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </LockedMatchCard>
              );
            })}
          </section>
        ))
      )}
    </main>
  );
}
