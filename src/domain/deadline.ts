// Pure deadline logic. NO next/* or @prisma/* imports.
// Official rules use two deadline blocks, enforced server-side in UTC:
//   Block A — pool entry, the 72 group-stage predictions, and the four FIFA
//     prizes (champion, top scorer, goalkeeper, golden ball). Open from pool
//     creation; closes 1h before the OPENING match (all group picks lock then).
//   Block B — the knockout predictions and the runner-up prize. Opens
//     20/06/2026 00:00 BRT; the runner-up pick closes 1h before the first R32
//     kickoff, while each knockout MATCH still locks 1h before its own kickoff.
// Deadlines are derived from kickoff times (never stored), so a rescheduled
// match automatically moves its own lock.

import type { Fase } from "@/domain/scoring";
import type { PrizeType } from "@/domain/awards";

export const LOCK_LEAD_MS = 60 * 60 * 1000;

/** Block B opens: 20/06/2026 00:00 America/Sao_Paulo (UTC-3) = 03:00 UTC. */
export const KNOCKOUT_OPENS_AT_UTC = new Date("2026-06-20T03:00:00.000Z");

const isGroup = (fase: Fase): boolean => fase === "grupos";

/**
 * True while a match's prediction may still be created/edited.
 * Group match: until 1h before the OPENING match (Block A close) — group picks
 *   do NOT stay open until their own kickoff.
 * Knockout match: from Block B open until 1h before its OWN kickoff.
 * `openingKickoffUtc` null (fixtures not synced yet) keeps Block A open.
 */
export function isPredictionOpen(
  fase: Fase,
  kickoffUtc: Date,
  openingKickoffUtc: Date | null,
  now: Date = new Date(),
): boolean {
  if (isGroup(fase)) {
    if (openingKickoffUtc === null) return true;
    return now.getTime() < openingKickoffUtc.getTime() - LOCK_LEAD_MS;
  }
  return (
    now.getTime() >= KNOCKOUT_OPENS_AT_UTC.getTime() &&
    now.getTime() < kickoffUtc.getTime() - LOCK_LEAD_MS
  );
}

/**
 * True once a match's predictions can never be edited again — the reveal gate
 * (predictions stay hidden from other members until this). NOT the negation of
 * isPredictionOpen: a knockout match before Block B opens is neither open nor
 * locked, and must stay hidden without being editable.
 */
export function isMatchLocked(
  fase: Fase,
  kickoffUtc: Date,
  openingKickoffUtc: Date | null,
  now: Date = new Date(),
): boolean {
  if (isGroup(fase)) {
    if (openingKickoffUtc === null) return false;
    return now.getTime() >= openingKickoffUtc.getTime() - LOCK_LEAD_MS;
  }
  return now.getTime() >= kickoffUtc.getTime() - LOCK_LEAD_MS;
}

/** Knockout-only state before Block B opens, for the "abre em 20/06" UI copy. */
export function isKnockoutNotYetOpen(fase: Fase, now: Date = new Date()): boolean {
  return !isGroup(fase) && now.getTime() < KNOCKOUT_OPENS_AT_UTC.getTime();
}

/**
 * Editing window for a FIFA prize pick.
 * runner_up (Block B): from 20/06 00:00 BRT until 1h before the first R32
 *   kickoff. `firstR32KickoffUtc` null (R32 pairings not synced yet) keeps it
 *   open — the pairings are published well before the first R32 match.
 * All other prizes (Block A): from pool creation until 1h before the opening
 *   match, exactly like group predictions.
 */
export function isPrizePredictionOpen(
  prizeType: PrizeType,
  deadlines: {
    openingKickoffUtc: Date | null;
    firstR32KickoffUtc: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (prizeType === "runner_up") {
    if (now.getTime() < KNOCKOUT_OPENS_AT_UTC.getTime()) return false;
    if (deadlines.firstR32KickoffUtc === null) return true;
    return (
      now.getTime() < deadlines.firstR32KickoffUtc.getTime() - LOCK_LEAD_MS
    );
  }
  if (deadlines.openingKickoffUtc === null) return true;
  return now.getTime() < deadlines.openingKickoffUtc.getTime() - LOCK_LEAD_MS;
}
