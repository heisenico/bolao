// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { Bracket } from "./Bracket";
import { buildBracket, KNOCKOUT_PHASES } from "@/domain/bracket";
import type { BracketMatch } from "@/domain/bracket";

function m(over: Partial<BracketMatch>): BracketMatch {
  return {
    id: over.id ?? "x",
    fase: over.fase ?? "r32",
    dataHora: over.dataHora ?? new Date("2026-07-01T18:00:00Z"),
    homeNome: over.homeNome ?? "Brasil",
    awayNome: over.awayNome ?? "Croacia",
    homeCodigoPais: over.homeCodigoPais ?? "BR",
    awayCodigoPais: over.awayCodigoPais ?? "HR",
    homeBandeira: over.homeBandeira ?? null,
    awayBandeira: over.awayBandeira ?? null,
    placarHome: over.placarHome ?? null,
    placarAway: over.placarAway ?? null,
  };
}

describe("Bracket", () => {
  it("renders team names and the final score for a knockout match", () => {
    const columns = buildBracket([
      m({
        id: "k1",
        fase: "r32",
        homeNome: "Brasil",
        awayNome: "Croacia",
        placarHome: 2,
        placarAway: 0,
      }),
    ]);
    render(<Bracket columns={columns} />);
    expect(screen.getAllByText("Brasil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Croacia").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("renders a phase label for every knockout phase, in r32..final order", () => {
    const columns = buildBracket([m({ id: "k1", fase: "r32" })]);
    render(<Bracket columns={columns} />);
    const expectedLabels = [
      "32 avos",
      "Oitavas",
      "Quartas",
      "Semifinal",
      "3º lugar",
      "Final",
    ];
    for (const label of expectedLabels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(KNOCKOUT_PHASES.length).toBe(expectedLabels.length);
  });

  it("renders both teams' flags, preferring the crest image when bandeira is set", () => {
    const crest = "https://crests.football-data.org/764.png";
    const columns = buildBracket([
      m({
        id: "k1",
        fase: "r32",
        homeNome: "Brasil",
        homeCodigoPais: "BRA",
        homeBandeira: crest,
        awayNome: "Croacia",
        awayCodigoPais: "CRO",
        awayBandeira: null,
      }),
    ]);
    const { container } = render(<Bracket columns={columns} />);
    // Home flag is the real crest image (bandeira passed through to Flag).
    // Flag renders crests with a decorative empty alt, so query by src.
    const imgs = Array.from(container.querySelectorAll("img")).filter(
      (i) => i.getAttribute("src") === crest
    );
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0].tagName).toBe("IMG");
    // Away flag falls back to the emoji/code path (no bandeira).
    expect(screen.getAllByLabelText("CRO").length).toBeGreaterThan(0);
  });

  it("shows a placeholder dash for matches without a score yet", () => {
    const columns = buildBracket([
      m({ id: "k1", fase: "final", placarHome: null, placarAway: null }),
    ]);
    render(<Bracket columns={columns} />);
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("renders a global empty state when there are no knockout matches", () => {
    const columns = buildBracket([{ ...m({ id: "g1", fase: "grupos" }) }]);
    render(<Bracket columns={columns} />);
    expect(
      screen.getByText("O chaveamento aparece após a fase de grupos.")
    ).toBeInTheDocument();
  });

  it("offers mobile phase navigation that switches the selected phase tab", () => {
    const columns = buildBracket([
      m({ id: "r", fase: "r32", homeNome: "Brasil", awayNome: "Croacia" }),
      m({ id: "f", fase: "final", homeNome: "Franca", awayNome: "Espanha" }),
    ]);
    render(<Bracket columns={columns} />);

    // The mobile phase navigation exposes a tab per phase.
    const nav = screen.getByRole("tablist", { name: /fase/i });
    const r32Tab = within(nav).getByRole("tab", { name: "32 avos" });
    const finalTab = within(nav).getByRole("tab", { name: "Final" });
    // First phase selected by default.
    expect(r32Tab).toHaveAttribute("aria-selected", "true");
    expect(finalTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(finalTab);
    expect(finalTab).toHaveAttribute("aria-selected", "true");
    expect(r32Tab).toHaveAttribute("aria-selected", "false");
  });
});
