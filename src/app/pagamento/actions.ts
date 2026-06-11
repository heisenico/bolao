"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { getMembership } from "@/server/pools";
import { markPaid } from "@/server/payments";

/**
 * Member taps "Já paguei" on the pool payment screen. The membership is
 * resolved from the session + poolId (never from the form), so it is always
 * the caller's own.
 */
export async function markPaidPoolAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const poolId = String(formData.get("poolId") ?? "");

  const membership = await getMembership(poolId, session.user.id);
  if (!membership) redirect("/dashboard");

  await markPaid(membership.id);

  revalidatePath(`/pools/${poolId}`);
  revalidatePath(`/pools/${poolId}/pagamento`);
}
