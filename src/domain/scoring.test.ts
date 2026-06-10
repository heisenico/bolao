import { describe, it, expect } from "vitest";
import {
  AUTO_PALPITE,
  classifyPrediction,
  finalPoints,
  outcome,
  settlePrediction,
  type Score,
} from "@/domain/scoring";

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

describe("classifyPrediction", () => {
  it("exact score => exact, 10", () => {
    expect(classifyPrediction({ home: 2, away: 1 }, { home: 2, away: 1 })).toEqual({
      hitType: "exact",
      basePoints: 10,
    });
  });

  it("exact 0x0 draw => exact, 10", () => {
    expect(classifyPrediction({ home: 0, away: 0 }, { home: 0, away: 0 })).toEqual({
      hitType: "exact",
      basePoints: 10,
    });
  });

  it("right winner + right goal difference, wrong score => winner_and_diff, 5", () => {
    expect(classifyPrediction({ home: 3, away: 1 }, { home: 2, away: 0 })).toEqual({
      hitType: "winner_and_diff",
      basePoints: 5,
    });
  });

  it("right winner only => winner_only, 3", () => {
    expect(classifyPrediction({ home: 1, away: 0 }, { home: 3, away: 1 })).toEqual({
      hitType: "winner_only",
      basePoints: 3,
    });
  });

  it("pinned edge case: wrong-score draw is ALWAYS winner_and_diff (1x1 vs 2x2 => 5)", () => {
    expect(classifyPrediction({ home: 1, away: 1 }, { home: 2, away: 2 })).toEqual({
      hitType: "winner_and_diff",
      basePoints: 5,
    });
  });

  it("away win with right difference => winner_and_diff, 5", () => {
    expect(classifyPrediction({ home: 0, away: 2 }, { home: 1, away: 3 })).toEqual({
      hitType: "winner_and_diff",
      basePoints: 5,
    });
  });

  it("wrong winner => miss, 0", () => {
    expect(classifyPrediction({ home: 2, away: 0 }, { home: 0, away: 1 })).toEqual({
      hitType: "miss",
      basePoints: 0,
    });
  });

  it("predicted draw but real had a winner => miss, 0", () => {
    expect(classifyPrediction({ home: 1, away: 1 }, { home: 2, away: 0 })).toEqual({
      hitType: "miss",
      basePoints: 0,
    });
  });

  it("predicted a winner but real was a draw => miss, 0", () => {
    expect(classifyPrediction({ home: 2, away: 1 }, { home: 1, away: 1 })).toEqual({
      hitType: "miss",
      basePoints: 0,
    });
  });

  it("the automatic fallback palpite (0x0) scores as a normal hit when the match ends 0x0", () => {
    expect(classifyPrediction(AUTO_PALPITE, { home: 0, away: 0 })).toEqual({
      hitType: "exact",
      basePoints: 10,
    });
  });
});

describe("finalPoints (phase multipliers)", () => {
  it("group stage is 1x: 10 / 5 / 3", () => {
    expect(finalPoints(10, "grupos")).toBe(10);
    expect(finalPoints(5, "grupos")).toBe(5);
    expect(finalPoints(3, "grupos")).toBe(3);
  });

  it("R32 and R16 are 1.5x, rounding half up: 15 / 8 / 5", () => {
    for (const fase of ["r32", "oitavas"] as const) {
      expect(finalPoints(10, fase)).toBe(15);
      expect(finalPoints(5, fase)).toBe(8);
      expect(finalPoints(3, fase)).toBe(5);
    }
  });

  it("QF and SF are 2x: 20 / 10 / 6", () => {
    for (const fase of ["quartas", "semi"] as const) {
      expect(finalPoints(10, fase)).toBe(20);
      expect(finalPoints(5, fase)).toBe(10);
      expect(finalPoints(3, fase)).toBe(6);
    }
  });

  it("third place and final are 3x: 30 / 15 / 9", () => {
    for (const fase of ["terceiro", "final"] as const) {
      expect(finalPoints(10, fase)).toBe(30);
      expect(finalPoints(5, fase)).toBe(15);
      expect(finalPoints(3, fase)).toBe(9);
    }
  });

  it("a miss is 0 in every phase", () => {
    for (const fase of [
      "grupos",
      "r32",
      "oitavas",
      "quartas",
      "semi",
      "terceiro",
      "final",
    ] as const) {
      expect(finalPoints(0, fase)).toBe(0);
    }
  });
});

describe("settlePrediction", () => {
  it("exact on the final => 10 base, 30 final", () => {
    expect(
      settlePrediction({ home: 2, away: 1 }, { home: 2, away: 1 }, "final"),
    ).toEqual({ hitType: "exact", pontosBase: 10, pontosObtidos: 30 });
  });

  it("exact 1x1 on R16 (penalties ignored upstream) => 10 base, 15 final", () => {
    expect(
      settlePrediction({ home: 1, away: 1 }, { home: 1, away: 1 }, "oitavas"),
    ).toEqual({ hitType: "exact", pontosBase: 10, pontosObtidos: 15 });
  });

  it("winner-only on the final => 3 base, 9 final (spec example)", () => {
    expect(
      settlePrediction({ home: 1, away: 0 }, { home: 3, away: 0 }, "final"),
    ).toEqual({ hitType: "winner_only", pontosBase: 3, pontosObtidos: 9 });
  });

  it("winner_and_diff on the final => 5 base, 15 final (spec example)", () => {
    expect(
      settlePrediction({ home: 2, away: 1 }, { home: 3, away: 2 }, "final"),
    ).toEqual({ hitType: "winner_and_diff", pontosBase: 5, pontosObtidos: 15 });
  });
});
