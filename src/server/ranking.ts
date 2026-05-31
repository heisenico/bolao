import { prisma } from '@/lib/prisma'
import { rankRows, type RankingRow } from '@/domain/ranking'

/**
 * Aggregates each membership's predictions into a RankingRow and returns the
 * rows sorted by the full tiebreaker chain (CONTRACT §4 via rankRows).
 * cravadas = predictions worth 3; acertosVencedor = predictions worth exactly 1.
 * Every membership appears, even one with no predictions (zeroed row).
 */
export async function computeStandings(poolId: string): Promise<RankingRow[]> {
  const memberships = await prisma.poolMembership.findMany({
    where: { poolId },
    include: {
      user: { select: { name: true, email: true, image: true } },
      predictions: { select: { pontosObtidos: true } },
    },
  })

  const rows: RankingRow[] = memberships.map((m) => {
    let pontos = 0
    let cravadas = 0
    let acertosVencedor = 0
    for (const p of m.predictions) {
      pontos += p.pontosObtidos
      if (p.pontosObtidos === 3) cravadas++
      else if (p.pontosObtidos === 1) acertosVencedor++
    }
    return {
      membershipId: m.id,
      nome: m.user.name ?? m.user.email ?? m.id,
      pontos,
      cravadas,
      acertosVencedor,
      joinedAt: m.joinedAt,
      image: m.user.image ?? null,
    }
  })

  return rankRows(rows)
}
