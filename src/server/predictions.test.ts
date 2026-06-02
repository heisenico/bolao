import { beforeEach, describe, expect, it } from 'vitest'
import type { MatchPhase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createPool, joinPool } from './pools'
import {
  PredictionLockedError,
  getVisiblePredictions,
  hasPredictedEntirePhase,
  upsertPrediction,
} from './predictions'

async function seedMatch(kickoff: Date) {
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR', grupo: 'A' } })
  const away = await prisma.team.create({ data: { nome: 'Argentina', codigoPais: 'AR', grupo: 'A' } })
  return prisma.match.create({
    data: {
      fase: 'grupos',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: kickoff,
    },
  })
}

describe('predictions service (integration)', () => {
  let inviteCode: string
  let memberAId: string // membershipId
  let memberBId: string // membershipId

  beforeEach(async () => {
    const owner = await prisma.user.create({ data: { email: `o-${Date.now()}@test.dev` } })
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'Pred Pool',
      valorEntrada: 1000,
      chavePix: 'o@pix',
    })
    inviteCode = pool.inviteCode

    const uA = await prisma.user.create({ data: { email: `a-${Date.now()}@test.dev` } })
    const uB = await prisma.user.create({ data: { email: `b-${Date.now()}@test.dev` } })
    const a = await joinPool({ inviteCode, userId: uA.id })
    const b = await joinPool({ inviteCode, userId: uB.id })
    memberAId = a.id
    memberBId = b.id
  })

  it('upsertPrediction creates a prediction while open', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z') // 5h before -> open
    const match = await seedMatch(kickoff)

    const pred = await upsertPrediction({
      membershipId: memberAId,
      matchId: match.id,
      palpiteHome: 2,
      palpiteAway: 1,
      now,
    })

    expect(pred.palpiteHome).toBe(2)
    expect(pred.palpiteAway).toBe(1)
    expect(pred.pontosObtidos).toBe(0)
  })

  it('upsertPrediction updates an existing prediction (same membership+match) while open', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z')
    const match = await seedMatch(kickoff)

    await upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 1, palpiteAway: 1, now })
    const updated = await upsertPrediction({
      membershipId: memberAId,
      matchId: match.id,
      palpiteHome: 3,
      palpiteAway: 0,
      now,
    })

    expect(updated.palpiteHome).toBe(3)
    expect(updated.palpiteAway).toBe(0)
    const count = await prisma.prediction.count({ where: { membershipId: memberAId, matchId: match.id } })
    expect(count).toBe(1)
  })

  it('upsertPrediction throws PredictionLockedError at the lock boundary (now === kickoff - 1h)', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T19:00:00.000Z') // exactly kickoff - 1h -> locked
    const match = await seedMatch(kickoff)

    await expect(
      upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 0, palpiteAway: 0, now }),
    ).rejects.toBeInstanceOf(PredictionLockedError)

    const count = await prisma.prediction.count({ where: { matchId: match.id } })
    expect(count).toBe(0)
  })

  it('upsertPrediction throws PredictionLockedError after kickoff', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T21:00:00.000Z') // 1h after kickoff -> locked
    const match = await seedMatch(kickoff)

    await expect(
      upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 1, palpiteAway: 1, now }),
    ).rejects.toBeInstanceOf(PredictionLockedError)
  })

  it('upsertPrediction throws for an unknown match id', async () => {
    const now = new Date('2026-06-11T15:00:00.000Z')
    await expect(
      upsertPrediction({ membershipId: memberAId, matchId: 'nope', palpiteHome: 1, palpiteAway: 0, now }),
    ).rejects.toThrow(/match/i)
  })

  it('upsertPrediction rejects negative scores', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z')
    const match = await seedMatch(kickoff)

    await expect(
      upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: -1, palpiteAway: 0, now }),
    ).rejects.toThrow(/palpite/i)

    const count = await prisma.prediction.count({ where: { matchId: match.id } })
    expect(count).toBe(0)
  })

  it('upsertPrediction rejects non-integer scores', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z')
    const match = await seedMatch(kickoff)

    await expect(
      upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 1.5, palpiteAway: 0, now }),
    ).rejects.toThrow(/palpite/i)

    const count = await prisma.prediction.count({ where: { matchId: match.id } })
    expect(count).toBe(0)
  })

  it('getVisiblePredictions hides other members predictions while the match is open', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z') // open
    const match = await seedMatch(kickoff)

    await upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 2, palpiteAway: 1, now })
    await upsertPrediction({ membershipId: memberBId, matchId: match.id, palpiteHome: 0, palpiteAway: 0, now })

    // Viewer A sees only their own prediction while open.
    const visibleToA = await getVisiblePredictions(match.id, memberAId, now)
    expect(visibleToA).toHaveLength(1)
    expect(visibleToA[0].membershipId).toBe(memberAId)
  })

  it('getVisiblePredictions returns the viewer own row even when only others also predicted (open)', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const now = new Date('2026-06-11T15:00:00.000Z') // open
    const match = await seedMatch(kickoff)

    // Both A and B predict; viewer B must still see B's own row (and not A's) while open.
    await upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 2, palpiteAway: 1, now })
    await upsertPrediction({ membershipId: memberBId, matchId: match.id, palpiteHome: 0, palpiteAway: 0, now })

    const visibleToB = await getVisiblePredictions(match.id, memberBId, now)
    expect(visibleToB).toHaveLength(1)
    expect(visibleToB[0].membershipId).toBe(memberBId)
  })

  it('getVisiblePredictions reveals all predictions once the match locks', async () => {
    const kickoff = new Date('2026-06-11T20:00:00.000Z')
    const openNow = new Date('2026-06-11T15:00:00.000Z')
    const lockedNow = new Date('2026-06-11T19:30:00.000Z') // after lock
    const match = await seedMatch(kickoff)

    await upsertPrediction({ membershipId: memberAId, matchId: match.id, palpiteHome: 2, palpiteAway: 1, now: openNow })
    await upsertPrediction({ membershipId: memberBId, matchId: match.id, palpiteHome: 0, palpiteAway: 0, now: openNow })

    const visible = await getVisiblePredictions(match.id, memberAId, lockedNow)
    const ids = visible.map((p) => p.membershipId).sort()
    expect(ids).toEqual([memberAId, memberBId].sort())
  })

  it('getVisiblePredictions throws for an unknown match id', async () => {
    const now = new Date('2026-06-11T15:00:00.000Z')
    await expect(getVisiblePredictions('nope', memberAId, now)).rejects.toThrow(/match/i)
  })
})

