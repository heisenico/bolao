import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_A_LEAD_MS,
  KNOCKOUT_OPENS_AT_UTC,
  LOCK_LEAD_MS,
  isBlockAOpen,
  isKnockoutNotYetOpen,
  isMatchLocked,
  isPredictionOpen,
  isPrizePredictionOpen,
} from "./deadline";

// Opening match: 11/06/2026 16h BRT = 19:00 UTC.
const OPENING = new Date("2026-06-11T19:00:00.000Z");
// First R32 match: 28/06/2026 15h BRT = 18:00 UTC => runner-up closes 17:00 UTC.
const FIRST_R32 = new Date("2026-06-28T18:00:00.000Z");

describe("deadline domain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("match picks lock 10 minutes before kickoff; Block A leads by 1 hour", () => {
    expect(LOCK_LEAD_MS).toBe(10 * 60 * 1000);
    expect(BLOCK_A_LEAD_MS).toBe(60 * 60 * 1000);
  });

  it("KNOCKOUT_OPENS_AT_UTC is 20/06/2026 00:00 BRT (03:00 UTC)", () => {
    expect(KNOCKOUT_OPENS_AT_UTC.toISOString()).toBe("2026-06-20T03:00:00.000Z");
  });

  describe("group-stage matches (per-match 10-minute lock)", () => {
    const groupKickoff = new Date("2026-06-24T19:00:00.000Z");

    it("open until 10 minutes before its OWN kickoff (1 ms before the boundary)", () => {
      expect(
        isPredictionOpen("grupos", groupKickoff,
          new Date(groupKickoff.getTime() - LOCK_LEAD_MS - 1)),
      ).toBe(true);
      // Days after the opening match, this group pick is still editable.
      expect(
        isPredictionOpen("grupos", groupKickoff, new Date("2026-06-20T12:00:00.000Z")),
      ).toBe(true);
    });

    it("locks exactly at kickoff - 10min", () => {
      const lock = new Date(groupKickoff.getTime() - LOCK_LEAD_MS);
      expect(isPredictionOpen("grupos", groupKickoff, lock)).toBe(false);
      expect(isMatchLocked("grupos", groupKickoff, lock)).toBe(true);
      expect(
        isMatchLocked("grupos", groupKickoff, new Date(lock.getTime() - 1)),
      ).toBe(false);
    });
  });

  describe("knockout matches (Block B window + own 10-minute lock)", () => {
    const r32Kickoff = new Date("2026-06-29T19:00:00.000Z");

    it("rejected before Block B opens (20/06 00:00 BRT)", () => {
      const before = new Date("2026-06-19T23:59:00.000Z"); // 19/06 20:59 BRT
      expect(isPredictionOpen("r32", r32Kickoff, before)).toBe(false);
      expect(isKnockoutNotYetOpen("r32", before)).toBe(true);
    });

    it("open from Block B open until its own kickoff - 10min", () => {
      expect(isPredictionOpen("r32", r32Kickoff, KNOCKOUT_OPENS_AT_UTC)).toBe(true);
      expect(
        isPredictionOpen("r32", r32Kickoff,
          new Date(r32Kickoff.getTime() - LOCK_LEAD_MS - 1)),
      ).toBe(true);
    });

    it("locks 10 minutes before its OWN kickoff", () => {
      const ownLock = new Date(r32Kickoff.getTime() - LOCK_LEAD_MS);
      expect(isPredictionOpen("r32", r32Kickoff, ownLock)).toBe(false);
      expect(isMatchLocked("r32", r32Kickoff, ownLock)).toBe(true);
    });

    it("is neither open nor locked (hidden, uneditable) before Block B opens", () => {
      const before = new Date("2026-06-15T12:00:00.000Z");
      expect(isPredictionOpen("final", r32Kickoff, before)).toBe(false);
      expect(isMatchLocked("final", r32Kickoff, before)).toBe(false);
    });

    it("isKnockoutNotYetOpen is false for group matches and after the window opens", () => {
      expect(isKnockoutNotYetOpen("grupos", new Date("2026-06-15T12:00:00.000Z"))).toBe(false);
      expect(isKnockoutNotYetOpen("r32", KNOCKOUT_OPENS_AT_UTC)).toBe(false);
    });
  });

  describe("Block A window (entry, removal, fee/Pix edits — 1h lead)", () => {
    it("open until opening kickoff - 1h, closed from then on", () => {
      const close = new Date(OPENING.getTime() - BLOCK_A_LEAD_MS);
      expect(isBlockAOpen(OPENING, new Date(close.getTime() - 1))).toBe(true);
      expect(isBlockAOpen(OPENING, close)).toBe(false);
    });

    it("stays open while fixtures are not synced yet", () => {
      expect(isBlockAOpen(null, new Date("2026-06-01T00:00:00.000Z"))).toBe(true);
    });
  });

  describe("prize windows (1h leads — season-long calls, not match picks)", () => {
    const deadlines = { openingKickoffUtc: OPENING, firstR32KickoffUtc: FIRST_R32 };

    it("champion (Block A) open before, closed at opening kickoff - 1h", () => {
      const blockAClose = new Date(OPENING.getTime() - BLOCK_A_LEAD_MS);
      expect(
        isPrizePredictionOpen("champion", deadlines, new Date(blockAClose.getTime() - 1)),
      ).toBe(true);
      expect(isPrizePredictionOpen("champion", deadlines, blockAClose)).toBe(false);
    });

    it("runner_up rejected before 20/06 00:00 BRT", () => {
      expect(
        isPrizePredictionOpen("runner_up", deadlines, new Date("2026-06-19T23:59:00.000Z")),
      ).toBe(false);
    });

    it("runner_up open inside Block B, closed at first R32 kickoff - 1h", () => {
      expect(isPrizePredictionOpen("runner_up", deadlines, KNOCKOUT_OPENS_AT_UTC)).toBe(true);
      const blockBClose = new Date(FIRST_R32.getTime() - BLOCK_A_LEAD_MS);
      expect(
        isPrizePredictionOpen("runner_up", deadlines, new Date(blockBClose.getTime() - 1)),
      ).toBe(true);
      expect(isPrizePredictionOpen("runner_up", deadlines, blockBClose)).toBe(false);
    });

    it("runner_up stays open inside the window while R32 pairings are unknown", () => {
      expect(
        isPrizePredictionOpen(
          "runner_up",
          { openingKickoffUtc: OPENING, firstR32KickoffUtc: null },
          new Date("2026-06-22T12:00:00.000Z"),
        ),
      ).toBe(true);
    });

    it("Block A prizes stay open while fixtures are not synced yet", () => {
      expect(
        isPrizePredictionOpen(
          "golden_ball",
          { openingKickoffUtc: null, firstR32KickoffUtc: null },
          new Date("2026-06-01T00:00:00.000Z"),
        ),
      ).toBe(true);
    });
  });

  it("defaults now to the current system clock when omitted", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    vi.setSystemTime(new Date("2026-06-11T19:00:00.000Z"));
    expect(isPredictionOpen("grupos", kickoff)).toBe(true);
    expect(isMatchLocked("grupos", kickoff)).toBe(false);
    vi.setSystemTime(new Date("2026-06-11T19:55:00.000Z"));
    expect(isPredictionOpen("grupos", kickoff)).toBe(false);
    expect(isMatchLocked("grupos", kickoff)).toBe(true);
  });
});
