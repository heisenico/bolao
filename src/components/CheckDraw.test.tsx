// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CheckDraw } from "./CheckDraw";

afterEach(cleanup);

describe("CheckDraw", () => {
  it("renders a decorative svg with the checkmark path", () => {
    const { container } = render(<CheckDraw />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg!.querySelector("path.check-draw__path")).not.toBeNull();
  });

  it("is static (no draw class) at rest", () => {
    const { container } = render(<CheckDraw />);
    expect(container.querySelector("svg")!.classList).not.toContain(
      "check-draw--in"
    );
  });

  it("adds the draw class only when animate is set", () => {
    const { container } = render(<CheckDraw animate />);
    expect(container.querySelector("svg")!.classList).toContain(
      "check-draw--in"
    );
  });
});
