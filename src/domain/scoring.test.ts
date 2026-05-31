import { describe, it, expect } from "vitest";
import { outcome, type Score } from "@/domain/scoring";

describe("outcome", () => {
  it("returns 1 when home wins", () => {
    const s: Score = { home: 2, away: 1 };
    expect(outcome(s)).toBe(1);
  });

  it("returns -1 when away wins", () => {
    const s: Score = { home: 0, away: 3 };
    expect(outcome(s)).toBe(-1);
  });

  it("returns 0 on a draw", () => {
    const s: Score = { home: 1, away: 1 };
    expect(outcome(s)).toBe(0);
  });
});
