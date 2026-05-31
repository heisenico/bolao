// Pure prize logic. NO next/* or @prisma/* imports.
// Winner-takes-all (CONTRACT §4): prize = sum of confirmed entries.
// Money is integer BRL cents everywhere (CONTRACT §9).

import type { RankingRow } from "@/domain/ranking";

/** Total prize pool = confirmed entries * entry value, in integer BRL cents. */
export function computePrize(
  confirmedEntriesCount: number,
  valorEntradaCents: number,
): number {
  return confirmedEntriesCount * valorEntradaCents;
}

/**
 * Single winner via ranking sort (CONTRACT §4). Expects an already-ranked
 * list (call rankRows first). Returns the first row, or null if empty.
 */
export function pickWinner(rankedRows: RankingRow[]): RankingRow | null {
  return rankedRows.length > 0 ? rankedRows[0] : null;
}
