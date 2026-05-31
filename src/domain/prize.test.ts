import { describe, it, expect } from "vitest";
import { computePrize, pickWinner } from "@/domain/prize";
import type { RankingRow } from "@/domain/ranking";

function row(over: Partial<RankingRow>): RankingRow {
  return {
    membershipId: over.membershipId ?? "m1",
    nome: over.nome ?? "Ana",
    pontos: over.pontos ?? 0,
    cravadas: over.cravadas ?? 0,
    acertosVencedor: over.acertosVencedor ?? 0,
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

describe("pickWinner", () => {
  it("returns null for an empty ranking", () => {
    expect(pickWinner([])).toBeNull();
  });

  it("returns the first row of an already-ranked list", () => {
    const ranked = [
      row({ membershipId: "win", pontos: 30 }),
      row({ membershipId: "second", pontos: 20 }),
    ];
    expect(pickWinner(ranked)?.membershipId).toBe("win");
  });

  it("does not re-sort; trusts caller-provided order", () => {
    const ranked = [
      row({ membershipId: "a", pontos: 5 }),
      row({ membershipId: "b", pontos: 99 }),
    ];
    expect(pickWinner(ranked)?.membershipId).toBe("a");
  });
});
