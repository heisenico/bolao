import { describe, it, expect } from "vitest";
import {
  compareRankingRows,
  rankRows,
  type RankingRow,
} from "@/domain/ranking";

function row(
  partial: Partial<RankingRow> & { membershipId: string },
): RankingRow {
  return {
    membershipId: partial.membershipId,
    nome: partial.nome ?? partial.membershipId,
    pontos: partial.pontos ?? 0,
    cravadas: partial.cravadas ?? 0,
    acertosVencedor: partial.acertosVencedor ?? 0,
    joinedAt: partial.joinedAt ?? new Date("2026-06-01T00:00:00.000Z"),
    image: partial.image ?? null,
  };
}

describe("compareRankingRows", () => {
  it("orders by pontos desc first", () => {
    const a = row({ membershipId: "a", pontos: 10 });
    const b = row({ membershipId: "b", pontos: 20 });
    expect(compareRankingRows(a, b)).toBeGreaterThan(0); // b before a
    expect(compareRankingRows(b, a)).toBeLessThan(0);
  });

  it("breaks pontos tie by cravadas desc", () => {
    const a = row({ membershipId: "a", pontos: 10, cravadas: 2 });
    const b = row({ membershipId: "b", pontos: 10, cravadas: 5 });
    expect(compareRankingRows(a, b)).toBeGreaterThan(0); // b first
    expect(compareRankingRows(b, a)).toBeLessThan(0);
  });

  it("breaks pontos+cravadas tie by acertosVencedor desc", () => {
    const a = row({
      membershipId: "a",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 4,
    });
    const b = row({
      membershipId: "b",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 9,
    });
    expect(compareRankingRows(a, b)).toBeGreaterThan(0); // b first
    expect(compareRankingRows(b, a)).toBeLessThan(0);
  });

  it("breaks full tie by earliest joinedAt asc", () => {
    const early = new Date("2026-05-01T00:00:00.000Z");
    const late = new Date("2026-05-02T00:00:00.000Z");
    const a = row({
      membershipId: "a",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 4,
      joinedAt: late,
    });
    const b = row({
      membershipId: "b",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 4,
      joinedAt: early,
    });
    expect(compareRankingRows(a, b)).toBeGreaterThan(0); // b (earlier) first
    expect(compareRankingRows(b, a)).toBeLessThan(0);
  });

  it("returns 0 only when every tiebreaker is equal", () => {
    const when = new Date("2026-05-01T00:00:00.000Z");
    const a = row({
      membershipId: "a",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 4,
      joinedAt: when,
    });
    const b = row({
      membershipId: "b",
      pontos: 10,
      cravadas: 3,
      acertosVencedor: 4,
      joinedAt: when,
    });
    expect(compareRankingRows(a, b)).toBe(0);
  });
});

describe("rankRows", () => {
  it("returns a sorted copy applying the full tiebreaker chain", () => {
    const early = new Date("2026-05-01T00:00:00.000Z");
    const late = new Date("2026-05-02T00:00:00.000Z");
    const input: RankingRow[] = [
      row({ membershipId: "low", pontos: 5 }),
      row({
        membershipId: "tieLate",
        pontos: 10,
        cravadas: 3,
        acertosVencedor: 4,
        joinedAt: late,
      }),
      row({
        membershipId: "tieEarly",
        pontos: 10,
        cravadas: 3,
        acertosVencedor: 4,
        joinedAt: early,
      }),
      row({ membershipId: "top", pontos: 99 }),
    ];
    const out = rankRows(input);
    expect(out.map((r) => r.membershipId)).toEqual([
      "top",
      "tieEarly",
      "tieLate",
      "low",
    ]);
  });

  it("does not mutate the input array", () => {
    const input: RankingRow[] = [
      row({ membershipId: "a", pontos: 1 }),
      row({ membershipId: "b", pontos: 2 }),
    ];
    const before = input.map((r) => r.membershipId);
    rankRows(input);
    expect(input.map((r) => r.membershipId)).toEqual(before);
  });

  it("handles empty input", () => {
    expect(rankRows([])).toEqual([]);
  });
});
