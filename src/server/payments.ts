import { PaymentStatus, type PoolMembership } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { OwnershipError } from '@/server/admin'
import { computePrize, pickPrizeWinners, type PrizeRankedRow } from '@/domain/prize'
import { computeStandings } from '@/server/ranking'

/**
 * Member self-declares "já paguei": pendente -> pago, stamping
 * pagamentoReportadoEm. Guarded transition: an already-`pago` report is a
 * no-op (keeps the first timestamp), and a `confirmado` membership is never
 * downgraded by a stray tap.
 */
export async function markPaid(membershipId: string): Promise<PoolMembership> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
  })
  if (membership.paymentStatus !== PaymentStatus.pendente) {
    return membership
  }
  return prisma.poolMembership.update({
    where: { id: membershipId },
    data: { paymentStatus: PaymentStatus.pago, pagamentoReportadoEm: new Date() },
  })
}

/**
 * Self-declare "já paguei" for a membership the caller owns. Lives here (NOT in
 * a 'use server' module) so the explicit callerUserId can never be forged via a
 * direct server-action POST. Verifies membership.userId === callerUserId before
 * mutating, so a raw membershipId from FormData cannot flip another user's status.
 */
export async function markPaidAsUser(
  callerUserId: string,
  membershipId: string,
): Promise<void> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
  })
  if (membership.userId !== callerUserId) throw new OwnershipError()
  await markPaid(membershipId)
}

/**
 * Creator rejects a payment report ("marcar como não pago"): pago/confirmado ->
 * pendente, clearing the report timestamp and any confirmation record, in one
 * transaction. For false reports or a confirmation made by mistake.
 */
export async function revertPaymentToPending(
  membershipId: string,
  adminId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await tx.poolMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { pool: true },
    })
    if (membership.pool.ownerId !== adminId) throw new OwnershipError()

    await tx.poolMembership.update({
      where: { id: membershipId },
      data: { paymentStatus: PaymentStatus.pendente, pagamentoReportadoEm: null },
    })
    await tx.paymentRecord.deleteMany({ where: { membershipId } })
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
 * Prize summary (official rules): the pot counts ONLY confirmed entries —
 * total = (# memberships with paymentStatus=confirmado) * pool.valorEntrada
 * (integer BRL cents) — and the top 3 HUMANS split it 60/30/10, cascading past
 * any AI rows. computeStandings is already tiebreaker-sorted, so it is passed
 * straight to pickPrizeWinners — no re-sort here. The app only reports the
 * winners; the organizer pays via PIX outside the app.
 */
export async function prizeSummary(
  poolId: string,
): Promise<{ total: number; winners: PrizeRankedRow[] }> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  const confirmedEntriesCount = await prisma.poolMembership.count({
    where: { poolId, paymentStatus: PaymentStatus.confirmado },
  })
  const total = computePrize(confirmedEntriesCount, pool.valorEntrada)

  const standings = await computeStandings(poolId)
  const winners = pickPrizeWinners(standings)

  return { total, winners }
}