describe('hasPredictedEntirePhase (integration)', () => {
  let memberAId: string
  let memberBId: string

  async function seedPhaseMatch(fase: MatchPhase, suffix: string) {
    const home = await prisma.team.create({ data: { nome: `H-${suffix}`, codigoPais: 'BR' } })
    const away = await prisma.team.create({ data: { nome: `A-${suffix}`, codigoPais: 'AR' } })
    return prisma.match.create({
      data: {
        fase,
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-06-20T20:00:00.000Z'),
      },
    })
  }

  async function predict(membershipId: string, matchId: string) {
    await prisma.prediction.create({
      data: { membershipId, matchId, palpiteHome: 1, palpiteAway: 0 },
    })
  }

  beforeEach(async () => {
    const owner = await prisma.user.create({ data: { email: `ph-o-${Date.now()}-${Math.random()}@test.dev` } })
    const pool = await createPool({
      ownerId: owner.id,
      nome: 'Phase Pool',
      valorEntrada: 1000,
      chavePix: 'ph@pix',
    })
    const uA = await prisma.user.create({ data: { email: `ph-a-${Date.now()}-${Math.random()}@test.dev` } })
    const uB = await prisma.user.create({ data: { email: `ph-b-${Date.now()}-${Math.random()}@test.dev` } })
    memberAId = (await joinPool({ inviteCode: pool.inviteCode, userId: uA.id })).id
    memberBId = (await joinPool({ inviteCode: pool.inviteCode, userId: uB.id })).id
  })

  it('is false while any match in the phase is still unpredicted', async () => {
    const m1 = await seedPhaseMatch('grupos', 'g1')
    await seedPhaseMatch('grupos', 'g2')
    await predict(memberAId, m1.id)

    expect(await hasPredictedEntirePhase(memberAId, m1.id)).toBe(false)
  })

  it('is true once every match in the phase is predicted', async () => {
    const m1 = await seedPhaseMatch('grupos', 'g1')
    const m2 = await seedPhaseMatch('grupos', 'g2')
    await predict(memberAId, m1.id)
    await predict(memberAId, m2.id)

    expect(await hasPredictedEntirePhase(memberAId, m1.id)).toBe(true)
  })

  it('scopes completion to the match own phase, ignoring other phases', async () => {
    const g1 = await seedPhaseMatch('grupos', 'g1')
    const g2 = await seedPhaseMatch('grupos', 'g2')
    const o1 = await seedPhaseMatch('oitavas', 'o1')
    await predict(memberAId, g1.id)
    await predict(memberAId, g2.id)

    // Group phase fully predicted -> true, even though oitavas is untouched.
    expect(await hasPredictedEntirePhase(memberAId, g1.id)).toBe(true)
    // The oitavas match's own phase still has an open pick -> false.
    expect(await hasPredictedEntirePhase(memberAId, o1.id)).toBe(false)
  })

  it('counts only the given membership predictions', async () => {
    const m1 = await seedPhaseMatch('grupos', 'g1')
    await predict(memberBId, m1.id)

    expect(await hasPredictedEntirePhase(memberAId, m1.id)).toBe(false)
    expect(await hasPredictedEntirePhase(memberBId, m1.id)).toBe(true)
  })

  it('is false for an unknown match id', async () => {
    expect(await hasPredictedEntirePhase(memberAId, 'nope')).toBe(false)
  })
})
