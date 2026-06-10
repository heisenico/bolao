import { prisma } from '@/lib/prisma'

export interface DeadlineContext {
  /** Kickoff of the opening match (Block A closes 1h before it). Null until fixtures sync. */
  openingKickoffUtc: Date | null
  /** Kickoff of the first R32 match (runner-up closes 1h before it). Null until pairings sync. */
  firstR32KickoffUtc: Date | null
}

/**
 * Deadline anchors derived from the synced fixtures — never stored, so a
 * rescheduled opening/first-R32 match moves the block deadlines automatically
 * (official rule: deadlines follow the new kickoff time).
 */
export async function getDeadlineContext(): Promise<DeadlineContext> {
  const [opening, firstR32] = await Promise.all([
    prisma.match.findFirst({
      orderBy: { dataHora: 'asc' },
      select: { dataHora: true },
    }),
    prisma.match.findFirst({
      where: { fase: 'r32' },
      orderBy: { dataHora: 'asc' },
      select: { dataHora: true },
    }),
  ])
  return {
    openingKickoffUtc: opening?.dataHora ?? null,
    firstR32KickoffUtc: firstR32?.dataHora ?? null,
  }
}
