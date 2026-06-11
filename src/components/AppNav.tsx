"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary app navigation (a11y landmark + cross-screen wayfinding).
 *
 * Mobile-first: on phones the five pool destinations live in a FIXED BOTTOM
 * tab bar (thumb-reachable, 44px+ targets, iOS safe-area padding) and a slim
 * top row keeps the way back to "Meus bolões". From `md` up it collapses into
 * the original single top bar. The matching `main` bottom padding lives in
 * globals.css (keyed off [data-bottom-tabs]).
 * Client component: needs the active route for aria-current.
 */
export function AppNav({ poolId }: { poolId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/pools/${poolId}`, label: "Início" },
    { href: `/pools/${poolId}/palpites`, label: "Palpites" },
    { href: `/pools/${poolId}/premios`, label: "Prêmios" },
    { href: `/pools/${poolId}/ranking`, label: "Ranking" },
    { href: `/pools/${poolId}/bracket`, label: "Mata-mata" },
  ];
  const meusBoloes = { href: "/dashboard", label: "Meus bolões" };

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Phones: slim top row back to the pool list. */}
      <nav
        aria-label="Meus bolões"
        className="flex items-center justify-between border-b border-border pb-2 md:hidden"
      >
        <Link
          href={meusBoloes.href}
          aria-current={isActive(meusBoloes.href) ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-ink-soft"
        >
          ← {meusBoloes.label}
        </Link>
      </nav>

      {/* Phones: fixed bottom tab bar with the high-frequency destinations. */}
      <nav
        aria-label="Navegação principal"
        data-bottom-tabs
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-12 min-w-0 flex-1 basis-0 items-center justify-center px-1 py-2 text-center text-xs " +
                (active
                  ? "font-bold text-accent-strong"
                  : "font-medium text-ink-muted")
              }
            >
              <span className="truncate">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* md+: the original single top bar with every destination. */}
      <nav
        aria-label="Navegação principal"
        className="hidden gap-1 overflow-x-auto border-b border-border pb-2 md:flex"
      >
        {[...tabs, meusBoloes].map((l) => {
          const active = isActive(l.href);
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
    </>
  );
}
