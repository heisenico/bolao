# Bolão da Copa 2026 — Interface Contract (v1)

> **Single source of truth for all implementation plans.** Every task in every plan file MUST use the
> exact names, signatures, schema, and conventions defined here. If a plan needs something not defined
> here, define it here first. Derived from `docs/superpowers/specs/2026-05-31-bolao-copa-2026-design.md`.

---

## 1. Tech stack (pinned, verified 2026-05-31)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript**, React 19 | `create-next-app@latest`, `src/` dir, alias `@/*` → `src/*` |
| Styling | **Tailwind CSS v4** | theme tokens via `@theme` in `src/app/globals.css` |
| Font | **Open Sans** via `next/font/google` | applied on `<body>` |
| DB | **PostgreSQL (Neon free)** — dev, test, prod | pooled `DATABASE_URL` + `DIRECT_URL` for migrations |
| ORM | **Prisma 6** (`prisma@^6`, `@prisma/client@^6`) | `new PrismaClient()`, datasource url in schema (NO driver adapter, NO prisma.config.ts) |
| Auth | **next-auth@beta (v5)** + `@auth/prisma-adapter@^2` + built-in **Resend** provider | magic link, database sessions, route-level `auth()` checks (no edge middleware) |
| Email | **Resend** | built-in provider (fetch-based); dev fallback logs link to console |
| Results API | **API-Football** (api-sports.io), free tier | `league=1, season=2026`; 100 req/day budget |
| Scheduler | **External** (cron-job.org) → `GET /api/poll-scores` (secret token) | NOT Vercel cron (Hobby = 1/day) |
| Tests | **Vitest 4** (`environment: 'node'`) + `vite-tsconfig-paths` | pure logic = no DB; integration = Postgres test DB |

### Exact dev/test packages
```
# app deps
npm i @prisma/client@^6 next-auth@beta @auth/prisma-adapter@^2
# dev deps
npm i -D prisma@^6 vitest@^4 vite-tsconfig-paths@^6 dotenv-cli@^11
# optional (component tests only; opt-in jsdom per file)
npm i -D @vitejs/plugin-react@^6 jsdom@^29 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6
```

---

## 2. File structure (responsibilities)

```
src/
  app/
    layout.tsx                      # root layout: Open Sans, <body> theme
    globals.css                     # Tailwind v4 + @theme tokens (ge.globo)
    page.tsx                        # redirects to /dashboard or /login
    login/page.tsx                  # magic-link email form (server action)
    verify-request/page.tsx         # "check your email" confirmation
    dashboard/page.tsx              # ranking summary + next matches + deadline
    pools/new/page.tsx              # create pool
    join/[code]/page.tsx            # join via invite code + PIX instructions
    palpites/page.tsx               # predictions by current phase
    ranking/page.tsx                # detailed ranking
    bracket/page.tsx                # knockout bracket
    admin/[poolId]/page.tsx         # admin: results, payments, prize, members
    api/auth/[...nextauth]/route.ts # Auth.js handler
    api/poll-scores/route.ts        # token-protected results poller
  auth.ts                           # NextAuth({...}) -> { handlers, auth, signIn, signOut }
  lib/
    prisma.ts                       # PrismaClient singleton
    env.ts                          # typed env access (server-only)
    apiFootball.ts                  # API-Football typed client (fetch + cache)
  domain/                           # PURE logic — NO next/* or @prisma/* imports
    scoring.ts                      # scorePrediction, outcome
    ranking.ts                      # compareStandings, RankingRow
    deadline.ts                     # isPredictionOpen, LOCK_LEAD_MS
    prize.ts                        # computePrize, pickWinner
  server/                           # Prisma-backed services (import domain + prisma)
    pools.ts                        # createPool, joinPool, getMembership
    predictions.ts                  # upsertPrediction (enforces deadline), getVisiblePredictions
    results.ts                      # syncFixtures, pollAndSettle, applyManualResult
    ranking.ts                      # computeStandings(poolId)
    payments.ts                     # markPaid, confirmPayment, prizeSummary
  components/
    TeamCard.tsx  MatchCard.tsx  RankingTable.tsx  Bracket.tsx  Flag.tsx  Button.tsx
prisma/
  schema.prisma
  seed.ts                           # optional: seed teams/fixtures for dev
vitest.config.ts
vitest.setup.ts
.env            # DATABASE_URL (pooled), DIRECT_URL — dev
.env.test       # DATABASE_URL (pooled), DIRECT_URL — test DB (must contain "test")
.env.local      # AUTH_SECRET, AUTH_RESEND_KEY, AUTH_URL, API_FOOTBALL_KEY, POLL_SECRET
```

