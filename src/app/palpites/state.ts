/**
 * Result of `savePalpiteAction`, surfaced to the client via `useActionState` so
 * the palpite form can confirm a save (quiet checkmark) and mark the moment the
 * whole phase is filled in (`phaseComplete`). Kept in a plain module because a
 * `"use server"` file may only export async functions, not a type or constant.
 */
export type SavePalpiteState =
  | { status: "idle" }
  | { status: "saved"; phaseComplete: boolean }
  | { status: "error"; message: string };

export const SAVE_PALPITE_IDLE: SavePalpiteState = { status: "idle" };
