"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary app navigation (a11y landmark + cross-screen wayfinding). Rendered on
 * the authenticated app pages (dashboard, palpites, ranking, mata-mata). Uses a
 * real <nav> landmark and aria-current so screen-reader users can locate and
 * track navigation. Client component: needs the active route for aria-current.
 */
const LINKS = [
  { href: "/dashboard", label: "Início" },
  { href: "/palpites", label: "Palpites" },
  { href: "/ranking", label: "Ranking" },
  { href: "/bracket", label: "Mata-mata" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="flex gap-1 overflow-x-auto border-b border-border pb-2"
    >
      {LINKS.map((l) => {
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
