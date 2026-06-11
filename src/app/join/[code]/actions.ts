"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { EntryClosedError, joinPool } from "@/server/pools";
import { markPaidAsUser } from "@/server/payments";

/**
 * Ensure the viewer is a member of the pool for `code`.
 * Returns the membership id, or null when entry has closed (contract §11.5):
 * the join page renders the "inscrições encerradas" state from a null result.
 * Re-throws anything that is not EntryClosedError (no silent catch).
 */
export async function joinPoolAction(code: string): Promise<string | null> {
  const session = await requireSession();
  try {
    const membership = await joinPool({
      inviteCode: code,
      userId: session.user.id,
    });
    return membership.id;
  } catch (err) {
    if (err instanceof EntryClosedError) return null;
    throw err;
  }
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const membershipId = String(formData.get("membershipId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!membershipId) throw new Error("membershipId ausente");
  // markPaidAsUser (server module, not an action) verifies the caller owns the
  // membership — a raw membershipId cannot flip another user's status.
  await markPaidAsUser(session.user.id, membershipId);
  revalidatePath(`/join/${code}`);
}
