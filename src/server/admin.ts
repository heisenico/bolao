import { prisma } from '@/lib/prisma'
import { isBlockAOpen } from '@/domain/deadline'
import { getDeadlineContext } from '@/server/deadlines'

/** Thrown when a non-owner attempts an admin action. No silent fallbacks. */
export class OwnershipError extends Error {
  constructor(message = 'Apenas o organizador do bolão pode fazer isso.') {
    super(message)
    this.name = 'OwnershipError'
  }
}

/** Thrown when removal is attempted after the Block A deadline. */
export class RemovalClosedError extends Error {
  constructor(
    message = 'Não é mais possível remover participantes: o Bloco A já encerrou (1h antes da abertura).',
  ) {
    super(message)
    this.name = 'RemovalClosedError'
  }
}

/**
 * Load a pool for the admin screen, asserting the caller owns it.
 * Includes memberships (with user) ordered by joinedAt for member management.
 */
export async function getAdminPool(poolId: string, callerUserId: string) {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: {
      memberships: {
        orderBy: { joinedAt: 'asc' },
        include: { user: true },
      },
    },
  })
  if (pool.ownerId !== callerUserId) throw new OwnershipError()
  return pool
}

/**
 * Remove a member from a pool. Owner-only, and only while Block A is open:
 * late entry is forbidden, so a removal after lock could not be undone and
 * would distort an already-locked pool. Cascades delete predictions/payments.
 */
export async function removeMember(
  membershipId: string,
  callerUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
    include: { pool: true },
  })
  if (membership.pool.ownerId !== callerUserId) throw new OwnershipError()
  const { openingKickoffUtc } = await getDeadlineContext()
  if (!isBlockAOpen(openingKickoffUtc, now)) throw new RemovalClosedError()
  await prisma.poolMembership.delete({ where: { id: membershipId } })
}
