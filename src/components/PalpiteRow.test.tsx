// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stub the server action so jsdom never loads its server-only imports (prisma,
// session). The render tests below never dispatch it; they assert the
// presentational contract of the row.
vi.mock("@/app/palpites/actions", () => ({ savePalpiteAction: vi.fn() }));

import { PalpiteRow } from "./PalpiteRow";

afterEach(cleanup);

const baseProps = {
  poolId: "pool-1",
  matchId: "match-1",
  grupo: "A",
  home: { nome: "Brasil", codigoPais: "BR", bandeira: null },
  away: { nome: "Argentina", codigoPais: "AR", bandeira: null },
};

describe("PalpiteRow", () => {
  it("renders both score inputs and a Salvar button", () => {
    render(
      <PalpiteRow
        {...baseProps}
        hasPrediction={false}
        defaultHome={null}
        defaultAway={null}
      />
    );
    expect(screen.getByLabelText("Placar de Brasil")).toBeInTheDocument();
    expect(screen.getByLabelText("Placar de Argentina")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar" })
    ).toBeInTheDocument();
  });

  it("carries poolId and matchId as hidden fields", () => {
    const { container } = render(
      <PalpiteRow
        {...baseProps}
        hasPrediction={false}
        defaultHome={null}
        defaultAway={null}
      />
    );
    expect(
      container.querySelector('input[name="poolId"]')
    ).toHaveValue("pool-1");
    expect(
      container.querySelector('input[name="matchId"]')
    ).toHaveValue("match-1");
  });

  it("shows the pendente state and no checkmark when there is no prediction", () => {
    const { container } = render(
      <PalpiteRow
        {...baseProps}
        hasPrediction={false}
        defaultHome={null}
        defaultAway={null}
      />
    );
    expect(container.querySelector('[data-status="pendente"]')).not.toBeNull();
    expect(container.querySelector('[data-status="feito"]')).toBeNull();
    expect(container.querySelector("svg.check-draw--in")).toBeNull();
  });

  it("shows the feito state with a static (undrawn-class-free) checkmark for an existing prediction", () => {
    const { container } = render(
      <PalpiteRow
        {...baseProps}
        hasPrediction
        defaultHome={2}
        defaultAway={1}
      />
    );
    const status = container.querySelector('[data-status="feito"]');
    expect(status).not.toBeNull();
    expect(status!.querySelector("path.check-draw__path")).not.toBeNull();
    // On first paint the check is static, not freshly drawn.
    expect(container.querySelector("svg.check-draw--in")).toBeNull();
    expect(screen.getByLabelText("Placar de Brasil")).toHaveValue(2);
    expect(screen.getByLabelText("Placar de Argentina")).toHaveValue(1);
  });

  it("exposes a polite live region for save announcements", () => {
    render(
      <PalpiteRow
        {...baseProps}
        hasPrediction={false}
        defaultHome={null}
        defaultAway={null}
      />
    );
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});
