import { type Prediction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isMatchLocked, isPredictionOpen } from '@/domain/deadline'

export class PredictionLockedError extends Error {
  constructor(matchId: string) {
    super(`Predictions are locked for match ${matchId}`)
    this.name = 'PredictionLockedError'
  }
}

/** Scores must be non-negative integers (a football scoreline). */
function assertValidScore(value: number, field: 'palpiteHome' | 'palpiteAway'): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Palpite inválido: ${field} deve ser um inteiro não-negativo (recebido ${value})`)
  }
}

/**
 * Create or update the caller's prediction for a match.
 * Rejected (PredictionLockedError) once now >= kickoff - 1h. Deadline enforced in UTC.
 */
export async function upsertPrediction(args: {
  membershipId: string
  matchId: string
  palpiteHome: number
  palpiteAway: number
  now?: Date
}): Promise<Prediction> {
  assertValidScore(args.palpiteHome, 'palpiteHome')
  assertValidScore(args.palpiteAway, 'palpiteAway')

  const now = args.now ?? new Date()
  const match = await prisma.match.findUnique({ where: { id: args.matchId } })
  if (!match) {
    throw new Error(`Match not found: ${args.matchId}`)
  }
  if (!isPredictionOpen(match.dataHora, now)) {
    throw new PredictionLockedError(args.matchId)
  }
  return prisma.prediction.upsert({
    where: {
      membershipId_matchId: {
        membershipId: args.membershipId,
        matchId: args.matchId,
      },
    },
    create: {
      membershipId: args.membershipId,
      matchId: args.matchId,
      palpiteHome: args.palpiteHome,
      palpiteAway: args.palpiteAway,
    },
    update: {
      palpiteHome: args.palpiteHome,
      palpiteAway: args.palpiteAway,
    },
  })
}

/**
 * Predictions for a match the viewer is allowed to see.
 * While the match is open, only the viewer's own prediction is returned (anti-copy).
 * Once locked (now >= kickoff - 1h), all members' predictions are returned.
 */
export async function getVisiblePredictions(
  matchId: string,
  viewerMembershipId: string,
  now: Date = new Date(),
): Promise<Prediction[]> {
  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) {
    throw new Error(`Match not found: ${matchId}`)
  }
  if (isMatchLocked(match.dataHora, now)) {
    return prisma.prediction.findMany({ where: { matchId } })
  }
  return prisma.prediction.findMany({
    where: { matchId, membershipId: viewerMembershipId },
  })
}
