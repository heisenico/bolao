import { PaymentStatus, type PoolMembership } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { OwnershipError } from '@/server/admin'
import type { RankingRow } from '@/domain/ranking'
import { computePrize, pickWinner } from '@/domain/prize'
import { computeStandings } from '@/server/ranking'

/**
 * Member self-declares "já paguei": pendente -> pago.
 * Admin confirmation (pago -> confirmado) is Plan D (confirmPayment).
 */
export async function markPaid(membershipId: string): Promise<PoolMembership> {
  return prisma.poolMembership.update({
    where: { id: membershipId },
    data: { paymentStatus: PaymentStatus.pago },
  })
}

/**
 * Admin confirms a member's PIX (CONTRACT §7 step 3): set membership
 * paymentStatus = confirmado and upsert a single PaymentRecord stamped with
 * valor = pool.valorEntrada, metodo = 'PIX', confirmadoPor / confirmadoEm.
 * Idempotent: re-confirming keeps a single record.
 */
export async function confirmPayment(membershipId: string, adminId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await tx.poolMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { pool: true },
    })
    // Authorization: only the owner of the membership's pool may confirm it.
    // Guards against a pool owner passing a membershipId from a pool they do
    // not own and corrupting that pool's confirmed-entry count / prize pot.
    if (membership.pool.ownerId !== adminId) throw new OwnershipError()

    await tx.poolMembership.update({
      where: { id: membershipId },
      data: { paymentStatus: PaymentStatus.confirmado },
    })

    const existing = await tx.paymentRecord.findFirst({ where: { membershipId } })
    if (existing) {
      await tx.paymentRecord.update({
        where: { id: existing.id },
        data: { confirmadoPor: adminId, confirmadoEm: new Date() },
      })
    } else {
      await tx.paymentRecord.create({
        data: {
          membershipId,
          valor: membership.pool.valorEntrada,
          metodo: 'PIX',
          confirmadoPor: adminId,
          confirmadoEm: new Date(),
        },
      })
    }
  })
}

/**
 * Winner-takes-all prize summary (CONTRACT §4 / §6 signature). The pot counts
 * ONLY confirmed entries: total = (# memberships with paymentStatus=confirmado)
 * * pool.valorEntrada (integer BRL cents). winner = top ranked row.
 * computeStandings is already tiebreaker-sorted, so it is passed straight to
 * pickWinner — no re-sort here.
 */
export async function prizeSummary(
  poolId: string,
): Promise<{ total: number; winner: RankingRow | null }> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  const confirmedEntriesCount = await prisma.poolMembership.count({
    where: { poolId, paymentStatus: PaymentStatus.confirmado },
  })
  const total = computePrize(confirmedEntriesCount, pool.valorEntrada)

  const standings = await computeStandings(poolId)
  const winner = pickWinner(standings)

  return { total, winner }
}
