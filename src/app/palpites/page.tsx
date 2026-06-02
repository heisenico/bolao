import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isMatchLocked } from "@/domain/deadline";
import { getCurrentMembership } from "@/server/pools";
import { getVisiblePredictions } from "@/server/predictions";
import { Flag } from "@/components/Flag";
import { Button } from "@/components/Button";
import { AppNav } from "@/components/AppNav";
import { savePalpiteAction } from "./actions";

export default async function PalpitesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const session = await requireSession();

  const membership = await getCurrentMembership(session.user.id);
  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-10">
        <AppNav />
        <h1 className="text-2xl font-bold">Palpites</h1>
        <p>Você ainda não entrou em um bolão.</p>
        <a href="/pools/new" className="text-accent-strong underline">
          Criar um bolão
        </a>
      </main>
    );
  }

  const now = new Date();

  // Current phase = the earliest phase that still has an unfinished match.
  const upcoming = await prisma.match.findFirst({
    where: { status: { in: ["agendada", "ao_vivo"] } },
    orderBy: { dataHora: "asc" },
  });
  const currentPhase = upcoming?.fase ?? "grupos";

  const matches = await prisma.match.findMany({
    where: { fase: currentPhase },
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

  // For locked matches, reveal every member's prediction (contract §6 reveal-after-lock).
  // getVisiblePredictions returns only the viewer's own row while the match is open,
  // so this map is non-empty (beyond the viewer) only once a match has locked.
  const lockedMatches = matches.filter((m) => isMatchLocked(m.dataHora, now));
  const revealedByMatch = new Map<
    string,
    {
      membershipId: string;
      nome: string;
      palpiteHome: number;
      palpiteAway: number;
    }[]
  >();
  // Run the per-match reveal queries concurrently (still via getVisiblePredictions,
  // so the reveal-after-lock rule is preserved), then resolve all member names in a
  // single batched query instead of one findMany per match.
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
    revealedByMatch.set(
      m.id,
      visibleByMatch[i].map((p) => ({
        membershipId: p.membershipId,
        nome: nameById.get(p.membershipId) ?? "Participante",
        palpiteHome: p.palpiteHome,
        palpiteAway: p.palpiteAway,
      }))
    );
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav />
      <h1 className="text-2xl font-bold">Palpites — fase {currentPhase}</h1>
      {erro === "travado" ? (
        <p
          role="alert"
          className="rounded-md bg-surface-muted p-3 text-sm text-danger"
        >
          Jogo travado: o prazo para palpitar já encerrou.
        </p>
      ) : null}

      {matches.length === 0 ? (
        <p>Nenhum jogo nesta fase ainda.</p>
      ) : (
        matches.map((m) => {
          const locked = isMatchLocked(m.dataHora, now);
          const pred = byMatch.get(m.id);
          const revealed = revealedByMatch.get(m.id) ?? [];
          return (
            <form
              key={m.id}
              action={savePalpiteAction}
              className="flex flex-col gap-2 rounded-md border border-border p-4"
            >
              <input type="hidden" name="poolId" value={membership.poolId} />
              <input type="hidden" name="matchId" value={m.id} />
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <Flag
                    codigoPais={m.homeTeam.codigoPais}
                    bandeira={m.homeTeam.bandeira}
                    className="h-4 w-6 shrink-0 object-cover"
                  />
                  <span className="truncate">{m.homeTeam.nome}</span>
                </span>
                <input
                  name="palpiteHome"
                  type="number"
                  min={0}
                  defaultValue={pred?.palpiteHome ?? ""}
                  disabled={locked}
                  aria-label={`Placar de ${m.homeTeam.nome}`}
                  className="w-14 rounded-md border border-border px-2 py-1 text-center"
                />
                <span>x</span>
                <input
                  name="palpiteAway"
                  type="number"
                  min={0}
                  defaultValue={pred?.palpiteAway ?? ""}
                  disabled={locked}
                  aria-label={`Placar de ${m.awayTeam.nome}`}
                  className="w-14 rounded-md border border-border px-2 py-1 text-center"
                />
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <span className="truncate">{m.awayTeam.nome}</span>
                  <Flag
                    codigoPais={m.awayTeam.codigoPais}
                    bandeira={m.awayTeam.bandeira}
                    className="h-4 w-6 shrink-0 object-cover"
                  />
                </span>
              </div>
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
                {locked ? (
                  <span className="text-ink-muted">travado</span>
                ) : (
                  <Button type="submit">Salvar</Button>
                )}
              </div>

              {locked ? (
                <section className="mt-1 flex flex-col gap-1 border-t border-surface-muted pt-2 text-sm">
                  <h2 className="font-semibold text-ink-soft">
                    Palpites dos participantes
                  </h2>
                  {revealed.length === 0 ? (
                    <p className="text-ink-muted">
                      Ninguém palpitou neste jogo.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {revealed.map((r) => (
                        <li
                          key={r.membershipId}
                          className="flex items-center justify-between"
                        >
                          <span className="text-ink-soft">
                            {r.nome}
                            {r.membershipId === membership.id ? " (você)" : ""}
                          </span>
                          <span className="font-semibold">
                            {r.palpiteHome} x {r.palpiteAway}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </form>
          );
        })
      )}
    </main>
  );
}
