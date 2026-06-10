"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PrizeType } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import { PRIZE_TYPES } from "@/domain/awards";
import {
  PrizePredictionLockedError,
  upsertPrizePrediction,
} from "@/server/prizes";

function isPrizeType(value: string): value is PrizeType {
  return (PRIZE_TYPES as string[]).includes(value);
}

export async function savePremioAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const poolId = String(formData.get("poolId") ?? "");
  const prizeType = String(formData.get("prizeType") ?? "");
  const value = String(formData.get("value") ?? "");

  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  if (!isPrizeType(prizeType) || !value.trim()) {
    redirect(`/pools/${poolId}/premios?erro=invalido`);
  }

  try {
    await upsertPrizePrediction({
      membershipId: membership.id,
      prizeType,
      value,
    });
  } catch (err) {
    // Locked at write time: redirect to the "travado" notice instead of
    // crashing the page. Re-throw anything else.
    if (err instanceof PrizePredictionLockedError) {
      redirect(`/pools/${poolId}/premios?erro=travado`);
    }
    throw err;
  }

  revalidatePath(`/pools/${poolId}/premios`);
  redirect(`/pools/${poolId}/premios?ok=${prizeType}`);
}
