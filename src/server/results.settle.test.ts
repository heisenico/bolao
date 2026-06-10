import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { pollAndSettle, syncFixtures } from './results'
import type { FootballDataClient, FdMatch } from '@/lib/footballData'

const KICKOFF = '2026-06-11T20:00:00Z'

function scheduledMatch(stage = 'GROUP_STAGE'): FdMatch {
  return {
    id: 1001,
    utcDate: KICKOFF,
    stage,
    group: stage === 'GROUP_STAGE' ? 'Group A' : null,
    status: 'SCHEDULED',
    homeTeam: { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'France', tla: 'FRA', crest: null },
    score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
  }
}

function baseClient(finished: FdMatch[], stage = 'GROUP_STAGE'): FootballDataClient {
  return {
    getTeams: async () => [
      { id: 6, name: 'Brazil', tla: 'BRA', crest: null },
      { id: 2, name: 'France', tla: 'FRA', crest: null },
    ],
    getMatches: async () => [scheduledMatch(stage)],
    getFinishedMatches: async () => finished,
  }
}

function finishedMatch(home: number, away: number, stage = 'GROUP_STAGE'): FdMatch {
  return {
    id: 1001,
    utcDate: KICKOFF,
    stage,
    group: stage === 'GROUP_STAGE' ? 'Group A' : null,
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

  it('settles a group match writing hitType/pontosBase/pontosObtidos (10/5/3/0 rules)', async () => {
    await syncFixtures({ client: baseClient([]) })
    const exact = await seedPrediction(2, 1) // exact => 10
    const winnerDiff = await seedPrediction(1, 0) // home win + diff 1 (real 2-1) => 5
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
    expect(exactPred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 10 })
    const winnerDiffPred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: winnerDiff.membership.id } })
    expect(winnerDiffPred).toMatchObject({ hitType: 'winner_and_diff', pontosBase: 5, pontosObtidos: 5 })
    const wrongPred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: wrong.membership.id } })
    expect(wrongPred).toMatchObject({ hitType: 'miss', pontosBase: 0, pontosObtidos: 0 })
  })

  it('a member with NO prediction gets the automatic 0x0 fallback row (official rule)', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { match, membership } = await seedMemberWithoutPrediction()

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedMatch(2, 1)]),
    })

    expect(result.settledMatchIds).toHaveLength(1)
    const settled = await prisma.match.findFirstOrThrow({ where: { id: match.id } })
    expect(settled.status).toBe('encerrada')

    const rows = await prisma.prediction.findMany({ where: { membershipId: membership.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      palpiteHome: 0,
      palpiteAway: 0,
      palpiteAutomatico: true,
      hitType: 'miss', // 0x0 vs 2x1
      pontosObtidos: 0,
    })
  })

  it('the 0x0 fallback scores as a normal hit when the match actually ends 0x0', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { membership } = await seedMemberWithoutPrediction()

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    await pollAndSettle({ now: inWindow, client: baseClient([finishedMatch(0, 0)]) })

    const rows = await prisma.prediction.findMany({ where: { membershipId: membership.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      palpiteAutomatico: true,
      hitType: 'exact',
      pontosBase: 10,
      pontosObtidos: 10, // grupos 1x
    })
  })

  it('applies the phase multiplier on settlement (R16 exact 1x1 after ET => 15, penalties ignored)', async () => {
    await syncFixtures({ client: baseClient([], 'LAST_16') })
    const exact = await seedPrediction(1, 1) // exact 1x1 on oitavas => 10 * 1.5 = 15

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    // fullTime excludes penalties: a 1-1 decided on penalties arrives as 1-1.
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedMatch(1, 1, 'LAST_16')], 'LAST_16'),
    })

    expect(result.settledMatchIds).toHaveLength(1)
    const pred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: exact.membership.id } })
    expect(pred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 15 })
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
