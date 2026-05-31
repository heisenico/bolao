import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { pollAndSettle, syncFixtures } from './results'
import type { FootballDataClient, FdMatch } from '@/lib/footballData'

const KICKOFF = '2026-06-11T20:00:00Z'

function scheduledMatch(): FdMatch {
  return {
    id: 1001,
    utcDate: KICKOFF,
    stage: 'GROUP_STAGE',
    group: 'Group A',
    status: 'SCHEDULED',
    homeTeam: { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'France', tla: 'FRA', crest: null },
    score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
  }
}

function baseClient(finished: FdMatch[]): FootballDataClient {
  return {
    getTeams: async () => [
      { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
      { id: 2, name: 'France', tla: 'FRA', crest: null },
    ],
    getMatches: async () => [scheduledMatch()],
    getFinishedMatches: async () => finished,
  }
}

function finishedMatch(home: number, away: number): FdMatch {
  return {
    id: 1001,
    utcDate: KICKOFF,
    stage: 'GROUP_STAGE',
    group: 'Group A',
    status: 'FINISHED',
    homeTeam: { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'France', tla: 'FRA', crest: null },
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home, away } },
  }
}

/** Seeds a pool + membership + a prediction for the synced match 1001. */
async function seedPrediction(palpiteHome: number, palpiteAway: number) {
  const user = await prisma.user.create({ data: { email: `u${Math.random()}@t.test` } })
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: user.id },
  })
  const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
  await prisma.prediction.create({
    data: { membershipId: membership.id, matchId: match.id, palpiteHome, palpiteAway },
  })
  return { match, membership }
}

/** Seeds a pool + membership but NO prediction row for the synced match 1001. */
async function seedMemberWithoutPrediction() {
  const user = await prisma.user.create({ data: { email: `u${Math.random()}@t.test` } })
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: user.id },
  })
  const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
  return { match, membership, pool }
}

describe('pollAndSettle', () => {
  it('no-op outside any match window (does not call the API)', async () => {
    await syncFixtures({ client: baseClient([]) })
    let finishedCalls = 0
    const spyClient: FootballDataClient = {
      ...baseClient([]),
      getFinishedMatches: async () => {
        finishedCalls++
        return []
      },
    }

    const before = new Date('2026-06-10T00:00:00.000Z') // a day before kickoff
    const result = await pollAndSettle({ now: before, client: spyClient })

    expect(result).toEqual({ settledMatchIds: [] })
    expect(finishedCalls).toBe(0) // quota gating: never touch the API outside a window
  })

  it('settles a finished match inside the window and recomputes points for multiple predictions', async () => {
    await syncFixtures({ client: baseClient([]) })
    const exact = await seedPrediction(2, 1) // exact => 3
    const winner = await seedPrediction(1, 0) // home win predicted; real 2-1 => 1
    const wrong = await seedPrediction(0, 2) // away win predicted; real 2-1 => 0

    const inWindow = new Date('2026-06-11T22:00:00.000Z') // kickoff + 2h
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedMatch(2, 1)]),
    })

    expect(result.settledMatchIds).toHaveLength(1)

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
    expect(match.placarHome).toBe(2)
    expect(match.placarAway).toBe(1)
    expect(match.status).toBe('encerrada')
    expect(match.resultadoFonte).toBe('api')

    const exactPred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: exact.membership.id } })
    expect(exactPred.pontosObtidos).toBe(3)
    const winnerPred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: winner.membership.id } })
    expect(winnerPred.pontosObtidos).toBe(1)
    const wrongPred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: wrong.membership.id } })
    expect(wrongPred.pontosObtidos).toBe(0)
  })

  it('a member with NO prediction row for a settled match contributes 0 (absence-of-row, CONTRACT §11.6)', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { match, membership } = await seedMemberWithoutPrediction()

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedMatch(2, 1)]),
    })

    // The match settles, but no prediction row is created for the absent member.
    expect(result.settledMatchIds).toHaveLength(1)
    const settled = await prisma.match.findFirstOrThrow({ where: { id: match.id } })
    expect(settled.status).toBe('encerrada')

    const rows = await prisma.prediction.findMany({ where: { membershipId: membership.id } })
    expect(rows).toHaveLength(0) // no row => no points => the member scores 0
  })

  it('never overwrites a manual result', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { match } = await seedPrediction(2, 1)
    await prisma.match.update({
      where: { id: match.id },
      data: { placarHome: 5, placarAway: 0, status: 'encerrada', resultadoFonte: 'manual' },
    })

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedMatch(2, 1)]),
    })

    expect(result.settledMatchIds).toEqual([])
    const reloaded = await prisma.match.findFirstOrThrow({ where: { id: match.id } })
    expect(reloaded.placarHome).toBe(5)
    expect(reloaded.placarAway).toBe(0)
    expect(reloaded.resultadoFonte).toBe('manual')
  })

  it('is idempotent: re-running after settlement settles nothing new', async () => {
    await syncFixtures({ client: baseClient([]) })
    await seedPrediction(2, 1)

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    await pollAndSettle({ now: inWindow, client: baseClient([finishedMatch(2, 1)]) })
    const second = await pollAndSettle({ now: inWindow, client: baseClient([finishedMatch(2, 1)]) })

    expect(second.settledMatchIds).toEqual([])
  })
})
