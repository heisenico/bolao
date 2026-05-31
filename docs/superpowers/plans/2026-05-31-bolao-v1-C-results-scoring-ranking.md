# Results + Scoring + Ranking Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (dash space bracket) syntax for tracking.
Goal: Add automatic results ingestion from API-Football, deterministic per-match scoring, point recomputation on settlement, and a fully tiebroken ranking with a ranking page, so the standings auto-update within ~10-15 min of each match finishing.
Architecture: Pure domain logic (`src/domain/scoring.ts`, `src/domain/ranking.ts`) stays framework- and DB-free and is unit-tested with no I/O. A typed `src/lib/apiFootball.ts` fetch client with an in-memory cache talks to API-Football (`league=1, season=2026`) within the 100 req/day budget. Prisma-backed services (`src/server/results.ts`, `src/server/ranking.ts`) compose domain + prisma to sync fixtures, settle finished matches inside match windows, and aggregate standings; a token-protected `GET /api/poll-scores` route is the entry point an external scheduler hits every ~10-15 min.
Tech Stack: Next.js App Router + TypeScript, React 19, Prisma 6 + PostgreSQL (Neon), Vitest 4 (node env) + vite-tsconfig-paths, Tailwind CSS v4, API-Football (api-sports.io) via fetch.
---

> **Assumptions:** Plans A (scaffold, Tailwind theme, Prisma + auth models, Vitest harness, prisma singleton, `src/lib/env.ts`, Auth.js) and B (domain `Pool/Membership/Team/Match/Prediction/PaymentRecord` + enums in `prisma/schema.prisma`, `src/server/pools.ts`, `src/server/predictions.ts`, `src/domain/deadline.ts`, palpites + dashboard UI, `src/components/Button.tsx`, `src/components/Flag.tsx`) are fully implemented and committed. This plan only adds the files listed below; it does not re-create schema, env, or harness.
>
> **Contract anchors used by this plan** (from `docs/superpowers/plans/CONTRACT.md`):
> - Scoring rules (§4): exact = 3, winner/draw only = 1, wrong **or no prediction** = 0. Knockout uses normal+extra time; no 0×0 fallback.
> - Domain signatures (§5): `outcome`, `scorePrediction`, `RankingRow`, `compareRankingRows`, `rankRows`.
> - Server signatures (§6): `pollAndSettle(opts?: { now?: Date; client?: ApiFootballClient })`, `syncFixtures()`, `computeStandings(poolId)`. (`applyManualResult` is **defined only in Plan D** — CONTRACT §11.1. Plan C's `results.ts` exports only `syncFixtures`, `pollAndSettle`, `roundToPhase` plus the pure mappers `hasFinalScore`/`fixtureToScore`.)
> - Env accessors (§11.3): getter-function form only — `env.apiFootballKey()`, `env.pollSecret()`.
> - Current-pool resolution (§11.4): `getCurrentMembership(session.user.id)` from `src/server/pools.ts` (Plan B).
> - Ranking avatar + live refresh (§11.7): `RankingRow.image: string | null`; `AutoRefresh` client component polling `router.refresh()` every 45s.
> - Fixtures sync (§11.6): `GET /api/sync-fixtures` (daily, POLL_SECRET-protected) calls `syncFixtures()`; `roundToPhase(league.round)` maps knockout rounds; missing-prediction-row scores 0.
> - Manual override priority (§4): `resultadoFonte = manual` is never overwritten by the poller.
> - Ranking sort (§4): (1) `pontos` desc, (2) `cravadas` desc, (3) `acertosVencedor` desc, (4) `joinedAt` asc.
> - Test harness (§8): `dotenv -e .env.test -- vitest run` for DB integration; `vitest run src/domain` for pure unit tests with no DB.

> **Pre-flight (run once before Task 1, do not commit anything yet):**
> - [ ] Confirm Plan B is in place: `test -f prisma/schema.prisma && grep -q "model Prediction" prisma/schema.prisma && grep -q "enum ResultadoFonte" prisma/schema.prisma && echo OK_SCHEMA`
> - [ ] Confirm prisma singleton and env helper exist: `test -f src/lib/prisma.ts && test -f src/lib/env.ts && echo OK_LIB`
> - [ ] Confirm deadline domain exists (Plan B): `test -f src/domain/deadline.ts && echo OK_DEADLINE`
> - [ ] Confirm Vitest scripts exist in package.json: `grep -q '"test:run"' package.json && grep -q '"test:unit"' package.json && echo OK_SCRIPTS`
> - [ ] If any check fails, STOP — an earlier-letter plan is not actually complete. Do not work around it.

---

### Task 1: Pure scoring domain (`src/domain/scoring.ts`)

**Files:**
- Create: `src/domain/scoring.ts`
- Test: `src/domain/scoring.test.ts`

This is pure logic: no `next/*`, no `@prisma/*` imports. Tested with no DB via `vitest run src/domain` (CONTRACT §8).

- [ ] Write the failing test. Create `src/domain/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { outcome, scorePrediction, type Score } from './scoring'

describe('outcome', () => {
  it('returns 1 when home wins', () => {
    expect(outcome({ home: 2, away: 0 })).toBe(1)
  })
  it('returns -1 when away wins', () => {
    expect(outcome({ home: 0, away: 3 })).toBe(-1)
  })
  it('returns 0 on a draw', () => {
    expect(outcome({ home: 1, away: 1 })).toBe(0)
  })
  it('is sign(home - away), not magnitude', () => {
    expect(outcome({ home: 7, away: 1 })).toBe(1)
    expect(outcome({ home: 1, away: 7 })).toBe(-1)
  })
})

describe('scorePrediction', () => {
  it('exact score => 3', () => {
    const palpite: Score = { home: 2, away: 1 }
    const resultado: Score = { home: 2, away: 1 }
    expect(scorePrediction(palpite, resultado)).toBe(3)
  })
  it('exact 0x0 draw => 3', () => {
    expect(scorePrediction({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(3)
  })
  it('right winner, wrong score => 1', () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 3, away: 1 })).toBe(1)
  })
  it('right draw, wrong score => 1', () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(1)
  })
  it('wrong winner => 0', () => {
    expect(scorePrediction({ home: 2, away: 0 }, { home: 0, away: 1 })).toBe(0)
  })
  it('predicted draw but real had a winner => 0', () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0)
  })
  it('predicted a winner but real was a draw => 0', () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 1, away: 1 })).toBe(0)
  })
  it('return type is one of 0 | 1 | 3', () => {
    const v = scorePrediction({ home: 0, away: 1 }, { home: 1, away: 0 })
    expect([0, 1, 3]).toContain(v)
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:unit`. Expected: failure — Vitest cannot resolve `./scoring` (module not found / `outcome` is not a function), all `scoring.test.ts` cases error.

- [ ] Minimal implementation. Create `src/domain/scoring.ts`:
```ts
// Pure scoring logic. No next/* or @prisma/* imports (CONTRACT §2 boundaries).
// Rules (CONTRACT §4): exact score = 3; right winner/draw only = 1; wrong = 0.
// Knockout: caller passes normal+extra-time score; penalties are ignored upstream.

export interface Score {
  home: number
  away: number
}

/** sign(home - away): 1 home win, -1 away win, 0 draw. */
export function outcome(s: Score): -1 | 0 | 1 {
  if (s.home > s.away) return 1
  if (s.home < s.away) return -1
  return 0
}

/**
 * Points for one prediction against one result.
 * Exact placar => 3; correct winner/draw but wrong placar => 1; otherwise 0.
 */
export function scorePrediction(palpite: Score, resultado: Score): 0 | 1 | 3 {
  if (palpite.home === resultado.home && palpite.away === resultado.away) {
    return 3
  }
  if (outcome(palpite) === outcome(resultado)) {
    return 1
  }
  return 0
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:unit`. Expected: PASS — all `scoring.test.ts` cases green.

- [ ] Commit. Commands:
```
git add src/domain/scoring.ts src/domain/scoring.test.ts
git commit -m "feat: add pure scoring domain (outcome, scorePrediction)"
```

---

### Task 2: Pure ranking domain (`src/domain/ranking.ts`)

**Files:**
- Create: `src/domain/ranking.ts`
- Test: `src/domain/ranking.test.ts`

Pure logic, no DB. Tiebreaker order (CONTRACT §4): (1) `pontos` desc, (2) `cravadas` desc, (3) `acertosVencedor` desc, (4) `joinedAt` asc.

- [ ] Write the failing test. Create `src/domain/ranking.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { compareRankingRows, rankRows, type RankingRow } from './ranking'

function row(partial: Partial<RankingRow> & { membershipId: string }): RankingRow {
  return {
    nome: partial.nome ?? partial.membershipId,
    pontos: partial.pontos ?? 0,
    cravadas: partial.cravadas ?? 0,
    acertosVencedor: partial.acertosVencedor ?? 0,
    joinedAt: partial.joinedAt ?? new Date('2026-06-01T00:00:00.000Z'),
    image: partial.image ?? null,
    membershipId: partial.membershipId,
  }
}

describe('compareRankingRows', () => {
  it('orders by pontos desc first', () => {
    const a = row({ membershipId: 'a', pontos: 10 })
    const b = row({ membershipId: 'b', pontos: 20 })
    expect(compareRankingRows(a, b)).toBeGreaterThan(0) // b before a
    expect(compareRankingRows(b, a)).toBeLessThan(0)
  })

  it('breaks pontos tie by cravadas desc', () => {
    const a = row({ membershipId: 'a', pontos: 10, cravadas: 2 })
    const b = row({ membershipId: 'b', pontos: 10, cravadas: 5 })
    expect(compareRankingRows(a, b)).toBeGreaterThan(0) // b first
  })

  it('breaks pontos+cravadas tie by acertosVencedor desc', () => {
    const a = row({ membershipId: 'a', pontos: 10, cravadas: 3, acertosVencedor: 4 })
    const b = row({ membershipId: 'b', pontos: 10, cravadas: 3, acertosVencedor: 9 })
    expect(compareRankingRows(a, b)).toBeGreaterThan(0) // b first
  })

  it('breaks full tie by earliest joinedAt asc', () => {
    const early = new Date('2026-05-01T00:00:00.000Z')
    const late = new Date('2026-05-02T00:00:00.000Z')
    const a = row({ membershipId: 'a', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: late })
    const b = row({ membershipId: 'b', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: early })
    expect(compareRankingRows(a, b)).toBeGreaterThan(0) // b (earlier) first
    expect(compareRankingRows(b, a)).toBeLessThan(0)
  })

  it('returns 0 only when every tiebreaker is equal', () => {
    const when = new Date('2026-05-01T00:00:00.000Z')
    const a = row({ membershipId: 'a', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: when })
    const b = row({ membershipId: 'b', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: when })
    expect(compareRankingRows(a, b)).toBe(0)
  })
})

describe('rankRows', () => {
  it('returns a sorted copy applying the full tiebreaker chain', () => {
    const early = new Date('2026-05-01T00:00:00.000Z')
    const late = new Date('2026-05-02T00:00:00.000Z')
    const input: RankingRow[] = [
      row({ membershipId: 'low', pontos: 5 }),
      row({ membershipId: 'tieLate', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: late }),
      row({ membershipId: 'tieEarly', pontos: 10, cravadas: 3, acertosVencedor: 4, joinedAt: early }),
      row({ membershipId: 'top', pontos: 99 }),
    ]
    const out = rankRows(input)
    expect(out.map((r) => r.membershipId)).toEqual(['top', 'tieEarly', 'tieLate', 'low'])
  })

  it('does not mutate the input array', () => {
    const input: RankingRow[] = [
      row({ membershipId: 'a', pontos: 1 }),
      row({ membershipId: 'b', pontos: 2 }),
    ]
    const before = input.map((r) => r.membershipId)
    rankRows(input)
    expect(input.map((r) => r.membershipId)).toEqual(before)
  })

  it('handles empty input', () => {
    expect(rankRows([])).toEqual([])
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:unit`. Expected: failure — `./ranking` cannot be resolved; `compareRankingRows`/`rankRows` undefined.

- [ ] Minimal implementation. Create `src/domain/ranking.ts`:
```ts
// Pure ranking logic. No next/* or @prisma/* imports (CONTRACT §2 boundaries).
// Tiebreaker order (CONTRACT §4):
//   1) pontos desc, 2) cravadas desc, 3) acertosVencedor desc, 4) joinedAt asc.

export interface RankingRow {
  membershipId: string
  nome: string
  pontos: number
  cravadas: number
  acertosVencedor: number
  joinedAt: Date
  image: string | null
}

/** Comparator for Array.sort: negative => a ranks first. */
export function compareRankingRows(a: RankingRow, b: RankingRow): number {
  if (a.pontos !== b.pontos) return b.pontos - a.pontos
  if (a.cravadas !== b.cravadas) return b.cravadas - a.cravadas
  if (a.acertosVencedor !== b.acertosVencedor) return b.acertosVencedor - a.acertosVencedor
  return a.joinedAt.getTime() - b.joinedAt.getTime()
}

/** Returns a new sorted array (does not mutate input). */
export function rankRows(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort(compareRankingRows)
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:unit`. Expected: PASS — all `ranking.test.ts` and `scoring.test.ts` cases green.

- [ ] Commit. Commands:
```
git add src/domain/ranking.ts src/domain/ranking.test.ts
git commit -m "feat: add pure ranking domain (RankingRow, compareRankingRows, rankRows)"
```

---

### Task 3: API-Football typed client (`src/lib/apiFootball.ts`)

**Files:**
- Create: `src/lib/apiFootball.ts`
- Test: `src/lib/apiFootball.test.ts`

A typed fetch client for API-Football (api-sports.io) with header auth (`x-apisports-key: API_FOOTBALL_KEY`), a simple in-memory TTL cache (keeps usage under the 100 req/day budget — CONTRACT §1, SPEC §9), and three read methods scoped to `league=1, season=2026`. We inject the fetch function so tests do not hit the network and the env helper stays mockable.

- [ ] Write the failing test. Create `src/lib/apiFootball.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createApiFootballClient,
  API_FOOTBALL_BASE_URL,
  WC_LEAGUE,
  WC_SEASON,
  type ApiFixture,
  type ApiTeamEntry,
} from './apiFootball'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const teamsBody = {
  response: [
    { team: { id: 6, name: 'Brazil', code: 'BRA' } },
    { team: { id: 2, name: 'France', code: 'FRA' } },
  ] satisfies ApiTeamEntry[],
}

const fixturesBody = {
  response: [
    {
      fixture: { id: 1001, date: '2026-06-11T20:00:00+00:00', status: { short: 'NS' } },
      league: { round: 'Group A - 1' },
      teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
      goals: { home: null, away: null },
    },
  ] satisfies ApiFixture[],
}

describe('createApiFootballClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the api key header and league/season query for fixtures', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixturesBody))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock })

    const fixtures = await client.getFixtures()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`${API_FOOTBALL_BASE_URL}/fixtures`)
    expect(String(url)).toContain(`league=${WC_LEAGUE}`)
    expect(String(url)).toContain(`season=${WC_SEASON}`)
    expect((init as RequestInit).headers).toMatchObject({ 'x-apisports-key': 'KEY123' })
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0].fixture.id).toBe(1001)
  })

  it('getTeams returns the response array', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(teamsBody))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock })

    const teams = await client.getTeams()

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`${API_FOOTBALL_BASE_URL}/teams`)
    expect(teams.map((t) => t.team.id)).toEqual([6, 2])
  })

  it('caches identical requests within the TTL (one network call)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixturesBody))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock, cacheTtlMs: 60_000 })

    await client.getFixtures()
    await client.getFixtures()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getFinishedFixtures filters to finished statuses (FT/AET/PEN)', async () => {
    const mixed = {
      response: [
        { fixture: { id: 1, date: '2026-06-11T20:00:00+00:00', status: { short: 'FT' } }, league: { round: 'Group A - 1' }, teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } }, goals: { home: 2, away: 1 } },
        { fixture: { id: 2, date: '2026-06-11T20:00:00+00:00', status: { short: 'NS' } }, league: { round: 'Group A - 2' }, teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } }, goals: { home: null, away: null } },
        { fixture: { id: 3, date: '2026-06-11T20:00:00+00:00', status: { short: 'AET' } }, league: { round: 'Round of 16' }, teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } }, goals: { home: 1, away: 1 } },
        { fixture: { id: 4, date: '2026-06-11T20:00:00+00:00', status: { short: 'PEN' } }, league: { round: 'Quarter-finals' }, teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } }, goals: { home: 0, away: 0 } },
      ] satisfies ApiFixture[],
    }
    const fetchMock = vi.fn(async () => jsonResponse(mixed))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock })

    const finished = await client.getFinishedFixtures()

    expect(finished.map((f) => f.fixture.id)).toEqual([1, 3, 4])
  })

  it('exposes goals (normal + extra time) and excludes any penalty shootout', async () => {
    // A PEN match: goals carry the pre-shootout score; the shootout is NOT in goals.
    const penBody = {
      response: [
        {
          fixture: { id: 7, date: '2026-07-01T20:00:00+00:00', status: { short: 'PEN' } },
          league: { round: 'Round of 16' },
          teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
          goals: { home: 1, away: 1 },
        },
      ] satisfies ApiFixture[],
    }
    const fetchMock = vi.fn(async () => jsonResponse(penBody))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock })

    const finished = await client.getFinishedFixtures()

    // The ApiFixture surface has no penalty field at all — goals is the only score.
    expect(finished[0].goals).toEqual({ home: 1, away: 1 })
    expect('penalty' in (finished[0] as Record<string, unknown>)).toBe(false)
  })

  it('throws on non-2xx responses', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 429 }))
    const client = createApiFootballClient({ apiKey: 'KEY123', fetchFn: fetchMock })

    await expect(client.getFixtures()).rejects.toThrow(/API-Football request failed: 429/)
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/lib/apiFootball.test.ts`. Expected: failure — `./apiFootball` cannot be resolved; `createApiFootballClient` undefined.

- [ ] Minimal implementation. Create `src/lib/apiFootball.ts`:
```ts
// Typed API-Football (api-sports.io) client. fetch-based, in-memory TTL cache.
// Budget-aware: 100 req/day free tier (CONTRACT §1, SPEC §9). Always scoped to
// league=1, season=2026. fetchFn + apiKey are injectable so callers/tests control I/O.

export const API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io'
export const WC_LEAGUE = 1
export const WC_SEASON = 2026

/** Statuses that mean the match is over and the final score is authoritative. */
export const FINISHED_STATUSES = ['FT', 'AET', 'PEN'] as const
export type FinishedStatus = (typeof FINISHED_STATUSES)[number]

export interface ApiTeamEntry {
  team: { id: number; name: string; code: string | null }
}

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string } }
  // API-Football nests the round label here (e.g. "Group A - 1", "Round of 16").
  league: { round: string }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  // Goals are the score after normal + extra time. The penalty shootout, if any,
  // lives in `score.penalty` (not modeled here) and is intentionally excluded
  // from scoring (CONTRACT §4, §11.6).
  goals: { home: number | null; away: number | null }
}

interface ApiEnvelope<T> {
  response: T[]
}

export interface ApiFootballClient {
  getTeams(): Promise<ApiTeamEntry[]>
  getFixtures(): Promise<ApiFixture[]>
  getFinishedFixtures(): Promise<ApiFixture[]>
}

export interface ApiFootballClientOptions {
  apiKey: string
  fetchFn?: typeof fetch
  cacheTtlMs?: number
}

interface CacheEntry {
  expiresAt: number
  value: unknown
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 min: dedupes bursts, preserves quota.

export function createApiFootballClient(options: ApiFootballClientOptions): ApiFootballClient {
  const fetchFn = options.fetchFn ?? fetch
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const cache = new Map<string, CacheEntry>()

  async function get<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
    const url = new URL(`${API_FOOTBALL_BASE_URL}${path}`)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v))
    }
    const key = url.toString()

    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T[]
    }

    const res = await fetchFn(url.toString(), {
      headers: { 'x-apisports-key': options.apiKey },
    })
    if (!res.ok) {
      throw new Error(`API-Football request failed: ${res.status}`)
    }
    const body = (await res.json()) as ApiEnvelope<T>
    const value = body.response ?? []
    cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs })
    return value
  }

  return {
    getTeams() {
      return get<ApiTeamEntry>('/teams', { league: WC_LEAGUE, season: WC_SEASON })
    },
    getFixtures() {
      return get<ApiFixture>('/fixtures', { league: WC_LEAGUE, season: WC_SEASON })
    },
    async getFinishedFixtures() {
      const all = await get<ApiFixture>('/fixtures', { league: WC_LEAGUE, season: WC_SEASON })
      return all.filter((f) =>
        (FINISHED_STATUSES as readonly string[]).includes(f.fixture.status.short),
      )
    },
  }
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/lib/apiFootball.test.ts`. Expected: PASS — all 6 `apiFootball.test.ts` cases green (incl. the penalty-exclusion case).

- [ ] Commit. Commands:
```
git add src/lib/apiFootball.ts src/lib/apiFootball.test.ts
git commit -m "feat: add typed API-Football client with in-memory TTL cache"
```

---

### Task 4: Map API fixtures to domain (phase + score helpers in `src/server/results.ts`)

**Files:**
- Create: `src/server/results.ts` (helpers only this task; services added in Tasks 5-6)
- Test: `src/server/results.helpers.test.ts`

Before touching the DB we need two pure mappers that translate API-Football shapes into our enum/score types. These have no prisma/next imports either, but they live in `results.ts` because they are results-ingestion concerns. We test them with no DB (`vitest run`, but no Postgres tables touched).

- [ ] Write the failing test. Create `src/server/results.helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fixtureToScore, hasFinalScore } from './results'
import type { ApiFixture } from '@/lib/apiFootball'

function fx(goalsHome: number | null, goalsAway: number | null, short = 'FT'): ApiFixture {
  return {
    fixture: { id: 1, date: '2026-06-11T20:00:00+00:00', status: { short } },
    league: { round: 'Group A - 1' },
    teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
    goals: { home: goalsHome, away: goalsAway },
  }
}

describe('hasFinalScore', () => {
  it('true when both goals are numbers', () => {
    expect(hasFinalScore(fx(2, 1))).toBe(true)
  })
  it('false when either goal is null', () => {
    expect(hasFinalScore(fx(null, 1))).toBe(false)
    expect(hasFinalScore(fx(2, null))).toBe(false)
  })
})

describe('fixtureToScore', () => {
  it('extracts home/away goals as a Score', () => {
    expect(fixtureToScore(fx(3, 0))).toEqual({ home: 3, away: 0 })
  })
  it('throws if goals are not final', () => {
    expect(() => fixtureToScore(fx(null, null))).toThrow(/final score/i)
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/server/results.helpers.test.ts`. Expected: failure — `./results` cannot be resolved; `fixtureToScore`/`hasFinalScore` undefined.

- [ ] Minimal implementation. Create `src/server/results.ts` (this is the first slice of the file; Tasks 5-6 append the prisma-backed services to it):
```ts
import type { ApiFixture } from '@/lib/apiFootball'
import type { Score } from '@/domain/scoring'

/** True when the API fixture carries both final goal counts. */
export function hasFinalScore(fixture: ApiFixture): boolean {
  return typeof fixture.goals.home === 'number' && typeof fixture.goals.away === 'number'
}

/** Extracts the final Score from an API fixture. Throws if not final. */
export function fixtureToScore(fixture: ApiFixture): Score {
  if (!hasFinalScore(fixture)) {
    throw new Error('Fixture has no final score')
  }
  return { home: fixture.goals.home as number, away: fixture.goals.away as number }
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/server/results.helpers.test.ts`. Expected: PASS — all 4 cases green.

- [ ] Commit. Commands:
```
git add src/server/results.ts src/server/results.helpers.test.ts
git commit -m "feat: add API fixture -> domain score mappers in results"
```

---

### Task 5: `syncFixtures()` — upsert teams + matches by `apiFootballId`

**Files:**
- Modify: `src/server/results.ts`
- Test: `src/server/results.roundToPhase.test.ts` (pure, no DB)
- Test: `src/server/results.sync.test.ts`

`syncFixtures(): Promise<{ teams: number; matches: number }>` (CONTRACT §6). It reads teams + fixtures from the API-Football client, upserts each `Team` by `apiFootballId` and each `Match` by `apiFootballId`, and returns counts. This is an integration test against the Postgres test DB (CONTRACT §8) — run with `npm run test:run`, which loads `.env.test`. The API client is injected so tests never hit the network.

Phase mapping (CONTRACT §11.6): `syncFixtures` sets `match.fase = roundToPhase(fixture.league.round)`. The exported `roundToPhase(round: string): MatchPhase` maps API-Football round labels → our `MatchPhase`: `Group` → `grupos`, `Round of 32` → `r32`, `Round of 16` → `oitavas`, `Quarter-finals` → `quartas`, `Semi-finals` → `semi`, `3rd Place Final` → `terceiro`, `Final` → `final`. Unknown/empty rounds default to `grupos`. `roundToPhase` is unit-tested with no DB; the sync test asserts a knockout round produces the right `fase`.

- [ ] Write the failing `roundToPhase` unit test (pure, no DB). Create `src/server/results.roundToPhase.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { roundToPhase } from './results'

describe('roundToPhase', () => {
  it('maps API-Football round labels to MatchPhase (CONTRACT §11.6)', () => {
    expect(roundToPhase('Group A - 1')).toBe('grupos')
    expect(roundToPhase('Group H - 3')).toBe('grupos')
    expect(roundToPhase('Round of 32')).toBe('r32')
    expect(roundToPhase('Round of 16')).toBe('oitavas')
    expect(roundToPhase('Quarter-finals')).toBe('quartas')
    expect(roundToPhase('Semi-finals')).toBe('semi')
    expect(roundToPhase('3rd Place Final')).toBe('terceiro')
    expect(roundToPhase('Final')).toBe('final')
  })

  it('does not confuse "Semi-finals" / "Quarter-finals" / "3rd Place Final" with the plain Final', () => {
    expect(roundToPhase('Semi-finals')).not.toBe('final')
    expect(roundToPhase('Quarter-finals')).not.toBe('final')
    expect(roundToPhase('3rd Place Final')).not.toBe('final')
    expect(roundToPhase('Final')).toBe('final')
  })

  it('defaults unknown or empty rounds to grupos', () => {
    expect(roundToPhase('')).toBe('grupos')
    expect(roundToPhase('Some Unknown Stage')).toBe('grupos')
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/server/results.roundToPhase.test.ts`. Expected: failure — `roundToPhase` is not exported from `./results` (TypeError: not a function).

- [ ] Write the failing sync integration test. Create `src/server/results.sync.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { syncFixtures } from './results'
import type { ApiFootballClient } from '@/lib/apiFootball'

function fakeClient(overrides?: Partial<ApiFootballClient>): ApiFootballClient {
  return {
    getTeams: async () => [
      { team: { id: 6, name: 'Brazil', code: 'BRA' } },
      { team: { id: 2, name: 'France', code: 'FRA' } },
    ],
    getFixtures: async () => [
      {
        fixture: { id: 1001, date: '2026-06-11T20:00:00+00:00', status: { short: 'NS' } },
        league: { round: 'Group A - 1' },
        teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
        goals: { home: null, away: null },
      },
    ],
    getFinishedFixtures: async () => [],
    ...overrides,
  }
}

describe('syncFixtures', () => {
  it('upserts teams and matches and returns counts', async () => {
    const result = await syncFixtures({ client: fakeClient() })

    expect(result).toEqual({ teams: 2, matches: 1 })

    const teams = await prisma.team.findMany()
    expect(teams).toHaveLength(2)
    const brazil = teams.find((t) => t.apiFootballId === 6)!
    expect(brazil.nome).toBe('Brazil')
    expect(brazil.codigoPais).toBe('BRA')

    const matches = await prisma.match.findMany({ include: { homeTeam: true, awayTeam: true } })
    expect(matches).toHaveLength(1)
    expect(matches[0].apiFootballId).toBe(1001)
    expect(matches[0].fase).toBe('grupos')
    expect(matches[0].status).toBe('agendada')
    expect(matches[0].homeTeam.apiFootballId).toBe(6)
    expect(matches[0].awayTeam.apiFootballId).toBe(2)
    expect(matches[0].dataHora.toISOString()).toBe('2026-06-11T20:00:00.000Z')
  })

  it('is idempotent: running twice does not duplicate rows', async () => {
    await syncFixtures({ client: fakeClient() })
    const second = await syncFixtures({ client: fakeClient() })

    expect(second).toEqual({ teams: 2, matches: 1 })
    expect(await prisma.team.count()).toBe(2)
    expect(await prisma.match.count()).toBe(1)
  })

  it('updates an existing match score-free fields on re-sync (e.g. new dataHora)', async () => {
    await syncFixtures({ client: fakeClient() })

    const moved = fakeClient({
      getFixtures: async () => [
        {
          fixture: { id: 1001, date: '2026-06-12T18:00:00+00:00', status: { short: 'NS' } },
          league: { round: 'Group A - 1' },
          teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
          goals: { home: null, away: null },
        },
      ],
    })
    await syncFixtures({ client: moved })

    const match = await prisma.match.findFirst({ where: { apiFootballId: 1001 } })
    expect(match!.dataHora.toISOString()).toBe('2026-06-12T18:00:00.000Z')
  })

  it('sets match.fase from league.round (knockout rounds map correctly)', async () => {
    const knockout = fakeClient({
      getFixtures: async () => [
        {
          fixture: { id: 2001, date: '2026-07-05T18:00:00+00:00', status: { short: 'NS' } },
          league: { round: 'Round of 16' },
          teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
          goals: { home: null, away: null },
        },
      ],
    })
    await syncFixtures({ client: knockout })

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 2001 } })
    expect(match.fase).toBe('oitavas')
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/server/results.sync.test.ts`. Expected: failure — `syncFixtures` is not exported from `./results` (TypeError: not a function).

- [ ] Minimal implementation. Append to `src/server/results.ts` (add the prisma import at the top alongside the existing imports, then add the helper + `syncFixtures`):
```ts
// --- add to the import block at the top of src/server/results.ts ---
import { prisma } from '@/lib/prisma'
import {
  createApiFootballClient,
  type ApiFootballClient,
  type ApiFixture,
} from '@/lib/apiFootball'
import { env } from '@/lib/env'
import type { MatchPhase } from '@prisma/client'
```
```ts
// --- append below the existing helpers in src/server/results.ts ---

/** Builds the default API client from env (server-only). */
function defaultClient(): ApiFootballClient {
  return createApiFootballClient({ apiKey: env.apiFootballKey() })
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
```

- [ ] Run tests to confirm pass. Commands: `npm run test:run -- src/server/results.roundToPhase.test.ts` then `npm run test:run -- src/server/results.sync.test.ts`. Expected: PASS — the 3 `roundToPhase` mapping cases green, and all 4 sync cases green (DB upserts, idempotency, dataHora update, knockout `fase` mapping).

- [ ] Commit. Commands:
```
git add src/server/results.ts src/server/results.roundToPhase.test.ts src/server/results.sync.test.ts
git commit -m "feat: add syncFixtures + roundToPhase mapping; upsert teams/matches by apiFootballId"
```

---

### Task 6: `pollAndSettle(opts)` — settle finished matches inside windows + recompute points

**Files:**
- Modify: `src/server/results.ts`
- Test: `src/server/results.settle.test.ts`

`pollAndSettle(opts?: { now?: Date; client?: ApiFootballClient }): Promise<{ settledMatchIds: string[] }>` (CONTRACT §6); `now` defaults to the wall clock, `client` is injectable for tests. Behavior (SPEC §9, CONTRACT §4):
- Only act if `now` is inside a match window (a match whose `status` is `agendada` and whose `dataHora` is within the window bracket). Outside any window => no-op, returns `{ settledMatchIds: [] }` and does NOT call the API (preserves quota).
- For finished fixtures from the API: find the local match by `apiFootballId`. Skip any match whose `resultadoFonte === 'manual'` (manual override priority — never overwritten). Otherwise write `placarHome`/`placarAway`, `status = 'encerrada'`, `resultadoFonte = 'api'`.
- Recompute `pontosObtidos` for every `Prediction` of that match via `scorePrediction`.
- Idempotent: re-running after settlement is a no-op for already-settled matches (their `status` is `encerrada`, not `agendada`, so they are not in any open window).

Window definition: a match window is open from `dataHora` until `dataHora + WINDOW_DURATION_MS` (default 3h covers 90' + ET + stoppage + the ~10-15 min settle lag). We act only when at least one `agendada` match's window contains `now`.

- [ ] Write the failing test. Create `src/server/results.settle.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { pollAndSettle, syncFixtures } from './results'
import type { ApiFootballClient, ApiFixture } from '@/lib/apiFootball'

const KICKOFF = '2026-06-11T20:00:00+00:00'

function baseClient(finished: ApiFixture[]): ApiFootballClient {
  return {
    getTeams: async () => [
      { team: { id: 6, name: 'Brazil', code: 'BRA' } },
      { team: { id: 2, name: 'France', code: 'FRA' } },
    ],
    getFixtures: async () => [
      {
        fixture: { id: 1001, date: KICKOFF, status: { short: 'NS' } },
        league: { round: 'Group A - 1' },
        teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
        goals: { home: null, away: null },
      },
    ],
    getFinishedFixtures: async () => finished,
  }
}

function finishedFixture(home: number, away: number): ApiFixture {
  return {
    fixture: { id: 1001, date: KICKOFF, status: { short: 'FT' } },
    league: { round: 'Group A - 1' },
    teams: { home: { id: 6, name: 'Brazil' }, away: { id: 2, name: 'France' } },
    goals: { home, away },
  }
}

/** Seeds a pool + membership + a prediction for the synced match 1001. */
async function seedPrediction(palpiteHome: number, palpiteAway: number) {
  const user = await prisma.user.create({ data: { email: `u${Math.random()}@t.test` } })
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: user.id },
  })
  const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
  await prisma.prediction.create({
    data: { membershipId: membership.id, matchId: match.id, palpiteHome, palpiteAway },
  })
  return { match, membership }
}

/** Seeds a pool + membership but NO prediction row for the synced match 1001. */
async function seedMemberWithoutPrediction() {
  const user = await prisma.user.create({ data: { email: `u${Math.random()}@t.test` } })
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: user.id },
  })
  const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
  return { match, membership, pool }
}

describe('pollAndSettle', () => {
  it('no-op outside any match window (does not call the API)', async () => {
    await syncFixtures({ client: baseClient([]) })
    let finishedCalls = 0
    const spyClient: ApiFootballClient = {
      ...baseClient([]),
      getFinishedFixtures: async () => {
        finishedCalls++
        return []
      },
    }

    const before = new Date('2026-06-10T00:00:00.000Z') // a day before kickoff
    const result = await pollAndSettle({ now: before, client: spyClient })

    expect(result).toEqual({ settledMatchIds: [] })
    expect(finishedCalls).toBe(0)
  })

  it('settles a finished match inside the window and scores predictions', async () => {
    await syncFixtures({ client: baseClient([]) })
    await seedPrediction(2, 1) // exact => 3

    const inWindow = new Date('2026-06-11T22:00:00.000Z') // kickoff + 2h
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedFixture(2, 1)]),
    })

    expect(result.settledMatchIds).toHaveLength(1)

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
    expect(match.placarHome).toBe(2)
    expect(match.placarAway).toBe(1)
    expect(match.status).toBe('encerrada')
    expect(match.resultadoFonte).toBe('api')

    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(3)
  })

  it('scores a winner-only prediction as 1', async () => {
    await syncFixtures({ client: baseClient([]) })
    await seedPrediction(1, 0) // home win predicted; real 2-1 home win => 1

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    await pollAndSettle({ now: inWindow, client: baseClient([finishedFixture(2, 1)]) })

    const match = await prisma.match.findFirstOrThrow({ where: { apiFootballId: 1001 } })
    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(1)
  })

  it('a member with NO prediction row for a settled match contributes 0 (absence-of-row, CONTRACT §11.6)', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { match, membership } = await seedMemberWithoutPrediction()

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedFixture(2, 1)]),
    })

    // The match settles, but no prediction row is created for the absent member.
    expect(result.settledMatchIds).toHaveLength(1)
    const settled = await prisma.match.findFirstOrThrow({ where: { id: match.id } })
    expect(settled.status).toBe('encerrada')

    const rows = await prisma.prediction.findMany({ where: { membershipId: membership.id } })
    expect(rows).toHaveLength(0) // no row => no points => the member scores 0
  })

  it('never overwrites a manual result', async () => {
    await syncFixtures({ client: baseClient([]) })
    const { match } = await seedPrediction(2, 1)
    await prisma.match.update({
      where: { id: match.id },
      data: { placarHome: 5, placarAway: 0, status: 'encerrada', resultadoFonte: 'manual' },
    })

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    const result = await pollAndSettle({
      now: inWindow,
      client: baseClient([finishedFixture(2, 1)]),
    })

    expect(result.settledMatchIds).toEqual([])
    const reloaded = await prisma.match.findFirstOrThrow({ where: { id: match.id } })
    expect(reloaded.placarHome).toBe(5)
    expect(reloaded.placarAway).toBe(0)
    expect(reloaded.resultadoFonte).toBe('manual')
  })

  it('is idempotent: re-running after settlement settles nothing new', async () => {
    await syncFixtures({ client: baseClient([]) })
    await seedPrediction(2, 1)

    const inWindow = new Date('2026-06-11T22:00:00.000Z')
    await pollAndSettle({ now: inWindow, client: baseClient([finishedFixture(2, 1)]) })
    const second = await pollAndSettle({ now: inWindow, client: baseClient([finishedFixture(2, 1)]) })

    expect(second.settledMatchIds).toEqual([])
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/server/results.settle.test.ts`. Expected: failure — `pollAndSettle` is not exported from `./results` (TypeError: not a function).

- [ ] Minimal implementation. Append to `src/server/results.ts` (add the `scorePrediction` import to the top import block, then append the window constant + `pollAndSettle`). Do NOT add `applyManualResult` — it belongs to Plan D (CONTRACT §11.1):
```ts
// --- add to the import block at the top of src/server/results.ts ---
import { scorePrediction } from '@/domain/scoring'
```
```ts
// --- append at the end of src/server/results.ts ---

/** A match window stays "open for polling" from kickoff to kickoff + this. */
export const MATCH_WINDOW_DURATION_MS = 3 * 60 * 60 * 1000 // 3h: 90' + ET + stoppage + settle lag

/**
 * Polls finished fixtures and settles matches, but only when `now` falls inside
 * an open match window (an agendada match whose [dataHora, dataHora+window] contains now).
 * Outside every window: no-op, no API call (preserves the 100 req/day budget).
 *
 * For each finished fixture matched by apiFootballId whose resultadoFonte is NOT
 * 'manual': writes placarHome/placarAway + status=encerrada + resultadoFonte=api,
 * then recomputes pontosObtidos for that match's predictions via scorePrediction.
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

    // Manual override priority: never overwrite a manual result (CONTRACT §4).
    const current = await prisma.match.findUniqueOrThrow({
      where: { id: m.id },
      select: { resultadoFonte: true },
    })
    if (current.resultadoFonte === 'manual') continue

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
```

> **No `applyManualResult` here (CONTRACT §11.1):** Plan C's `results.ts` exports only `syncFixtures`, `pollAndSettle`, `roundToPhase` (plus the pure `hasFinalScore`/`fixtureToScore` mappers). `applyManualResult` is **defined for the first time in Plan D**, which modifies this file. Do not add a stub — a throwing stub would shadow Plan D's real implementation and break the manual-override path.

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/server/results.settle.test.ts`. Expected: PASS — all 6 settle cases green (no-op outside window, exact=3, winner=1, no-prediction-row contributes 0, manual untouched, idempotent).

- [ ] Commit. Commands:
```
git add src/server/results.ts src/server/results.settle.test.ts
git commit -m "feat: add pollAndSettle (window-gated settle + point recompute)"
```

---

### Task 7: `GET /api/poll-scores` route — token-protected poller

**Files:**
- Create: `src/app/api/poll-scores/route.ts`
- Test: `src/app/api/poll-scores/route.test.ts`

The route (CONTRACT §1/§2, SPEC §9): public endpoint hit by an external scheduler, protected by a secret token compared against `POLL_SECRET` (accepted in either the `x-poll-secret` header or the `secret` query param). On valid token it calls `pollAndSettle()` and returns the settled match ids; outside windows `pollAndSettle` no-ops, so the route is naturally a no-op too. Invalid/missing token => 401. We inject `pollAndSettle` via a default param so the route test does not need the DB.

- [ ] Write the failing test. Create `src/app/api/poll-scores/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { handlePoll } from './route'

const SECRET = 'top-secret-token'

function req(opts: { header?: string; query?: string }): Request {
  const url = new URL('http://localhost/api/poll-scores')
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query)
  const headers = new Headers()
  if (opts.header !== undefined) headers.set('x-poll-secret', opts.header)
  return new Request(url.toString(), { headers })
}

describe('handlePoll', () => {
  it('401 when token is missing', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({}), { pollSecret: SECRET, settle })
    expect(res.status).toBe(401)
    expect(settle).not.toHaveBeenCalled()
  })

  it('401 when token is wrong', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({ header: 'nope' }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(401)
    expect(settle).not.toHaveBeenCalled()
  })

  it('200 and calls settle when token matches via header', async () => {
    const settle = vi.fn(async () => ({ settledMatchIds: ['m1', 'm2'] }))
    const res = await handlePoll(req({ header: SECRET }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(200)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ settledMatchIds: ['m1', 'm2'] })
  })

  it('200 and calls settle when token matches via query param', async () => {
    const settle = vi.fn(async () => ({ settledMatchIds: [] }))
    const res = await handlePoll(req({ query: SECRET }), { pollSecret: SECRET, settle })
    expect(res.status).toBe(200)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ settledMatchIds: [] })
  })

  it('500 when POLL_SECRET is not configured', async () => {
    const settle = vi.fn()
    const res = await handlePoll(req({ header: 'anything' }), { pollSecret: '', settle })
    expect(res.status).toBe(500)
    expect(settle).not.toHaveBeenCalled()
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/app/api/poll-scores/route.test.ts`. Expected: failure — `./route` cannot be resolved / `handlePoll` undefined.

- [ ] Minimal implementation. Create `src/app/api/poll-scores/route.ts`:
```ts
import { pollAndSettle } from '@/server/results'
import { env } from '@/lib/env'

// External scheduler (cron-job.org) hits this every ~10-15 min. It only does real
// work inside match windows (pollAndSettle no-ops otherwise), preserving API quota.
export const dynamic = 'force-dynamic'

interface PollDeps {
  pollSecret: string
  settle: () => Promise<{ settledMatchIds: string[] }>
}

/** Pure-ish handler: token compare + delegate. Deps injected for testing. */
export async function handlePoll(request: Request, deps: PollDeps): Promise<Response> {
  if (!deps.pollSecret) {
    return Response.json({ error: 'POLL_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get('x-poll-secret') ?? url.searchParams.get('secret') ?? ''

  if (provided !== deps.pollSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await deps.settle()
  return Response.json(result, { status: 200 })
}

export async function GET(request: Request): Promise<Response> {
  return handlePoll(request, {
    pollSecret: env.pollSecret(),
    settle: () => pollAndSettle(),
  })
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/app/api/poll-scores/route.test.ts`. Expected: PASS — all 5 route cases green.

- [ ] Add the scheduler README note. Create `src/app/api/poll-scores/README.md`:
```md
# /api/poll-scores

Token-protected results poller. **An external scheduler (cron-job.org) must call this
endpoint every ~10-15 min** — Vercel Hobby cron is limited to 1/day (SPEC §13), so it is
not used.

## Auth

Send the `POLL_SECRET` value either as:
- header: `x-poll-secret: <POLL_SECRET>`, or
- query param: `?secret=<POLL_SECRET>`

Missing/wrong token => `401`. Unconfigured `POLL_SECRET` on the server => `500`.

## Behavior

Calls `pollAndSettle()`, which **only acts inside match windows** (an `agendada` match
whose `[dataHora, dataHora + 3h]` window contains `now`). Outside every window it is a
no-op and makes **no API-Football call**, keeping usage under the 100 req/day free budget.

## cron-job.org setup (two jobs — CONTRACT §11.6)

Both routes share the same `POLL_SECRET` token check.

1. **Poll scores (every ~10-15 min):** job pointing at
   `https://<your-app>/api/poll-scores?secret=<POLL_SECRET>` (or set the `x-poll-secret`
   header). Method: `GET`. Settles finished matches inside their windows.
2. **Sync fixtures (daily, once):** job pointing at
   `https://<your-app>/api/sync-fixtures?secret=<POLL_SECRET>`. Method: `GET`. Refreshes
   the teams/fixtures table (new kickoff times, knockout bracket fill-ins). Daily is
   enough — fixtures change rarely and this conserves the 100 req/day budget.
```

- [ ] Commit. Commands:
```
git add src/app/api/poll-scores/route.ts src/app/api/poll-scores/route.test.ts src/app/api/poll-scores/README.md
git commit -m "feat: add token-protected GET /api/poll-scores poller route"
```

---

### Task 8: `GET /api/sync-fixtures` route — token-protected daily fixtures sync

**Files:**
- Create: `src/app/api/sync-fixtures/route.ts`
- Test: `src/app/api/sync-fixtures/route.test.ts`

CONTRACT §11.6: a **daily** cron-job.org job hits this route to refresh teams/fixtures; it reuses the exact same `POLL_SECRET` token check as `/api/poll-scores` (header `x-poll-secret` or `?secret=`), and on a valid token calls `syncFixtures()` and returns the counts. Invalid/missing token => 401; unconfigured secret => 500. `syncFixtures` is injected via deps so the route test needs no DB or network.

> **Admin "Sincronizar jogos" button (owner-only):** CONTRACT §11.6 also calls for an owner-only admin button that invokes `syncFixtures`. The admin screen (`src/app/admin/[poolId]/page.tsx`) is built in **Plan D** (CONTRACT §10), so the button is wired there against the `syncFixtures` service exported by this plan. Plan C ships the service + the daily route; Plan D adds the owner-only button. No admin UI is created in Plan C.

- [ ] Write the failing test. Create `src/app/api/sync-fixtures/route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { handleSync } from './route'

const SECRET = 'top-secret-token'

function req(opts: { header?: string; query?: string }): Request {
  const url = new URL('http://localhost/api/sync-fixtures')
  if (opts.query !== undefined) url.searchParams.set('secret', opts.query)
  const headers = new Headers()
  if (opts.header !== undefined) headers.set('x-poll-secret', opts.header)
  return new Request(url.toString(), { headers })
}

describe('handleSync', () => {
  it('401 when token is missing', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({}), { pollSecret: SECRET, sync })
    expect(res.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it('401 when token is wrong', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({ header: 'nope' }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it('200 and calls syncFixtures when token matches via header', async () => {
    const sync = vi.fn(async () => ({ teams: 32, matches: 64 }))
    const res = await handleSync(req({ header: SECRET }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(200)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ teams: 32, matches: 64 })
  })

  it('200 and calls syncFixtures when token matches via query param', async () => {
    const sync = vi.fn(async () => ({ teams: 0, matches: 0 }))
    const res = await handleSync(req({ query: SECRET }), { pollSecret: SECRET, sync })
    expect(res.status).toBe(200)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ teams: 0, matches: 0 })
  })

  it('500 when POLL_SECRET is not configured', async () => {
    const sync = vi.fn()
    const res = await handleSync(req({ header: 'anything' }), { pollSecret: '', sync })
    expect(res.status).toBe(500)
    expect(sync).not.toHaveBeenCalled()
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/app/api/sync-fixtures/route.test.ts`. Expected: failure — `./route` cannot be resolved / `handleSync` undefined.

- [ ] Minimal implementation. Create `src/app/api/sync-fixtures/route.ts`:
```ts
import { syncFixtures } from '@/server/results'
import { env } from '@/lib/env'

// External scheduler (cron-job.org) hits this DAILY to refresh teams/fixtures
// (CONTRACT §11.6). Same POLL_SECRET token check as /api/poll-scores.
export const dynamic = 'force-dynamic'

interface SyncDeps {
  pollSecret: string
  sync: () => Promise<{ teams: number; matches: number }>
}

/** Token compare + delegate to syncFixtures. Deps injected for testing. */
export async function handleSync(request: Request, deps: SyncDeps): Promise<Response> {
  if (!deps.pollSecret) {
    return Response.json({ error: 'POLL_SECRET not configured' }, { status: 500 })
  }

  const url = new URL(request.url)
  const provided = request.headers.get('x-poll-secret') ?? url.searchParams.get('secret') ?? ''

  if (provided !== deps.pollSecret) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await deps.sync()
  return Response.json(result, { status: 200 })
}

export async function GET(request: Request): Promise<Response> {
  return handleSync(request, {
    pollSecret: env.pollSecret(),
    sync: () => syncFixtures(),
  })
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/app/api/sync-fixtures/route.test.ts`. Expected: PASS — all 5 route cases green.

- [ ] Commit. Commands:
```
git add src/app/api/sync-fixtures/route.ts src/app/api/sync-fixtures/route.test.ts
git commit -m "feat: add token-protected GET /api/sync-fixtures daily fixtures sync route"
```

---

### Task 9: `computeStandings(poolId)` — aggregate predictions into RankingRow[]

**Files:**
- Create: `src/server/ranking.ts`
- Test: `src/server/ranking.test.ts`

`computeStandings(poolId: string): Promise<RankingRow[]>` (CONTRACT §6). For each `PoolMembership` of the pool it aggregates that member's predictions into:
- `pontos` = sum of `pontosObtidos`,
- `cravadas` = count of predictions worth 3 (`pontosObtidos === 3`),
- `acertosVencedor` = count worth exactly 1 (`pontosObtidos === 1`),
- `joinedAt` from the membership,
- `nome` from the user (`user.name ?? user.email ?? membershipId`),
- `image` from the user (`user.image`, nullable — CONTRACT §11.7).

It returns rows already sorted with `rankRows` (the full tiebreaker chain). Integration test against the Postgres test DB (CONTRACT §8).

- [ ] Write the failing test. Create `src/server/ranking.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { computeStandings } from './ranking'

async function makePool() {
  const owner = await prisma.user.create({ data: { email: `o${Math.random()}@t.test` } })
  const pool = await prisma.pool.create({
    data: { nome: 'P', inviteCode: `c${Math.random()}`, ownerId: owner.id, valorEntrada: 1000, chavePix: 'pix' },
  })
  return pool
}

async function makeMatch(apiId: number) {
  const home = await prisma.team.create({ data: { nome: `H${apiId}`, codigoPais: 'AAA', apiFootballId: apiId * 10 } })
  const away = await prisma.team.create({ data: { nome: `A${apiId}`, codigoPais: 'BBB', apiFootballId: apiId * 10 + 1 } })
  return prisma.match.create({
    data: {
      fase: 'grupos',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-06-11T20:00:00.000Z'),
      apiFootballId: apiId,
    },
  })
}

async function addMember(poolId: string, name: string, joinedAt: Date, image?: string) {
  const user = await prisma.user.create({
    data: { name, email: `${name}@t.test`, image: image ?? null },
  })
  return prisma.poolMembership.create({ data: { poolId, userId: user.id, joinedAt } })
}

describe('computeStandings', () => {
  it('aggregates pontos, cravadas, acertosVencedor (and image) per membership', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)
    const m2 = await makeMatch(2)
    const alice = await addMember(pool.id, 'Alice', new Date('2026-05-01T00:00:00.000Z'), 'https://img/alice.png')

    await prisma.prediction.create({ data: { membershipId: alice.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: alice.id, matchId: m2.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 1 } })

    const rows = await computeStandings(pool.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(alice.id)
    expect(rows[0].nome).toBe('Alice')
    expect(rows[0].pontos).toBe(4)
    expect(rows[0].cravadas).toBe(1)
    expect(rows[0].acertosVencedor).toBe(1)
    expect(rows[0].joinedAt.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(rows[0].image).toBe('https://img/alice.png')
  })

  it('includes members with no predictions as zero rows (image null when unset)', async () => {
    const pool = await makePool()
    const bob = await addMember(pool.id, 'Bob', new Date('2026-05-03T00:00:00.000Z'))

    const rows = await computeStandings(pool.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(bob.id)
    expect(rows[0].pontos).toBe(0)
    expect(rows[0].cravadas).toBe(0)
    expect(rows[0].acertosVencedor).toBe(0)
    expect(rows[0].image).toBeNull()
  })

  it('returns rows sorted by the full tiebreaker chain', async () => {
    const pool = await makePool()
    const m1 = await makeMatch(1)

    // Same pontos (3) and cravadas (1); tie broken by earlier joinedAt.
    const early = await addMember(pool.id, 'Early', new Date('2026-05-01T00:00:00.000Z'))
    const late = await addMember(pool.id, 'Late', new Date('2026-05-09T00:00:00.000Z'))
    const top = await addMember(pool.id, 'Top', new Date('2026-05-05T00:00:00.000Z'))

    await prisma.prediction.create({ data: { membershipId: early.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: late.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })

    const m2 = await makeMatch(2)
    await prisma.prediction.create({ data: { membershipId: top.id, matchId: m1.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: top.id, matchId: m2.id, palpiteHome: 0, palpiteAway: 0, pontosObtidos: 3 } })

    const rows = await computeStandings(pool.id)
    expect(rows.map((r) => r.nome)).toEqual(['Top', 'Early', 'Late'])
  })

  it('only counts predictions from the requested pool', async () => {
    const poolA = await makePool()
    const poolB = await makePool()
    const m1 = await makeMatch(1)
    const aMember = await addMember(poolA.id, 'A', new Date('2026-05-01T00:00:00.000Z'))
    const bMember = await addMember(poolB.id, 'B', new Date('2026-05-01T00:00:00.000Z'))

    await prisma.prediction.create({ data: { membershipId: aMember.id, matchId: m1.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 } })
    await prisma.prediction.create({ data: { membershipId: bMember.id, matchId: m1.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 } })

    const rows = await computeStandings(poolA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].membershipId).toBe(aMember.id)
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/server/ranking.test.ts`. Expected: failure — `./ranking` cannot be resolved / `computeStandings` undefined.

- [ ] Minimal implementation. Create `src/server/ranking.ts`:
```ts
import { prisma } from '@/lib/prisma'
import { rankRows, type RankingRow } from '@/domain/ranking'

/**
 * Aggregates each membership's predictions into a RankingRow and returns the
 * rows sorted by the full tiebreaker chain (CONTRACT §4 via rankRows).
 * cravadas = predictions worth 3; acertosVencedor = predictions worth exactly 1.
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
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/server/ranking.test.ts`. Expected: PASS — all 4 standings cases green.

- [ ] Commit. Commands:
```
git add src/server/ranking.ts src/server/ranking.test.ts
git commit -m "feat: add computeStandings aggregating predictions into ranked rows"
```

---

### Task 10: `RankingTable` component

**Files:**
- Create: `src/components/RankingTable.tsx`
- Test: `src/components/RankingTable.test.tsx`

Presentational component (CONTRACT §2: UI never imports prisma). Takes `rows: RankingRow[]` and renders position, name, pontos, cravadas, acertosVencedor, highlighting the leader (first row). Component test opts into jsdom per-file via the docblock pragma (CONTRACT §8 — jsdom is opt-in per file).

- [ ] Write the failing test. Create `src/components/RankingTable.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { RankingTable } from './RankingTable'
import type { RankingRow } from '@/domain/ranking'

afterEach(cleanup)

const rows: RankingRow[] = [
  { membershipId: 'a', nome: 'Alice', pontos: 7, cravadas: 2, acertosVencedor: 1, joinedAt: new Date('2026-05-01T00:00:00.000Z'), image: 'https://img/alice.png' },
  { membershipId: 'b', nome: 'Bob', pontos: 3, cravadas: 0, acertosVencedor: 3, joinedAt: new Date('2026-05-02T00:00:00.000Z'), image: null },
]

describe('RankingTable', () => {
  it('renders one row per member with name and pontos', () => {
    render(<RankingTable rows={rows} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders an avatar image when image is set', () => {
    render(<RankingTable rows={rows} />)
    const img = screen.getByAltText('Alice') as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.src).toContain('https://img/alice.png')
  })

  it('falls back to the name initial when image is null', () => {
    render(<RankingTable rows={rows} />)
    // Bob has no image => a fallback initial "B" is shown instead of an <img>.
    expect(screen.queryByAltText('Bob')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('numbers positions starting at 1', () => {
    render(<RankingTable rows={rows} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('marks the leader row with data-leader on the first row', () => {
    const { container } = render(<RankingTable rows={rows} />)
    const leader = container.querySelector('[data-leader="true"]')
    expect(leader).not.toBeNull()
    expect(leader!.textContent).toContain('Alice')
  })

  it('renders an empty state when there are no rows', () => {
    render(<RankingTable rows={[]} />)
    expect(screen.getByText(/sem participantes/i)).toBeInTheDocument()
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/components/RankingTable.test.tsx`. Expected: failure — `./RankingTable` cannot be resolved / `RankingTable` undefined.

- [ ] Minimal implementation. Create `src/components/RankingTable.tsx`:
```tsx
import type { RankingRow } from '@/domain/ranking'

/** Avatar: the user's image if present, else a circle with their name initial. */
function Avatar({ nome, image }: { nome: string; image: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- remote avatars, no next/image config needed
    return (
      <img
        src={image}
        alt={nome}
        className="h-7 w-7 rounded-full object-cover"
        width={28}
        height={28}
      />
    )
  }
  const initial = (nome.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#CCCCCC] text-xs font-bold text-[#222222]"
    >
      {initial}
    </span>
  )
}

export function RankingTable({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[#666666]">Sem participantes ainda.</p>
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-[#CCCCCC] text-sm text-[#666666]">
          <th className="px-2 py-2">#</th>
          <th className="px-2 py-2">Nome</th>
          <th className="px-2 py-2 text-right">Pontos</th>
          <th className="px-2 py-2 text-right">Cravadas</th>
          <th className="px-2 py-2 text-right">Vencedor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const isLeader = i === 0
          return (
            <tr
              key={row.membershipId}
              data-leader={isLeader ? 'true' : 'false'}
              className={
                'border-b border-[#F3F3F3] ' +
                (isLeader ? 'bg-[#06AA48]/10 font-bold' : '')
              }
            >
              <td className="px-2 py-2">{i + 1}</td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <Avatar nome={row.nome} image={row.image} />
                  {row.nome}
                </span>
              </td>
              <td className="px-2 py-2 text-right">{row.pontos}</td>
              <td className="px-2 py-2 text-right">{row.cravadas}</td>
              <td className="px-2 py-2 text-right">{row.acertosVencedor}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/components/RankingTable.test.tsx`. Expected: PASS — all 6 component cases green (incl. avatar image + initial fallback).

- [ ] Commit. Commands:
```
git add src/components/RankingTable.tsx src/components/RankingTable.test.tsx
git commit -m "feat: add RankingTable component with leader highlight"
```

---

### Task 11: `AutoRefresh` client component (live-ish ranking)

**Files:**
- Create: `src/components/AutoRefresh.tsx`
- Test: `src/components/AutoRefresh.test.tsx`

CONTRACT §11.7: a `'use client'` component that calls `router.refresh()` on an interval (default 45s) to re-fetch the server component's data — this is the "~30-60s client polling" that makes the ranking page update live-ish without a websocket. It renders nothing. We mount it on the ranking page (Task 12). The test mocks `next/navigation`'s `useRouter` and fake timers to assert `refresh` fires on the interval and the timer is cleared on unmount.

- [ ] Write the failing test. Create `src/components/AutoRefresh.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

import { AutoRefresh } from './AutoRefresh'

beforeEach(() => {
  refresh.mockClear()
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AutoRefresh', () => {
  it('renders nothing', () => {
    const { container } = render(<AutoRefresh />)
    expect(container.firstChild).toBeNull()
  })

  it('calls router.refresh() once per interval', () => {
    render(<AutoRefresh intervalMs={45_000} />)
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(45_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(45_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('stops refreshing after unmount (clears the interval)', () => {
    const { unmount } = render(<AutoRefresh intervalMs={45_000} />)
    vi.advanceTimersByTime(45_000)
    expect(refresh).toHaveBeenCalledTimes(1)

    unmount()
    vi.advanceTimersByTime(90_000)
    expect(refresh).toHaveBeenCalledTimes(1) // no further calls
  })
})
```

- [ ] Run it to confirm it fails. Command: `npm run test:run -- src/components/AutoRefresh.test.tsx`. Expected: failure — `./AutoRefresh` cannot be resolved / `AutoRefresh` undefined.

- [ ] Minimal implementation. Create `src/components/AutoRefresh.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Invisible client component: periodically calls router.refresh() to re-run the
 * parent server component and pull fresh data (CONTRACT §11.7). Default 45s.
 */
export function AutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
```

- [ ] Run tests to confirm pass. Command: `npm run test:run -- src/components/AutoRefresh.test.tsx`. Expected: PASS — all 3 cases green (renders nothing, refreshes per interval, stops on unmount).

- [ ] Commit. Commands:
```
git add src/components/AutoRefresh.tsx src/components/AutoRefresh.test.tsx
git commit -m "feat: add AutoRefresh client component (router.refresh every 45s)"
```

---

### Task 12: Ranking page (`src/app/ranking/page.tsx`)

**Files:**
- Create: `src/app/ranking/page.tsx`

Server component (CONTRACT §2: `app/*` calls `server/*`). It resolves the viewer's session (`auth()` from Plan A) and current membership via `getCurrentMembership(session.user.id)` (CONTRACT §11.4, from `src/server/pools.ts`, Plan B), loads standings via `computeStandings(poolId)`, renders `<RankingTable>`, and mounts `<AutoRefresh>` for live-ish updates (CONTRACT §11.7). No auth/membership => redirect. This is a wiring/scaffolding task (no new pure logic); it is verified by a build + lint check rather than a red-green test, since the data path is already covered by Task 9, the component by Task 10, and the refresher by Task 11.

- [ ] Create the page. Create `src/app/ranking/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getCurrentMembership } from '@/server/pools'
import { computeStandings } from '@/server/ranking'
import { RankingTable } from '@/components/RankingTable'
import { AutoRefresh } from '@/components/AutoRefresh'

export const dynamic = 'force-dynamic'

export default async function RankingPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const membership = await getCurrentMembership(session.user.id)
  if (!membership) {
    redirect('/dashboard')
  }

  const rows = await computeStandings(membership.poolId)

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <AutoRefresh />
      <h1 className="mb-4 text-2xl font-bold text-[#222222]">Ranking</h1>
      <RankingTable rows={rows} />
    </main>
  )
}
```

> **Resolver (CONTRACT §11.4):** `getCurrentMembership(userId: string): Promise<PoolMembership | null>` is provided by Plan B (`src/server/pools.ts`) and returns the user's current membership (v1 assumes one pool per user). Do NOT call `getMembership` with one argument — its signature stays `getMembership(poolId, userId)`. The `auth` import and `session.user.id` shape come from Plan A's `src/auth.ts` + `src/types/next-auth.d.ts` (CONTRACT §7, §11.2).

- [ ] Verify it compiles and lints. Commands:
```
npx tsc --noEmit
npm run lint
```
Expected: no type errors referencing `src/app/ranking/page.tsx`; lint passes.

- [ ] Run the full test suite to confirm nothing regressed. Command: `npm run test:run`. Expected: PASS — all domain, lib, server, route, and component tests from Tasks 1-11 green.

- [ ] Commit. Commands:
```
git add src/app/ranking/page.tsx
git commit -m "feat: add ranking page rendering computed standings"
```

---

### Task 13: Full-suite verification + plan-level wrap-up

**Files:**
- (no new files)

- [ ] Run the pure unit tests (no DB). Command: `npm run test:unit`. Expected: PASS — `src/domain/scoring.test.ts` and `src/domain/ranking.test.ts` green with zero DB usage.

- [ ] Run the full suite against the test DB. Command: `npm run test:run`. Expected: PASS — every test added in Tasks 1-12 green; afterEach cleanup leaves no rows (CONTRACT §8).

- [ ] Typecheck + lint the whole project. Commands:
```
npx tsc --noEmit
npm run lint
```
Expected: clean.

- [ ] Smoke-check the poller and sync routes manually (optional, requires `.env.local` with `POLL_SECRET`). Commands:
```
curl -s -o /dev/null -w "poll  %{http_code}\n" "http://localhost:3000/api/poll-scores?secret=$POLL_SECRET"
curl -s -o /dev/null -w "sync  %{http_code}\n" "http://localhost:3000/api/sync-fixtures?secret=$POLL_SECRET"
```
Expected (with the dev server running): poll `200` with an empty `settledMatchIds` array when outside match windows; sync `200` with `{ teams, matches }` counts; both `401` if you omit the secret.

- [ ] Final commit (if any lint/format fixups were needed). Commands:
```
git add -A
git commit -m "chore: verify Plan C results + scoring + ranking end-to-end"
```

---

## End state

Auto-scored ranking that updates shortly after each match: `syncFixtures()` seeds teams/matches from API-Football (phase derived from `roundToPhase(league.round)`), refreshed by a daily `GET /api/sync-fixtures`; an external scheduler hits the token-protected `GET /api/poll-scores` every ~10-15 min, which inside match windows settles finished matches (`status = encerrada`, `resultadoFonte = api`, manual results untouched) and recomputes `pontosObtidos` via the pure `scorePrediction`; `computeStandings(poolId)` aggregates and ranks members (with avatars) using the full tiebreaker chain; the ranking page renders `<RankingTable>` and mounts `<AutoRefresh>` for live-ish updates. `applyManualResult` is **NOT** defined in this plan — it is added by Plan D (CONTRACT §11.1).

## Symbols this plan defines (for later plans to reuse)

- `src/domain/scoring.ts`: `Score`, `outcome`, `scorePrediction`
- `src/domain/ranking.ts`: `RankingRow` (incl. `image: string | null`), `compareRankingRows`, `rankRows`
- `src/lib/apiFootball.ts`: `API_FOOTBALL_BASE_URL`, `WC_LEAGUE`, `WC_SEASON`, `FINISHED_STATUSES`, `ApiTeamEntry`, `ApiFixture` (incl. `league.round` + `goals`), `ApiFootballClient`, `createApiFootballClient`
- `src/server/results.ts`: `hasFinalScore`, `fixtureToScore`, `roundToPhase`, `MATCH_WINDOW_DURATION_MS`, `syncFixtures`, `pollAndSettle` (NO `applyManualResult` — Plan D adds it, CONTRACT §11.1)
- `src/server/ranking.ts`: `computeStandings`
- `src/components/RankingTable.tsx`: `RankingTable`
- `src/components/AutoRefresh.tsx`: `AutoRefresh`
- `src/app/api/poll-scores/route.ts`: `handlePoll`, `GET`
- `src/app/api/sync-fixtures/route.ts`: `handleSync`, `GET`
- `src/app/ranking/page.tsx`: `RankingPage`

## Symbols this plan consumes from earlier plans (must already exist)

- Plan A: `src/lib/prisma.ts` (`prisma`), `src/lib/env.ts` (`env` getter functions `env.apiFootballKey()`, `env.pollSecret()` — CONTRACT §11.3), `src/auth.ts` (`auth`) + `src/types/next-auth.d.ts` (`session.user.id`), Vitest harness + scripts (`test:run`, `test:unit`).
- Plan B: Prisma models/enums (`Team`, `Match`, `Prediction`, `PoolMembership`, `MatchPhase`, `MatchStatus`, `ResultadoFonte`), `src/server/pools.ts` (`getCurrentMembership(userId)` — CONTRACT §11.4), `src/components/Button.tsx`, `src/components/Flag.tsx`, `src/domain/deadline.ts`.
