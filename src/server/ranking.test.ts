import { describe, it, expect } from 'vitest'
import type { HitType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { computeStandings, getPrizeWinners } from './ranking'

async function makePool() {
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  return pool
}

async function makeMatch(apiId: number) {
  const home = await prisma.team.create({ data: { nome: `H${apiId}`, codigoPais: 'AAA', apiFootballId: apiId * 10 } })
  const away = await prisma.team.create({ data: { nome: `A${apiId}`, codigoPais: 'BBB', apiFootballId: apiId * 10 + 1 } })
  return prisma.match.create({
    data: {
      fase: 'grupos',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-06-11T20:00:00.000Z'),
      apiFootballId: apiId,
    },
  })
}

async function addMember(
  poolId: string,
  name: string,
  joinedAt: Date,
  opts: { image?: string; isAi?: boolean } = {},
) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `${name}-${Math.random()}@t.test`,
      image: opts.image ?? null,
      isAi: opts.isAi ?? false,
    },
  })
  return prisma.poolMembership.create({ data: { poolId, userId: user.id, joinedAt } })
}

function predict(args: {
  membershipId: string
  matchId: string
  pontosObtidos: number
  hitType: HitType
  pontosBase?: number
}) {
  return prisma.prediction.create({
    data: {
      membershipId: args.membershipId,
      matchId: args.matchId,
      palpiteHome: 1,
      palpiteAway: 0,
      pontosObtidos: args.pontosObtidos,
      pontosBase: args.pontosBase ?? null,
      hitType: args.hitType,
    },
  })
}

