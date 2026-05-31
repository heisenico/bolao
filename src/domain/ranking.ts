// Pure ranking logic. NO next/* or @prisma/* imports.
// Tiebreaker order (CONTRACT §4):
//   1) pontos desc, 2) cravadas desc, 3) acertosVencedor desc, 4) joinedAt asc.

export interface RankingRow {
  membershipId: string;
  nome: string;
  pontos: number;
  cravadas: number;
  acertosVencedor: number;
  joinedAt: Date;
  image: string | null;
}

/** Comparator for Array.sort: negative => a ranks first. */
export function compareRankingRows(a: RankingRow, b: RankingRow): number {
  if (a.pontos !== b.pontos) return b.pontos - a.pontos;
  if (a.cravadas !== b.cravadas) return b.cravadas - a.cravadas;
  if (a.acertosVencedor !== b.acertosVencedor) {
    return b.acertosVencedor - a.acertosVencedor;
  }
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

/** Returns a new sorted array (does not mutate input). */
export function rankRows(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort(compareRankingRows);
}
