"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { OwnershipError } from "@/server/admin";
import { EntryClosedError, joinPool } from "@/server/pools";
import { markPaid } from "@/server/payments";

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

/**
 * Self-declare "já paguei" for a membership the caller owns.
 * Testable id-explicit wrapper (no session): mirrors the admin "AsOwner"
 * pattern. Verifies membership.userId === callerUserId before mutating, so a
 * raw membershipId from FormData cannot be used to flip another user's status.
 */
export async function markPaidAsUser(
  callerUserId: string,
  membershipId: string,
): Promise<void> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
  });
  if (membership.userId !== callerUserId) throw new OwnershipError();
  await markPaid(membershipId);
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const membershipId = String(formData.get("membershipId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!membershipId) throw new Error("membershipId ausente");
  await markPaidAsUser(session.user.id, membershipId);
  revalidatePath(`/join/${code}`);
}
