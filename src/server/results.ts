import { prisma } from '@/lib/prisma'
import {
  defaultFootballDataClient,
  type FootballDataClient,
  type FdMatch,
} from '@/lib/footballData'
import { scorePrediction, type Score } from '@/domain/scoring'
import type { MatchPhase, MatchStatus } from '@prisma/client'

/** Builds the default football-data.org client from env (server-only). */
export function defaultClient(): FootballDataClient {
  return defaultFootballDataClient()
}

/**
 * True when the match is over and the final score is authoritative: FINISHED and
 * both fullTime goal counts present (CONTRACT §11.10).
 */
export function hasFinalScore(match: FdMatch): boolean {
  return (
    match.status === 'FINISHED' &&
    typeof match.score.fullTime.home === 'number' &&
    typeof match.score.fullTime.away === 'number'
  )
}

/**
 * Extracts the final Score from a football-data.org match. Throws if not final.
 * Reads `score.fullTime` only — the result after normal + extra time. Any penalty
 * shootout is NOT reflected there (CONTRACT §4, §11.10): a 1-1 that went to
 * penalties scores as a draw here.
 */
export function fixtureToScore(match: FdMatch): Score {
  if (!hasFinalScore(match)) {
    throw new Error('Match has no final score')
  }
  return {
    home: match.score.fullTime.home as number,
    away: match.score.fullTime.away as number,
  }
}

/**
 * Maps a football-data.org stage to our MatchPhase (CONTRACT §11.10).
 *   GROUP_STAGE -> grupos, LAST_32 -> r32, LAST_16 -> oitavas,
 *   QUARTER_FINALS -> quartas, SEMI_FINALS -> semi,
 *   THIRD_PLACE -> terceiro, FINAL -> final.
 * Unknown/empty stages default to grupos.
 */
export function stageToPhase(stage: string): MatchPhase {
  switch (stage) {
    case 'GROUP_STAGE':
      return 'grupos'
    case 'LAST_32':
      return 'r32'
    case 'LAST_16':
      return 'oitavas'
    case 'QUARTER_FINALS':
      return 'quartas'
    case 'SEMI_FINALS':
      return 'semi'
    case 'THIRD_PLACE':
      return 'terceiro'
    case 'FINAL':
      return 'final'
    default:
      return 'grupos'
  }
}

/**
 * Maps a football-data.org status to our MatchStatus (CONTRACT §11.10).
 *   SCHEDULED|TIMED -> agendada, IN_PLAY|PAUSED -> ao_vivo, FINISHED -> encerrada,
 *   POSTPONED -> adiada, CANCELLED|SUSPENDED -> cancelada.
 * Unknown statuses default to agendada.
 */
export function statusToMatchStatus(status: string): MatchStatus {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'agendada'
    case 'IN_PLAY':
    case 'PAUSED':
      return 'ao_vivo'
    case 'FINISHED':
      return 'encerrada'
    case 'POSTPONED':
      return 'adiada'
    case 'CANCELLED':
    case 'SUSPENDED':
      return 'cancelada'
    default:
      return 'agendada'
  }
}

/**
 * Syncs teams + matches from football-data.org into Team/Match, keyed by the FD
 * id stored in the existing `apiFootballId` columns (no migration — CONTRACT
 * §11.10). Idempotent: upserts by id, never duplicates. Returns counts.
 * The client is injectable so tests never hit the network (CONTRACT §8, §11.10).
 *
 * Team metadata is stable, so both create and update set nome/codigoPais/bandeira
 * (crest URL) and grupo. grupo comes from the GROUP_STAGE matches: a team's group
 * letter is read off any group-stage match it plays in (`"GROUP_A"` -> `"A"`).
 * Teams that appear only in knockout placeholders keep grupo = null.
 *
 * create: connect home/away by FD team id, dataHora from utcDate, fase from stage,
 *   status=agendada, apiFootballId=FD match id.
 * update: refresh ONLY dataHora + fase. Never reverts status/placar/resultadoFonte,
 *   so a daily re-sync cannot undo a settled or manually-overridden result.
 */
export async function syncFixtures(
  opts: { client?: FootballDataClient } = {},
): Promise<{ teams: number; matches: number }> {
  const client = opts.client ?? defaultClient()

  const fdMatches = await client.getMatches()

  // Group letter per team, derived from group-stage matches. Both teams of a
  // GROUP_STAGE match whose `group` is set ("GROUP_A") get that letter ("A").
  const groupByFdTeamId = new Map<number, string>()
  for (const m of fdMatches) {
    if (m.stage !== 'GROUP_STAGE' || !m.group) continue
    const letter = m.group.startsWith('GROUP_')
      ? m.group.slice('GROUP_'.length)
      : m.group
    if (!letter) continue
    groupByFdTeamId.set(m.homeTeam.id, letter)
    groupByFdTeamId.set(m.awayTeam.id, letter)
  }

  const fdTeams = await client.getTeams()
  for (const team of fdTeams) {
    const grupo = groupByFdTeamId.get(team.id) ?? null
    await prisma.team.upsert({
      where: { apiFootballId: team.id },
      update: {
        nome: team.name,
        codigoPais: team.tla ?? '',
        bandeira: team.crest ?? null,
        grupo,
      },
      create: {
        nome: team.name,
        codigoPais: team.tla ?? '',
        bandeira: team.crest ?? null,
        grupo,
        apiFootballId: team.id,
      },
    })
  }

  // Map FD team id -> our Team.id for FK wiring.
  const teamRows = await prisma.team.findMany({
    where: { apiFootballId: { not: null } },
    select: { id: true, apiFootballId: true },
  })
  const teamIdByFdId = new Map<number, string>()
  for (const t of teamRows) {
    if (t.apiFootballId != null) teamIdByFdId.set(t.apiFootballId, t.id)
  }

  let matchCount = 0
  for (const m of fdMatches) {
    const homeId = teamIdByFdId.get(m.homeTeam.id)
    const awayId = teamIdByFdId.get(m.awayTeam.id)
    if (!homeId || !awayId) continue // skip matches whose teams we did not sync

    await prisma.match.upsert({
      where: { apiFootballId: m.id },
      // update: refresh schedule + phase only; never revert a settled/manual result.
      update: {
        dataHora: new Date(m.utcDate),
        fase: stageToPhase(m.stage),
      },
      create: {
        fase: stageToPhase(m.stage),
        homeTeam: { connect: { id: homeId } },
        awayTeam: { connect: { id: awayId } },
        dataHora: new Date(m.utcDate),
        status: 'agendada',
        apiFootballId: m.id,
      },
    })
    matchCount++
  }

  return { teams: fdTeams.length, matches: matchCount }
}

