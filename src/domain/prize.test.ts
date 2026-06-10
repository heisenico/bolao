import { describe, it, expect } from "vitest";
import {
  PRIZE_SPLIT_PCT,
  assignPrizeRanks,
  computePrize,
  pickPrizeWinners,
} from "@/domain/prize";
import type { RankingRow } from "@/domain/ranking";

function row(over: Partial<RankingRow> & { membershipId: string }): RankingRow {
  return {
    membershipId: over.membershipId,
    nome: over.nome ?? over.membershipId,
    pontos: over.pontos ?? 0,
    cravadas: over.cravadas ?? 0,
    acertosVencedor: over.acertosVencedor ?? 0,
    acertouCampeao: over.acertouCampeao ?? false,
    isAi: over.isAi ?? false,
    joinedAt: over.joinedAt ?? new Date("2026-01-01T00:00:00Z"),
    image: over.image ?? null,
  };
}

describe("computePrize", () => {
  it("multiplies confirmed entries by entry value in cents", () => {
    expect(computePrize(0, 2500)).toBe(0);
    expect(computePrize(1, 2500)).toBe(2500);
    expect(computePrize(8, 2500)).toBe(20000);
  });

  it("returns 0 when entry value is 0", () => {
    expect(computePrize(10, 0)).toBe(0);
  });

  it("stays in integer cents (no float drift)", () => {
    expect(computePrize(3, 333)).toBe(999);
    expect(Number.isInteger(computePrize(7, 1999))).toBe(true);
  });
});

describe("assignPrizeRanks", () => {
  it("split is 60/30/10", () => {
    expect(PRIZE_SPLIT_PCT).toEqual([60, 30, 10]);
  });

  it("no AIs => identical to the overall top 3 (spec case)", () => {
    const out = assignPrizeRanks([
      row({ membershipId: "a", pontos: 30 }),
      row({ membershipId: "b", pontos: 20 }),
      row({ membershipId: "c", pontos: 10 }),
      row({ membershipId: "d", pontos: 5 }),
    ]);
    expect(out.map((r) => [r.overallRank, r.humanPrizeRank, r.prizePct])).toEqual([
      [1, 1, 60],
      [2, 2, 30],
      [3, 3, 10],
      [4, null, null],
    ]);
  });

  it("AI in 1st => humans in 2nd/3rd/4th get 60/30/10 (spec example)", () => {
    const out = assignPrizeRanks([
      row({ membershipId: "claude", isAi: true, pontos: 99 }),
      row({ membershipId: "lucca", pontos: 30 }),
      row({ membershipId: "joao", pontos: 20 }),
      row({ membershipId: "maria", pontos: 10 }),
    ]);
    expect(out.map((r) => [r.membershipId, r.humanPrizeRank, r.prizePct])).toEqual([
      ["claude", null, null],
      ["lucca", 1, 60],
      ["joao", 2, 30],
      ["maria", 3, 10],
    ]);
    // Overall ranks are untouched by the cascade.
    expect(out.map((r) => r.overallRank)).toEqual([1, 2, 3, 4]);
  });

  it("two AIs in the top 3 => humans in 3rd/4th/5th get 60/30/10 (spec case)", () => {
    const out = assignPrizeRanks([
      row({ membershipId: "claude", isAi: true, pontos: 99 }),
      row({ membershipId: "gemini", isAi: true, pontos: 80 }),
      row({ membershipId: "h1", pontos: 30 }),
      row({ membershipId: "h2", pontos: 20 }),
      row({ membershipId: "h3", pontos: 10 }),
      row({ membershipId: "h4", pontos: 5 }),
    ]);
    const prized = out.filter((r) => r.humanPrizeRank !== null);
    expect(prized.map((r) => [r.membershipId, r.overallRank, r.prizePct])).toEqual([
      ["h1", 3, 60],
      ["h2", 4, 30],
      ["h3", 5, 10],
    ]);
  });

  it("fewer than 3 humans => only the existing humans take shares", () => {
    const out = assignPrizeRanks([
      row({ membershipId: "ai", isAi: true, pontos: 50 }),
      row({ membershipId: "only-human", pontos: 10 }),
    ]);
    expect(out[0].humanPrizeRank).toBeNull();
    expect(out[1]).toMatchObject({ humanPrizeRank: 1, prizePct: 60 });
  });

  it("handles empty input", () => {
    expect(assignPrizeRanks([])).toEqual([]);
  });
});

describe("pickPrizeWinners", () => {
  it("returns only the prized humans, in prize order", () => {
    const winners = pickPrizeWinners([
      row({ membershipId: "ai", isAi: true, pontos: 99 }),
      row({ membershipId: "h1", pontos: 30 }),
      row({ membershipId: "h2", pontos: 20 }),
      row({ membershipId: "h3", pontos: 10 }),
      row({ membershipId: "h4", pontos: 5 }),
    ]);
    expect(winners.map((r) => [r.membershipId, r.prizePct])).toEqual([
      ["h1", 60],
      ["h2", 30],
      ["h3", 10],
    ]);
  });
});