**Boundaries:** `domain/*` is framework-free and unit-tested with zero I/O. `server/*` composes `domain/*` + `prisma`. `app/*` calls `server/*`. UI never imports `prisma` directly.

---

## 3. Prisma schema (authoritative — exact field names)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ---------- Auth.js (required by @auth/prisma-adapter) ----------
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  memberships   PoolMembership[]
  ownedPools    Pool[]    @relation("PoolOwner")
  createdAt     DateTime  @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@unique([identifier, token])
}

// ---------- Domain ----------
// NOTE: Prisma requires one enum value per line (single-line shorthand is invalid).
enum PoolStatus {
  aberto
  fechado
}

enum PaymentStatus {
  pendente
  pago
  confirmado
}

enum MatchPhase {
  grupos
  r32
  oitavas
  quartas
  semi
  terceiro
  final
}

enum MatchStatus {
  agendada
  ao_vivo
  encerrada
  adiada
  cancelada
}

enum ResultadoFonte {
  api
  manual
}

model Pool {
  id           String           @id @default(cuid())
  nome         String
  inviteCode   String           @unique
  ownerId      String
  owner        User             @relation("PoolOwner", fields: [ownerId], references: [id])
  valorEntrada Int              // BRL cents
  chavePix     String
  status       PoolStatus       @default(aberto)
  createdAt    DateTime         @default(now())
  memberships  PoolMembership[]
}

model PoolMembership {
  id            String        @id @default(cuid())
  poolId        String
  userId        String
  pool          Pool          @relation(fields: [poolId], references: [id], onDelete: Cascade)
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  joinedAt      DateTime      @default(now())   // tiebreaker
  paymentStatus PaymentStatus @default(pendente)
  predictions   Prediction[]
  payments      PaymentRecord[]
  @@unique([poolId, userId])
}

model Team {
  id           String  @id @default(cuid())
  nome         String
  codigoPais   String                  // ISO-ish code for flag
  grupo        String?                 // "A".."L"
  apiFootballId Int?   @unique
  homeMatches  Match[] @relation("HomeTeam")
  awayMatches  Match[] @relation("AwayTeam")
}

model Match {
  id            String       @id @default(cuid())
  fase          MatchPhase
  homeTeamId    String
  awayTeamId    String
  homeTeam      Team         @relation("HomeTeam", fields: [homeTeamId], references: [id])
  awayTeam      Team         @relation("AwayTeam", fields: [awayTeamId], references: [id])
  dataHora      DateTime                  // kickoff, stored UTC
  placarHome    Int?
  placarAway    Int?
  status        MatchStatus  @default(agendada)
  resultadoFonte ResultadoFonte?
  apiFootballId Int?         @unique
  predictions   Prediction[]
}

model Prediction {
  id           String         @id @default(cuid())
  membershipId String
  matchId      String
  membership   PoolMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  match        Match          @relation(fields: [matchId], references: [id], onDelete: Cascade)
  palpiteHome  Int
  palpiteAway  Int
  pontosObtidos Int           @default(0)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  @@unique([membershipId, matchId])
}

