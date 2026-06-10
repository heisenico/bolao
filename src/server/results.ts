import { prisma } from '@/lib/prisma'
import {
  defaultFootballDataClient,
  type FootballDataClient,
  type FdMatch,
} from '@/lib/footballData'
import { AUTO_PALPITE, settlePrediction, type Score } from '@/domain/scoring'
import { KNOCKOUT_PHASES, type BracketMatch } from '@/domain/bracket'
import type { MatchPhase, MatchStatus, Prisma } from '@prisma/client'

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

/**
 * Scores every prediction of a settled match inside the caller's transaction.
 * Official rules:
 *   - 0x0 fallback: a member with no pick gets an automatic 0x0 prediction
 *     (palpiteAutomatico), created here so it is auditable like any other pick.
 *     Memberships span ALL pools — matches are global rows shared across pools.
 *   - Each prediction gets hitType + pontosBase (pre-multiplier) + pontosObtidos
 *     (post phase-multiplier, the value the ranking sums).
 * Recomputing is idempotent: same score + fase always writes the same values.
 */
async function settlePredictionsTx(
  tx: Prisma.TransactionClient,
  match: { id: string; fase: MatchPhase },
  score: Score,
): Promise<void> {
  const memberships = await tx.poolMembership.findMany({ select: { id: true } })
  const predicted = await tx.prediction.findMany({
    where: { matchId: match.id },
    select: { membershipId: true },
  })
  const hasPick = new Set(predicted.map((p) => p.membershipId))
  const missing = memberships.filter((m) => !hasPick.has(m.id))
  if (missing.length > 0) {
    await tx.prediction.createMany({
      data: missing.map((m) => ({
        membershipId: m.id,
        matchId: match.id,
        palpiteHome: AUTO_PALPITE.home,
        palpiteAway: AUTO_PALPITE.away,
        palpiteAutomatico: true,
      })),
      skipDuplicates: true,
    })
  }

  const predictions = await tx.prediction.findMany({ where: { matchId: match.id } })
  for (const p of predictions) {
    const settled = settlePrediction(
      { home: p.palpiteHome, away: p.palpiteAway },
      score,
      match.fase,
    )
    await tx.prediction.update({
      where: { id: p.id },
      data: {
        hitType: settled.hitType,
        pontosBase: settled.pontosBase,
        pontosObtidos: settled.pontosObtidos,
      },
    })
  }
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
 * placarHome/placarAway + status=encerrada + resultadoFonte=api, then settles
 * every prediction (hitType + pontosBase + multiplied pontosObtidos, creating
 * the 0x0 fallbacks) via settlePredictionsTx. Idempotent: settled matches are
 * no longer agendada, so they fall out of the candidate gate.
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
    select: { id: true, apiFootballId: true, fase: true },
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
    // prediction (incl. creating the 0x0 fallbacks) in one transaction. A crash
    // mid-recompute would otherwise flip the match to `encerrada` with only some
    // predictions scored, and a re-run can't fix it (the match is no longer
    // `agendada`, so it falls out of the candidate gate). The transaction rolls
    // back the result write too, leaving the match `agendada` for a clean retry.
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

      await settlePredictionsTx(tx, m, score)
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
    const match = await tx.match.update({
      where: { id: matchId },
      data: {
        placarHome,
        placarAway,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
      select: { id: true, fase: true },
    })

    await settlePredictionsTx(tx, match, { home: placarHome, away: placarAway })
  })
}

/**
 * Idempotent rescore safety net (spec Phase 1 backfill): re-runs the current
 * classifier + phase multipliers over every already-settled match (encerrada
 * with both placar values), in one transaction per match. With nothing settled
 * it is a no-op; running it twice yields identical pontosObtidos. Manual
 * results are rescored from their stored placar — the source stays manual and
 * the result itself is never altered.
 */
export async function rescoreSettledMatches(): Promise<{ rescoredMatchIds: string[] }> {
  const settled = await prisma.match.findMany({
    where: {
      status: 'encerrada',
      placarHome: { not: null },
      placarAway: { not: null },
    },
    select: { id: true, fase: true, placarHome: true, placarAway: true },
  })

  const rescoredMatchIds: string[] = []
  for (const m of settled) {
    await prisma.$transaction(async (tx) => {
      await settlePredictionsTx(tx, m, {
        home: m.placarHome as number,
        away: m.placarAway as number,
      })
    })
    rescoredMatchIds.push(m.id)
  }

  return { rescoredMatchIds }
}

/**
 * Admin cancels a match (CONTRACT §4 / §11.8): set status=cancelada and void
 * every prediction (pontosObtidos=0, pontosBase=null, hitType='cancelled' so
 * the tiebreaker counters can never count it). Both writes run in one
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
      data: { pontosObtidos: 0, pontosBase: null, hitType: 'cancelled' },
    }),
  ])
}

/** One match row for the admin manual-result / cancel `<select>` (SPEC §9). */
export type AdminMatch = {
  id: string
  fase: MatchPhase
  status: MatchStatus
  dataHora: Date
  homeNome: string
  awayNome: string
  homeCodigoPais: string
  awayCodigoPais: string
  placarHome: number | null
  placarAway: number | null
}

/**
 * Load ALL matches for the admin manual-result / cancel forms (SPEC §9),
 * ordered by kickoff. Unlike getKnockoutMatches (Bracket-only), this includes
 * group-stage matches: the manual fallback must work for every match, and the
 * group stage is the whole start of the tournament. Returning all phases/states
 * (including cancelada) keeps a result correctable after the fact; the option
 * label carries date + teams + status/score so the owner can pick the right one.
 */
export async function getMatchesForAdmin(): Promise<AdminMatch[]> {
  const matches = await prisma.match.findMany({
    orderBy: { dataHora: 'asc' },
    include: { homeTeam: true, awayTeam: true },
  })
  return matches.map((m) => ({
    id: m.id,
    fase: m.fase,
    status: m.status,
    dataHora: m.dataHora,
    homeNome: m.homeTeam.nome,
    awayNome: m.awayTeam.nome,
    homeCodigoPais: m.homeTeam.codigoPais,
    awayCodigoPais: m.awayTeam.codigoPais,
    placarHome: m.placarHome,
    placarAway: m.placarAway,
  }))
}

/**
 * Load knockout-phase matches (r32..final) mapped to the pure BracketMatch shape
 * (CONTRACT §8). Group-stage matches are excluded by the `fase in KNOCKOUT_PHASES`
 * gate. Ordered by kickoff so the Bracket can lay out columns chronologically.
 */
export async function getKnockoutMatches(): Promise<BracketMatch[]> {
  const matches = await prisma.match.findMany({
    where: { fase: { in: KNOCKOUT_PHASES } },
    orderBy: { dataHora: 'asc' },
    include: { homeTeam: true, awayTeam: true },
  })
  return matches.map((m) => ({
    id: m.id,
    fase: m.fase,
    dataHora: m.dataHora,
    homeNome: m.homeTeam.nome,
    awayNome: m.awayTeam.nome,
    homeCodigoPais: m.homeTeam.codigoPais,
    awayCodigoPais: m.awayTeam.codigoPais,
    homeBandeira: m.homeTeam.bandeira,
    awayBandeira: m.awayTeam.bandeira,
    placarHome: m.placarHome,
    placarAway: m.placarAway,
  }))
}
