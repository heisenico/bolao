// Pure ranking logic. NO next/* or @prisma/* imports.
// Tiebreaker order (official rules):
//   1) pontos desc, 2) cravadas desc, 3) acertos (any non-miss hit) desc,
//   4) champion prize hit desc, 5) joinedAt asc.

export interface RankingRow {
  membershipId: string;
  nome: string;
  /** Final total: match points (post-multiplier) + confirmed prize points. */
  pontos: number;
  /** Count of hitType === 'exact' — phase-independent (a final cravada counts once). */
  cravadas: number;
  /** Count of any non-miss hit (exact, winner_and_diff, winner_only). */
  acertosVencedor: number;
  /** Tiebreaker 4: this member's champion pick matched the confirmed result. */
  acertouCampeao: boolean;
  /** AI participants rank normally but never take prize money. */
  isAi: boolean;
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
  if (a.acertouCampeao !== b.acertouCampeao) {
    return a.acertouCampeao ? -1 : 1;
  }
  return a.joinedAt.getTime() - b.joinedAt.getTime();
}

/** Returns a new sorted array (does not mutate input). */
export function rankRows(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort(compareRankingRows);
}
