import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createPool, joinPool } from '@/server/pools'
import { markPaidAsUser } from './actions'

describe('markPaidAsUser self-ownership (integration)', () => {
  let ownerUserId: string
  let strangerUserId: string
  let membershipId: string

  beforeEach(async () => {
    const poolOwner = await prisma.user.create({
      data: { email: `po-${Date.now()}-${Math.random()}@test.dev` },
    })
    const pool = await createPool({
      ownerId: poolOwner.id,
      nome: 'Join Pool',
      valorEntrada: 3000,
      chavePix: 'po@pix',
    })

    const member = await prisma.user.create({
      data: { email: `mem-${Date.now()}-${Math.random()}@test.dev` },
    })
    const stranger = await prisma.user.create({
      data: { email: `str-${Date.now()}-${Math.random()}@test.dev` },
    })
    const membership = await joinPool({ inviteCode: pool.inviteCode, userId: member.id })

    ownerUserId = member.id
    strangerUserId = stranger.id
    membershipId = membership.id
  })

  it('rejects when a stranger marks another user membership paid, and does not mutate', async () => {
    await expect(markPaidAsUser(strangerUserId, membershipId)).rejects.toThrow()

    const membership = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membershipId } })
    expect(membership.paymentStatus).toBe('pendente')
  })

  it('flips to pago when the membership owner marks paid', async () => {
    await markPaidAsUser(ownerUserId, membershipId)

    const membership = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membershipId } })
    expect(membership.paymentStatus).toBe('pago')
  })
})
