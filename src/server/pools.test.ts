import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { LOCK_LEAD_MS } from '@/domain/deadline'
import {
  EntryClosedError,
  createPool,
  getMembership,
  joinPool,
  listUserMemberships,
} from './pools'

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, name: email.split('@')[0] } })
}

// Seed one Match whose kickoff is `kickoff` so min(Match.dataHora) = kickoff.
async function seedFirstMatch(kickoff: Date) {
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR', grupo: 'A' } })
  const away = await prisma.team.create({ data: { nome: 'Argentina', codigoPais: 'AR', grupo: 'A' } })
  return prisma.match.create({
    data: { fase: 'grupos', homeTeamId: home.id, awayTeamId: away.id, dataHora: kickoff },
  })
}

describe('pools service (integration)', () => {
  let ownerId: string

  beforeEach(async () => {
    const owner = await makeUser(`owner-${Date.now()}@test.dev`)
    ownerId = owner.id
  })

  it('createPool stores cents + chavePix and auto-enrolls the owner', async () => {
    const pool = await createPool({
      ownerId,
      nome: 'Bolão dos Amigos',
      valorEntrada: 2500,
      chavePix: 'owner@pix.dev',
    })

    expect(pool.id).toBeTruthy()
    expect(pool.nome).toBe('Bolão dos Amigos')
    expect(pool.valorEntrada).toBe(2500)
    expect(pool.chavePix).toBe('owner@pix.dev')
    expect(pool.status).toBe('aberto')
    expect(pool.inviteCode).toMatch(/^[A-Z0-9]{6,}$/)

    const ownerMembership = await getMembership(pool.id, ownerId)
    expect(ownerMembership).not.toBeNull()
    // The creator never pays themself: their membership starts confirmed.
    expect(ownerMembership?.paymentStatus).toBe('confirmado')
  })

  it('createPool generates distinct invite codes across pools', async () => {
    const a = await createPool({ ownerId, nome: 'A', valorEntrada: 1000, chavePix: 'a@pix' })
    const b = await createPool({ ownerId, nome: 'B', valorEntrada: 1000, chavePix: 'b@pix' })
    expect(a.inviteCode).not.toBe(b.inviteCode)
  })

  it('joinPool creates a membership for a new member (pendente by default)', async () => {
    const pool = await createPool({ ownerId, nome: 'Join Me', valorEntrada: 5000, chavePix: 'x@pix' })
    const member = await makeUser(`m-${Date.now()}@test.dev`)

    const membership = await joinPool({ inviteCode: pool.inviteCode, userId: member.id })

    expect(membership.poolId).toBe(pool.id)
    expect(membership.userId).toBe(member.id)
    expect(membership.paymentStatus).toBe('pendente')
  })

  it('joinPool is idempotent: re-joining returns the existing membership', async () => {
    const pool = await createPool({ ownerId, nome: 'Dup', valorEntrada: 1000, chavePix: 'x@pix' })
    const member = await makeUser(`dup-${Date.now()}@test.dev`)

    const first = await joinPool({ inviteCode: pool.inviteCode, userId: member.id })
    const second = await joinPool({ inviteCode: pool.inviteCode, userId: member.id })

    expect(second.id).toBe(first.id)
    const count = await prisma.poolMembership.count({ where: { poolId: pool.id, userId: member.id } })
    expect(count).toBe(1)
  })

  it('joinPool throws when the invite code does not exist', async () => {
    const member = await makeUser(`nf-${Date.now()}@test.dev`)
    await expect(joinPool({ inviteCode: 'NOPE99', userId: member.id })).rejects.toThrow(/invite/i)
  })

  it('joinPool stays open when no matches exist yet (entry deadline unset)', async () => {
    const pool = await createPool({ ownerId, nome: 'No Matches', valorEntrada: 1000, chavePix: 'x@pix' })
    const member = await makeUser(`open-${Date.now()}@test.dev`)
    // No Match rows → firstKickoff is undefined → entry is open.
    const membership = await joinPool({
      inviteCode: pool.inviteCode,
      userId: member.id,
      now: new Date('2026-06-11T20:00:00.000Z'),
    })
    expect(membership.poolId).toBe(pool.id)
  })

  it('joinPool throws EntryClosedError once now >= firstKickoff - 1h', async () => {
    const pool = await createPool({ ownerId, nome: 'Closed', valorEntrada: 1000, chavePix: 'x@pix' })
    const member = await makeUser(`closed-${Date.now()}@test.dev`)
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    await seedFirstMatch(kickoff)
    // now === kickoff - 1h is the boundary: entry is closed.
    const now = new Date(kickoff.getTime() - LOCK_LEAD_MS)

    await expect(
      joinPool({ inviteCode: pool.inviteCode, userId: member.id, now }),
    ).rejects.toBeInstanceOf(EntryClosedError)

    const count = await prisma.poolMembership.count({ where: { poolId: pool.id, userId: member.id } })
    expect(count).toBe(0)
  })

  it('joinPool stays open up to just before firstKickoff - 1h', async () => {
    const pool = await createPool({ ownerId, nome: 'Still Open', valorEntrada: 1000, chavePix: 'x@pix' })
    const member = await makeUser(`stillopen-${Date.now()}@test.dev`)
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    await seedFirstMatch(kickoff)
    const now = new Date(kickoff.getTime() - LOCK_LEAD_MS - 1) // 1ms before the boundary

    const membership = await joinPool({ inviteCode: pool.inviteCode, userId: member.id, now })
    expect(membership.poolId).toBe(pool.id)
  })

  it('getMembership returns null when the user is not a member', async () => {
    const pool = await createPool({ ownerId, nome: 'Empty', valorEntrada: 1000, chavePix: 'x@pix' })
    const stranger = await makeUser(`s-${Date.now()}@test.dev`)
    expect(await getMembership(pool.id, stranger.id)).toBeNull()
  })

  it('listUserMemberships returns an empty list when the user has no pools', async () => {
    const stranger = await makeUser(`lm-none-${Date.now()}@test.dev`)
    expect(await listUserMemberships(stranger.id)).toEqual([])
  })

  it('listUserMemberships returns every pool the user is in, earliest-joined first, with pool info', async () => {
    const poolA = await createPool({ ownerId, nome: 'Alpha', valorEntrada: 1000, chavePix: 'a@pix' })
    const poolB = await createPool({ ownerId, nome: 'Beta', valorEntrada: 1000, chavePix: 'b@pix' })
    const member = await makeUser(`lm-${Date.now()}@test.dev`)

    const first = await joinPool({ inviteCode: poolA.inviteCode, userId: member.id })
    const second = await joinPool({ inviteCode: poolB.inviteCode, userId: member.id })
    await prisma.poolMembership.update({
      where: { id: second.id },
      data: { joinedAt: new Date(first.joinedAt.getTime() + 1000) },
    })

    const list = await listUserMemberships(member.id)
    expect(list).toHaveLength(2)
    expect(list.map((m) => m.pool.nome)).toEqual(['Alpha', 'Beta'])
    expect(list[0].pool.ownerId).toBe(ownerId)
  })
})
