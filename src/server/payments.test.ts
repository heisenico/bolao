import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { OwnershipError } from '@/server/admin'
import { createPool, joinPool } from './pools'
import { confirmPayment, markPaid } from './payments'

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

describe('confirmPayment cross-pool authorization (integration)', () => {
  let userAId: string
  let userBId: string
  let mMembershipIdInB: string

  beforeEach(async () => {
    const userA = await prisma.user.create({ data: { email: `a-${Date.now()}-${Math.random()}@test.dev` } })
    const userB = await prisma.user.create({ data: { email: `b-${Date.now()}-${Math.random()}@test.dev` } })
    userAId = userA.id
    userBId = userB.id

    await createPool({ ownerId: userA.id, nome: 'Pool A', valorEntrada: 3000, chavePix: 'a@pix' })
    const poolB = await createPool({
      ownerId: userB.id,
      nome: 'Pool B',
      valorEntrada: 3000,
      chavePix: 'b@pix',
    })

    const member = await prisma.user.create({ data: { email: `m-${Date.now()}-${Math.random()}@test.dev` } })
    const membership = await joinPool({ inviteCode: poolB.inviteCode, userId: member.id })
    mMembershipIdInB = membership.id
  })

  it('rejects with OwnershipError when a foreign pool owner confirms, and does not mutate', async () => {
    await expect(confirmPayment(mMembershipIdInB, userAId)).rejects.toBeInstanceOf(OwnershipError)

    const membership = await prisma.poolMembership.findUniqueOrThrow({ where: { id: mMembershipIdInB } })
    expect(membership.paymentStatus).not.toBe('confirmado')

    const record = await prisma.paymentRecord.findFirst({ where: { membershipId: mMembershipIdInB } })
    expect(record).toBeNull()
  })

  it('succeeds when the pool owner confirms', async () => {
    await confirmPayment(mMembershipIdInB, userBId)

    const membership = await prisma.poolMembership.findUniqueOrThrow({ where: { id: mMembershipIdInB } })
    expect(membership.paymentStatus).toBe('confirmado')

    const record = await prisma.paymentRecord.findFirst({ where: { membershipId: mMembershipIdInB } })
    expect(record?.confirmadoPor).toBe(userBId)
  })
})
