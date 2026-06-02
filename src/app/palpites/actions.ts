"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import { PredictionLockedError, upsertPrediction } from "@/server/predictions";

export async function savePalpiteAction(formData: FormData): Promise<void> {
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
    throw new Error("Placar inválido");
  }

  const membership = await getMembership(poolId, session.user.id);
  if (!membership) {
    throw new Error("Você não participa deste bolão");
  }

  try {
    await upsertPrediction({
      membershipId: membership.id,
      matchId,
      palpiteHome,
      palpiteAway,
    });
  } catch (err) {
    // Locked at write time (contract §5): surface a "jogo travado" message
    // instead of crashing the page. Re-throw anything else.
    if (err instanceof PredictionLockedError) {
      redirect(`/pools/${poolId}/palpites?erro=travado`);
    }
    throw err;
  }

  revalidatePath(`/pools/${poolId}/palpites`);
}
