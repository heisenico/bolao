import 'server-only'
import type { PrizeType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { OwnershipError, removeMember } from '@/server/admin'
import { applyManualResult, cancelMatch, syncFixtures } from '@/server/results'
import { applyPrizeResult } from '@/server/prizes'
import { confirmPayment } from '@/server/payments'

// Owner-gated admin operations with EXPLICIT caller ids, for the form actions
// and for tests. Deliberately NOT in a 'use server' module: every export of a
// 'use server' file becomes a POST-reachable server function, and these take
// callerUserId as a parameter — exposing them would let a request impersonate
// the owner. The 'use server' actions resolve the caller from the session and
// delegate here.

/**
 * Assert the given user owns the pool, else throw OwnershipError.
 * WC matches are global (shared across pools), so every admin mutation is gated
 * behind owning the pool it operates under (CONTRACT §6). No silent fallback.
 */
async function assertOwner(callerUserId: string, poolId: string): Promise<void> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  if (pool.ownerId !== callerUserId) throw new OwnershipError()
}

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

export async function applyPrizeResultAsOwner(
  callerUserId: string,
  poolId: string,
  prizeType: PrizeType,
  value: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await applyPrizeResult(prizeType, value)
}