model PaymentRecord {
  id            String         @id @default(cuid())
  membershipId  String
  membership    PoolMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  valor         Int            // BRL cents
  metodo        String         @default("PIX")
  comprovanteRef String?
  confirmadoPor String?
  confirmadoEm  DateTime?
}
```

> `locked` is NOT a column. Lock is computed at write time (see §5 deadline). `@db.Text` omitted (Postgres TEXT is the default for `String`; no annotation needed).

---

## 4. Business rules (authoritative — override any generic example)

- **Scoring (per match):** placar exato = **3 pts**; acertou só vencedor/empate = **1 pt**; erro **ou sem palpite** = **0 pts**. (No 0×0 fallback. No prediction row ⇒ 0.)
- **Knockout:** score is normal time + extra time; penalties ignored.
- **Deadline:** predictions editable until **1h before kickoff** (`LOCK_LEAD_MS = 60*60*1000`). Enforced server-side in UTC.
- **Hidden predictions:** other members' predictions are not returned until that match locks (`now >= dataHora - 1h`).
- **Ranking sort (desc/asc):** (1) total points desc, (2) exact-score count desc, (3) winner-correct count desc, (4) `joinedAt` asc.
- **Entry:** allowed until 1h before the tournament's first match; then pool `fechado`.
- **Prize:** **winner-takes-all** = sum of *confirmed* entries. Single winner via ranking sort.
- **Postponed match:** predictions stand, deadline follows new `dataHora`. **Cancelled:** predictions void, 0 pts. **W.O.:** official 3×0 treated as real.
- **Manual override priority:** `resultadoFonte = manual` is never overwritten by the API poller.

---

## 5. Domain function signatures (pure — `src/domain`)

```ts
// scoring.ts
export interface Score { home: number; away: number }
export function outcome(s: Score): -1 | 0 | 1            // sign(home - away)
export function scorePrediction(palpite: Score, resultado: Score): 0 | 1 | 3

// deadline.ts
export const LOCK_LEAD_MS = 60 * 60 * 1000
export function isPredictionOpen(kickoffUtc: Date, now: Date): boolean   // now < kickoff - 1h
export function isMatchLocked(kickoffUtc: Date, now: Date): boolean      // !isPredictionOpen

// ranking.ts
export interface RankingRow {
  membershipId: string; nome: string; pontos: number;
  cravadas: number; acertosVencedor: number; joinedAt: Date;
}
export function compareRankingRows(a: RankingRow, b: RankingRow): number  // for Array.sort
export function rankRows(rows: RankingRow[]): RankingRow[]                // sorted copy

// prize.ts
export function computePrize(confirmedEntriesCount: number, valorEntradaCents: number): number
export function pickWinner(rankedRows: RankingRow[]): RankingRow | null   // first or null if empty
```

## 6. Key server service signatures (`src/server`)

```ts
// predictions.ts
export async function upsertPrediction(args: {
  membershipId: string; matchId: string; palpiteHome: number; palpiteAway: number; now?: Date
}): Promise<Prediction>          // throws PredictionLockedError if !isPredictionOpen
export async function getVisiblePredictions(matchId: string, viewerMembershipId: string, now?: Date)

// results.ts
export async function pollAndSettle(opts?: { now?: Date; client?: ApiFootballClient }): Promise<{ settledMatchIds: string[] }>
export async function applyManualResult(matchId: string, placarHome: number, placarAway: number): Promise<void>
export async function syncFixtures(): Promise<{ teams: number; matches: number }>

// ranking.ts
export async function computeStandings(poolId: string): Promise<RankingRow[]>

// payments.ts
export async function prizeSummary(poolId: string): Promise<{ total: number; winner: RankingRow | null }>
```

## 7. Auth setup (verified Auth.js v5 shape)

- `src/auth.ts`: `NextAuth({ adapter: PrismaAdapter(prisma), providers: [Resend({ from, sendVerificationRequest })] })`.
- `sendVerificationRequest`: in `NODE_ENV !== 'production'` (or no `AUTH_RESEND_KEY`), `console.log` the magic-link URL; otherwise POST to `https://api.resend.com/emails`.
- Route handler: `src/app/api/auth/[...nextauth]/route.ts` → `export const { GET, POST } = handlers`.
- Session: `const session = await auth()` in server components / route handlers / server actions.
- Sign in: server action `await signIn('resend', { email })`. Sign out: `await signOut()`.
- Env: `AUTH_SECRET` (`npx auth secret`), `AUTH_RESEND_KEY`, `AUTH_URL` (prod only), `DATABASE_URL`, `DIRECT_URL`.
- No edge middleware in v1 → database sessions (adapter default); protect pages by checking `await auth()` and redirecting to `/login`.