describe('computeStandings', () => {
  it('aggregates pontos, cravadas, acertosVencedor (and image) per membership', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const m2 = await makeMatch(2)
    const alice = await addMember(pool.id, 'Alice', new Date('2026-05-01T00:00:00.000Z'), {
      image: 'https://img/alice.png',
    })

    await predict({ membershipId: alice.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: alice.id, matchId: m2.id, pontosObtidos: 3, hitType: 'winner_only', pontosBase: 3 })

    const rows = await computeStandings(pool.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(alice.id)
    expect(rows[0].nome).toBe('Alice')
    expect(rows[0].pontos).toBe(13)
    expect(rows[0].cravadas).toBe(1)
    expect(rows[0].acertosVencedor).toBe(2) // any non-miss hit counts
    expect(rows[0].acertouCampeao).toBe(false)
    expect(rows[0].isAi).toBe(false)
    expect(rows[0].joinedAt.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(rows[0].image).toBe('https://img/alice.png')
  })

  it('counts tiebreakers by hitType, NEVER by point literals (multiplier regression)', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const m2 = await makeMatch(2)
    const ana = await addMember(pool.id, 'Ana', new Date('2026-05-01T00:00:00.000Z'))

    // A final-phase cravada worth 30 points: counts as exactly ONE cravada.
    await predict({ membershipId: ana.id, matchId: m1.id, pontosObtidos: 30, hitType: 'exact', pontosBase: 10 })
    // A winner-only worth 3 points (the OLD cravada literal): NOT a cravada.
    await predict({ membershipId: ana.id, matchId: m2.id, pontosObtidos: 3, hitType: 'winner_only', pontosBase: 3 })

    const rows = await computeStandings(pool.id)
    expect(rows[0].pontos).toBe(33)
    expect(rows[0].cravadas).toBe(1)
    expect(rows[0].acertosVencedor).toBe(2)
  })

  it('pending and cancelled predictions never enter the counters', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const m2 = await makeMatch(2)
    const bea = await addMember(pool.id, 'Bea', new Date('2026-05-01T00:00:00.000Z'))

    await predict({ membershipId: bea.id, matchId: m1.id, pontosObtidos: 0, hitType: 'pending' })
    await predict({ membershipId: bea.id, matchId: m2.id, pontosObtidos: 0, hitType: 'cancelled' })

    const rows = await computeStandings(pool.id)
    expect(rows[0].pontos).toBe(0)
    expect(rows[0].cravadas).toBe(0)
    expect(rows[0].acertosVencedor).toBe(0)
  })

  it('adds confirmed prize points to the total; unsettled picks add nothing', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const carla = await addMember(pool.id, 'Carla', new Date('2026-05-01T00:00:00.000Z'))

    await predict({ membershipId: carla.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    // Settled prize: +30. Unsettled (pointsAwarded null): +0.
    await prisma.prizePrediction.create({
      data: { membershipId: carla.id, prizeType: 'champion', value: 'Brasil', pointsAwarded: 30 },
    })
    await prisma.prizePrediction.create({
      data: { membershipId: carla.id, prizeType: 'top_scorer', value: 'Kane', pointsAwarded: null },
    })

    const rows = await computeStandings(pool.id)
    expect(rows[0].pontos).toBe(40)
    expect(rows[0].acertouCampeao).toBe(true)
  })

  it('breaks a full points/cravadas/acertos tie by the champion prize hit', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    // Same match points and counters; 'late' joined later BUT hit the champion.
    const early = await addMember(pool.id, 'Early', new Date('2026-05-01T00:00:00.000Z'))
    const late = await addMember(pool.id, 'Late', new Date('2026-05-09T00:00:00.000Z'))

    await predict({ membershipId: early.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: late.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })

    // Equalize the totals at 40 so only the champion HIT differs: early gets a
    // settled WRONG champion pick (0 pts) plus a top_scorer hit (+30); late
    // gets the champion hit (+30).
    await prisma.prizePrediction.create({
      data: { membershipId: early.id, prizeType: 'champion', value: 'Argentina', pointsAwarded: 0 },
    })
    await prisma.prizePrediction.create({
      data: { membershipId: early.id, prizeType: 'top_scorer', value: 'Kane', pointsAwarded: 30 },
    })
    await prisma.prizePrediction.create({
      data: { membershipId: late.id, prizeType: 'champion', value: 'Brasil', pointsAwarded: 30 },
    })

    const rows = await computeStandings(pool.id)
    // Totals tied at 40, cravadas tied, acertos tied -> champion hit wins
    // despite the later joinedAt.
    expect(rows.map((r) => r.nome)).toEqual(['Late', 'Early'])
    expect(rows[0].acertouCampeao).toBe(true)
    expect(rows[1].acertouCampeao).toBe(false)
  })

  it('includes members with no predictions as zero rows (image null when unset)', async () => {
    const pool = await makePool()
    const bob = await addMember(pool.id, 'Bob', new Date('2026-05-03T00:00:00.000Z'))

    const rows = await computeStandings(pool.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(bob.id)
    expect(rows[0].pontos).toBe(0)
    expect(rows[0].cravadas).toBe(0)
    expect(rows[0].acertosVencedor).toBe(0)
    expect(rows[0].image).toBeNull()
  })

  it('returns rows sorted by the full tiebreaker chain', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)

    // Same pontos and cravadas; tie broken by earlier joinedAt.
    const early = await addMember(pool.id, 'Early', new Date('2026-05-01T00:00:00.000Z'))
    const late = await addMember(pool.id, 'Late', new Date('2026-05-09T00:00:00.000Z'))
    const top = await addMember(pool.id, 'Top', new Date('2026-05-05T00:00:00.000Z'))

    await predict({ membershipId: early.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: late.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })

    const m2 = await makeMatch(2)
    await predict({ membershipId: top.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: top.id, matchId: m2.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })

    const rows = await computeStandings(pool.id)
    expect(rows.map((r) => r.nome)).toEqual(['Top', 'Early', 'Late'])
  })

  it('only counts predictions from the requested pool', async () => {
    const poolA = await makePool()
    const poolB = await makePool()
    const m1 = await makeMatch(1)
    const aMember = await addMember(poolA.id, 'A', new Date('2026-05-01T00:00:00.000Z'))
    const bMember = await addMember(poolB.id, 'B', new Date('2026-05-01T00:00:00.000Z'))

    await predict({ membershipId: aMember.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: bMember.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })

    const rows = await computeStandings(poolA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(aMember.id)
  })
})

describe('getPrizeWinners', () => {
  it('annotates the full standings; AIs rank but the top humans take 60/30/10', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const ai = await addMember(pool.id, 'Claude', new Date('2026-05-01T00:00:00.000Z'), { isAi: true })
    const h1 = await addMember(pool.id, 'Lucca', new Date('2026-05-01T00:00:00.000Z'))
    const h2 = await addMember(pool.id, 'Joao', new Date('2026-05-02T00:00:00.000Z'))
    await addMember(pool.id, 'Maria', new Date('2026-05-03T00:00:00.000Z'))

    await predict({ membershipId: ai.id, matchId: m1.id, pontosObtidos: 10, hitType: 'exact', pontosBase: 10 })
    await predict({ membershipId: h1.id, matchId: m1.id, pontosObtidos: 5, hitType: 'winner_and_diff', pontosBase: 5 })
    await predict({ membershipId: h2.id, matchId: m1.id, pontosObtidos: 3, hitType: 'winner_only', pontosBase: 3 })

    const rows = await getPrizeWinners(pool.id)
    expect(rows.map((r) => [r.nome, r.overallRank, r.humanPrizeRank, r.prizePct])).toEqual([
      ['Claude', 1, null, null],
      ['Lucca', 2, 1, 60],
      ['Joao', 3, 2, 30],
      ['Maria', 4, 3, 10],
    ])
  })
})
