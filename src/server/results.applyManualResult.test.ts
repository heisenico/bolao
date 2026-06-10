import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { applyManualResult, pollAndSettle } from '@/server/results'
import type { FootballDataClient, FdMatch } from '@/lib/footballData'

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, name: email.split('@')[0] } })
}

async function makeTeam(nome: string, codigoPais: string, apiFootballId?: number) {
  return prisma.team.create({ data: { nome, codigoPais, apiFootballId } })
}

async function baseFixture() {
  const owner = await makeUser(`owner-${Date.now()}-${Math.random()}@test.com`)
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
  const home = await makeTeam('Brasil', 'BR')
  const away = await makeTeam('Argentina', 'AR')
  const match = await prisma.match.create({
    data: {
      fase: 'final',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-07-19T18:00:00Z'),
      status: 'agendada',
    },
  })
  return { owner, pool, member, match }
}

/** A FINISHED FD match with a chosen id + score, used to prove manual survives. */
function finishedFd(id: number, home: number, away: number): FdMatch {
  return {
    id,
    utcDate: '2026-07-19T18:00:00Z',
    stage: 'FINAL',
    group: null,
    status: 'FINISHED',
    homeTeam: { id: 6, name: 'Brasil', tla: 'BRA', crest: null },
    awayTeam: { id: 2, name: 'Argentina', tla: 'ARG', crest: null },
    score: { winner: 'AWAY_TEAM', duration: 'REGULAR', fullTime: { home, away } },
  }
}

function clientReturning(finished: FdMatch[]): FootballDataClient {
  return {
    getTeams: async () => [],
    getMatches: async () => [],
    getFinishedMatches: async () => finished,
  }
}

describe('applyManualResult', () => {
  it('writes score, marks encerrada + manual, and scores the prediction (final exact = 30)', async () => {
    const { member, match } = await baseFixture()
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 2, palpiteAway: 1 },
    })

    await applyManualResult(match.id, 2, 1)

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.placarHome).toBe(2)
    expect(after.placarAway).toBe(1)
    expect(after.status).toBe('encerrada')
    expect(after.resultadoFonte).toBe('manual')

    // fase 'final' => multiplier 3x: exact 10 base, 30 final (spec example).
    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 30 })
  })

  it('scores winner-only (9 on the final) and miss (0) for the same manual result', async () => {
    const { member, pool, match } = await baseFixture()
    const u2 = await makeUser(`u2-${Date.now()}-${Math.random()}@test.com`)
    const m2 = await prisma.poolMembership.create({ data: { poolId: pool.id, userId: u2.id } })
    // member: predicts 3x0 -> right winner, wrong diff -> winner_only (3 base, x3 = 9)
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 3, palpiteAway: 0 },
    })
    // m2: predicts 0x2 -> wrong winner -> miss
    await prisma.prediction.create({
      data: { membershipId: m2.id, matchId: match.id, palpiteHome: 0, palpiteAway: 2 },
    })

    await applyManualResult(match.id, 2, 1)

    const p1 = await prisma.prediction.findFirstOrThrow({ where: { membershipId: member.id } })
    const p2 = await prisma.prediction.findFirstOrThrow({ where: { membershipId: m2.id } })
    expect(p1).toMatchObject({ hitType: 'winner_only', pontosBase: 3, pontosObtidos: 9 })
    expect(p2).toMatchObject({ hitType: 'miss', pontosBase: 0, pontosObtidos: 0 })
  })

  it('rejects non-integer or negative scores', async () => {
    const { match } = await baseFixture()
    await expect(applyManualResult(match.id, -1, 0)).rejects.toThrow()
    await expect(applyManualResult(match.id, 1, 2.5)).rejects.toThrow()
  })

  // W.O. needs no special path: it is a normal manual result (e.g. 3x0) applied
  // through this same function (CONTRACT §4 / §11.8).
  it('handles a W.O. as a normal 3x0 manual result', async () => {
    const { member, match } = await baseFixture()
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 3, palpiteAway: 0 },
    })

    await applyManualResult(match.id, 3, 0)

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.placarHome).toBe(3)
    expect(after.placarAway).toBe(0)
    expect(after.resultadoFonte).toBe('manual')
    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 30 })
  })

  it('is NOT overwritten by the poller even when a FINISHED fixture has a different score', async () => {
    const { member, match } = await baseFixture()
    // Give the match an apiFootballId so the poller could in principle target it.
    await prisma.match.update({ where: { id: match.id }, data: { apiFootballId: 9999 } })
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 1, palpiteAway: 0 },
    })

    await applyManualResult(match.id, 1, 0)

    // The poller runs inside the match's window with a mock client whose FINISHED
    // fixture for the SAME apiFootballId reports a DIFFERENT score (4x0). The
    // manual result (status=encerrada, resultadoFonte=manual) must survive: the
    // match is no longer `agendada`, so it is not a settle candidate.
    const inWindow = new Date('2026-07-19T20:00:00Z') // kickoff + 2h
    const result = await pollAndSettle({
      now: inWindow,
      client: clientReturning([finishedFd(9999, 4, 0)]),
    })

    expect(result.settledMatchIds).toEqual([])

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.resultadoFonte).toBe('manual')
    expect(after.placarHome).toBe(1)
    expect(after.placarAway).toBe(0)
    expect(after.status).toBe('encerrada')

    // The exact manual prediction (1x0) kept its 30 points (final exact),
    // not re-scored against 4x0.
    const pred = await prisma.prediction.findFirstOrThrow({ where: { membershipId: member.id } })
    expect(pred).toMatchObject({ hitType: 'exact', pontosBase: 10, pontosObtidos: 30 })
  })
})
