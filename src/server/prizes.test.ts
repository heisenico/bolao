import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  PrizePredictionLockedError,
  applyPrizeResult,
  upsertPrizePrediction,
} from '@/server/prizes'
import { computeStandings } from '@/server/ranking'

// Opening match 11/06 19:00 UTC => Block A closes 18:00 UTC.
// First R32 match 28/06 18:00 UTC => runner-up closes 17:00 UTC.
const OPENING_KICKOFF = new Date('2026-06-11T19:00:00.000Z')
const FIRST_R32_KICKOFF = new Date('2026-06-28T18:00:00.000Z')

const BLOCK_A_OPEN = new Date('2026-06-10T12:00:00.000Z')
const BLOCK_A_CLOSED = new Date('2026-06-11T18:00:00.000Z')
const BLOCK_B_OPEN = new Date('2026-06-20T03:00:00.000Z')
const BLOCK_B_CLOSED = new Date('2026-06-28T17:00:00.000Z')

let memberId: string
let poolId: string

async function seedMatches() {
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
  await prisma.match.create({
    data: { fase: 'grupos', homeTeamId: home.id, awayTeamId: away.id, dataHora: OPENING_KICKOFF },
  })
  await prisma.match.create({
    data: { fase: 'r32', homeTeamId: home.id, awayTeamId: away.id, dataHora: FIRST_R32_KICKOFF },
  })
}