## 8. Test harness (Vitest 4 + Prisma 6 + Postgres)

- `vitest.config.ts`: `plugins: [tsconfigPaths()]`, `test: { globals: true, environment: 'node', setupFiles: ['./vitest.setup.ts'] }`.
- `vitest.setup.ts`: assert `process.env.DATABASE_URL` includes `"test"` (guard); `execSync('npx prisma migrate deploy')` (or `db push`) in `beforeAll`; `afterEach` cleans tables child-first (`prediction`→`paymentRecord`→`membership`→`pool`→`match`→`team`→auth models); `afterAll` `prisma.$disconnect()`.
- Scripts: `"test": "dotenv -e .env.test -- vitest"`, `"test:run": "dotenv -e .env.test -- vitest run"`, `"test:unit": "vitest run src/domain"` (no DB needed).
- Pure `domain/*` tests need no env/DB and use `vi.useFakeTimers()` for deadline tests.
- Playwright/E2E: **out of scope for v1.**

## 9. Conventions

- Money stored as **integer BRL cents** everywhere (`valorEntrada`, `valor`, prize). Format at the edge.
- All timestamps **UTC** in DB; display in `America/Sao_Paulo`.
- TDD per task: write failing test → run (fail) → minimal impl → run (pass) → commit. Conventional commits (`feat:`, `test:`, `chore:`).
- Errors: named error classes (e.g., `PredictionLockedError`), no silent catches.

---

## 10. Plan decomposition (4 sequential plans — each ships testable software)

