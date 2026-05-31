import type { ApiFixture } from '@/lib/apiFootball'
import type { Score } from '@/domain/scoring'
import type { MatchPhase } from '@prisma/client'

/** True when the API fixture carries both final goal counts. */
export function hasFinalScore(fixture: ApiFixture): boolean {
  return typeof fixture.goals.home === 'number' && typeof fixture.goals.away === 'number'
}

/**
 * Extracts the final Score from an API fixture. Throws if not final.
 * Reads `fixture.goals` only — the score after normal + extra time. Any penalty
 * shootout lives in `score.penalty` (not modeled) and is intentionally excluded
 * (CONTRACT §4, §11.6): a 1-1 that went to penalties scores as a draw here.
 */
export function fixtureToScore(fixture: ApiFixture): Score {
  if (!hasFinalScore(fixture)) {
    throw new Error('Fixture has no final score')
  }
  return { home: fixture.goals.home as number, away: fixture.goals.away as number }
}

/**
 * Maps an API-Football round label to our MatchPhase (CONTRACT §11.6).
 *   Group -> grupos, Round of 32 -> r32, Round of 16 -> oitavas,
 *   Quarter-finals -> quartas, Semi-finals -> semi,
 *   3rd Place Final -> terceiro, Final -> final.
 * Unknown/empty rounds default to grupos. Order matters: the "3rd Place" and
 * "Semi"/"Quarter" checks run before the bare "final" check so they are not
 * mis-mapped to MatchPhase.final.
 */
export function roundToPhase(round: string): MatchPhase {
  const r = (round ?? '').toLowerCase()
  if (r.includes('group')) return 'grupos'
  if (r.includes('round of 32')) return 'r32'
  if (r.includes('round of 16')) return 'oitavas'
  if (r.includes('quarter')) return 'quartas'
  if (r.includes('semi')) return 'semi'
  if (r.includes('3rd') || r.includes('third')) return 'terceiro'
  if (r.includes('final')) return 'final'
  return 'grupos'
}
