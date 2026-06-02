"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import {
  PredictionLockedError,
  hasPredictedEntirePhase,
  upsertPrediction,
} from "@/server/predictions";
import type { SavePalpiteState } from "./state";

export async function savePalpiteAction(
  _prev: SavePalpiteState,
  formData: FormData
): Promise<SavePalpiteState> {
  const session = await requireSession();

  const poolId = String(formData.get("poolId") ?? "");
  const matchId = String(formData.get("matchId") ?? "");
  const palpiteHome = Number(formData.get("palpiteHome"));
  const palpiteAway = Number(formData.get("palpiteAway"));

  if (
    !Number.isInteger(palpiteHome) ||
    !Number.isInteger(palpiteAway) ||
    palpiteHome < 0 ||
    palpiteAway < 0
  ) {
    return { status: "error", message: "Placar inválido." };
  }

  const membership = await getMembership(poolId, session.user.id);
  if (!membership) {
    return { status: "error", message: "Você não participa deste bolão." };
  }

  try {
    await upsertPrediction({
      membershipId: membership.id,
      matchId,
      palpiteHome,
      palpiteAway,
    });
  } catch (err) {
    // Locked at write time (contract §5): redirect to the "jogo travado" notice
    // instead of crashing the page. Re-throw anything else.
    if (err instanceof PredictionLockedError) {
      redirect(`/pools/${poolId}/palpites?erro=travado`);
    }
    throw err;
  }

  const phaseComplete = await hasPredictedEntirePhase(membership.id, matchId);

  revalidatePath(`/pools/${poolId}/palpites`);
  return { status: "saved", phaseComplete };
}
