import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCK_LEAD_MS, isMatchLocked, isPredictionOpen } from "./deadline";

describe("deadline domain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("LOCK_LEAD_MS is exactly one hour in ms", () => {
    expect(LOCK_LEAD_MS).toBe(60 * 60 * 1000);
  });

  it("isPredictionOpen is true well before the lead window", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    const now = new Date("2026-06-11T18:00:00.000Z"); // 2h before
    expect(isPredictionOpen(kickoff, now)).toBe(true);
  });

  it("isPredictionOpen is true at exactly 1h + 1ms before kickoff", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    const now = new Date(kickoff.getTime() - LOCK_LEAD_MS - 1);
    expect(isPredictionOpen(kickoff, now)).toBe(true);
  });

  it("isPredictionOpen is false at exactly the lock boundary (now === kickoff - 1h)", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    const now = new Date(kickoff.getTime() - LOCK_LEAD_MS);
    expect(isPredictionOpen(kickoff, now)).toBe(false);
  });

  it("isPredictionOpen is false after the lock boundary", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    const now = new Date("2026-06-11T19:30:00.000Z"); // 30min before
    expect(isPredictionOpen(kickoff, now)).toBe(false);
  });

  it("isMatchLocked is the negation of isPredictionOpen at the boundary", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    const open = new Date(kickoff.getTime() - LOCK_LEAD_MS - 1);
    const locked = new Date(kickoff.getTime() - LOCK_LEAD_MS);
    expect(isMatchLocked(kickoff, open)).toBe(false);
    expect(isMatchLocked(kickoff, locked)).toBe(true);
  });

  it("defaults now to the current system clock when omitted (open case)", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    vi.setSystemTime(new Date("2026-06-11T17:00:00.000Z"));
    expect(isPredictionOpen(kickoff)).toBe(true);
    expect(isMatchLocked(kickoff)).toBe(false);
  });

  it("defaults now to the current system clock when omitted (locked case)", () => {
    const kickoff = new Date("2026-06-11T20:00:00.000Z");
    vi.setSystemTime(new Date("2026-06-11T19:45:00.000Z"));
    expect(isPredictionOpen(kickoff)).toBe(false);
    expect(isMatchLocked(kickoff)).toBe(true);
  });
});
