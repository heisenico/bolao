// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/Button";

describe("Button", () => {
  it("renders its children as the label", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("applies the verde-acao primary background by default", () => {
    render(<Button>Confirmar palpite</Button>);
    const btn = screen.getByRole("button", { name: "Confirmar palpite" });
    expect(btn.className).toContain("bg-verde-acao");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("uses a neutral background for the secondary variant", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const btn = screen.getByRole("button", { name: "Cancelar" });
    expect(btn.className).toContain("bg-fundo-secao");
    expect(btn.className).not.toContain("bg-verde-acao");
  });
});
