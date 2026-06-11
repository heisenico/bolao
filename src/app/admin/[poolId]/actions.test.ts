import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  applyPrizeResultAsOwner,
  applyResultAsOwner,
  cancelMatchAsOwner,
  confirmPaymentAsOwner,
  removeMemberAsOwner,
  syncFixturesAsOwner,
} from '@/server/adminOps'
import { OwnershipError } from '@/server/admin'

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
  const playerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id, paymentStatus: 'pago' },
  })
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Chile', codigoPais: 'CL' } })
  const match = await prisma.match.create({
    data: {
      fase: 'r32',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-07-01T18:00:00Z'),
    },
  })
  return { owner, stranger, player, pool, playerMember, match }
}

describe('applyResultAsOwner', () => {
  it('owner applies a manual result', async () => {
    const { owner, pool, match } = await fixture()
    await applyResultAsOwner(owner.id, pool.id, match.id, 3, 1)
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.placarHome).toBe(3)
    expect(m.resultadoFonte).toBe('manual')
  })

  it('non-owner is rejected with OwnershipError', async () => {
    const { stranger, pool, match } = await fixture()
    await expect(applyResultAsOwner(stranger.id, pool.id, match.id, 3, 1)).rejects.toBeInstanceOf(
      OwnershipError,
    )
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.placarHome).toBeNull()
  })
})

describe('cancelMatchAsOwner', () => {
  it('owner cancels a match (status cancelada, predictions zeroed)', async () => {
    const { owner, pool, match, playerMember } = await fixture()
    await prisma.prediction.create({
      data: { membershipId: playerMember.id, matchId: match.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 },
    })

    await cancelMatchAsOwner(owner.id, pool.id, match.id)

    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.status).toBe('cancelada')
    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(0)
  })

  it('non-owner cannot cancel', async () => {
    const { stranger, pool, match } = await fixture()
    await expect(cancelMatchAsOwner(stranger.id, pool.id, match.id)).rejects.toBeInstanceOf(
      OwnershipError,
    )
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.status).toBe('agendada')
  })
})

describe('syncFixturesAsOwner', () => {
  it('non-owner cannot sync fixtures', async () => {
    const { stranger, pool } = await fixture()
    await expect(syncFixturesAsOwner(stranger.id, pool.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('confirmPaymentAsOwner', () => {
  it('owner confirms a member payment', async () => {
    const { owner, pool, playerMember } = await fixture()
    await confirmPaymentAsOwner(owner.id, pool.id, playerMember.id)
    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: playerMember.id } })
    expect(m.paymentStatus).toBe('confirmado')
  })

  it('non-owner cannot confirm', async () => {
    const { stranger, pool, playerMember } = await fixture()
    await expect(
      confirmPaymentAsOwner(stranger.id, pool.id, playerMember.id),
    ).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('removeMemberAsOwner', () => {
  it('owner removes a member', async () => {
    const { owner, pool, playerMember } = await fixture()
    await removeMemberAsOwner(owner.id, pool.id, playerMember.id)
    const gone = await prisma.poolMembership.findUnique({ where: { id: playerMember.id } })
    expect(gone).toBeNull()
  })
})

describe('applyPrizeResultAsOwner', () => {
  it('owner settles a prize result', async () => {
    const { owner, pool } = await fixture()
    await applyPrizeResultAsOwner(owner.id, pool.id, 'champion', 'Brasil')
    const result = await prisma.prizeResult.findUniqueOrThrow({ where: { prizeType: 'champion' } })
    expect(result.value).toBe('Brasil')
    expect(result.pointsValue).toBe(30)
  })

  it('non-owner cannot settle a prize result', async () => {
    const { stranger, pool } = await fixture()
    await expect(
      applyPrizeResultAsOwner(stranger.id, pool.id, 'champion', 'Brasil'),
    ).rejects.toBeInstanceOf(OwnershipError)
    expect(await prisma.prizeResult.count()).toBe(0)
  })
})
