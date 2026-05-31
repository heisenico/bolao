import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { pollAndSettle, syncFixtures } from './results'
import type { ApiFootballClient, ApiFixture } from '@/lib/apiFootball'

const KICKOFF = '2026-06-11T20:00:00+00:00'

function baseClient(finished: ApiFixture[]): ApiFootballClient {
  return {
    getTeams: async () => [
      { team: { id: 6, name: 'Brazil', code: 'BRA' } },
      { team: { id: 2, name: 'France', code: 'FRA' } },
    ],
    getFixtures: async () => [
      {
        fixture: { id: 1001, date: KICKOFF, status: { short: 'NS' } },
        league: { round: 'Group A - 1' },
        teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
        goals: { home: null, away: null },
      },
    ],
    getFinishedFixtures: async () => finished,
  }
}

function finishedFixture(home: number, away: number): ApiFixture {
  return {
    fixture: { id: 1001, date: KICKOFF, status: { short: 'FT' } },
    league: { round: 'Group A - 1' },
    teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
    goals: { home, away },
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
    const spyClient: ApiFootballClient = {
      ...baseClient([]),
      getFinishedFixtures: async () => {
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
      client: baseClient([finishedFixture(2, 1)]),
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
      client: baseClient([finishedFixture(2, 1)]),
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
      client: baseClient([finishedFixture(2, 1)]),
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
    await pollAndSettle({ now: inWindow, client: baseClient([finishedFixture(2, 1)]) })
    const second = await pollAndSettle({ now: inWindow, client: baseClient([finishedFixture(2, 1)]) })

    expect(second.settledMatchIds).toEqual([])
  })
})
