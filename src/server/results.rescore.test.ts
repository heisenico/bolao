import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { rescoreSettledMatches } from '@/server/results'

async function fixture() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
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
  const member = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: owner.id },
  })
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
  return { owner, pool, member, home, away }
}

describe('rescoreSettledMatches (idempotent backfill)', () => {
  it('recomputes legacy 3/1/0 predictions under the new classifier + multipliers', async () => {
    const { member, home, away } = await fixture()
    // A settled R16 match (1.5x) carrying LEGACY values: exact stored as 3,
    // hitType still 'pending' (pre-Phase-0 row shape).
    const match = await prisma.match.create({
      data: {
        fase: 'oitavas',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-07-06T18:00:00Z'),
        placarHome: 2,
        placarAway: 1,
        status: 'encerrada',
        resultadoFonte: 'api',
      },
    })
    await prisma.prediction.create({
      data: {
        membershipId: member.id,
        matchId: match.id,
        palpiteHome: 2,
        palpiteAway: 1,
        pontosObtidos: 3, // legacy exact
        hitType: 'pending',
      },
    })

    const result = await rescoreSettledMatches()
    expect(result.rescoredMatchIds).toEqual([match.id])

    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 15 })
  })

  it('creates the 0x0 fallback rows for members without predictions', async () => {
    const { member, home, away } = await fixture()
    await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
        placarHome: 0,
        placarAway: 0,
        status: 'encerrada',
        resultadoFonte: 'api',
      },
    })

    await rescoreSettledMatches()

    const rows = await prisma.prediction.findMany({ where: { membershipId: member.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      palpiteAutomatico: true,
      hitType: 'exact', // 0x0 fallback vs an actual 0x0
      pontosBase: 10,
      pontosObtidos: 10,
    })
  })

  it('is idempotent: running twice yields identical pontosObtidos and row count', async () => {
    const { member, home, away } = await fixture()
    const match = await prisma.match.create({
      data: {
        fase: 'final',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-07-19T18:00:00Z'),
        placarHome: 2,
        placarAway: 1,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 3, palpiteAway: 2 },
    })

    await rescoreSettledMatches()
    const first = await prisma.prediction.findMany({ orderBy: { id: 'asc' } })
    await rescoreSettledMatches()
    const second = await prisma.prediction.findMany({ orderBy: { id: 'asc' } })

    expect(second.map((p) => [p.id, p.hitType, p.pontosBase, p.pontosObtidos])).toEqual(
      first.map((p) => [p.id, p.hitType, p.pontosBase, p.pontosObtidos]),
    )
    // winner_and_diff on the final: 5 base x3 = 15 (spec example).
    expect(first[0]).toMatchObject({ hitType: 'winner_and_diff', pontosObtidos: 15 })
  })

  it('skips unsettled and cancelled matches', async () => {
    const { home, away } = await fixture()
    await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
        status: 'agendada',
      },
    })
    await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-13T18:00:00Z'),
        status: 'cancelada',
      },
    })

    const result = await rescoreSettledMatches()
    expect(result.rescoredMatchIds).toEqual([])
  })
})
