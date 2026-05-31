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
