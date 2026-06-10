import { type Prediction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isMatchLocked, isPredictionOpen } from '@/domain/deadline'
import { getDeadlineContext } from '@/server/deadlines'

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
 * Create or update the caller's prediction for a match. Deadlines enforced in
 * UTC, per the official blocks (PredictionLockedError when outside the window):
 *   group match — until 1h before the OPENING match (Block A close);
 *   knockout match — from 20/06 00:00 BRT until 1h before its own kickoff.
 * A draw (home === away) is a valid prediction in EVERY phase, knockout included
 * (penalties never count, so knockout matches can end level).
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
  const { openingKickoffUtc } = await getDeadlineContext()
  if (!isPredictionOpen(match.fase, match.dataHora, openingKickoffUtc, now)) {
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
      // An edit is always a human act: a row seeded as an automatic 0x0 can
      // only exist after settlement, and settled matches are locked above.
      palpiteAutomatico: false,
    },
  })
}

/**
 * Has this membership predicted every match in the given match's phase? Backs the
 * "fase completa" confirmation shown when a save fills the last open pick. True
 * only when the member has a prediction for every match in the phase; a
 * locked-but-unpredicted match keeps it false (they did not complete it in time).
 * Returns false for an unknown match.
 */
export async function hasPredictedEntirePhase(
  membershipId: string,
  matchId: string,
): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { fase: true },
  })
  if (!match) return false

  const phaseMatchIds = (
    await prisma.match.findMany({
      where: { fase: match.fase },
      select: { id: true },
    })
  ).map((m) => m.id)
  if (phaseMatchIds.length === 0) return false

  const predicted = await prisma.prediction.count({
    where: { membershipId, matchId: { in: phaseMatchIds } },
  })
  return predicted >= phaseMatchIds.length
}

/**
 * Predictions for a match the viewer is allowed to see.
 * While the match can still be edited (or, for a knockout match, before its
 * window even opens), only the viewer's own prediction is returned (anti-copy).
 * Once locked — Block A close for group matches, kickoff - 1h for knockout —
 * all members' predictions are returned.
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
  const { openingKickoffUtc } = await getDeadlineContext()
  if (isMatchLocked(match.fase, match.dataHora, openingKickoffUtc, now)) {
    return prisma.prediction.findMany({ where: { matchId } })
  }
  return prisma.prediction.findMany({
    where: { matchId, membershipId: viewerMembershipId },
  })
}
