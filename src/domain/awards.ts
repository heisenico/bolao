// Pure FIFA prize-prediction logic. NO next/* or @prisma/* imports.
// Five official prizes, each worth fixed points added to the general ranking.
// Settled manually by the organizer after FIFA confirms (no API source).

export type PrizeType =
  | "champion"
  | "top_scorer"
  | "best_goalkeeper"
  | "golden_ball"
  | "runner_up";

export const PRIZE_TYPES: PrizeType[] = [
  "champion",
  "top_scorer",
  "best_goalkeeper",
  "golden_ball",
  "runner_up",
];

/** Points awarded for a correct pick — immutable after the first match. */
export const PRIZE_POINTS: Record<PrizeType, number> = {
  champion: 30,
  top_scorer: 20,
  best_goalkeeper: 15,
  golden_ball: 15,
  runner_up: 10,
};

/** pt-BR labels for forms and the ranking breakdown. */
export const PRIZE_LABEL: Record<PrizeType, string> = {
  champion: "Campeão",
  top_scorer: "Artilheiro",
  best_goalkeeper: "Melhor goleiro",
  golden_ball: "Melhor jogador",
  runner_up: "Vice-campeão",
};

/** Prizes picked from the team list (the rest are player names, free text). */
export const TEAM_PRIZE_TYPES: PrizeType[] = ["champion", "runner_up"];

/**
 * Canonical form for comparing a pick against the official result: trimmed,
 * lower-cased, diacritics stripped (Müller == muller), inner whitespace
 * collapsed. Team prizes come from a <select> so this is a safety net; player
 * prizes are free text and depend on it.
 */
export function normalizePrizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** True when a pick matches the official result after normalization. */
export function prizeValuesMatch(pick: string, official: string): boolean {
  const normalizedPick = normalizePrizeValue(pick);
  return normalizedPick !== "" && normalizedPick === normalizePrizeValue(official);
}
