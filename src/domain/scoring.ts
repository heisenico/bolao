// Pure scoring helpers. NO next/* or @prisma/* imports.
export interface Score {
  home: number;
  away: number;
}

/** Hit levels of the official scoring ("Clássico Gradativo"), best to worst. */
export type HitType = "exact" | "winner_and_diff" | "winner_only" | "miss";

/** Base (pre-multiplier) points per hit level — immutable after the first match. */
export const BASE_POINTS: Record<HitType, number> = {
  exact: 10,
  winner_and_diff: 5,
  winner_only: 3,
  miss: 0,
};

/** A member with no pick gets this automatic palpite at settlement (official rule). */
export const AUTO_PALPITE: Score = { home: 0, away: 0 };

/** sign(home - away): 1 = home win, -1 = away win, 0 = draw */
export function outcome(s: Score): -1 | 0 | 1 {
  if (s.home > s.away) return 1;
  if (s.home < s.away) return -1;
  return 0;
}

export interface Classification {
  hitType: HitType;
  basePoints: number;
}

/**
 * Classifies one prediction against one result (official rules):
 *   exact placar => exact (10); correct winner + correct goal difference =>
 *   winner_and_diff (5); correct winner/draw only => winner_only (3); else miss (0).
 * Clause order pins the draw edge case: a predicted draw with the wrong score
 * always matches the goal difference (both are 0), so 1x1 vs 2x2 is
 * winner_and_diff (5), never winner_only (3).
 * Knockout: caller passes the normal+extra-time score; penalties are ignored upstream.
 */
export function classifyPrediction(
  palpite: Score,
  resultado: Score,
): Classification {
  if (palpite.home === resultado.home && palpite.away === resultado.away) {
    return { hitType: "exact", basePoints: BASE_POINTS.exact };
  }
  if (
    outcome(palpite) === outcome(resultado) &&
    palpite.home - palpite.away === resultado.home - resultado.away
  ) {
    return { hitType: "winner_and_diff", basePoints: BASE_POINTS.winner_and_diff };
  }
  if (outcome(palpite) === outcome(resultado)) {
    return { hitType: "winner_only", basePoints: BASE_POINTS.winner_only };
  }
  return { hitType: "miss", basePoints: BASE_POINTS.miss };
}

/** Match phases as stored on Match.fase (mirrors the Prisma MatchPhase enum). */
export type Fase =
  | "grupos"
  | "r32"
  | "oitavas"
  | "quartas"
  | "semi"
  | "terceiro"
  | "final";

/**
 * Phase multipliers (official rules): group 1x, R32/R16 1.5x, QF/SF 2x,
 * third place/final 3x. Applied to every hit level.
 */
export const PHASE_MULTIPLIER: Record<Fase, number> = {
  grupos: 1,
  r32: 1.5,
  oitavas: 1.5,
  quartas: 2,
  semi: 2,
  terceiro: 3,
  final: 3,
};

/** Final points = round(base x multiplier). Half rounds up: 4.5 => 5, 7.5 => 8. */
export function finalPoints(basePoints: number, fase: Fase): number {
  return Math.round(basePoints * PHASE_MULTIPLIER[fase]);
}

export interface SettledScore {
  hitType: HitType;
  pontosBase: number;
  pontosObtidos: number;
}

/** One-stop settlement math: classify the palpite, then apply the phase multiplier. */
export function settlePrediction(
  palpite: Score,
  resultado: Score,
  fase: Fase,
): SettledScore {
  const { hitType, basePoints } = classifyPrediction(palpite, resultado);
  return {
    hitType,
    pontosBase: basePoints,
    pontosObtidos: finalPoints(basePoints, fase),
  };
}
