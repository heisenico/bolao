import { PaymentStatus, type PoolMembership } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
