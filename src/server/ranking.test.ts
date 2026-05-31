import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { computeStandings } from './ranking'

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

async function addMember(poolId: string, name: string, joinedAt: Date, image?: string) {
  const user = await prisma.user.create({
    data: { name, email: `${name}@t.test`, image: image ?? null },
  })
  return prisma.poolMembership.create({ data: { poolId, userId: user.id, joinedAt } })
}

describe('computeStandings', () => {
  it('aggregates pontos, cravadas, acertosVencedor (and image) per membership', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const m2 = await makeMatch(2)
    const alice = await addMember(pool.id, 'Alice', new Date('2026-05-01T00:00:00.000Z'), 'https://img/alice.png')

    await prisma.prediction.create({ data: { membershipId: alice.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: alice.id, matchId: m2.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 1 } })

    const rows = await computeStandings(pool.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(alice.id)
    expect(rows[0].nome).toBe('Alice')
    expect(rows[0].pontos).toBe(4)
    expect(rows[0].cravadas).toBe(1)
    expect(rows[0].acertosVencedor).toBe(1)
    expect(rows[0].joinedAt.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(rows[0].image).toBe('https://img/alice.png')
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

    // Same pontos (3) and cravadas (1); tie broken by earlier joinedAt.
    const early = await addMember(pool.id, 'Early', new Date('2026-05-01T00:00:00.000Z'))
    const late = await addMember(pool.id, 'Late', new Date('2026-05-09T00:00:00.000Z'))
    const top = await addMember(pool.id, 'Top', new Date('2026-05-05T00:00:00.000Z'))

    await prisma.prediction.create({ data: { membershipId: early.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: late.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })

    const m2 = await makeMatch(2)
    await prisma.prediction.create({ data: { membershipId: top.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: top.id, matchId: m2.id, palpiteHome: 0, palpiteAway: 0, pontosObtidos: 3 } })

    const rows = await computeStandings(pool.id)
    expect(rows.map((r) => r.nome)).toEqual(['Top', 'Early', 'Late'])
  })

  it('only counts predictions from the requested pool', async () => {
    const poolA = await makePool()
    const poolB = await makePool()
    const m1 = await makeMatch(1)
    const aMember = await addMember(poolA.id, 'A', new Date('2026-05-01T00:00:00.000Z'))
    const bMember = await addMember(poolB.id, 'B', new Date('2026-05-01T00:00:00.000Z'))

    await prisma.prediction.create({ data: { membershipId: aMember.id, matchId: m1.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: bMember.id, matchId: m1.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 } })

    const rows = await computeStandings(poolA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(aMember.id)
  })
})
