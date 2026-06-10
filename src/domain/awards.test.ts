import { describe, it, expect } from "vitest";
import {
  PRIZE_LABEL,
  PRIZE_POINTS,
  PRIZE_TYPES,
  normalizePrizeValue,
  prizeValuesMatch,
} from "@/domain/awards";

describe("prize constants", () => {
  it("awards 30/20/15/15/10 points (official table)", () => {
    expect(PRIZE_POINTS).toEqual({
      champion: 30,
      top_scorer: 20,
      best_goalkeeper: 15,
      golden_ball: 15,
      runner_up: 10,
    });
  });

  it("every prize type has a pt-BR label", () => {
    for (const type of PRIZE_TYPES) {
      expect(PRIZE_LABEL[type]).toBeTruthy();
    }
  });
});

describe("normalizePrizeValue", () => {
  it("lower-cases, trims and collapses whitespace", () => {
    expect(normalizePrizeValue("  Harry  Kane ")).toBe("harry kane");
  });

  it("strips diacritics (pt-BR names)", () => {
    expect(normalizePrizeValue("Vinícius Júnior")).toBe("vinicius junior");
    expect(normalizePrizeValue("Müller")).toBe("muller");
    expect(normalizePrizeValue("França")).toBe("franca");
  });
});

describe("prizeValuesMatch", () => {
  it("matches case-insensitively and accent-insensitively", () => {
    expect(prizeValuesMatch("vinicius junior", "Vinícius Júnior")).toBe(true);
    expect(prizeValuesMatch("BRASIL", "Brasil")).toBe(true);
  });

  it("does not match different values", () => {
    expect(prizeValuesMatch("Argentina", "Brasil")).toBe(false);
  });

  it("never matches an empty pick", () => {
    expect(prizeValuesMatch("", "")).toBe(false);
    expect(prizeValuesMatch("   ", "Brasil")).toBe(false);
  });
});
