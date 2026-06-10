import type { HitType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { rankRows, type RankingRow } from '@/domain/ranking'
import { assignPrizeRanks, type PrizeRankedRow } from '@/domain/prize'

// Hit types that count as an "acerto" for tiebreaker #3 (any non-miss). An
// explicit allowlist so 'pending' and 'cancelled' can never sneak into the
// counters. NO code may infer hit type from point values — point literals vary
// by phase multiplier (a cravada is worth 10, 15, 20 or 30).
const COUNTED_HIT_TYPES: ReadonlySet<HitType> = new Set([
  'exact',
  'winner_and_diff',
  'winner_only',
])

/**
 * Aggregates each membership's predictions + confirmed FIFA prize points into a
 * RankingRow and returns the rows sorted by the full tiebreaker chain.
 * cravadas counts hitType === 'exact' (phase-independent); acertosVencedor
 * counts any non-miss hit. Prize points enter the total only once settled
 * (pointsAwarded non-null); acertouCampeao = champion pick awarded > 0.
 * Every membership appears, even one with no predictions (zeroed row).
 */
export async function computeStandings(poolId: string): Promise<RankingRow[]> {
  const memberships = await prisma.poolMembership.findMany({
    where: { poolId },
    include: {
      user: { select: { name: true, email: true, image: true, isAi: true } },
      predictions: { select: { pontosObtidos: true, hitType: true } },
      prizePredictions: { select: { prizeType: true, pointsAwarded: true } },
    },
  })

  const rows: RankingRow[] = memberships.map((m) => {
    let pontos = 0
    let cravadas = 0
    let acertosVencedor = 0
    for (const p of m.predictions) {
      pontos += p.pontosObtidos
      if (p.hitType === 'exact') cravadas++
      if (COUNTED_HIT_TYPES.has(p.hitType)) acertosVencedor++
    }

    let acertouCampeao = false
    for (const pp of m.prizePredictions) {
      pontos += pp.pointsAwarded ?? 0
      if (pp.prizeType === 'champion' && (pp.pointsAwarded ?? 0) > 0) {
        acertouCampeao = true
      }
    }

    return {
      membershipId: m.id,
      nome: m.user.name ?? m.user.email ?? m.id,
      pontos,
      cravadas,
      acertosVencedor,
      acertouCampeao,
      isAi: m.user.isAi,
      joinedAt: m.joinedAt,
      image: m.user.image ?? null,
    }
  })

  return rankRows(rows)
}

/**
 * Final standings annotated with prize positions: the top `topN` HUMANS take
 * prize ranks 1..topN (60/30/10), cascading past any AI rows. AIs and
 * non-winners carry humanPrizeRank/prizePct = null.
 */
export async function getPrizeWinners(
  poolId: string,
  topN = 3,
): Promise<PrizeRankedRow[]> {
  const standings = await computeStandings(poolId)
  return assignPrizeRanks(standings, topN)
}
