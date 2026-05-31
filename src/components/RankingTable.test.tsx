// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RankingTable } from "./RankingTable";
import type { RankingRow } from "@/domain/ranking";

afterEach(cleanup);

const rows: RankingRow[] = [
  {
    membershipId: "a",
    nome: "Alice",
    pontos: 7,
    cravadas: 2,
    acertosVencedor: 1,
    joinedAt: new Date("2026-05-01T00:00:00.000Z"),
    image: "https://img/alice.png",
  },
  {
    membershipId: "b",
    nome: "Bob",
    pontos: 3,
    cravadas: 0,
    acertosVencedor: 3,
    joinedAt: new Date("2026-05-02T00:00:00.000Z"),
    image: null,
  },
];

/** Returns the <tr> elements in render order. */
function bodyRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("tbody tr"));
}

function cell(row: HTMLElement, name: string): HTMLElement {
  return row.querySelector(`[data-cell="${name}"]`) as HTMLElement;
}

describe("RankingTable", () => {
  it("renders rows in order, one per member with name", () => {
    const { container } = render(<RankingTable rows={rows} />);
    const trs = bodyRows(container);
    expect(trs).toHaveLength(2);
    expect(within(trs[0]).getByText("Alice")).toBeInTheDocument();
    expect(within(trs[1]).getByText("Bob")).toBeInTheDocument();
  });

  it("shows position, pontos, and cravadas per row", () => {
    const { container } = render(<RankingTable rows={rows} />);
    const [first, second] = bodyRows(container);

    expect(cell(first, "position")).toHaveTextContent("1");
    expect(cell(first, "pontos")).toHaveTextContent("7");
    expect(cell(first, "cravadas")).toHaveTextContent("2");

    expect(cell(second, "position")).toHaveTextContent("2");
    expect(cell(second, "pontos")).toHaveTextContent("3");
    expect(cell(second, "cravadas")).toHaveTextContent("0");
  });

  it("renders an avatar image when image is set", () => {
    render(<RankingTable rows={rows} />);
    const img = screen.getByAltText("Alice") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.src).toContain("https://img/alice.png");
  });

  it("falls back to the name initial when image is null", () => {
    render(<RankingTable rows={rows} />);
    // Bob has no image => a fallback initial "B" is shown instead of an <img>.
    expect(screen.queryByAltText("Bob")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("marks the leader row with data-leader on the first row", () => {
    const { container } = render(<RankingTable rows={rows} />);
    const leader = container.querySelector('[data-leader="true"]');
    expect(leader).not.toBeNull();
    expect(leader!.textContent).toContain("Alice");
    // Only the first row is the leader.
    expect(container.querySelectorAll('[data-leader="true"]')).toHaveLength(1);
  });

  it("renders an empty state when there are no rows", () => {
    render(<RankingTable rows={[]} />);
    expect(screen.getByText(/sem participantes/i)).toBeInTheDocument();
  });
});
