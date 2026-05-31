import { describe, expect, it } from "vitest";
import { formatCentsBRL, reaisToCents } from "./money";

describe("money helpers", () => {
  it("reaisToCents parses a plain integer reais string", () => {
    expect(reaisToCents("25")).toBe(2500);
  });

  it("reaisToCents parses decimals with a dot", () => {
    expect(reaisToCents("25.50")).toBe(2550);
  });

  it("reaisToCents parses decimals with a comma (pt-BR input)", () => {
    expect(reaisToCents("25,50")).toBe(2550);
  });

  it("reaisToCents rounds to the nearest cent", () => {
    expect(reaisToCents("10.999")).toBe(1100);
  });

  it("reaisToCents throws on non-numeric input", () => {
    expect(() => reaisToCents("abc")).toThrow(/valor/i);
  });

  it("reaisToCents throws on negative input", () => {
    expect(() => reaisToCents("-5")).toThrow(/valor/i);
  });

  it("formatCentsBRL renders cents as R$ with two decimals", () => {
    expect(formatCentsBRL(2500)).toBe("R$ 25,00");
    expect(formatCentsBRL(2550)).toBe("R$ 25,50");
    expect(formatCentsBRL(0)).toBe("R$ 0,00");
  });
});
