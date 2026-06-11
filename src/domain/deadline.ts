// Pure deadline logic. NO next/* or @prisma/* imports.
// Match picks are per-match: ANY match (group or knockout) can be created or
// edited until 10 MINUTES before its own kickoff, enforced server-side in UTC.
// The knockout window still only opens on 20/06 (Block B).
// Block A keeps a 1-hour lead before the OPENING match for the administrative
// cutoffs: pool entry, member removal, entry-fee/Pix edits, and the four
// season-long prize picks (champion, top scorer, goalkeeper, golden ball);
// the runner-up prize closes 1h before the first R32 kickoff.
// Deadlines are derived from kickoff times (never stored), so a rescheduled
// match automatically moves its own lock.

import type { Fase } from "@/domain/scoring";
import type { PrizeType } from "@/domain/awards";

/** A match pick locks this long before ITS OWN kickoff: 10 minutes. */
export const LOCK_LEAD_MS = 10 * 60 * 1000;

/** Block A cutoffs (entry, prizes, admin edits) lead the opening match by 1h. */
export const BLOCK_A_LEAD_MS = 60 * 60 * 1000;

/** Block B opens: 20/06/2026 00:00 America/Sao_Paulo (UTC-3) = 03:00 UTC. */
export const KNOCKOUT_OPENS_AT_UTC = new Date("2026-06-20T03:00:00.000Z");

const isGroup = (fase: Fase): boolean => fase === "grupos";

/**
 * True while a match's prediction may still be created/edited.
 * Group match: from pool creation until 10 minutes before its own kickoff.
 * Knockout match: from Block B open until 10 minutes before its own kickoff.
 */
export function isPredictionOpen(
  fase: Fase,
  kickoffUtc: Date,
  now: Date = new Date(),
): boolean {
  if (!isGroup(fase) && now.getTime() < KNOCKOUT_OPENS_AT_UTC.getTime()) {
    return false;
  }
  return now.getTime() < kickoffUtc.getTime() - LOCK_LEAD_MS;
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
  now: Date = new Date(),
): boolean {
  return now.getTime() >= kickoffUtc.getTime() - LOCK_LEAD_MS;
}

/** Knockout-only state before Block B opens, for the "abre em 20/06" UI copy. */
export function isKnockoutNotYetOpen(fase: Fase, now: Date = new Date()): boolean {
  return !isGroup(fase) && now.getTime() < KNOCKOUT_OPENS_AT_UTC.getTime();
}

/**
 * Block A window: pool entry, member removal, and entry-fee/Pix edits are
 * allowed only while it is open (until 1h before the opening match). Null
 * openingKickoffUtc (fixtures not synced) keeps it open.
 */
export function isBlockAOpen(
  openingKickoffUtc: Date | null,
  now: Date = new Date(),
): boolean {
  if (openingKickoffUtc === null) return true;
  return now.getTime() < openingKickoffUtc.getTime() - BLOCK_A_LEAD_MS;
}

/**
 * Editing window for a FIFA prize pick (1h leads — prize picks are season-long
 * calls, not match picks, so they keep the Block A/B cutoffs).
 * runner_up (Block B): from 20/06 00:00 BRT until 1h before the first R32
 *   kickoff. `firstR32KickoffUtc` null (R32 pairings not synced yet) keeps it
 *   open — the pairings are published well before the first R32 match.
 * All other prizes (Block A): from pool creation until 1h before the opening
 *   match.
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
      now.getTime() < deadlines.firstR32KickoffUtc.getTime() - BLOCK_A_LEAD_MS
    );
  }
  return isBlockAOpen(deadlines.openingKickoffUtc, now);
}
