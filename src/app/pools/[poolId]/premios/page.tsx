import type { PrizeType } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  PRIZE_LABEL,
  PRIZE_POINTS,
  PRIZE_TYPES,
  TEAM_PRIZE_TYPES,
  prizeValuesMatch,
} from "@/domain/awards";
import { isPrizePredictionOpen, KNOCKOUT_OPENS_AT_UTC } from "@/domain/deadline";
import { getMembership } from "@/server/pools";
import { getDeadlineContext } from "@/server/deadlines";
import { getPrizePredictions, getPrizeResults } from "@/server/prizes";
import { AppNav } from "@/components/AppNav";
import { SubmitButton } from "@/components/SubmitButton";
import { savePremioAction } from "@/app/premios/actions";

// What each prize is worth, shown next to the label so the stakes are explicit.
const PRIZE_HINT: Record<PrizeType, string> = {
  champion: "Quem leva a taça?",
  top_scorer: "Artilheiro da Copa (Chuteira de Ouro)",
  best_goalkeeper: "Melhor goleiro (Luva de Ouro)",
  golden_ball: "Melhor jogador (Bola de Ouro)",
  runner_up: "Quem perde a final?",
};

export default async function PremiosPage({
  params,
  searchParams,
}: {
  params: Promise<{ poolId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { poolId } = await params;
  const { erro, ok } = await searchParams;
  const session = await requireSession();

  // Membership guard: only members of this pool may pick in it.
  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  const now = new Date();
  const deadlines = await getDeadlineContext();
  const [picks, results, teams] = await Promise.all([
    getPrizePredictions(membership.id),
    getPrizeResults(),
    prisma.team.findMany({ orderBy: { nome: "asc" } }),
  ]);
  const pickByType = new Map(picks.map((p) => [p.prizeType, p]));
  const resultByType = new Map(results.map((r) => [r.prizeType, r]));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <AppNav poolId={poolId} />
      <h1 className="text-2xl font-bold">Prêmios da Copa</h1>
      <p className="text-sm text-ink-strong">
        Cinco palpites extras que valem pontos no ranking geral. Campeão,
        artilheiro, goleiro e melhor jogador travam junto com a fase de grupos;
        o vice-campeão abre em 20/06 e trava antes do mata-mata começar.
      </p>

      {erro === "travado" ? (
        <p
          role="alert"
          className="rounded-md bg-surface-muted p-3 text-sm text-danger"
        >
          Palpite travado: o prazo deste prêmio já encerrou.
        </p>
      ) : null}
      {erro === "invalido" ? (
        <p
          role="alert"
          className="rounded-md bg-surface-muted p-3 text-sm text-danger"
        >
          Palpite inválido: escolha um valor.
        </p>
      ) : null}
      {ok ? (
        <p
          role="status"
          className="rounded-md bg-accent/10 p-3 text-sm text-accent-strong"
        >
          Palpite salvo.
        </p>
      ) : null}

      {PRIZE_TYPES.map((prizeType) => {
        const pick = pickByType.get(prizeType);
        const result = resultByType.get(prizeType);
        const open = isPrizePredictionOpen(prizeType, deadlines, now);
        const isTeamPick = TEAM_PRIZE_TYPES.includes(prizeType);
        const runnerUpNotYetOpen =
          prizeType === "runner_up" &&
          now.getTime() < KNOCKOUT_OPENS_AT_UTC.getTime();

        return (
          <section
            key={prizeType}
            className="flex flex-col gap-2 rounded-md border border-border p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{PRIZE_LABEL[prizeType]}</h2>
              <span className="shrink-0 text-sm text-ink-muted">
                vale {PRIZE_POINTS[prizeType]} pts
              </span>
            </div>
            <p className="text-sm text-ink-muted">{PRIZE_HINT[prizeType]}</p>

            {open ? (
              <form action={savePremioAction} className="flex items-end gap-2">
                <input type="hidden" name="poolId" value={poolId} />
                <input type="hidden" name="prizeType" value={prizeType} />
                <label className="flex min-w-0 grow flex-col text-sm">
                  Seu palpite
                  {isTeamPick ? (
                    <select
                      name="value"
                      required
                      defaultValue={pick?.value ?? ""}
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
                      defaultValue={pick?.value ?? ""}
                      placeholder="Nome do jogador"
                      className="rounded-md border border-border p-2"
                    />
                  )}
                </label>
                <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
              </form>
            ) : runnerUpNotYetOpen ? (
              <p className="text-sm text-ink-muted">
                Abre em 20/06 (00h, horário de Brasília).
              </p>
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  Seu palpite:{" "}
                  <span className="font-semibold">
                    {pick ? pick.value : "— (sem palpite)"}
                  </span>
                </p>
                {result ? (
                  <p>
                    Resultado oficial:{" "}
                    <span className="font-semibold">{result.value}</span>
                    {pick ? (
                      prizeValuesMatch(pick.value, result.value) ? (
                        <span className="ml-2 font-semibold text-accent-strong">
                          acertou! +{pick.pointsAwarded ?? result.pointsValue} pts
                        </span>
                      ) : (
                        <span className="ml-2 text-ink-muted">errou (0 pts)</span>
                      )
                    ) : null}
                  </p>
                ) : (
                  <p className="text-ink-muted">
                    Travado — aguardando apuração oficial.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
