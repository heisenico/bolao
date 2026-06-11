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

/** Clamp a stepped score to the 0..99 a scoreline can hold. */
function stepScore(current: string, delta: number): string {
  const parsed = parseInt(current, 10);
  const base = Number.isNaN(parsed) ? 0 : parsed;
  return String(Math.min(99, Math.max(0, base + delta)));
}

/**
 * One score field as a thumb-friendly stepper: big −/+ targets (44px) around
 * a numeric input that still accepts direct typing (inputmode="numeric").
 */
function ScoreStepper({
  name,
  value,
  onChange,
  teamNome,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  teamNome: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Diminuir placar de ${teamNome}`}
        onClick={() => onChange(stepScore(value, -1))}
        className="h-11 w-11 shrink-0 rounded-md border border-border text-xl font-bold text-ink-soft active:bg-surface-muted"
      >
        −
      </button>
      <input
        name={name}
        type="number"
        min={0}
        max={99}
        step={1}
        required
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Placar de ${teamNome}`}
        className="h-11 w-12 rounded-md border border-border px-1 text-center text-base"
      />
      <button
        type="button"
        aria-label={`Aumentar placar de ${teamNome}`}
        onClick={() => onChange(stepScore(value, 1))}
        className="h-11 w-11 shrink-0 rounded-md border border-border text-xl font-bold text-ink-soft active:bg-surface-muted"
      >
        +
      </button>
    </span>
  );
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

  // Controlled scores so the steppers and direct typing share one source of
  // truth; initialized from the saved palpite when there is one.
  const [homeScore, setHomeScore] = useState(
    defaultHome !== null ? String(defaultHome) : ""
  );
  const [awayScore, setAwayScore] = useState(
    defaultAway !== null ? String(defaultAway) : ""
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

      {/* Teams line, then a thumb-friendly stepper line — fits 360px wide. */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <Flag
            codigoPais={home.codigoPais}
            bandeira={home.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
          <span className="truncate">{home.nome}</span>
        </span>
        <span className="text-sm text-ink-muted">x</span>
        <span className="flex min-w-0 items-center justify-end gap-2 font-semibold">
          <span className="truncate">{away.nome}</span>
          <Flag
            codigoPais={away.codigoPais}
            bandeira={away.bandeira}
            className="h-4 w-6 shrink-0 object-cover"
          />
        </span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <ScoreStepper
          name="palpiteHome"
          value={homeScore}
          onChange={setHomeScore}
          teamNome={home.nome}
        />
        <span aria-hidden="true">x</span>
        <ScoreStepper
          name="palpiteAway"
          value={awayScore}
          onChange={setAwayScore}
          teamNome={away.nome}
        />
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
