"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary app navigation (a11y landmark + cross-screen wayfinding). When given a
 * poolId it renders the links for that bolão (Início / Palpites / Ranking /
 * Mata-mata) plus a "Meus bolões" link back to the list. Without a poolId it
 * falls back to the legacy flat links (kept only during the route cut-over).
 * Client component: needs the active route for aria-current.
 */
export function AppNav({ poolId }: { poolId: string }) {
  const pathname = usePathname();

  const links = [
    { href: `/pools/${poolId}`, label: "Início" },
    { href: `/pools/${poolId}/palpites`, label: "Palpites" },
    { href: `/pools/${poolId}/ranking`, label: "Ranking" },
    { href: `/pools/${poolId}/bracket`, label: "Mata-mata" },
    { href: "/dashboard", label: "Meus bolões" },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="flex gap-1 overflow-x-auto border-b border-border pb-2"
    >
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              "shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition-colors " +
              (active
                ? "bg-surface-muted text-ink"
                : "text-ink-soft hover:bg-surface-muted hover:text-ink")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
