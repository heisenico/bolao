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
