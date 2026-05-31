import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createPool, joinPool } from './pools'
import { markPaid } from './payments'

describe('payments service (integration)', () => {
  let membershipId: string

  beforeEach(async () => {
    const owner = await prisma.user.create({ data: { email: `o-${Date.now()}@test.dev` } })
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'Pay Pool',
      valorEntrada: 3000,
      chavePix: 'o@pix',
    })
    const member = await prisma.user.create({ data: { email: `m-${Date.now()}@test.dev` } })
    const membership = await joinPool({ inviteCode: pool.inviteCode, userId: member.id })
    membershipId = membership.id
  })

  it('markPaid flips paymentStatus from pendente to pago', async () => {
    const before = await prisma.poolMembership.findUnique({ where: { id: membershipId } })
    expect(before?.paymentStatus).toBe('pendente')

    const updated = await markPaid(membershipId)
    expect(updated.paymentStatus).toBe('pago')

    const persisted = await prisma.poolMembership.findUnique({ where: { id: membershipId } })
    expect(persisted?.paymentStatus).toBe('pago')
  })

  it('markPaid is idempotent when already pago', async () => {
    await markPaid(membershipId)
    const again = await markPaid(membershipId)
    expect(again.paymentStatus).toBe('pago')
  })

  it('markPaid throws for an unknown membership id', async () => {
    await expect(markPaid('does-not-exist')).rejects.toThrow()
  })
})
