import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { cancelMatch, pollAndSettle } from '@/server/results'
import { computeStandings } from '@/server/ranking'
import type { FootballDataClient, FdMatch } from '@/lib/footballData'

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
  const away = await prisma.team.create({ data: { nome: 'Peru', codigoPais: 'PE' } })
  const match = await prisma.match.create({
    data: {
      fase: 'grupos',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-06-15T18:00:00Z'),
      placarHome: 2,
      placarAway: 1,
      status: 'encerrada',
      resultadoFonte: 'api',
    },
  })
  return { owner, pool, member, match, home, away }
}

/** A FINISHED FD match used to prove the poller never resurrects a cancelada. */
function finishedFd(id: number, home: number, away: number): FdMatch {
  return {
    id,
    utcDate: '2026-06-15T18:00:00Z',
    stage: 'GROUP_STAGE',
    group: 'GROUP_A',
    status: 'FINISHED',
    homeTeam: { id: 6, name: 'Brasil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'Peru', tla: 'PER', crest: null },
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home, away } },
  }
}

function clientReturning(finished: FdMatch[]): FootballDataClient {
  return {
    getTeams: async () => [],
    getMatches: async () => [],
    getFinishedMatches: async () => finished,
  }
}

describe('cancelMatch', () => {
  it('marks the match cancelada and voids all its predictions (hitType cancelled)', async () => {
    const { member, match } = await fixture()
    await prisma.prediction.create({
      data: {
        membershipId: member.id,
        matchId: match.id,
        palpiteHome: 2,
        palpiteAway: 1,
        pontosObtidos: 10,
        pontosBase: 10,
        hitType: 'exact',
      },
    })

    await cancelMatch(match.id)

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.status).toBe('cancelada')

    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred).toMatchObject({ pontosObtidos: 0, pontosBase: null, hitType: 'cancelled' })
  })

  it('is skipped by the poller (cancelada is never settled or resurrected)', async () => {
    const { match } = await fixture()
    await prisma.match.update({ where: { id: match.id }, data: { apiFootballId: 8888 } })

    await cancelMatch(match.id)
    // Run inside the match's window with a mock client whose FINISHED fixture
    // reports a score: a cancelada match (status != agendada) is not a candidate.
    const inWindow = new Date('2026-06-15T20:00:00Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: clientReturning([finishedFd(8888, 3, 3)]),
    })

    expect(result.settledMatchIds).toEqual([])
    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.status).toBe('cancelada')
  })

  it('drops the cancelled match contribution from standings', async () => {
    const { member, pool, home, away } = await fixture()
    // Two finished group matches; the member nails both (10 + 10 = 20 points).
    const m1 = await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-16T18:00:00Z'),
        placarHome: 1,
        placarAway: 0,
        status: 'encerrada',
        resultadoFonte: 'api',
      },
    })
    const m2 = await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-17T18:00:00Z'),
        placarHome: 2,
        placarAway: 2,
        status: 'encerrada',
        resultadoFonte: 'api',
      },
    })
    await prisma.prediction.create({
      data: {
        membershipId: member.id,
        matchId: m1.id,
        palpiteHome: 1,
        palpiteAway: 0,
        pontosObtidos: 10,
        pontosBase: 10,
        hitType: 'exact',
      },
    })
    await prisma.prediction.create({
      data: {
        membershipId: member.id,
        matchId: m2.id,
        palpiteHome: 2,
        palpiteAway: 2,
        pontosObtidos: 10,
        pontosBase: 10,
        hitType: 'exact',
      },
    })

    const before = await computeStandings(pool.id)
    const beforeRow = before.find((r) => r.membershipId === member.id)
    expect(beforeRow?.pontos).toBe(20)
    expect(beforeRow?.cravadas).toBe(2)

    await cancelMatch(m2.id)

    const after = await computeStandings(pool.id)
    const afterRow = after.find((r) => r.membershipId === member.id)
    expect(afterRow?.pontos).toBe(10)
    // The cancelled prediction also leaves every tiebreaker counter.
    expect(afterRow?.cravadas).toBe(1)
    expect(afterRow?.acertosVencedor).toBe(1)
  })
})
