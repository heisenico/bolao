import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getAdminPool, removeMember, OwnershipError } from '@/server/admin'

async function fixture() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  const stranger = await prisma.user.create({
    data: { email: `stranger-${Date.now()}-${Math.random()}@test.com`, name: 'Stranger' },
  })
  const player = await prisma.user.create({
    data: { email: `player-${Date.now()}-${Math.random()}@test.com`, name: 'Player' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const ownerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: owner.id },
  })
  const playerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id },
  })
  return { owner, stranger, player, pool, ownerMember, playerMember }
}

describe('getAdminPool', () => {
  it('returns the pool with memberships+users when the caller owns it', async () => {
    const { owner, pool } = await fixture()
    const result = await getAdminPool(pool.id, owner.id)
    expect(result.id).toBe(pool.id)
    expect(result.memberships.length).toBe(2)
    expect(result.memberships[0].user.email).toBeTruthy()
  })

  it('throws OwnershipError when the caller does not own the pool', async () => {
    const { stranger, pool } = await fixture()
    await expect(getAdminPool(pool.id, stranger.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('removeMember', () => {
  it('deletes a member when the caller owns the pool', async () => {
    const { owner, playerMember } = await fixture()
    await removeMember(playerMember.id, owner.id)
    const gone = await prisma.poolMembership.findUnique({ where: { id: playerMember.id } })
    expect(gone).toBeNull()
  })

  it('throws OwnershipError when a non-owner tries to remove a member', async () => {
    const { stranger, playerMember } = await fixture()
    await expect(removeMember(playerMember.id, stranger.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})