beforeEach(async () => {
  const owner = await prisma.user.create({
    data: { email: `pz-${Date.now()}-${Math.random()}@t.test`, name: 'Owner' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'P',
      inviteCode: `c${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 1000,
      chavePix: 'pix',
    },
  })
  poolId = pool.id
  memberId = (
    await prisma.poolMembership.create({ data: { poolId: pool.id, userId: owner.id } })
  ).id
  await seedMatches()
})

describe('upsertPrizePrediction windows', () => {
  it('Block A prizes: open before the opening match - 1h, locked after', async () => {
    const pick = await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'champion',
      value: 'Brasil',
      now: BLOCK_A_OPEN,
    })
    expect(pick.value).toBe('Brasil')

    await expect(
      upsertPrizePrediction({
        membershipId: memberId,
        prizeType: 'champion',
        value: 'Argentina',
        now: BLOCK_A_CLOSED,
      }),
    ).rejects.toBeInstanceOf(PrizePredictionLockedError)
  })

  it('runner_up: rejected before 20/06 00:00 BRT, open inside Block B, locked at its close', async () => {
    await expect(
      upsertPrizePrediction({
        membershipId: memberId,
        prizeType: 'runner_up',
        value: 'Franca',
        now: new Date('2026-06-19T23:00:00.000Z'), // 19/06 20:00 BRT
      }),
    ).rejects.toBeInstanceOf(PrizePredictionLockedError)

    const pick = await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'runner_up',
      value: 'Franca',
      now: BLOCK_B_OPEN,
    })
    expect(pick.value).toBe('Franca')

    await expect(
      upsertPrizePrediction({
        membershipId: memberId,
        prizeType: 'runner_up',
        value: 'Alemanha',
        now: BLOCK_B_CLOSED,
      }),
    ).rejects.toBeInstanceOf(PrizePredictionLockedError)
  })

  it('updates the existing pick in place (one row per prize type)', async () => {
    await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'top_scorer',
      value: 'Kane',
      now: BLOCK_A_OPEN,
    })
    await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'top_scorer',
      value: 'Vinícius Júnior',
      now: BLOCK_A_OPEN,
    })

    const rows = await prisma.prizePrediction.findMany({ where: { membershipId: memberId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('Vinícius Júnior')
  })

  it('rejects an empty value', async () => {
    await expect(
      upsertPrizePrediction({
        membershipId: memberId,
        prizeType: 'golden_ball',
        value: '   ',
        now: BLOCK_A_OPEN,
      }),
    ).rejects.toThrow(/inválido/i)
  })

  it('rejects a value longer than 80 characters (server-side bound)', async () => {
    await expect(
      upsertPrizePrediction({
        membershipId: memberId,
        prizeType: 'golden_ball',
        value: 'x'.repeat(81),
        now: BLOCK_A_OPEN,
      }),
    ).rejects.toThrow(/80/)
  })
})

describe('applyPrizeResult (admin-manual settlement)', () => {
  it('awards points to matching picks (normalized) and 0 to the rest, across pools', async () => {
    // Second pool with its own member who also picked.
    const owner2 = await prisma.user.create({
      data: { email: `pz2-${Date.now()}-${Math.random()}@t.test` },
    })
    const pool2 = await prisma.pool.create({
      data: {
        nome: 'P2',
        inviteCode: `c${Math.random()}`,
        ownerId: owner2.id,
        valorEntrada: 1000,
        chavePix: 'pix',
      },
    })
    const member2 = await prisma.poolMembership.create({
      data: { poolId: pool2.id, userId: owner2.id },
    })

    // Accent/case differences must still match (normalized comparison).
    await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'top_scorer',
      value: 'vinicius junior',
      now: BLOCK_A_OPEN,
    })
    await upsertPrizePrediction({
      membershipId: member2.id,
      prizeType: 'top_scorer',
      value: 'Harry Kane',
      now: BLOCK_A_OPEN,
    })

    await applyPrizeResult('top_scorer', 'Vinícius Júnior')

    const mine = await prisma.prizePrediction.findFirstOrThrow({
      where: { membershipId: memberId, prizeType: 'top_scorer' },
    })
    const theirs = await prisma.prizePrediction.findFirstOrThrow({
      where: { membershipId: member2.id, prizeType: 'top_scorer' },
    })
    expect(mine.pointsAwarded).toBe(20)
    expect(theirs.pointsAwarded).toBe(0)

    const result = await prisma.prizeResult.findUniqueOrThrow({
      where: { prizeType: 'top_scorer' },
    })
    expect(result.value).toBe('Vinícius Júnior')
    expect(result.pointsValue).toBe(20)
  })

  it('prize points enter standings only after confirmation ("awaiting settlement" before)', async () => {
    await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'champion',
      value: 'Brasil',
      now: BLOCK_A_OPEN,
    })

    const before = await computeStandings(poolId)
    expect(before[0].pontos).toBe(0)
    expect(before[0].acertouCampeao).toBe(false)

    await applyPrizeResult('champion', 'BRASIL') // case-insensitive match

    const after = await computeStandings(poolId)
    expect(after[0].pontos).toBe(30)
    expect(after[0].acertouCampeao).toBe(true)
  })

  it('re-running with a corrected value re-awards consistently (idempotent correction)', async () => {
    await upsertPrizePrediction({
      membershipId: memberId,
      prizeType: 'best_goalkeeper',
      value: 'Alisson',
      now: BLOCK_A_OPEN,
    })

    await applyPrizeResult('best_goalkeeper', 'Courtois')
    let pick = await prisma.prizePrediction.findFirstOrThrow({
      where: { membershipId: memberId, prizeType: 'best_goalkeeper' },
    })
    expect(pick.pointsAwarded).toBe(0)

    // Admin corrects the official result; the pick is re-awarded.
    await applyPrizeResult('best_goalkeeper', 'Alisson')
    pick = await prisma.prizePrediction.findFirstOrThrow({
      where: { membershipId: memberId, prizeType: 'best_goalkeeper' },
    })
    expect(pick.pointsAwarded).toBe(15)

    const results = await prisma.prizeResult.findMany({
      where: { prizeType: 'best_goalkeeper' },
    })
    expect(results).toHaveLength(1) // upsert, never a duplicate row
  })

  it('rejects an empty official value', async () => {
    await expect(applyPrizeResult('champion', '  ')).rejects.toThrow(/inválido/i)
  })
})
