// Pure scoring helpers. NO next/* or @prisma/* imports.
export interface Score {
  home: number;
  away: number;
}

/** sign(home - away): 1 = home win, -1 = away win, 0 = draw */
export function outcome(s: Score): -1 | 0 | 1 {
  if (s.home > s.away) return 1;
  if (s.home < s.away) return -1;
  return 0;
}

/**
 * Points for one prediction against one result (CONTRACT §4):
 * exact placar => 3; correct winner/draw but wrong placar => 1; otherwise 0.
 * Knockout: caller passes normal+extra-time score; penalties are ignored upstream.
 */
export function scorePrediction(palpite: Score, resultado: Score): 0 | 1 | 3 {
  if (palpite.home === resultado.home && palpite.away === resultado.away) {
    return 3;
  }
  if (outcome(palpite) === outcome(resultado)) {
    return 1;
  }
  return 0;
}
