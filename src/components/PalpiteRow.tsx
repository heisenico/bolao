"use client";

import { useActionState, useEffect, useState } from "react";
import { Flag } from "@/components/Flag";
import { SubmitButton } from "@/components/SubmitButton";
import { CheckDraw } from "@/components/CheckDraw";
import { savePalpiteAction } from "@/app/palpites/actions";
import { SAVE_PALPITE_IDLE } from "@/app/palpites/state";

interface TeamLite {
  nome: string;
  codigoPais: string;
  bandeira: string | null;
}

/**
 * One editable match in the palpites list (unlocked matches only; locked ones are
 * display-only and stay server-rendered). Owns the score inputs and the save.
 *
 * Delight, scoped to this single moment: on a successful save the "feito" pill
 * settles in and a checkmark draws itself (the quiet baseline). When that save
 * was the one that filled in every match of the phase, a contained "fase
 * completa" line settles in and auto-dismisses (the warm touch). Both replay per
 * save via `saveCount`, never on reload, and collapse to instant under
 * prefers-reduced-motion. A polite live region voices the same to screen readers.
 */
export function PalpiteRow({
  poolId,
  matchId,
  home,
  away,
  grupo,
  hasPrediction,
  defaultHome,
  defaultAway,
}: {
  poolId: string;
  matchId: string;
  home: TeamLite;
  away: TeamLite;
  grupo: string | null;
  hasPrediction: boolean;
  defaultHome: number | null;
  defaultAway: number | null;
}) {
  const [state, formAction] = useActionState(
    savePalpiteAction,
    SAVE_PALPITE_IDLE
  );

  // Detect each new save result during render (the sanctioned alternative to a
  // state-syncing effect): bump a counter so the checkmark / pill / note remount
  // and replay their entrance, and arm the transient "fase completa" note. The
  // guard settles after one extra render, so this never loops.
  const [seen, setSeen] = useState(state);
  const [saveCount, setSaveCount] = useState(0);
  const [showPhaseNote, setShowPhaseNote] = useState(false);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "saved") {
      setSaveCount((n) => n + 1);
      setShowPhaseNote(state.phaseComplete);
    }
  }

  // Keep "fase completa" a passing moment, not persistent UI. The only setState
  // here runs from the timer callback, never synchronously in the effect body.
  useEffect(() => {
    if (!showPhaseNote) return;
    const t = setTimeout(() => setShowPhaseNote(false), 4500);
    return () => clearTimeout(t);
  }, [showPhaseNote, saveCount]);

  const done = state.status === "saved" || hasPrediction;
  const animate = saveCount > 0;
  const error = state.status === "error" ? state.message : null;
  const liveMessage =
    state.status === "saved"
      ? state.phaseComplete
        ? "Fase completa. Todos os palpites enviados."
        : "Palpite salvo."
      : state.status === "error"
        ? state.message
        : "";

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-md border border-border p-4"
    >
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="matchId" value={matchId} />

      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <Flag
            codigoPais={home.codigoPais}
            bandeira={home.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
          <span className="truncate">{home.nome}</span>
        </span>
        <input
          name="palpiteHome"
          type="number"
          min={0}
          max={99}
          step={1}
          inputMode="numeric"
          defaultValue={defaultHome ?? ""}
          aria-label={`Placar de ${home.nome}`}
          className="w-14 rounded-md border border-border px-2 py-1 text-center"
        />
        <span>x</span>
        <input
          name="palpiteAway"
          type="number"
          min={0}
          max={99}
          step={1}
          inputMode="numeric"
          defaultValue={defaultAway ?? ""}
          aria-label={`Placar de ${away.nome}`}
          className="w-14 rounded-md border border-border px-2 py-1 text-center"
        />
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{away.nome}</span>
          <Flag
            codigoPais={away.codigoPais}
            bandeira={away.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span
            key={saveCount}
            data-status={done ? "feito" : "pendente"}
            className={
              done
                ? `inline-flex items-center gap-1 text-accent-strong${animate ? " feito--in" : ""}`
                : "text-ink-muted"
            }
          >
            {done ? (
              <>
                <CheckDraw animate={animate} />
                feito
              </>
            ) : (
              "pendente"
            )}
          </span>
          {grupo ? (
            <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
              Grupo {grupo}
            </span>
          ) : null}
        </span>
        <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {showPhaseNote ? (
        <p
          key={`note-${saveCount}`}
          className="phase-note mt-1 flex items-center gap-2 text-sm font-semibold text-accent-strong"
        >
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <span
              aria-hidden="true"
              className="phase-note__ring absolute inset-0 rounded-full bg-accent/25 opacity-0"
            />
            <CheckDraw animate className="relative" />
          </span>
          Fase completa: todos os palpites enviados.
        </p>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </form>
  );
}
