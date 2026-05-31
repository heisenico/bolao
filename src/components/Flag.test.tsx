// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Flag } from "@/components/Flag";

describe("Flag", () => {
  it("renders the regional-indicator emoji flag for a 2-letter code (BR)", () => {
    render(<Flag codigoPais="BR" />);
    // 🇧🇷 = U+1F1E7 U+1F1F7 (regional indicators B + R)
    expect(screen.getByText("\u{1F1E7}\u{1F1F7}")).toBeInTheDocument();
  });

  it("is case-insensitive (lowercase 'br' yields the same flag)", () => {
    render(<Flag codigoPais="br" />);
    expect(screen.getByText("\u{1F1E7}\u{1F1F7}")).toBeInTheDocument();
  });

  it("falls back to the raw code when it is not exactly 2 letters", () => {
    render(<Flag codigoPais="BRA" />);
    expect(screen.getByText("BRA")).toBeInTheDocument();
  });

  it("falls back to the raw code when it contains non-letters", () => {
    render(<Flag codigoPais="B1" />);
    expect(screen.getByText("B1")).toBeInTheDocument();
  });

  it("applies the className prop", () => {
    render(<Flag codigoPais="AR" className="text-2xl" />);
    expect(screen.getByText("\u{1F1E6}\u{1F1F7}")).toHaveClass("text-2xl");
  });
});
