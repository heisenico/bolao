'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { OwnershipError, removeMember } from '@/server/admin'
import { applyManualResult, cancelMatch, syncFixtures } from '@/server/results'
import { confirmPayment } from '@/server/payments'

/**
 * Assert the given user owns the pool, else throw OwnershipError.
 * WC matches are global (shared across pools), so every admin mutation is gated
 * behind owning the pool it operates under (CONTRACT §6). No silent fallback.
 */
async function assertOwner(callerUserId: string, poolId: string): Promise<void> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  if (pool.ownerId !== callerUserId) throw new OwnershipError()
}

// --- testable id-explicit wrappers (ownership logic, no session) ---

export async function applyResultAsOwner(
  callerUserId: string,
  poolId: string,
  matchId: string,
  placarHome: number,
  placarAway: number,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await applyManualResult(matchId, placarHome, placarAway)
}

export async function cancelMatchAsOwner(
  callerUserId: string,
  poolId: string,
  matchId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await cancelMatch(matchId)
}

export async function confirmPaymentAsOwner(
  callerUserId: string,
  poolId: string,
  membershipId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await confirmPayment(membershipId, callerUserId)
}

export async function removeMemberAsOwner(
  callerUserId: string,
  poolId: string,
  membershipId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await removeMember(membershipId, callerUserId)
}

export async function syncFixturesAsOwner(callerUserId: string, poolId: string): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await syncFixtures()
}

// --- 'use server' form-action entrypoints (resolve caller from session) ---

async function currentUserId(): Promise<string> {
  const session = await requireSession()
  return session.user.id
}

export async function applyResultAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  const placarHome = Number(formData.get('placarHome'))
  const placarAway = Number(formData.get('placarAway'))
  await applyResultAsOwner(await currentUserId(), poolId, matchId, placarHome, placarAway)
  revalidatePath(`/admin/${poolId}`)
}

export async function cancelMatchAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  await cancelMatchAsOwner(await currentUserId(), poolId, matchId)
  revalidatePath(`/admin/${poolId}`)
}

export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await confirmPaymentAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await removeMemberAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function syncFixturesAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  await syncFixturesAsOwner(await currentUserId(), poolId)
  revalidatePath(`/admin/${poolId}`)
}
