import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { syncFixtures } from './results'
import type { FootballDataClient, FdMatch } from '@/lib/footballData'

const BRAZIL_CREST = 'https://crests.football-data.org/764.png'
const FRANCE_CREST = 'https://crests.football-data.org/773.png'

function scheduledMatch(over?: Partial<FdMatch>): FdMatch {
  return {
    id: 1001,
    utcDate: '2026-06-11T20:00:00Z',
    stage: 'GROUP_STAGE',
    group: 'GROUP_A',
    status: 'SCHEDULED',
    homeTeam: { id: 6, name: 'Brazil', tla: 'BRA', crest: BRAZIL_CREST },
    awayTeam: { id: 2, name: 'France', tla: 'FRA', crest: FRANCE_CREST },
    score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
    ...over,
  }
}

function fakeClient(overrides?: Partial<FootballDataClient>): FootballDataClient {
  return {
    getTeams: async () => [
      { id: 6, name: 'Brazil', tla: 'BRA', crest: BRAZIL_CREST },
      { id: 2, name: 'France', tla: 'FRA', crest: FRANCE_CREST },
    ],
    getMatches: async () => [scheduledMatch()],
    getFinishedMatches: async () => [],
    ...overrides,
  }
}

describe('syncFixtures', () => {
  it('upserts teams and matches and returns counts', async () => {
    const result = await syncFixtures({ client: fakeClient() })

    expect(result).toEqual({ teams: 2, matches: 1 })

    const teams = await prisma.team.findMany()
    expect(teams).toHaveLength(2)
    const brazil = teams.find((t) => t.apiFootballId === 6)!
    expect(brazil.nome).toBe('Brazil')
    expect(brazil.codigoPais).toBe('BRA')
    expect(brazil.bandeira).toBe(BRAZIL_CREST)
    expect(brazil.grupo).toBe('A')
    const france = teams.find((t) => t.apiFootballId === 2)!
    expect(france.bandeira).toBe(FRANCE_CREST)
    expect(france.grupo).toBe('A')

    const matches = await prisma.match.findMany({ include: { homeTeam: true, awayTeam: true } })
    expect(matches).toHaveLength(1)
    expect(matches[0].apiFootballId).toBe(1001)
    expect(matches[0].fase).toBe('grupos')
    expect(matches[0].status).toBe('agendada')
    expect(matches[0].homeTeam.apiFootballId).toBe(6)
    expect(matches[0].awayTeam.apiFootballId).toBe(2)
    expect(matches[0].dataHora.toISOString()).toBe('2026-06-11T20:00:00.000Z')
  })

  it('is idempotent: running twice does not duplicate rows', async () => {
    await syncFixtures({ client: fakeClient() })
    const second = await syncFixtures({ client: fakeClient() })

    expect(second).toEqual({ teams: 2, matches: 1 })
    expect(await prisma.team.count()).toBe(2)
    expect(await prisma.match.count()).toBe(1)
  })

  it('updates an existing match score-free fields on re-sync (e.g. new dataHora)', async () => {
    await syncFixtures({ client: fakeClient() })

    const moved = fakeClient({
      getMatches: async () => [scheduledMatch({ utcDate: '2026-06-12T18:00:00Z' })],
    })
    await syncFixtures({ client: moved })

    const match = await prisma.match.findFirst({ where: { apiFootballId: 1001 } })
    expect(match!.dataHora.toISOString()).toBe('2026-06-12T18:00:00.000Z')
  })

  it('never reverts status/placar/resultadoFonte on re-sync (update touches only dataHora+fase)', async () => {
    await syncFixtures({ client: fakeClient() })

    // Simulate the match already settled (by the poller).
    const before = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
    await prisma.match.update({
      where: { id: before.id },
      data: { placarHome: 2, placarAway: 1, status: 'encerrada', resultadoFonte: 'api' },
    })

    // A later daily sync still returns the match as SCHEDULED with no score.
    await syncFixtures({ client: fakeClient() })

    const after = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
    expect(after.status).toBe('encerrada')
    expect(after.placarHome).toBe(2)
    expect(after.placarAway).toBe(1)
    expect(after.resultadoFonte).toBe('api')
  })

  it('sets match.fase from stage (knockout stages map correctly)', async () => {
    const knockout = fakeClient({
      getMatches: async () => [
        scheduledMatch({ id: 2001, utcDate: '2026-07-05T18:00:00Z', stage: 'LAST_16' }),
      ],
    })
    await syncFixtures({ client: knockout })

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 2001 } })
    expect(match.fase).toBe('oitavas')
  })

  it('derives the group letter from "GROUP_X" for both teams of a group-stage match', async () => {
    const groupB = fakeClient({
      getTeams: async () => [
        { id: 10, name: 'Spain', tla: 'ESP', crest: null },
        { id: 11, name: 'Japan', tla: 'JPN', crest: null },
      ],
      getMatches: async () => [
        scheduledMatch({
          id: 3001,
          group: 'GROUP_B',
          homeTeam: { id: 10, name: 'Spain', tla: 'ESP', crest: null },
          awayTeam: { id: 11, name: 'Japan', tla: 'JPN', crest: null },
        }),
      ],
    })
    await syncFixtures({ client: groupB })

    const spain = await prisma.team.findFirstOrThrow({ where: { apiFootballId: 10 } })
    const japan = await prisma.team.findFirstOrThrow({ where: { apiFootballId: 11 } })
    expect(spain.grupo).toBe('B')
    expect(japan.grupo).toBe('B')
  })

  it('leaves grupo null for teams that appear only in knockout matches', async () => {
    const knockoutOnly = fakeClient({
      getTeams: async () => [
        { id: 20, name: 'Argentina', tla: 'ARG', crest: null },
        { id: 21, name: 'Croatia', tla: 'CRO', crest: null },
      ],
      getMatches: async () => [
        scheduledMatch({
          id: 4001,
          stage: 'SEMI_FINALS',
          group: null,
          homeTeam: { id: 20, name: 'Argentina', tla: 'ARG', crest: null },
          awayTeam: { id: 21, name: 'Croatia', tla: 'CRO', crest: null },
        }),
      ],
    })
    await syncFixtures({ client: knockoutOnly })

    const argentina = await prisma.team.findFirstOrThrow({ where: { apiFootballId: 20 } })
    expect(argentina.grupo).toBeNull()
  })

  it('sets bandeira to null when the FD team has no crest', async () => {
    const noCrest = fakeClient({
      getTeams: async () => [{ id: 30, name: 'Ghana', tla: 'GHA', crest: null }],
      getMatches: async () => [],
    })
    await syncFixtures({ client: noCrest })

    const ghana = await prisma.team.findFirstOrThrow({ where: { apiFootballId: 30 } })
    expect(ghana.bandeira).toBeNull()
  })
})
