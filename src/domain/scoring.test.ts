import { describe, it, expect } from "vitest";
import { outcome, scorePrediction, type Score } from "@/domain/scoring";

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

describe("scorePrediction", () => {
  it("exact score => 3", () => {
    const palpite: Score = { home: 2, away: 1 };
    const resultado: Score = { home: 2, away: 1 };
    expect(scorePrediction(palpite, resultado)).toBe(3);
  });

  it("exact 0x0 draw => 3", () => {
    expect(scorePrediction({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(3);
  });

  it("exact 2x2 draw => 3", () => {
    expect(scorePrediction({ home: 2, away: 2 }, { home: 2, away: 2 })).toBe(3);
  });

  it("right winner, wrong score => 1", () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 3, away: 1 })).toBe(1);
  });

  it("right draw, wrong score => 1", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(1);
  });

  it("wrong winner => 0", () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 0, away: 1 })).toBe(0);
  });

  it("predicted draw but real had a winner => 0", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0);
  });

  it("predicted a winner but real was a draw => 0", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 1, away: 1 })).toBe(0);
  });

  it("return type is one of 0 | 1 | 3", () => {
    const v = scorePrediction({ home: 0, away: 1 }, { home: 1, away: 0 });
    expect([0, 1, 3]).toContain(v);
  });
});
