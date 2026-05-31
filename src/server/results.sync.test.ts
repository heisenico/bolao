import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { syncFixtures } from './results'
import type { ApiFootballClient } from '@/lib/apiFootball'

function fakeClient(overrides?: Partial<ApiFootballClient>): ApiFootballClient {
  return {
    getTeams: async () => [
      { team: { id: 6, name: 'Brazil', code: 'BRA' } },
      { team: { id: 2, name: 'France', code: 'FRA' } },
    ],
    getFixtures: async () => [
      {
        fixture: { id: 1001, date: '2026-06-11T20:00:00+00:00', status: { short: 'NS' } },
        league: { round: 'Group A - 1' },
        teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
        goals: { home: null, away: null },
      },
    ],
    getFinishedFixtures: async () => [],
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
      getFixtures: async () => [
        {
          fixture: { id: 1001, date: '2026-06-12T18:00:00+00:00', status: { short: 'NS' } },
          league: { round: 'Group A - 1' },
          teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
          goals: { home: null, away: null },
        },
      ],
    })
    await syncFixtures({ client: moved })

    const match = await prisma.match.findFirst({ where: { apiFootballId: 1001 } })
    expect(match!.dataHora.toISOString()).toBe('2026-06-12T18:00:00.000Z')
  })

  it('sets match.fase from league.round (knockout rounds map correctly)', async () => {
    const knockout = fakeClient({
      getFixtures: async () => [
        {
          fixture: { id: 2001, date: '2026-07-05T18:00:00+00:00', status: { short: 'NS' } },
          league: { round: 'Round of 16' },
          teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
          goals: { home: null, away: null },
        },
      ],
    })
    await syncFixtures({ client: knockout })

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 2001 } })
    expect(match.fase).toBe('oitavas')
  })
})