/** A match window stays "open for polling" from kickoff to kickoff + this. */
export const MATCH_WINDOW_DURATION_MS = 3 * 60 * 60 * 1000 // 3h: 90' + ET + stoppage + settle lag

/**
 * Polls finished matches and settles ours, but only when `now` falls inside an
 * open match window (an agendada match whose [dataHora, dataHora+window] contains
 * now). Outside every window: no-op, no API call (preserves the request budget).
 *
 * Candidate gate (CONTRACT §11.8): status agendada, resultadoFonte not manual
 * (include NULL explicitly so freshly-synced rows are not silently dropped),
 * dataHora within [now - window, now], apiFootballId set.
 *
 * For each candidate whose FD match is final (matched by apiFootballId): writes
 * placarHome/placarAway + status=encerrada + resultadoFonte=api, then recomputes
 * pontosObtidos for that match's predictions via scorePrediction. Idempotent:
 * settled matches are no longer agendada, so they fall out of the candidate gate.
 */
export async function pollAndSettle(
  opts: { now?: Date; client?: FootballDataClient } = {},
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
  const finished = await client.getFinishedMatches()
  const finishedByFdId = new Map<number, FdMatch>()
  for (const m of finished) {
    finishedByFdId.set(m.id, m)
  }

  const settledMatchIds: string[] = []

  for (const m of openMatches) {
    if (m.apiFootballId == null) continue
    const fd = finishedByFdId.get(m.apiFootballId)
    if (!fd || !hasFinalScore(fd)) continue

    const score = fixtureToScore(fd)

    // Atomic per match (CONTRACT §11.8): write the result and recompute every
    // prediction's pontosObtidos in one transaction. A crash mid-recompute would
    // otherwise flip the match to `encerrada` with only some predictions scored,
    // and a re-run can't fix it (the match is no longer `agendada`, so it falls
    // out of the candidate gate). The transaction rolls back the result write too,
    // leaving the match `agendada` for the next poll to retry cleanly.
    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: m.id },
        data: {
          placarHome: score.home,
          placarAway: score.away,
          status: 'encerrada',
          resultadoFonte: 'api',
        },
      })

      const predictions = await tx.prediction.findMany({ where: { matchId: m.id } })
      for (const p of predictions) {
        const pontos = scorePrediction({ home: p.palpiteHome, away: p.palpiteAway }, score)
        await tx.prediction.update({
          where: { id: p.id },
          data: { pontosObtidos: pontos },
        })
      }
    })

    settledMatchIds.push(m.id)
  }

  return { settledMatchIds }
}

/** Rejects a score that is not a non-negative integer (no silent coercion). */
function assertValidScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`)
  }
}

/**
 * Admin manual override (CONTRACT §4 / §6): set the final score, close the
 * match (status=encerrada), mark resultadoFonte=manual, and recompute
 * pontosObtidos for every prediction on this match. The poller already skips
 * manual matches (they are no longer `agendada` and the candidate gate excludes
 * non-api/non-null sources), so a manual result is never overwritten (§11.8).
 *
 * W.O. needs no special path: an official walkover is applied as a normal manual
 * result (e.g. 3x0) through this same function (CONTRACT §4 / §11.8).
 *
 * The match update and every prediction recompute run in one transaction: a
 * crash mid-recompute must not leave the match `encerrada` with only some
 * predictions scored (re-running can't fix it — the match is no longer a poll
 * candidate). The transaction rolls back the whole change so it can be retried.
 */
export async function applyManualResult(
  matchId: string,
  placarHome: number,
  placarAway: number,
): Promise<void> {
  assertValidScore(placarHome, 'placarHome')
  assertValidScore(placarAway, 'placarAway')

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: {
        placarHome,
        placarAway,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })

    const predictions = await tx.prediction.findMany({ where: { matchId } })
    for (const p of predictions) {
      const pontos = scorePrediction(
        { home: p.palpiteHome, away: p.palpiteAway },
        { home: placarHome, away: placarAway },
      )
      await tx.prediction.update({
        where: { id: p.id },
        data: { pontosObtidos: pontos },
      })
    }
  })
}

/**
 * Admin cancels a match (CONTRACT §4 / §11.8): set status=cancelada and void
 * every prediction's points (pontosObtidos=0). Both writes run in one
 * transaction. computeStandings sums pontosObtidos, so the now-zeroed
 * predictions drop the cancelled match out of the ranking with no further
 * change. The poller settles only status=agendada, so it never resurrects a
 * cancelada match.
 */
export async function cancelMatch(matchId: string): Promise<void> {
  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: { status: 'cancelada' },
    }),
    prisma.prediction.updateMany({
      where: { matchId },
      data: { pontosObtidos: 0 },
    }),
  ])
}
