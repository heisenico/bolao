"use client";

import * as React from "react";
import type { BracketColumn, KnockoutPhase } from "@/domain/bracket";
import { Flag } from "./Flag";

const PHASE_LABEL: Record<KnockoutPhase, string> = {
  r32: "32 avos",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  terceiro: "3º lugar",
  final: "Final",
};

function scoreText(n: number | null): string {
  return n === null ? "–" : String(n);
}

function TeamRow({
  nome,
  codigoPais,
  bandeira,
  placar,
}: {
  nome: string;
  codigoPais: string;
  bandeira: string | null;
  placar: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <Flag codigoPais={codigoPais} bandeira={bandeira} className="h-4 w-6 shrink-0 object-contain" />
        <span className="truncate">{nome}</span>
      </span>
      <span className="font-bold tabular-nums">{scoreText(placar)}</span>
    </div>
  );
}

function MatchCell({ match }: { match: BracketColumn["matches"][number] }) {
  return (
    <div className="rounded-lg border border-borda bg-fundo p-2 text-sm shadow-sm">
      <TeamRow
        nome={match.homeNome}
        codigoPais={match.homeCodigoPais}
        bandeira={match.homeBandeira}
        placar={match.placarHome}
      />
      <div className="mt-1">
        <TeamRow
          nome={match.awayNome}
          codigoPais={match.awayCodigoPais}
          bandeira={match.awayBandeira}
          placar={match.placarAway}
        />
      </div>
    </div>
  );
}

function PhaseColumn({ col }: { col: BracketColumn }) {
  return (
    <section className="flex w-56 shrink-0 flex-col gap-3">
      <h2 className="text-center text-sm font-bold text-texto">
        {PHASE_LABEL[col.fase]}
      </h2>
      <div className="flex h-full flex-col justify-around gap-3">
        {col.matches.length === 0 ? (
          <p className="text-center text-xs text-texto-mudo">A definir</p>
        ) : (
          col.matches.map((mt) => <MatchCell key={mt.id} match={mt} />)
        )}
      </div>
    </section>
  );
}

/**
 * Knockout bracket (CONTRACT §8 screen 5 / SPEC §8.5).
 * Mobile: a phase-navigation tablist swaps a single visible phase panel (the
 * panel itself scrolls horizontally when a phase has many matches). Desktop
 * (lg+): every column sits side by side, the two halves converging toward the
 * final. Flags reuse the shared `Flag` (real crest via `bandeira`, else emoji).
 */
export function Bracket({ columns }: { columns: BracketColumn[] }) {
  const [activeFase, setActiveFase] = React.useState<KnockoutPhase>(
    columns[0]?.fase ?? "r32"
  );

  const hasAnyMatch = columns.some((c) => c.matches.length > 0);
  if (!hasAnyMatch) {
    return (
      <p className="rounded-lg border border-dashed border-borda bg-fundo p-8 text-center text-sm text-texto-mudo">
        O chaveamento aparece após a fase de grupos.
      </p>
    );
  }

  const activeColumn =
    columns.find((c) => c.fase === activeFase) ?? columns[0];

  const tabId = (fase: KnockoutPhase) => `bracket-tab-${fase}`;
  // One panel is rendered at a time (the active phase), so every tab points its
  // aria-controls at this single, always-present panel id (APG single-panel form).
  const PANEL_ID = "bracket-panel";

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const index = columns.findIndex((c) => c.fase === activeFase);
    if (index === -1) return;
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % columns.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + columns.length) % columns.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = columns.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const next = columns[nextIndex];
    if (next) {
      setActiveFase(next.fase);
      document.getElementById(tabId(next.fase))?.focus();
    }
  }

  return (
    <div>
      {/* Mobile (<lg): phase navigation + single scrolling phase panel. */}
      <div className="lg:hidden">
        <div
          role="tablist"
          aria-label="Navegação por fase"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2"
        >
          {columns.map((col) => {
            const selected = col.fase === activeFase;
            return (
              <button
                key={col.fase}
                id={tabId(col.fase)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveFase(col.fase)}
                onKeyDown={handleTabKeyDown}
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                  selected
                    ? "bg-verde-acao text-white"
                    : "bg-fundo-secao text-texto-mudo"
                }`}
              >
                {PHASE_LABEL[col.fase]}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={tabId(activeColumn.fase)}
          tabIndex={0}
          className="mt-3 overflow-x-auto"
        >
          <div className="flex min-w-max justify-center">
            <PhaseColumn col={activeColumn} />
          </div>
        </div>
      </div>

      {/* Desktop (lg+): all columns side by side, converging to the final. */}
      <div className="hidden overflow-x-auto lg:block">
        <div className="flex min-w-max items-stretch gap-4 lg:justify-center">
          {columns.map((col) => (
            <PhaseColumn key={col.fase} col={col} />
          ))}
        </div>
      </div>
    </div>
  );
}
