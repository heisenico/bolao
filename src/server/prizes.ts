import type { PrizePrediction, PrizeResult, PrizeType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PRIZE_POINTS, prizeValuesMatch } from '@/domain/awards'
import { isPrizePredictionOpen } from '@/domain/deadline'
import { getDeadlineContext } from '@/server/deadlines'

export class PrizePredictionLockedError extends Error {
  constructor(prizeType: PrizeType) {
    super(`Prize predictions are locked for ${prizeType}`)
    this.name = 'PrizePredictionLockedError'
  }
}

/** Server-side bound for a pick/result value (the UI caps inputs at the same). */
export const MAX_PRIZE_VALUE_LENGTH = 80

function assertValidPrizeValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Palpite inválido: escolha um valor.')
  }
  if (trimmed.length > MAX_PRIZE_VALUE_LENGTH) {
    throw new Error(
      `Palpite inválido: máximo de ${MAX_PRIZE_VALUE_LENGTH} caracteres.`,
    )
  }
  return trimmed
}

/**
 * Create or update the caller's pick for one FIFA prize. Window enforced in UTC
 * (PrizePredictionLockedError outside it): champion/top_scorer/best_goalkeeper/
 * golden_ball until Block A close; runner_up inside the Block B window only
 * (20/06 00:00 BRT until 1h before the first R32 kickoff).
 */
export async function upsertPrizePrediction(args: {
  membershipId: string
  prizeType: PrizeType
  value: string
  now?: Date
}): Promise<PrizePrediction> {
  const value = assertValidPrizeValue(args.value)

  const now = args.now ?? new Date()
  const deadlines = await getDeadlineContext()
  if (!isPrizePredictionOpen(args.prizeType, deadlines, now)) {
    throw new PrizePredictionLockedError(args.prizeType)
  }

  return prisma.prizePrediction.upsert({
    where: {
      membershipId_prizeType: {
        membershipId: args.membershipId,
        prizeType: args.prizeType,
      },
    },
    create: {
      membershipId: args.membershipId,
      prizeType: args.prizeType,
      value,
    },
    update: { value },
  })
}

/** The caller's prize picks (any of the five types they have filled). */
export async function getPrizePredictions(
  membershipId: string,
): Promise<PrizePrediction[]> {
  return prisma.prizePrediction.findMany({ where: { membershipId } })
}

/** Confirmed official results (global facts — at most one row per prize type). */
export async function getPrizeResults(): Promise<PrizeResult[]> {
  return prisma.prizeResult.findMany()
}

/**
 * Admin-manual settlement (no API source): record the official FIFA result and
 * (re)award points to every pick of that type across ALL pools — the matching
 * picks get PRIZE_POINTS[type], the rest get 0 (no longer "aguardando
 * apuração"). Comparison is normalized (case/diacritic-insensitive). One
 * transaction; idempotent, and re-running with a corrected value re-awards
 * every pick consistently. Ownership is asserted by the action layer, exactly
 * like applyManualResult for match results.
 */
export async function applyPrizeResult(
  prizeType: PrizeType,
  value: string,
): Promise<void> {
  const officialValue = assertValidPrizeValue(value)

  await prisma.$transaction(async (tx) => {
    await tx.prizeResult.upsert({
      where: { prizeType },
      update: {
        value: officialValue,
        pointsValue: PRIZE_POINTS[prizeType],
        confirmedAt: new Date(),
      },
      create: {
        prizeType,
        value: officialValue,
        pointsValue: PRIZE_POINTS[prizeType],
      },
    })

    const picks = await tx.prizePrediction.findMany({ where: { prizeType } })
    for (const pick of picks) {
      await tx.prizePrediction.update({
        where: { id: pick.id },
        data: {
          pointsAwarded: prizeValuesMatch(pick.value, officialValue)
            ? PRIZE_POINTS[prizeType]
            : 0,
        },
      })
    }
  })
}
