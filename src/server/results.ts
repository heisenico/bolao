import { prisma } from '@/lib/prisma'
import {
  createApiFootballClient,
  type ApiFootballClient,
  type ApiFixture,
} from '@/lib/apiFootball'
import { env } from '@/lib/env'
import { scorePrediction, type Score } from '@/domain/scoring'
import type { MatchPhase } from '@prisma/client'

/** Builds the default API client from env (server-only). */
export function defaultClient(): ApiFootballClient {
  return createApiFootballClient({ apiKey: env.apiFootballKey() })
}

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

/**
 * Syncs teams + fixtures from API-Football into Team/Match, keyed by apiFootballId.
 * Idempotent: upserts by apiFootballId, never duplicates. Returns counts.
 * The API client is injectable so tests never hit the network (CONTRACT §8, §1 budget).
 */
export async function syncFixtures(
  opts: { client?: ApiFootballClient } = {},
): Promise<{ teams: number; matches: number }> {
  const client = opts.client ?? defaultClient()

  const apiTeams = await client.getTeams()
  for (const entry of apiTeams) {
    await prisma.team.upsert({
      where: { apiFootballId: entry.team.id },
      update: { nome: entry.team.name, codigoPais: entry.team.code ?? '' },
      create: {
        nome: entry.team.name,
        codigoPais: entry.team.code ?? '',
        apiFootballId: entry.team.id,
      },
    })
  }

  // Map apiFootballId -> our Team.id for FK wiring.
  const teamRows = await prisma.team.findMany({
    where: { apiFootballId: { not: null } },
    select: { id: true, apiFootballId: true },
  })
  const teamIdByApiId = new Map<number, string>()
  for (const t of teamRows) {
    if (t.apiFootballId != null) teamIdByApiId.set(t.apiFootballId, t.id)
  }

  const apiFixtures = await client.getFixtures()
  let matchCount = 0
  for (const fx of apiFixtures) {
    const homeId = teamIdByApiId.get(fx.teams.home.id)
    const awayId = teamIdByApiId.get(fx.teams.away.id)
    if (!homeId || !awayId) continue // skip fixtures whose teams we did not sync

    await prisma.match.upsert({
      where: { apiFootballId: fx.fixture.id },
      update: {
        homeTeamId: homeId,
        awayTeamId: awayId,
        dataHora: new Date(fx.fixture.date),
        fase: roundToPhase(fx.league.round),
      },
      create: {
        fase: roundToPhase(fx.league.round),
        homeTeamId: homeId,
        awayTeamId: awayId,
        dataHora: new Date(fx.fixture.date),
        apiFootballId: fx.fixture.id,
      },
    })
    matchCount++
  }

  return { teams: apiTeams.length, matches: matchCount }
}

/** A match window stays "open for polling" from kickoff to kickoff + this. */
export const MATCH_WINDOW_DURATION_MS = 3 * 60 * 60 * 1000 // 3h: 90' + ET + stoppage + settle lag

/**
 * Polls finished fixtures and settles matches, but only when `now` falls inside
 * an open match window (an agendada match whose [dataHora, dataHora+window] contains now).
 * Outside every window: no-op, no API call (preserves the 100 req/day budget).
 *
 * Candidate gate (CONTRACT §11.8): status agendada, resultadoFonte != manual (so a
 * manual result is never overwritten — defense-in-depth even though manual matches
 * are already non-agendada), dataHora within [now - window, now], apiFootballId set.
 *
 * For each candidate whose API fixture is final (matched by apiFootballId): writes
 * placarHome/placarAway + status=encerrada + resultadoFonte=api, then recomputes
 * pontosObtidos for that match's predictions via scorePrediction. Idempotent:
 * settled matches are no longer agendada, so they fall out of the candidate gate.
 */
export async function pollAndSettle(
  opts: { now?: Date; client?: ApiFootballClient } = {},
): Promise<{ settledMatchIds: string[] }> {
  const now = opts.now ?? new Date()

  // Find pending matches whose window currently contains `now`.
  const windowStartFloor = new Date(now.getTime() - MATCH_WINDOW_DURATION_MS)
  const openMatches = await prisma.match.findMany({
    where: {
      status: 'agendada',
      // Skip manual results (CONTRACT §11.8) but keep matches whose source is still
      // unset (NULL): a bare `{ not: 'manual' }` would drop NULL rows because SQL
      // `resultadoFonte <> 'manual'` is NULL (not true) for them, so include NULL
      // explicitly. Manual results are also already non-agendada (defense-in-depth).
      OR: [{ resultadoFonte: null }, { resultadoFonte: 'api' }],
      dataHora: { lte: now, gte: windowStartFloor },
      apiFootballId: { not: null },
    },
    select: { id: true, apiFootballId: true },
  })

  if (openMatches.length === 0) {
    return { settledMatchIds: [] }
  }

  const client = opts.client ?? defaultClient()
  const finished = await client.getFinishedFixtures()
  const finishedByApiId = new Map<number, ApiFixture>()
  for (const fx of finished) {
    finishedByApiId.set(fx.fixture.id, fx)
  }

  const settledMatchIds: string[] = []

  for (const m of openMatches) {
    if (m.apiFootballId == null) continue
    const fx = finishedByApiId.get(m.apiFootballId)
    if (!fx || !hasFinalScore(fx)) continue

    const score = fixtureToScore(fx)

    await prisma.match.update({
      where: { id: m.id },
      data: {
        placarHome: score.home,
        placarAway: score.away,
        status: 'encerrada',
        resultadoFonte: 'api',
      },
    })

    const predictions = await prisma.prediction.findMany({ where: { matchId: m.id } })
    for (const p of predictions) {
      const pontos = scorePrediction({ home: p.palpiteHome, away: p.palpiteAway }, score)
      await prisma.prediction.update({
        where: { id: p.id },
        data: { pontosObtidos: pontos },
      })
    }

    settledMatchIds.push(m.id)
  }

  return { settledMatchIds }
}