- **Plan A — Foundation + Auth** (`2026-05-31-bolao-v1-A-foundation-auth.md`): scaffold, Tailwind ge.globo theme, Open Sans, Prisma 6 + Postgres + auth models, Vitest harness, prisma singleton, Auth.js magic link (Resend + dev console), login/verify pages, session guard. → *Deployable app you can log into.*
- **Plan B — Pools + Predictions** (`2026-05-31-bolao-v1-B-pools-predictions.md`): domain models (Pool/Membership/Team/Match/Prediction/PaymentRecord + enums), create/join pool, PIX instructions, prediction upsert with server-side deadline lock, hidden predictions, palpites + dashboard UI. → *Create/join pool, submit hidden locked predictions.*
- **Plan C — Results + Scoring + Ranking** (`2026-05-31-bolao-v1-C-results-scoring-ranking.md`): API-Football client, `syncFixtures`, `/api/poll-scores` (token + match-window gating), `scorePrediction` + recompute, `computeStandings` + tiebreakers, ranking UI. → *Auto-scored live-ish ranking.*
- **Plan D — Admin + PIX + Bracket** (`2026-05-31-bolao-v1-D-admin-pix-bracket.md`): admin screen, manual result override (priority), confirm payment, `computePrize`/`pickWinner` (winner-takes-all), member mgmt, invite/share, knockout bracket UI. → *Full admin + bracket.*
```

---

## 11. Resolved consistency fixes (AUTHORITATIVE — supersede the first drafts)

These resolve issues found by the verify pass. Where any plan file conflicts with this section, **this section wins.**

### 11.1 Ownership of shared symbols (define exactly once)
- `src/components/Flag.tsx` → **created in Plan A** (next to `Button`). Props: `{ codigoPais: string; className?: string }`. Renders a flag from the country code (regional-indicator emoji from the 2-letter code; fallback to the raw code). jsdom component test. Plans B/C/D **import** it, never create it.
- `applyManualResult` → **defined only in Plan D** (Plan D *modifies* `src/server/results.ts` to add it). **Plan C must NOT create an `applyManualResult` stub** — delete that step from Plan C. Plan C's `results.ts` exports only `syncFixtures`, `pollAndSettle`, `roundToPhase`.
- `src/server/payments.ts` → **created in Plan B** with `markPaid`; **modified in Plan D** to add `confirmPayment`, `prizeSummary`.
- `TeamCard.tsx` / `MatchCard.tsx` → **dropped from v1** (pages inline their markup). Remove any assumption that they exist.

### 11.2 Session identity (Plan A)
- Add `src/types/next-auth.d.ts` augmenting `Session` so `session.user.id: string` is typed:
  ```ts
  import { DefaultSession } from 'next-auth'
  declare module 'next-auth' {
    interface Session { user: { id: string } & DefaultSession['user'] }
  }
  ```
- Add a session callback in `src/auth.ts`: `callbacks: { session({ session, user }) { session.user.id = user.id; return session } }` (database-session shape).
- `requireSession()` lives in **`src/lib/session.ts`** and returns `Promise<Session>`. All callers use `const session = await requireSession(); session.user.id`. Import from `@/lib/session` (NOT `@/auth`).

### 11.3 Env accessor (Plan A `src/lib/env.ts`) — single convention: getter functions
`env` exposes getter functions that throw if missing (except `authUrl`, which defaults):
```ts
export const env = {
  databaseUrl: () => requireEnv('DATABASE_URL'),
  directUrl:   () => requireEnv('DIRECT_URL'),
  authSecret:  () => requireEnv('AUTH_SECRET'),
  authResendKey: () => process.env.AUTH_RESEND_KEY ?? '',   // empty in dev → console fallback
  emailFrom:   () => process.env.AUTH_EMAIL_FROM ?? 'Bolão da Copa <onboarding@resend.dev>', // Resend test sender; set a verified-domain from in prod
  authUrl:     () => process.env.AUTH_URL ?? 'http://localhost:3000',
  apiFootballKey: () => requireEnv('API_FOOTBALL_KEY'),
  pollSecret:  () => requireEnv('POLL_SECRET'),
}
```
All call sites use **function-call** form: `env.apiFootballKey()`, `env.pollSecret()`, `env.authUrl()`. `.env.local` placeholders include `AUTH_URL`, `API_FOOTBALL_KEY`, `POLL_SECRET`.

### 11.4 Current-pool resolution (Plan B `src/server/pools.ts`)
- Add `getCurrentMembership(userId: string): Promise<PoolMembership | null>` = `prisma.poolMembership.findFirst({ where: { userId }, orderBy: { joinedAt: 'asc' } })`. v1 assumes a user is effectively in one pool.
- **Dashboard, Palpites, Ranking pages all use `getCurrentMembership(session.user.id)`** to resolve the pool. Never call `getMembership` with one argument (its signature stays `getMembership(poolId, userId)`).

### 11.5 Entry deadline + immutability (Plan B)
- `joinPool` rejects with a named `EntryClosedError` if `now >= firstKickoff - LOCK_LEAD_MS`, where `firstKickoff = min(Match.dataHora)`. If no matches exist yet, entry is open. Add an integration test for both branches.
- Immutability: v1 has **no pool-edit UI**, so config is immutable by construction — add a one-line note, no code.

### 11.6 Fixtures sync + knockout phase mapping (Plan C)
- `src/lib/apiFootball.ts` `ApiFixture` type includes `league.round: string` and `goals: { home: number|null; away: number|null }`. Scores read `fixture.goals` (after extra time; **excludes** the penalty shootout, which lives in `score.penalty`). Add a unit test pinning that penalties are excluded.
- `roundToPhase(round: string): MatchPhase` maps API round strings → `MatchPhase` (e.g. `Group` → `grupos`, `Round of 32` → `r32`, `Round of 16` → `oitavas`, `Quarter-finals` → `quartas`, `Semi-finals` → `semi`, `3rd Place Final` → `terceiro`, `Final` → `final`). `syncFixtures` sets `match.fase = roundToPhase(fixture.league.round)`. Unit test the mapping.
- Add `GET /api/sync-fixtures` route protected by `POLL_SECRET` (same token check as poll-scores) that calls `syncFixtures()`. README note: a **daily** cron-job.org job hits it; the every-~10-15-min job hits `/api/poll-scores`. Add an admin **"Sincronizar jogos"** button (owner-only) that also calls `syncFixtures`.
- Add an integration test: a member with **no prediction row** for a settled match scores 0 (the absence-of-row case).

### 11.7 Ranking avatar + live refresh (Plan C)
- `RankingRow` gains `image: string | null`. `computeStandings` selects `user.image`. `RankingTable` renders the avatar (fallback initial).
- Add a `'use client'` `AutoRefresh` component (calls `router.refresh()` every 45s) mounted on the **ranking** and **dashboard** pages — covers the "~30–60s client polling" for live-ish ranking.

### 11.8 Cancelled matches + W.O. (Plan D)
- Admin can mark a match **`cancelada`**: sets `status=cancelada` and zeroes/annuls (`pontosObtidos=0`) all its predictions; `computeStandings` ignores cancelled matches. `pollAndSettle` skips `cancelada`/`adiada` (only settles `agendada`→`encerrada`).
- **W.O.** is just a normal manual result (e.g. `3×0`) via `applyManualResult`; no special path. Add a one-line note.
- **PITFALL (implemented):** `pollAndSettle`'s candidate filter must NOT use `resultadoFonte: { not: 'manual' }` — Prisma compiles that to `<> 'manual'`, which is `NULL` (not true) for freshly-synced rows where `resultadoFonte` is unset, silently excluding ALL settleable matches. The implemented, correct form is `OR: [{ resultadoFonte: null }, { resultadoFonte: 'api' }]`. **Plan D must NOT re-add `{ not: 'manual' }`** — the manual-skip is already correctly handled in `pollAndSettle`.

### 11.9 Updated file-map additions
```
src/types/next-auth.d.ts                 # Session.user.id augmentation (Plan A)
src/components/Flag.tsx                   # flag from codigoPais (Plan A)
src/server/pools.ts:getCurrentMembership # current-pool resolver (Plan B)
src/app/api/sync-fixtures/route.ts       # token-protected daily fixtures sync (Plan C)
src/components/AutoRefresh.tsx            # client 45s router.refresh() (Plan C)
```

### 11.10 DATA SOURCE PIVOT — football-data.org (AUTHORITATIVE; replaces the API-Football client)
**Why:** verified live 2026-05-31 — API-Football **Free is restricted to seasons 2022–2024** (`errors.plan`), cannot serve WC2026. **football-data.org free** returns the full 104-match WC2026 schedule. `src/lib/apiFootball.ts` is **replaced**.
- **Client:** `src/lib/footballData.ts` (delete `apiFootball.ts` + its test). Base `https://api.football-data.org/v4`; header `X-Auth-Token: <FOOTBALL_DATA_KEY>`; competition `WC`, `season=2026`; 10 req/min. Add `env.footballDataKey()`.
- **Endpoints:** `/competitions/WC/matches?season=2026` (all), `?status=FINISHED` (settled), `/competitions/WC/teams?season=2026`.
- **Match v4 shape:** `{ id:number, utcDate, stage, group, status, homeTeam:{id,name,tla,crest}, awayTeam:{id,name,tla,crest}, score:{ winner, duration, fullTime:{home:number|null, away:number|null} } }`. `score.fullTime` = normal+ET, **excludes penalty shootout** (matches §4).
- **status → MatchStatus:** SCHEDULED|TIMED→agendada, IN_PLAY|PAUSED→ao_vivo, FINISHED→encerrada, POSTPONED→adiada, CANCELLED|SUSPENDED→cancelada.
- **stage → MatchPhase:** GROUP_STAGE→grupos, LAST_32→r32, LAST_16→oitavas, QUARTER_FINALS→quartas, SEMI_FINALS→semi, THIRD_PLACE→terceiro, FINAL→final.
- **Field reuse:** store the FD match/team **id** in existing `apiFootballId` columns (no migration). `Team.codigoPais` = team `tla` (3-letter; real-flag rendering deferred — `Flag` falls back to the code).
- **`syncFixtures`:** create→`status=agendada`; update→refresh only `dataHora`+`fase` (never revert `status`/`placar`/`resultadoFonte`).
- **`pollAndSettle`:** unchanged (window gate, `OR:[{resultadoFonte:null},{resultadoFonte:'api'}]`, atomic settle+recompute); fetches FINISHED via FD, matches by `apiFootballId`, score via `fullTime`.
- Client must **surface non-2xx/`errors` loudly** (api-sports client swallowed them).

