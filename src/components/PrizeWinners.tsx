import type { PrizeRankedRow } from "@/domain/prize";

/**
 * "Premiados" section: ONLY the humans taking a share of the pot (60/30/10),
 * cascading past AI participants — AIs rank but never win money. The app only
 * reports the winners; the organizer pays via PIX outside the app.
 * Presentational only; rows arrive pre-annotated from getPrizeWinners.
 */
export function PrizeWinners({ winners }: { winners: PrizeRankedRow[] }) {
  if (winners.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-4">
      <h2 className="text-lg font-semibold">Premiados</h2>
      <p className="text-sm text-ink-muted">
        Os 3 melhores participantes humanos dividem o prêmio (60% / 30% / 10%).
        Participantes IA pontuam no ranking, mas não concorrem ao prêmio.
      </p>
      <ol className="flex flex-col gap-1">
        {winners.map((w) => (
          <li
            key={w.membershipId}
            data-prize-rank={w.humanPrizeRank}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 break-words">
              {w.humanPrizeRank}º — {w.nome}
              <span className="ml-2 text-xs text-ink-muted">
                ({w.overallRank}º no ranking geral)
              </span>
            </span>
            <span className="shrink-0 font-semibold">{w.prizePct}%</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
