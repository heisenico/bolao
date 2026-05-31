import { prisma } from '@/lib/prisma'

/** Thrown when a non-owner attempts an admin action. No silent fallbacks. */
export class OwnershipError extends Error {
  constructor(message = 'Apenas o organizador do bolão pode fazer isso.') {
    super(message)
    this.name = 'OwnershipError'
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

/** Remove a member from a pool. Owner-only. Cascades delete predictions/payments. */
export async function removeMember(membershipId: string, callerUserId: string): Promise<void> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
    include: { pool: true },
  })
  if (membership.pool.ownerId !== callerUserId) throw new OwnershipError()
  await prisma.poolMembership.delete({ where: { id: membershipId } })
}
