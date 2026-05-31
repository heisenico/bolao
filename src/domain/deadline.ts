// Pure deadline logic. NO next/* or @prisma/* imports.
// Predictions are editable until 1h before kickoff (UTC), enforced server-side.

export const LOCK_LEAD_MS = 60 * 60 * 1000;

/** True while predictions may still be created/edited: now is strictly before (kickoff - 1h). */
export function isPredictionOpen(
  kickoffUtc: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() < kickoffUtc.getTime() - LOCK_LEAD_MS;
}

/** True once the match is locked (no more edits): the negation of isPredictionOpen. */
export function isMatchLocked(
  kickoffUtc: Date,
  now: Date = new Date()
): boolean {
  return !isPredictionOpen(kickoffUtc, now);
}
