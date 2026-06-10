// Pure prize logic. NO next/* or @prisma/* imports.
// Official rules: top 3 HUMANS split the pot 60% / 30% / 10%. AI participants
// rank normally but can never take prize money — prize positions cascade past
// them. Money is integer BRL cents everywhere; the app only REPORTS winners,
// it never moves money (the organizer pays via PIX outside the app).

import type { RankingRow } from "@/domain/ranking";

/** Total prize pool = confirmed entries * entry value, in integer BRL cents. */
export function computePrize(
  confirmedEntriesCount: number,
  valorEntradaCents: number,
): number {
  return confirmedEntriesCount * valorEntradaCents;
}

/** Prize split by human prize rank (1-based): 1st 60%, 2nd 30%, 3rd 10%. */
export const PRIZE_SPLIT_PCT = [60, 30, 10] as const;

export interface PrizeRankedRow extends RankingRow {
  /** 1-based position in the overall ranking (AIs included). */
  overallRank: number;
  /** 1-based prize position among humans only; null for AIs and non-winners. */
  humanPrizeRank: number | null;
  /** Share of the pot in percent (60/30/10); null when humanPrizeRank is null. */
  prizePct: number | null;
}

/**
 * Annotates an already-ranked list (call rankRows first) with prize positions:
 * the top `topN` humans take prize ranks 1..topN regardless of how many AIs
 * rank above them. Example: Claude (AI) 1st, Lucca 2nd, João 3rd, Maria 4th
 * => Lucca 60%, João 30%, Maria 10%.
 */
export function assignPrizeRanks(
  rankedRows: RankingRow[],
  topN: number = PRIZE_SPLIT_PCT.length,
): PrizeRankedRow[] {
  let humanRank = 0;
  return rankedRows.map((row, i) => {
    const takesPrize = !row.isAi && humanRank < topN;
    if (takesPrize) humanRank++;
    return {
      ...row,
      overallRank: i + 1,
      humanPrizeRank: takesPrize ? humanRank : null,
      prizePct: takesPrize ? (PRIZE_SPLIT_PCT[humanRank - 1] ?? null) : null,
    };
  });
}

/** Only the rows that take a share of the pot (the "Premiados" section). */
export function pickPrizeWinners(
  rankedRows: RankingRow[],
  topN: number = PRIZE_SPLIT_PCT.length,
): PrizeRankedRow[] {
  return assignPrizeRanks(rankedRows, topN).filter(
    (row) => row.humanPrizeRank !== null,
  );
}
