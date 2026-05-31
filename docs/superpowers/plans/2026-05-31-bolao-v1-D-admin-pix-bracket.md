# Admin + PIX + Bracket Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (dash space bracket) syntax for tracking.
Goal: Deliver the owner-only admin screen (manual result override, PIX confirmation, winner-takes-all prize summary, member management, invite sharing) and the knockout bracket view, completing v1.
Architecture: Pure prize math lives in `src/domain/prize.ts` (no next/prisma); `src/server/results.ts` is MODIFIED to add `applyManualResult` (manual override never reverted by the poller — CONTRACT §11.1, Plan C does NOT stub it) and `cancelMatch` (mark `cancelada`, zero its predictions — CONTRACT §11.8), and `src/server/payments.ts` gains `confirmPayment` + `prizeSummary` composing `computeStandings` + `rankRows` + `pickWinner` + `computePrize`. The `admin/[poolId]` server component enforces `requireSession` (from `@/lib/session`, CONTRACT §11.2) + ownership and renders forms/lists that call the server services, plus an owner-only "Sincronizar jogos" action calling `syncFixtures` (CONTRACT §11.6); `Bracket.tsx` renders knockout `Match` rows from `r32` onward.
Tech Stack: Next.js App Router (React 19) + TypeScript, Tailwind v4, Prisma 6 + Postgres, Vitest 4 (node env + Postgres test DB), domain sessions via Auth.js v5.
---

> **Assumptions (Plans A, B, C already implemented):** the Prisma schema in CONTRACT §3 is migrated; `src/lib/prisma.ts` exports the `prisma` singleton; `src/auth.ts` exports `auth`; `src/lib/session.ts` exports `requireSession()` (CONTRACT §11.2) returning `Promise<Session>` with `session.user.id: string`; `src/lib/env.ts` exports `env` with getter functions including `env.authUrl()` (CONTRACT §11.3); `src/domain/scoring.ts` exports `outcome`/`scorePrediction`/`Score`; `src/domain/ranking.ts` exports `RankingRow`/`compareRankingRows`/`rankRows`; `src/server/ranking.ts` exports `computeStandings(poolId)`; `src/server/results.ts` exports `pollAndSettle(now?)` and `syncFixtures()` (NOT `applyManualResult` — Plan C does not stub it; this plan adds it per CONTRACT §11.1); `src/server/payments.ts` exports `markPaid`; `src/server/pools.ts` exports `getMembership`; `src/components/Button.tsx` and `src/components/Flag.tsx` exist (`Flag` props `{ codigoPais: string; className?: string }`, CONTRACT §11.1). `MatchCard.tsx`/`TeamCard.tsx` are **dropped from v1** (CONTRACT §11.1) — do NOT assume they exist; pages inline their markup. **Do not redefine any of these.** The Vitest harness (CONTRACT §8) and scripts `test:run` / `test:unit` already exist.

> **Reuse map (symbols defined elsewhere, used here):** `prisma` (`@/lib/prisma`), `auth` (`@/auth`), `requireSession` (`@/lib/session`, CONTRACT §11.2), `env` with `env.authUrl()` (`@/lib/env`, CONTRACT §11.3), `RankingRow` + `rankRows` (`@/domain/ranking`), `computeStandings` (`@/server/ranking`), `pollAndSettle` (`@/server/results`), `markPaid` (`@/server/payments`), `getMembership` (`@/server/pools`), `Button`/`Flag` (`@/components`, `Flag` prop is `codigoPais`). Session identity: all callers use `const session = await requireSession(); session.user.id` (CONTRACT §11.2). Enum string values used verbatim from CONTRACT §3: `MatchStatus.encerrada`/`cancelada`, `ResultadoFonte.manual`/`api`, `PaymentStatus.confirmado`, `MatchPhase` values `r32 oitavas quartas semi terceiro final`.

---

### Task 1: Pure prize domain — `computePrize` + `pickWinner`

Pure logic, no DB, no next/prisma imports. Tested with `test:unit`.

**Files:**
- Create: `src/domain/prize.ts`
- Test: `src/domain/prize.test.ts`

Steps:

- [ ] Write the failing test file `src/domain/prize.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { computePrize, pickWinner } from './prize'
import type { RankingRow } from './ranking'

function row(over: Partial<RankingRow>): RankingRow {
  return {
    membershipId: over.membershipId ?? 'm1',
    nome: over.nome ?? 'Ana',
    pontos: over.pontos ?? 0,
    cravadas: over.cravadas ?? 0,
    acertosVencedor: over.acertosVencedor ?? 0,
    joinedAt: over.joinedAt ?? new Date('2026-01-01T00:00:00Z'),
    image: over.image ?? null,
  }
}

describe('computePrize', () => {
  it('multiplies confirmed entries by entry value in cents', () => {
    expect(computePrize(0, 2500)).toBe(0)
    expect(computePrize(1, 2500)).toBe(2500)
    expect(computePrize(8, 2500)).toBe(20000)
  })

  it('returns 0 when entry value is 0', () => {
    expect(computePrize(10, 0)).toBe(0)
  })

  it('stays in integer cents (no float drift)', () => {
    expect(computePrize(3, 333)).toBe(999)
    expect(Number.isInteger(computePrize(7, 1999))).toBe(true)
  })
})

describe('pickWinner', () => {
  it('returns null for an empty ranking', () => {
    expect(pickWinner([])).toBeNull()
  })

  it('returns the first row of an already-ranked list', () => {
    const ranked = [
      row({ membershipId: 'win', pontos: 30 }),
      row({ membershipId: 'second', pontos: 20 }),
    ]
    expect(pickWinner(ranked)?.membershipId).toBe('win')
  })

  it('does not re-sort; trusts caller-provided order', () => {
    const ranked = [
      row({ membershipId: 'a', pontos: 5 }),
      row({ membershipId: 'b', pontos: 99 }),
    ]
    expect(pickWinner(ranked)?.membershipId).toBe('a')
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:unit`. Expected failure: module not found / `computePrize` and `pickWinner` are not exported from `./prize` (file does not exist yet).

- [ ] Minimal implementation — write `src/domain/prize.ts` with the FULL code below:

```ts
import type { RankingRow } from './ranking'

/**
 * Winner-takes-all prize pool (CONTRACT §4): sum of confirmed entries.
 * All money is integer BRL cents (CONTRACT §9). Pure: no DB, no next/prisma.
 */
export function computePrize(confirmedEntriesCount: number, valorEntradaCents: number): number {
  return confirmedEntriesCount * valorEntradaCents
}

/**
 * Single winner via ranking sort (CONTRACT §4). Expects an already-ranked
 * list (use rankRows first). Returns the first row, or null if empty.
 */
export function pickWinner(rankedRows: RankingRow[]): RankingRow | null {
  return rankedRows.length > 0 ? rankedRows[0] : null
}
```

- [ ] Run tests to confirm pass: `npm run test:unit`. Expected: PASS (all `computePrize` and `pickWinner` cases green).

- [ ] Commit:

```
git add src/domain/prize.ts src/domain/prize.test.ts
git commit -m "feat: add computePrize and pickWinner pure domain functions"
```

---

### Task 2: `applyManualResult` in `src/server/results.ts` (manual override, never reverted)

This task **MODIFIES** `src/server/results.ts` to **add** `applyManualResult` (CONTRACT §11.1 — Plan C does NOT create a stub, so this is a real new export here). Sets the score, marks the match encerrada with `resultadoFonte = manual`, and recomputes that match's prediction points. **W.O. is just a normal manual result** (e.g. `3×0`) applied via this function — no special path (CONTRACT §11.8). Integration test (Postgres test DB, CONTRACT §8).

**Files:**
- Modify: `src/server/results.ts`
- Test: `src/server/results.applyManualResult.test.ts`

Steps:

- [ ] Write the failing test file `src/server/results.applyManualResult.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { applyManualResult, pollAndSettle } from '@/server/results'

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, name: email.split('@')[0] } })
}

async function makeTeam(nome: string, codigoPais: string, apiFootballId?: number) {
  return prisma.team.create({ data: { nome, codigoPais, apiFootballId } })
}

async function baseFixture() {
  const owner = await makeUser(`owner-${Date.now()}@test.com`)
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const member = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: owner.id },
  })
  const home = await makeTeam('Brasil', 'BR')
  const away = await makeTeam('Argentina', 'AR')
  const match = await prisma.match.create({
    data: {
      fase: 'final',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-07-19T18:00:00Z'),
      status: 'agendada',
    },
  })
  return { owner, pool, member, match }
}

describe('applyManualResult', () => {
  it('writes score, marks encerrada + manual, and scores the prediction (exact = 3)', async () => {
    const { member, match } = await baseFixture()
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 2, palpiteAway: 1 },
    })

    await applyManualResult(match.id, 2, 1)

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.placarHome).toBe(2)
    expect(after.placarAway).toBe(1)
    expect(after.status).toBe('encerrada')
    expect(after.resultadoFonte).toBe('manual')

    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(3)
  })

  it('scores winner-only (1) and wrong (0) for the same manual result', async () => {
    const { member, pool, match } = await baseFixture()
    const u2 = await makeUser(`u2-${Date.now()}@test.com`)
    const m2 = await prisma.poolMembership.create({ data: { poolId: pool.id, userId: u2.id } })
    // member: predicts 3x0 -> right winner, wrong score -> 1
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 3, palpiteAway: 0 },
    })
    // m2: predicts 0x2 -> wrong winner -> 0
    await prisma.prediction.create({
      data: { membershipId: m2.id, matchId: match.id, palpiteHome: 0, palpiteAway: 2 },
    })

    await applyManualResult(match.id, 2, 1)

    const p1 = await prisma.prediction.findFirstOrThrow({ where: { membershipId: member.id } })
    const p2 = await prisma.prediction.findFirstOrThrow({ where: { membershipId: m2.id } })
    expect(p1.pontosObtidos).toBe(1)
    expect(p2.pontosObtidos).toBe(0)
  })

  it('is NOT overwritten by the poller (manual override priority)', async () => {
    const { match } = await baseFixture()
    // give the match an apiFootballId so the poller could in principle target it
    await prisma.match.update({ where: { id: match.id }, data: { apiFootballId: 9999 } })

    await applyManualResult(match.id, 1, 0)

    await pollAndSettle({ now: new Date('2026-07-19T21:00:00Z') })

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.resultadoFonte).toBe('manual')
    expect(after.placarHome).toBe(1)
    expect(after.placarAway).toBe(0)
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/results.applyManualResult.test.ts`. Expected failure: `applyManualResult is not a function` / not exported from `@/server/results`.

- [ ] Minimal implementation — append the `applyManualResult` function to `src/server/results.ts`. Add these imports at the top if not already present (`scorePrediction` from the scoring domain, `prisma` from the lib), then add the function. FULL function code:

```ts
// --- add near the existing imports in src/server/results.ts (do not duplicate) ---
import { prisma } from '@/lib/prisma'
import { scorePrediction } from '@/domain/scoring'

// --- add this exported function ---
/**
 * Admin manual override (CONTRACT §4 / §6): set the final score, close the
 * match, mark resultadoFonte = manual (the poller must skip manual matches),
 * and recompute pontosObtidos for every prediction on this match.
 */
export async function applyManualResult(
  matchId: string,
  placarHome: number,
  placarAway: number,
): Promise<void> {
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
```

- [ ] Make the poller skip manual matches (CONTRACT §11.8). In `src/server/results.ts`, the Plan C `pollAndSettle` candidate query already gates on `status: 'agendada'` and the window filter `dataHora: { lte: now, gte: windowStartFloor }`. **ADD only** the line `resultadoFonte: { not: 'manual' },` to that same `where` clause — do **not** remove the `dataHora` window filter (it preserves the quota gating / "no API call outside a match window" guarantee). The full clause must read exactly:

```ts
// inside pollAndSettle, the candidate-match query filter (window filter PRESERVED):
where: {
  status: 'agendada',
  resultadoFonte: { not: 'manual' },
  dataHora: { lte: now, gte: windowStartFloor },
  apiFootballId: { not: null },
},
```

(`pollAndSettle` settles only `status=agendada` → `encerrada` and re-checks `resultadoFonte != manual`; it never touches `cancelada`/`adiada` or manual matches. The integration test above proves this contract.)

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/results.applyManualResult.test.ts`. Expected: PASS (3 specs green, including the poller-skips-manual case).

- [ ] Commit:

```
git add src/server/results.ts src/server/results.applyManualResult.test.ts
git commit -m "feat: applyManualResult with manual-override priority over poller"
```

---

### Task 3: `cancelMatch` in `src/server/results.ts` (cancelada — void predictions)

This task **MODIFIES** `src/server/results.ts` to add `cancelMatch` (CONTRACT §11.8). Admin marks a match `cancelada`: sets `status=cancelada` and zeroes/annuls (`pontosObtidos=0`) all its predictions. `computeStandings` already ignores non-`encerrada` matches (so cancelled matches drop out of the ranking with no further change). The poller already skips `cancelada` (it settles only `status=agendada`, Task 2). Integration test.

**Files:**
- Modify: `src/server/results.ts`
- Test: `src/server/results.cancelMatch.test.ts`

Steps:

- [ ] Write the failing test file `src/server/results.cancelMatch.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { cancelMatch, pollAndSettle } from '@/server/results'

async function fixture() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const member = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: owner.id },
  })
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Peru', codigoPais: 'PE' } })
  const match = await prisma.match.create({
    data: {
      fase: 'grupos',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-06-15T18:00:00Z'),
      placarHome: 2,
      placarAway: 1,
      status: 'encerrada',
      resultadoFonte: 'api',
    },
  })
  return { owner, pool, member, match }
}

describe('cancelMatch', () => {
  it('marks the match cancelada and zeroes all its predictions', async () => {
    const { member, match } = await fixture()
    await prisma.prediction.create({
      data: { membershipId: member.id, matchId: match.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 },
    })

    await cancelMatch(match.id)

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.status).toBe('cancelada')

    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(0)
  })

  it('is skipped by the poller (cancelada is never settled)', async () => {
    const { match } = await fixture()
    await prisma.match.update({ where: { id: match.id }, data: { apiFootballId: 8888 } })

    await cancelMatch(match.id)
    await pollAndSettle({ now: new Date('2026-06-15T21:00:00Z') })

    const after = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(after.status).toBe('cancelada')
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/results.cancelMatch.test.ts`. Expected failure: `cancelMatch is not a function` / not exported from `@/server/results`.

- [ ] Minimal implementation — append `cancelMatch` to `src/server/results.ts` (reuses `prisma` already imported in Task 2). FULL function code:

```ts
// --- add this exported function to src/server/results.ts ---
/**
 * Admin cancels a match (CONTRACT §4 / §11.8): set status = cancelada and
 * void every prediction's points (pontosObtidos = 0). computeStandings already
 * counts only encerrada matches, so cancelled matches drop out of the ranking.
 * The poller skips cancelada (it settles only status = agendada).
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
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/results.cancelMatch.test.ts`. Expected: PASS (2 specs green, including poller-skips-cancelada).

- [ ] Commit:

```
git add src/server/results.ts src/server/results.cancelMatch.test.ts
git commit -m "feat: cancelMatch marks cancelada and voids prediction points"
```

---

### Task 4: `confirmPayment` in `src/server/payments.ts`

Sets `paymentStatus = confirmado` on the membership and stamps `confirmadoPor` / `confirmadoEm` on a `PaymentRecord`. Integration test.

**Files:**
- Modify: `src/server/payments.ts`
- Test: `src/server/payments.confirmPayment.test.ts`

Steps:

- [ ] Write the failing test file `src/server/payments.confirmPayment.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { confirmPayment } from '@/server/payments'

async function fixture() {
  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}@test.com`, name: 'Admin' },
  })
  const player = await prisma.user.create({
    data: { email: `player-${Date.now()}@test.com`, name: 'Player' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}`,
      ownerId: admin.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const membership = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id, paymentStatus: 'pago' },
  })
  return { admin, player, pool, membership }
}

describe('confirmPayment', () => {
  it('flips membership to confirmado and stamps confirmadoPor/confirmadoEm', async () => {
    const { admin, membership, pool } = await fixture()

    await confirmPayment(membership.id, admin.id)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membership.id } })
    expect(m.paymentStatus).toBe('confirmado')

    const rec = await prisma.paymentRecord.findFirstOrThrow({
      where: { membershipId: membership.id },
    })
    expect(rec.confirmadoPor).toBe(admin.id)
    expect(rec.confirmadoEm).toBeInstanceOf(Date)
    expect(rec.valor).toBe(pool.valorEntrada)
    expect(rec.metodo).toBe('PIX')
  })

  it('is idempotent: confirming twice keeps confirmado and a single record', async () => {
    const { admin, membership } = await fixture()

    await confirmPayment(membership.id, admin.id)
    await confirmPayment(membership.id, admin.id)

    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: membership.id } })
    expect(m.paymentStatus).toBe('confirmado')

    const count = await prisma.paymentRecord.count({ where: { membershipId: membership.id } })
    expect(count).toBe(1)
  })
}
)
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/payments.confirmPayment.test.ts`. Expected failure: `confirmPayment is not a function` / not exported from `@/server/payments`.

- [ ] Minimal implementation — append `confirmPayment` to `src/server/payments.ts`. Add imports at the top if not present, then the function. FULL code:

```ts
// --- add near the existing imports in src/server/payments.ts (do not duplicate) ---
import { prisma } from '@/lib/prisma'

// --- add this exported function ---
/**
 * Admin confirms a member's PIX (CONTRACT §7): set membership paymentStatus =
 * confirmado and upsert a single PaymentRecord stamped with confirmadoPor /
 * confirmadoEm. Idempotent: re-confirming keeps one record.
 */
export async function confirmPayment(membershipId: string, adminId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const membership = await tx.poolMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { pool: true },
    })

    await tx.poolMembership.update({
      where: { id: membershipId },
      data: { paymentStatus: 'confirmado' },
    })

    const existing = await tx.paymentRecord.findFirst({ where: { membershipId } })
    if (existing) {
      await tx.paymentRecord.update({
        where: { id: existing.id },
        data: { confirmadoPor: adminId, confirmadoEm: new Date() },
      })
    } else {
      await tx.paymentRecord.create({
        data: {
          membershipId,
          valor: membership.pool.valorEntrada,
          metodo: 'PIX',
          confirmadoPor: adminId,
          confirmadoEm: new Date(),
        },
      })
    }
  })
}
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/payments.confirmPayment.test.ts`. Expected: PASS (both specs green).

- [ ] Commit:

```
git add src/server/payments.ts src/server/payments.confirmPayment.test.ts
git commit -m "feat: confirmPayment stamps confirmado membership and PaymentRecord"
```

---

### Task 5: `prizeSummary` in `src/server/payments.ts`

Composes `computeStandings` + `rankRows` + `pickWinner` + `computePrize`. Returns `{ total, winner }`. Integration test.

**Files:**
- Modify: `src/server/payments.ts`
- Test: `src/server/payments.prizeSummary.test.ts`

Steps:

- [ ] Write the failing test file `src/server/payments.prizeSummary.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { confirmPayment, prizeSummary } from '@/server/payments'

async function pool(valorEntrada = 2500) {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  return prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada,
      chavePix: 'pix@test.com',
    },
  })
}

async function member(poolId: string, nome: string, paymentStatus: 'pendente' | 'pago' | 'confirmado') {
  const user = await prisma.user.create({
    data: { email: `${nome}-${Date.now()}-${Math.random()}@test.com`, name: nome },
  })
  return prisma.poolMembership.create({
    data: { poolId, userId: user.id, paymentStatus },
  })
}

describe('prizeSummary', () => {
  it('total = confirmed entries * valorEntrada; winner = top of ranking', async () => {
    const p = await pool(2500)
    const admin = await prisma.user.findFirstOrThrow({ where: { id: p.ownerId } })
    const leader = await member(p.id, 'Leader', 'pendente')
    const second = await member(p.id, 'Second', 'pendente')
    const unpaidWinner = await member(p.id, 'Zé', 'pendente')

    // confirm 2 of 3 entries -> total = 2 * 2500 = 5000
    await confirmPayment(leader.id, admin.id)
    await confirmPayment(second.id, admin.id)

    // build a team + finished match so standings have points
    const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
    const away = await prisma.team.create({ data: { nome: 'Franca', codigoPais: 'FR' } })
    const match = await prisma.match.create({
      data: {
        fase: 'final',
        homeTeamId: home.id,
        awayTeamId: away.id,
        dataHora: new Date('2026-07-19T18:00:00Z'),
        placarHome: 2,
        placarAway: 1,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })
    // leader nails it (3), second gets winner-only (1)
    await prisma.prediction.create({
      data: { membershipId: leader.id, matchId: match.id, palpiteHome: 2, palpiteAway: 1, pontosObtidos: 3 },
    })
    await prisma.prediction.create({
      data: { membershipId: second.id, matchId: match.id, palpiteHome: 3, palpiteAway: 0, pontosObtidos: 1 },
    })

    const summary = await prizeSummary(p.id)

    expect(summary.total).toBe(5000)
    expect(summary.winner?.membershipId).toBe(leader.id)
    expect(summary.winner?.nome).toBe('Leader')
  })

  it('winner is null and total 0 when the pool has no members', async () => {
    const p = await pool(2500)
    const summary = await prizeSummary(p.id)
    expect(summary.total).toBe(0)
    expect(summary.winner).toBeNull()
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/payments.prizeSummary.test.ts`. Expected failure: `prizeSummary is not a function` / not exported from `@/server/payments`.

- [ ] Minimal implementation — append `prizeSummary` to `src/server/payments.ts`. Add imports for the composed functions at the top if not present, then the function. FULL code:

```ts
// --- add near the existing imports in src/server/payments.ts (do not duplicate) ---
import type { RankingRow } from '@/domain/ranking'
import { rankRows } from '@/domain/ranking'
import { computePrize, pickWinner } from '@/domain/prize'
import { computeStandings } from '@/server/ranking'

// --- add this exported function ---
/**
 * Winner-takes-all prize (CONTRACT §4 / §6 signature). total = count of
 * confirmed entries * valorEntrada (integer cents); winner = top ranked row.
 * Composes computeStandings + rankRows + pickWinner + computePrize.
 */
export async function prizeSummary(
  poolId: string,
): Promise<{ total: number; winner: RankingRow | null }> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  const confirmedEntriesCount = await prisma.poolMembership.count({
    where: { poolId, paymentStatus: 'confirmado' },
  })
  const total = computePrize(confirmedEntriesCount, pool.valorEntrada)

  const standings = await computeStandings(poolId)
  const winner = pickWinner(rankRows(standings))

  return { total, winner }
}
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/payments.prizeSummary.test.ts`. Expected: PASS (both specs green).

- [ ] Commit:

```
git add src/server/payments.ts src/server/payments.prizeSummary.test.ts
git commit -m "feat: prizeSummary composing standings, ranking and prize math"
```

---

### Task 6: Admin server helpers — owner-only data loaders

Server-only functions the admin page needs: an ownership-guarded loader and a member-removal action. Integration test for the guard + remove.

**Files:**
- Create: `src/server/admin.ts`
- Test: `src/server/admin.test.ts`

Steps:

- [ ] Write the failing test file `src/server/admin.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getAdminPool, removeMember, OwnershipError } from '@/server/admin'

async function fixture() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  const stranger = await prisma.user.create({
    data: { email: `stranger-${Date.now()}-${Math.random()}@test.com`, name: 'Stranger' },
  })
  const player = await prisma.user.create({
    data: { email: `player-${Date.now()}-${Math.random()}@test.com`, name: 'Player' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const ownerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: owner.id },
  })
  const playerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id },
  })
  return { owner, stranger, player, pool, ownerMember, playerMember }
}

describe('getAdminPool', () => {
  it('returns the pool with memberships+users when the caller owns it', async () => {
    const { owner, pool } = await fixture()
    const result = await getAdminPool(pool.id, owner.id)
    expect(result.id).toBe(pool.id)
    expect(result.memberships.length).toBe(2)
    expect(result.memberships[0].user.email).toBeTruthy()
  })

  it('throws OwnershipError when the caller does not own the pool', async () => {
    const { stranger, pool } = await fixture()
    await expect(getAdminPool(pool.id, stranger.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('removeMember', () => {
  it('deletes a member when the caller owns the pool', async () => {
    const { owner, pool, playerMember } = await fixture()
    await removeMember(playerMember.id, owner.id)
    const gone = await prisma.poolMembership.findUnique({ where: { id: playerMember.id } })
    expect(gone).toBeNull()
  })

  it('throws OwnershipError when a non-owner tries to remove a member', async () => {
    const { stranger, playerMember } = await fixture()
    await expect(removeMember(playerMember.id, stranger.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/admin.test.ts`. Expected failure: cannot resolve `@/server/admin` (file does not exist).

- [ ] Minimal implementation — write `src/server/admin.ts` with the FULL code below:

```ts
import { prisma } from '@/lib/prisma'

/** Thrown when a non-owner attempts an admin action. No silent fallbacks. */
export class OwnershipError extends Error {
  constructor(message = 'Apenas o organizador do bolão pode fazer isso.') {
    super(message)
    this.name = 'OwnershipError'
  }
}

/**
 * Load a pool for the admin screen, asserting the caller owns it.
 * Includes memberships (with user) ordered by joinedAt for member management.
 */
export async function getAdminPool(poolId: string, callerUserId: string) {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: {
      memberships: {
        orderBy: { joinedAt: 'asc' },
        include: { user: true },
      },
    },
  })
  if (pool.ownerId !== callerUserId) throw new OwnershipError()
  return pool
}

/** Remove a member from a pool. Owner-only. Cascades delete predictions/payments. */
export async function removeMember(membershipId: string, callerUserId: string): Promise<void> {
  const membership = await prisma.poolMembership.findUniqueOrThrow({
    where: { id: membershipId },
    include: { pool: true },
  })
  if (membership.pool.ownerId !== callerUserId) throw new OwnershipError()
  await prisma.poolMembership.delete({ where: { id: membershipId } })
}
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/admin.test.ts`. Expected: PASS (4 specs green).

- [ ] Commit:

```
git add src/server/admin.ts src/server/admin.test.ts
git commit -m "feat: owner-guarded getAdminPool and removeMember admin services"
```

---

### Task 7: Bracket data builder — pure `buildBracket` for `r32`→`final`

Pure transform from raw Match rows into ordered phase columns the `Bracket` component renders. No DB. Tested with `test:unit`.

**Files:**
- Create: `src/domain/bracket.ts`
- Test: `src/domain/bracket.test.ts`

Steps:

- [ ] Write the failing test file `src/domain/bracket.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { buildBracket, KNOCKOUT_PHASES } from './bracket'
import type { BracketMatch } from './bracket'

function m(over: Partial<BracketMatch>): BracketMatch {
  return {
    id: over.id ?? 'x',
    fase: over.fase ?? 'r32',
    dataHora: over.dataHora ?? new Date('2026-07-01T18:00:00Z'),
    homeNome: over.homeNome ?? 'A',
    awayNome: over.awayNome ?? 'B',
    homeCodigoPais: over.homeCodigoPais ?? 'AA',
    awayCodigoPais: over.awayCodigoPais ?? 'BB',
    placarHome: over.placarHome ?? null,
    placarAway: over.placarAway ?? null,
  }
}

describe('KNOCKOUT_PHASES', () => {
  it('lists knockout phases in order from r32 to final (no grupos)', () => {
    expect(KNOCKOUT_PHASES).toEqual(['r32', 'oitavas', 'quartas', 'semi', 'terceiro', 'final'])
  })
})

describe('buildBracket', () => {
  it('drops group-stage matches and keeps only knockout phases', () => {
    const cols = buildBracket([
      m({ id: 'g1', fase: 'grupos' }),
      m({ id: 'k1', fase: 'r32' }),
    ])
    const ids = cols.flatMap((c) => c.matches.map((x) => x.id))
    expect(ids).toContain('k1')
    expect(ids).not.toContain('g1')
  })

  it('returns one column per knockout phase, ordered r32..final', () => {
    const cols = buildBracket([
      m({ id: 'f', fase: 'final' }),
      m({ id: 'r', fase: 'r32' }),
      m({ id: 'q', fase: 'quartas' }),
    ])
    expect(cols.map((c) => c.fase)).toEqual(['r32', 'oitavas', 'quartas', 'semi', 'terceiro', 'final'])
    expect(cols.find((c) => c.fase === 'r32')!.matches.map((x) => x.id)).toEqual(['r'])
    expect(cols.find((c) => c.fase === 'oitavas')!.matches).toEqual([])
    expect(cols.find((c) => c.fase === 'final')!.matches.map((x) => x.id)).toEqual(['f'])
  })

  it('sorts matches within a phase by dataHora ascending', () => {
    const cols = buildBracket([
      m({ id: 'late', fase: 'r32', dataHora: new Date('2026-07-02T18:00:00Z') }),
      m({ id: 'early', fase: 'r32', dataHora: new Date('2026-07-01T18:00:00Z') }),
    ])
    expect(cols.find((c) => c.fase === 'r32')!.matches.map((x) => x.id)).toEqual(['early', 'late'])
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:unit`. Expected failure: cannot resolve `./bracket` / `buildBracket` not exported.

- [ ] Minimal implementation — write `src/domain/bracket.ts` with the FULL code below:

```ts
/**
 * Pure bracket builder (CONTRACT §2 domain boundary): no next/prisma imports.
 * Knockout starts at r32 (CONTRACT §3 MatchPhase). Group matches are dropped.
 */
export type KnockoutPhase = 'r32' | 'oitavas' | 'quartas' | 'semi' | 'terceiro' | 'final'

export const KNOCKOUT_PHASES: KnockoutPhase[] = [
  'r32',
  'oitavas',
  'quartas',
  'semi',
  'terceiro',
  'final',
]

export interface BracketMatch {
  id: string
  fase: string
  dataHora: Date
  homeNome: string
  awayNome: string
  homeCodigoPais: string
  awayCodigoPais: string
  placarHome: number | null
  placarAway: number | null
}

export interface BracketColumn {
  fase: KnockoutPhase
  matches: BracketMatch[]
}

function isKnockout(fase: string): fase is KnockoutPhase {
  return (KNOCKOUT_PHASES as string[]).includes(fase)
}

/** Group matches into ordered knockout columns (r32..final), sorted by kickoff. */
export function buildBracket(matches: BracketMatch[]): BracketColumn[] {
  return KNOCKOUT_PHASES.map((fase) => ({
    fase,
    matches: matches
      .filter((mt) => isKnockout(mt.fase) && mt.fase === fase)
      .slice()
      .sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime()),
  }))
}
```

- [ ] Run tests to confirm pass: `npm run test:unit`. Expected: PASS (`buildBracket` + `KNOCKOUT_PHASES` cases green, plus Task 1 prize cases still green).

- [ ] Commit:

```
git add src/domain/bracket.ts src/domain/bracket.test.ts
git commit -m "feat: pure buildBracket transform for knockout phases r32..final"
```

---

### Task 8: Server loader for bracket matches

Loads knockout `Match` rows for the bracket page and maps them into the pure `BracketMatch` shape. Integration test.

**Files:**
- Modify: `src/server/results.ts`
- Test: `src/server/results.bracket.test.ts`

Steps:

- [ ] Write the failing test file `src/server/results.bracket.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getKnockoutMatches } from '@/server/results'

async function team(nome: string, codigoPais: string) {
  return prisma.team.create({ data: { nome, codigoPais } })
}

describe('getKnockoutMatches', () => {
  it('returns only knockout matches mapped to BracketMatch shape', async () => {
    const a = await team('Brasil', 'BR')
    const b = await team('Croacia', 'HR')
    const c = await team('Espanha', 'ES')
    const d = await team('Italia', 'IT')

    await prisma.match.create({
      data: {
        fase: 'grupos',
        homeTeamId: a.id,
        awayTeamId: b.id,
        dataHora: new Date('2026-06-12T18:00:00Z'),
      },
    })
    const ko = await prisma.match.create({
      data: {
        fase: 'r32',
        homeTeamId: c.id,
        awayTeamId: d.id,
        dataHora: new Date('2026-07-01T18:00:00Z'),
        placarHome: 1,
        placarAway: 0,
        status: 'encerrada',
        resultadoFonte: 'manual',
      },
    })

    const rows = await getKnockoutMatches()

    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe(ko.id)
    expect(rows[0].fase).toBe('r32')
    expect(rows[0].homeNome).toBe('Espanha')
    expect(rows[0].awayNome).toBe('Italia')
    expect(rows[0].homeCodigoPais).toBe('ES')
    expect(rows[0].placarHome).toBe(1)
    expect(rows[0].placarAway).toBe(0)
    expect(rows[0].dataHora).toBeInstanceOf(Date)
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/server/results.bracket.test.ts`. Expected failure: `getKnockoutMatches is not a function` / not exported from `@/server/results`.

- [ ] Minimal implementation — append `getKnockoutMatches` to `src/server/results.ts`. Add the import if not present, then the function. FULL code:

```ts
// --- add near the existing imports in src/server/results.ts (do not duplicate) ---
import type { BracketMatch } from '@/domain/bracket'
import { KNOCKOUT_PHASES } from '@/domain/bracket'

// --- add this exported function ---
/** Load knockout-phase matches (r32..final) mapped to the pure BracketMatch shape. */
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
    placarHome: m.placarHome,
    placarAway: m.placarAway,
  }))
}
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/server/results.bracket.test.ts`. Expected: PASS (1 spec green).

- [ ] Commit:

```
git add src/server/results.ts src/server/results.bracket.test.ts
git commit -m "feat: getKnockoutMatches loader mapping Match rows to BracketMatch"
```

---

### Task 9: `Bracket.tsx` component (mobile phase nav + desktop two-sided)

Pure presentational component that consumes `BracketColumn[]` from `buildBracket`. Component test (opt-in jsdom per CONTRACT §1).

**Files:**
- Create: `src/components/Bracket.tsx`
- Test: `src/components/Bracket.test.tsx`

Steps:

- [ ] Write the failing test file `src/components/Bracket.test.tsx` with the FULL code below. First line opts this file into jsdom:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Bracket } from './Bracket'
import { buildBracket } from '@/domain/bracket'
import type { BracketMatch } from '@/domain/bracket'

function m(over: Partial<BracketMatch>): BracketMatch {
  return {
    id: over.id ?? 'x',
    fase: over.fase ?? 'r32',
    dataHora: over.dataHora ?? new Date('2026-07-01T18:00:00Z'),
    homeNome: over.homeNome ?? 'Brasil',
    awayNome: over.awayNome ?? 'Croacia',
    homeCodigoPais: over.homeCodigoPais ?? 'BR',
    awayCodigoPais: over.awayCodigoPais ?? 'HR',
    placarHome: over.placarHome ?? null,
    placarAway: over.placarAway ?? null,
  }
}

describe('Bracket', () => {
  it('renders team names and the final score for a knockout match', () => {
    const columns = buildBracket([
      m({ id: 'k1', fase: 'r32', homeNome: 'Brasil', awayNome: 'Croacia', placarHome: 2, placarAway: 0 }),
    ])
    render(<Bracket columns={columns} />)
    expect(screen.getAllByText('Brasil').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Croacia').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('shows a phase label for every knockout phase', () => {
    const columns = buildBracket([m({ id: 'k1', fase: 'r32' })])
    render(<Bracket columns={columns} />)
    // human-readable phase labels rendered as column headers
    expect(screen.getAllByText('32 avos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Final').length).toBeGreaterThan(0)
  })

  it('shows a placeholder dash for matches without a score yet', () => {
    const columns = buildBracket([m({ id: 'k1', fase: 'final', placarHome: null, placarAway: null })])
    render(<Bracket columns={columns} />)
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/components/Bracket.test.tsx`. Expected failure: cannot resolve `./Bracket` (component does not exist). (If `@testing-library/react` is missing, install the optional component-test deps from CONTRACT §1 first: `npm i -D @vitejs/plugin-react@^6 jsdom@^29 @testing-library/react@^16 @testing-library/dom@^10`.)

- [ ] Minimal implementation — write `src/components/Bracket.tsx` with the FULL code below:

```tsx
import type { BracketColumn } from '@/domain/bracket'
import type { KnockoutPhase } from '@/domain/bracket'
import { Flag } from './Flag'

const PHASE_LABEL: Record<KnockoutPhase, string> = {
  r32: '32 avos',
  oitavas: 'Oitavas',
  quartas: 'Quartas',
  semi: 'Semifinal',
  terceiro: '3º lugar',
  final: 'Final',
}

function scoreText(n: number | null): string {
  return n === null ? '–' : String(n)
}

function MatchCell({
  homeNome,
  awayNome,
  homeCodigoPais,
  awayCodigoPais,
  placarHome,
  placarAway,
}: BracketColumn['matches'][number]) {
  return (
    <div className="rounded-lg border border-[#CCCCCC] bg-white p-2 text-sm shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Flag codigoPais={homeCodigoPais} />
          <span>{homeNome}</span>
        </span>
        <span className="font-bold tabular-nums">{scoreText(placarHome)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Flag codigoPais={awayCodigoPais} />
          <span>{awayNome}</span>
        </span>
        <span className="font-bold tabular-nums">{scoreText(placarAway)}</span>
      </div>
    </div>
  )
}

/**
 * Knockout bracket (CONTRACT §8 screen 5 / SPEC §8.5).
 * Mobile: each phase is a column; the row scrolls horizontally (overflow-x-auto)
 * so the user swipes through phases. Desktop (lg): all columns sit side by side,
 * the two halves converging toward the final.
 */
export function Bracket({ columns }: { columns: BracketColumn[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4 lg:justify-center">
        {columns.map((col) => (
          <section key={col.fase} className="flex w-56 shrink-0 flex-col gap-3">
            <h3 className="text-center text-sm font-bold text-[#333333]">
              {PHASE_LABEL[col.fase]}
            </h3>
            <div className="flex flex-col justify-around gap-3 h-full">
              {col.matches.length === 0 ? (
                <p className="text-center text-xs text-[#999999]">A definir</p>
              ) : (
                col.matches.map((mt) => <MatchCell key={mt.id} {...mt} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
```

> `Flag` is reused from Plan A (`src/components/Flag.tsx`, CONTRACT §11.1). Its prop is `codigoPais: string` — the two `<Flag codigoPais={...} />` usages above are correct as written. Do not redefine `Flag`.

- [ ] Run tests to confirm pass: `npm run test:run -- src/components/Bracket.test.tsx`. Expected: PASS (3 specs green).

- [ ] Commit:

```
git add src/components/Bracket.tsx src/components/Bracket.test.tsx
git commit -m "feat: Bracket component with phase columns and scores"
```

---

### Task 10: Bracket page `app/bracket/page.tsx`

Server component: requires session, loads knockout matches, builds columns, renders `Bracket`. No new logic to TDD (composition of tested pieces) — scaffolding task with a build/typecheck verification.

**Files:**
- Create: `src/app/bracket/page.tsx`

Steps:

- [ ] Write `src/app/bracket/page.tsx` with the FULL code below:

```tsx
import { requireSession } from '@/lib/session'
import { getKnockoutMatches } from '@/server/results'
import { buildBracket } from '@/domain/bracket'
import { Bracket } from '@/components/Bracket'

export default async function BracketPage() {
  await requireSession()
  const matches = await getKnockoutMatches()
  const columns = buildBracket(matches)

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-[#333333]">Mata-mata</h1>
      <Bracket columns={columns} />
    </main>
  )
}
```

> `requireSession` is the Plan A session guard exported from `@/lib/session` (CONTRACT §11.2). Do not redefine it.

- [ ] Verify it typechecks and builds: `npx tsc --noEmit`. Expected: no type errors in `src/app/bracket/page.tsx` (resolves `getKnockoutMatches`, `buildBracket`, `Bracket`, `requireSession`).

- [ ] Commit:

```
git add src/app/bracket/page.tsx
git commit -m "feat: bracket page rendering knockout matches"
```

---

### Task 11: Admin server actions module

Server actions wiring the admin form/buttons to `applyManualResult`, `cancelMatch`, `confirmPayment`, `removeMember`, and `syncFixtures` (owner-only, CONTRACT §11.6), each guarded by `requireSession` + ownership. These are `'use server'` actions consumed by the page. Integration test for the manual-result, cancel-match and confirm-payment actions (mocking the session to a known user via the underlying services is impractical here, so we test the ownership guard path by calling the services directly — already covered — and here we only smoke-test that the action module wires correctly with an injected userId helper). To keep this testable, expose thin wrappers that take an explicit `adminUserId` and are called by the `'use server'` entrypoints. The `'use server'` entrypoints resolve the caller via `requireSession()` (CONTRACT §11.2), reading `session.user.id`.

**Files:**
- Create: `src/app/admin/[poolId]/actions.ts`
- Test: `src/app/admin/[poolId]/actions.test.ts`

Steps:

- [ ] Write the failing test file `src/app/admin/[poolId]/actions.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  applyResultAsOwner,
  cancelMatchAsOwner,
  confirmPaymentAsOwner,
  removeMemberAsOwner,
  syncFixturesAsOwner,
} from './actions'
import { OwnershipError } from '@/server/admin'

async function fixture() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@test.com`, name: 'Owner' },
  })
  const stranger = await prisma.user.create({
    data: { email: `stranger-${Date.now()}-${Math.random()}@test.com`, name: 'Stranger' },
  })
  const player = await prisma.user.create({
    data: { email: `player-${Date.now()}-${Math.random()}@test.com`, name: 'Player' },
  })
  const pool = await prisma.pool.create({
    data: {
      nome: 'Bolão',
      inviteCode: `code-${Date.now()}-${Math.random()}`,
      ownerId: owner.id,
      valorEntrada: 2500,
      chavePix: 'pix@test.com',
    },
  })
  const playerMember = await prisma.poolMembership.create({
    data: { poolId: pool.id, userId: player.id, paymentStatus: 'pago' },
  })
  const home = await prisma.team.create({ data: { nome: 'Brasil', codigoPais: 'BR' } })
  const away = await prisma.team.create({ data: { nome: 'Chile', codigoPais: 'CL' } })
  const match = await prisma.match.create({
    data: {
      fase: 'r32',
      homeTeamId: home.id,
      awayTeamId: away.id,
      dataHora: new Date('2026-07-01T18:00:00Z'),
    },
  })
  return { owner, stranger, player, pool, playerMember, match }
}

describe('applyResultAsOwner', () => {
  it('owner applies a manual result', async () => {
    const { owner, pool, match } = await fixture()
    await applyResultAsOwner(owner.id, pool.id, match.id, 3, 1)
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.placarHome).toBe(3)
    expect(m.resultadoFonte).toBe('manual')
  })

  it('non-owner is rejected with OwnershipError', async () => {
    const { stranger, pool, match } = await fixture()
    await expect(applyResultAsOwner(stranger.id, pool.id, match.id, 3, 1)).rejects.toBeInstanceOf(
      OwnershipError,
    )
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.placarHome).toBeNull()
  })
})

describe('cancelMatchAsOwner', () => {
  it('owner cancels a match (status cancelada, predictions zeroed)', async () => {
    const { owner, pool, match, playerMember } = await fixture()
    await prisma.prediction.create({
      data: { membershipId: playerMember.id, matchId: match.id, palpiteHome: 1, palpiteAway: 0, pontosObtidos: 3 },
    })

    await cancelMatchAsOwner(owner.id, pool.id, match.id)

    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.status).toBe('cancelada')
    const pred = await prisma.prediction.findFirstOrThrow({ where: { matchId: match.id } })
    expect(pred.pontosObtidos).toBe(0)
  })

  it('non-owner cannot cancel', async () => {
    const { stranger, pool, match } = await fixture()
    await expect(cancelMatchAsOwner(stranger.id, pool.id, match.id)).rejects.toBeInstanceOf(
      OwnershipError,
    )
    const m = await prisma.match.findUniqueOrThrow({ where: { id: match.id } })
    expect(m.status).toBe('agendada')
  })
})

describe('syncFixturesAsOwner', () => {
  it('non-owner cannot sync fixtures', async () => {
    const { stranger, pool } = await fixture()
    await expect(syncFixturesAsOwner(stranger.id, pool.id)).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('confirmPaymentAsOwner', () => {
  it('owner confirms a member payment', async () => {
    const { owner, pool, playerMember } = await fixture()
    await confirmPaymentAsOwner(owner.id, pool.id, playerMember.id)
    const m = await prisma.poolMembership.findUniqueOrThrow({ where: { id: playerMember.id } })
    expect(m.paymentStatus).toBe('confirmado')
  })

  it('non-owner cannot confirm', async () => {
    const { stranger, pool, playerMember } = await fixture()
    await expect(
      confirmPaymentAsOwner(stranger.id, pool.id, playerMember.id),
    ).rejects.toBeInstanceOf(OwnershipError)
  })
})

describe('removeMemberAsOwner', () => {
  it('owner removes a member', async () => {
    const { owner, pool, playerMember } = await fixture()
    await removeMemberAsOwner(owner.id, pool.id, playerMember.id)
    const gone = await prisma.poolMembership.findUnique({ where: { id: playerMember.id } })
    expect(gone).toBeNull()
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/app/admin/\[poolId\]/actions.test.ts`. Expected failure: cannot resolve `./actions` (file does not exist).

- [ ] Minimal implementation — write `src/app/admin/[poolId]/actions.ts` with the FULL code below. Pure-id wrappers are testable; the `'use server'` entrypoints resolve the caller via `auth()`:

```ts
'use server'

import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { OwnershipError } from '@/server/admin'
import { applyManualResult, cancelMatch, syncFixtures } from '@/server/results'
import { confirmPayment } from '@/server/payments'
import { removeMember } from '@/server/admin'
import { revalidatePath } from 'next/cache'

/** Assert the given user owns the pool, else throw. */
async function assertOwner(callerUserId: string, poolId: string): Promise<void> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } })
  if (pool.ownerId !== callerUserId) throw new OwnershipError()
}

// --- testable id-explicit wrappers ---

export async function applyResultAsOwner(
  callerUserId: string,
  poolId: string,
  matchId: string,
  placarHome: number,
  placarAway: number,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await applyManualResult(matchId, placarHome, placarAway)
}

export async function cancelMatchAsOwner(
  callerUserId: string,
  poolId: string,
  matchId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await cancelMatch(matchId)
}

export async function confirmPaymentAsOwner(
  callerUserId: string,
  poolId: string,
  membershipId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await confirmPayment(membershipId, callerUserId)
}

export async function removeMemberAsOwner(
  callerUserId: string,
  poolId: string,
  membershipId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await removeMember(membershipId, callerUserId)
}

export async function syncFixturesAsOwner(
  callerUserId: string,
  poolId: string,
): Promise<void> {
  await assertOwner(callerUserId, poolId)
  await syncFixtures()
}

// --- 'use server' form-action entrypoints (resolve caller from session) ---

async function currentUserId(): Promise<string> {
  const session = await requireSession()
  return session.user.id
}

export async function applyResultAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  const placarHome = Number(formData.get('placarHome'))
  const placarAway = Number(formData.get('placarAway'))
  await applyResultAsOwner(await currentUserId(), poolId, matchId, placarHome, placarAway)
  revalidatePath(`/admin/${poolId}`)
}

export async function cancelMatchAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const matchId = String(formData.get('matchId'))
  await cancelMatchAsOwner(await currentUserId(), poolId, matchId)
  revalidatePath(`/admin/${poolId}`)
}

export async function confirmPaymentAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await confirmPaymentAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  const membershipId = String(formData.get('membershipId'))
  await removeMemberAsOwner(await currentUserId(), poolId, membershipId)
  revalidatePath(`/admin/${poolId}`)
}

export async function syncFixturesAction(formData: FormData): Promise<void> {
  const poolId = String(formData.get('poolId'))
  await syncFixturesAsOwner(await currentUserId(), poolId)
  revalidatePath(`/admin/${poolId}`)
}
```

> The `'use server'` directive marks every export as a server action. The id-explicit wrappers (`applyResultAsOwner`, etc.) are imported by the test and called by the form actions, keeping ownership logic unit-testable without a real session. The form entrypoints resolve the caller via `requireSession()` and read `session.user.id` (CONTRACT §11.2 — typed by `src/types/next-auth.d.ts` and the `auth.ts` session callback added in Plan A; do not work around it here). `syncFixturesAsOwner` covers the owner-only "Sincronizar jogos" action (CONTRACT §11.6).

- [ ] Run tests to confirm pass: `npm run test:run -- src/app/admin/\[poolId\]/actions.test.ts`. Expected: PASS (8 specs green — result, cancel, sync-guard, confirm, remove).

- [ ] Commit:

```
git add "src/app/admin/[poolId]/actions.ts" "src/app/admin/[poolId]/actions.test.ts"
git commit -m "feat: owner-guarded admin server actions (result, cancel, payment, remove, sync)"
```

---

### Task 12: Share helpers — invite URL + WhatsApp link

Pure helpers building the invite URL and a WhatsApp share URL from an invite code. No DB. Tested with `test:unit`.

**Files:**
- Create: `src/domain/share.ts`
- Test: `src/domain/share.test.ts`

Steps:

- [ ] Write the failing test file `src/domain/share.test.ts` with the FULL code below:

```ts
import { describe, it, expect } from 'vitest'
import { inviteUrl, whatsappShareUrl } from './share'

describe('inviteUrl', () => {
  it('builds an absolute join URL from a base and invite code', () => {
    expect(inviteUrl('https://bolao.app', 'ABC123')).toBe('https://bolao.app/join/ABC123')
  })

  it('trims a trailing slash on the base', () => {
    expect(inviteUrl('https://bolao.app/', 'ABC123')).toBe('https://bolao.app/join/ABC123')
  })

  it('url-encodes the invite code', () => {
    expect(inviteUrl('https://bolao.app', 'a b/c')).toBe('https://bolao.app/join/a%20b%2Fc')
  })
})

describe('whatsappShareUrl', () => {
  it('wraps a message + invite url into a wa.me link', () => {
    const url = whatsappShareUrl('Entra no bolão!', 'https://bolao.app/join/ABC123')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(url).toContain(encodeURIComponent('Entra no bolão!'))
    expect(url).toContain(encodeURIComponent('https://bolao.app/join/ABC123'))
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:unit`. Expected failure: cannot resolve `./share` / functions not exported.

- [ ] Minimal implementation — write `src/domain/share.ts` with the FULL code below:

```ts
/** Pure share helpers (no next/prisma). Used by the admin invite section. */

/** Build the absolute join URL for an invite code. */
export function inviteUrl(baseUrl: string, inviteCode: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/join/${encodeURIComponent(inviteCode)}`
}

/** Build a wa.me share URL combining a message and the invite URL. */
export function whatsappShareUrl(message: string, joinUrl: string): string {
  const text = encodeURIComponent(`${message} ${joinUrl}`)
  return `https://wa.me/?text=${text}`
}
```

- [ ] Run tests to confirm pass: `npm run test:unit`. Expected: PASS (`inviteUrl` + `whatsappShareUrl` green, earlier domain tests still green).

- [ ] Commit:

```
git add src/domain/share.ts src/domain/share.test.ts
git commit -m "feat: pure inviteUrl and whatsappShareUrl share helpers"
```

---

### Task 13: Copy-link client component

Small client component with a "copiar link" button. Component test (opt-in jsdom).

**Files:**
- Create: `src/components/CopyLinkButton.tsx`
- Test: `src/components/CopyLinkButton.test.tsx`

Steps:

- [ ] Write the failing test file `src/components/CopyLinkButton.test.tsx` with the FULL code below:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyLinkButton } from './CopyLinkButton'

describe('CopyLinkButton', () => {
  it('copies the url to the clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<CopyLinkButton url="https://bolao.app/join/ABC123" />)
    const btn = screen.getByRole('button', { name: /copiar link/i })
    fireEvent.click(btn)

    expect(writeText).toHaveBeenCalledWith('https://bolao.app/join/ABC123')
    await waitFor(() => expect(screen.getByText(/copiado/i)).toBeTruthy())
  })
})
```

- [ ] Run it to confirm it fails: `npm run test:run -- src/components/CopyLinkButton.test.tsx`. Expected failure: cannot resolve `./CopyLinkButton`.

- [ ] Minimal implementation — write `src/components/CopyLinkButton.tsx` with the FULL code below:

```tsx
'use client'

import { useState } from 'react'

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-[#CCCCCC] bg-white px-3 py-2 text-sm font-semibold text-[#333333]"
    >
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}
```

- [ ] Run tests to confirm pass: `npm run test:run -- src/components/CopyLinkButton.test.tsx`. Expected: PASS (1 spec green).

- [ ] Commit:

```
git add src/components/CopyLinkButton.tsx src/components/CopyLinkButton.test.tsx
git commit -m "feat: CopyLinkButton client component for invite sharing"
```

---

### Task 14: Admin page `app/admin/[poolId]/page.tsx`

Server component: `requireSession` + ownership via `getAdminPool`, then renders the manual-result form, the membership list with confirm-payment buttons, member removal, the prize summary (total + winner), and the invite/share section. Composition of already-tested pieces; verified by typecheck/build.

**Files:**
- Create: `src/app/admin/[poolId]/page.tsx`

Steps:

- [ ] Write `src/app/admin/[poolId]/page.tsx` with the FULL code below:

```tsx
import { requireSession } from '@/lib/session'
import { getAdminPool } from '@/server/admin'
import { prizeSummary } from '@/server/payments'
import { getKnockoutMatches } from '@/server/results'
import { env } from '@/lib/env'
import { inviteUrl, whatsappShareUrl } from '@/domain/share'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import {
  applyResultAction,
  cancelMatchAction,
  confirmPaymentAction,
  removeMemberAction,
  syncFixturesAction,
} from './actions'

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ poolId: string }>
}) {
  const session = await requireSession()
  const { poolId } = await params
  const pool = await getAdminPool(poolId, session.user.id)
  const summary = await prizeSummary(poolId)
  const matches = await getKnockoutMatches()

  const join = inviteUrl(env.authUrl(), pool.inviteCode)
  const whatsapp = whatsappShareUrl(`Entra no bolão ${pool.nome}!`, join)

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#333333]">Admin — {pool.nome}</h1>
        {/* Owner-only fixtures sync (CONTRACT §11.6) */}
        <form action={syncFixturesAction}>
          <input type="hidden" name="poolId" value={poolId} />
          <button
            type="submit"
            className="rounded-md border border-[#CCCCCC] bg-white px-3 py-2 text-sm font-semibold text-[#333333]"
          >
            Sincronizar jogos
          </button>
        </form>
      </div>

      {/* Prize summary */}
      <section className="rounded-lg border border-[#CCCCCC] bg-[#FAFAFA] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Prêmio</h2>
        <p className="mt-1 text-2xl font-bold text-[#06AA48]">{brl(summary.total)}</p>
        <p className="text-sm text-[#666666]">
          Ganhador atual: {summary.winner ? summary.winner.nome : 'a definir'}
        </p>
      </section>

      {/* Manual result form */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Registrar/corrigir resultado</h2>
        <form action={applyResultAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="poolId" value={poolId} />
          <label className="flex flex-col text-sm">
            Jogo
            <select name="matchId" className="rounded-md border border-[#CCCCCC] p-2" required>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.homeNome} x {m.awayNome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            Casa
            <input
              type="number"
              name="placarHome"
              min={0}
              required
              className="w-16 rounded-md border border-[#CCCCCC] p-2"
            />
          </label>
          <label className="flex flex-col text-sm">
            Fora
            <input
              type="number"
              name="placarAway"
              min={0}
              required
              className="w-16 rounded-md border border-[#CCCCCC] p-2"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-[#06AA48] px-4 py-2 font-semibold text-white"
          >
            Salvar resultado
          </button>
        </form>
        <p className="mt-2 text-xs text-[#999999]">
          W.O.: registre o 3×0 oficial aqui como resultado manual normal (CONTRACT §11.8).
        </p>
      </section>

      {/* Cancel a match (status cancelada, void points — CONTRACT §11.8) */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Cancelar jogo</h2>
        <form action={cancelMatchAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="poolId" value={poolId} />
          <label className="flex flex-col text-sm">
            Jogo
            <select name="matchId" className="rounded-md border border-[#CCCCCC] p-2" required>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.homeNome} x {m.awayNome}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-[#CC0000] px-4 py-2 font-semibold text-[#CC0000]"
          >
            Cancelar jogo
          </button>
        </form>
      </section>

      {/* Members + payments */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Participantes</h2>
        <ul className="mt-3 divide-y divide-[#EEEEEE]">
          {pool.memberships.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm">
                {m.user.name ?? m.user.email}
                <span className="ml-2 text-xs text-[#999999]">[{m.paymentStatus}]</span>
              </span>
              <span className="flex gap-2">
                {m.paymentStatus !== 'confirmado' && (
                  <form action={confirmPaymentAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-[#06AA48] px-3 py-1 text-sm font-semibold text-white"
                    >
                      Confirmar pagamento
                    </button>
                  </form>
                )}
                {m.userId !== pool.ownerId && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="poolId" value={poolId} />
                    <input type="hidden" name="membershipId" value={m.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-[#CCCCCC] px-3 py-1 text-sm text-[#CC0000]"
                    >
                      Remover
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite / share */}
      <section className="rounded-lg border border-[#CCCCCC] p-4">
        <h2 className="text-lg font-bold text-[#333333]">Convidar</h2>
        <p className="mt-2 break-all text-sm text-[#666666]">{join}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyLinkButton url={join} />
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
          >
            Compartilhar no WhatsApp
          </a>
        </div>
      </section>
    </main>
  )
}
```

> Reuses: `requireSession` (`@/lib/session`, CONTRACT §11.2), `getAdminPool` (Task 6), `prizeSummary` (Task 5), `getKnockoutMatches` (Task 8), `env.authUrl()` (Plan A `src/lib/env.ts`, function form per CONTRACT §11.3), `inviteUrl`/`whatsappShareUrl` (Task 12), `CopyLinkButton` (Task 13), and the five actions `applyResultAction`/`cancelMatchAction`/`confirmPaymentAction`/`removeMemberAction`/`syncFixturesAction` (Task 11). `env.authUrl()` is the function-form accessor (CONTRACT §11.3) — do not access `env.AUTH_URL` as a property.

- [ ] Verify it typechecks and builds: `npx tsc --noEmit`. Expected: no type errors in `src/app/admin/[poolId]/page.tsx` (all imported symbols resolve).

- [ ] Commit:

```
git add "src/app/admin/[poolId]/page.tsx"
git commit -m "feat: admin page with results, cancel, payments, prize, sync and invite sharing"
```

---

### Task 15: Full suite green + final verification

Confirm the whole test suite passes and the app builds. No new code unless a regression surfaces.

**Files:**
- (verification only)

Steps:

- [ ] Run the full unit suite: `npm run test:unit`. Expected: PASS (prize, bracket, share domain tests all green; no DB needed).

- [ ] Run the full integration + component suite: `npm run test:run`. Expected: PASS (applyManualResult incl. poller-skips-manual, cancelMatch incl. poller-skips-cancelada, confirmPayment, prizeSummary, admin guards, getKnockoutMatches, Bracket, CopyLinkButton, admin actions incl. cancel + sync-guard). The guard in `vitest.setup.ts` must see a `DATABASE_URL` containing `"test"`.

- [ ] Run the production build: `npm run build`. Expected: build succeeds; `/admin/[poolId]` and `/bracket` routes compile.

- [ ] If everything is green, commit any incidental fixes (none expected):

```
git add -A
git commit -m "chore: verify full suite and build for admin/pix/bracket plan D" --allow-empty
```

---

## Coverage check (SPEC §8.7 + §7 + §8.5, CONTRACT §4/§5/§6)

- Owner-only admin page (`requireSession` from `@/lib/session` + ownership): Tasks 6, 11, 14.
- `applyManualResult` (placar, encerrada, manual, recompute points; poller never overwrites manual; ADDED here per CONTRACT §11.1, not stubbed in Plan C) + integration test: Task 2.
- `cancelMatch` (status=cancelada, predictions zeroed; computeStandings ignores it; poller skips it) + W.O.=manual 3×0 note (CONTRACT §11.8): Tasks 3, 11, 14.
- Admin form calling `applyManualResult`: Tasks 11, 14.
- Owner-only "Sincronizar jogos" action calling `syncFixtures` (CONTRACT §11.6): Tasks 11, 14.
- `confirmPayment(membershipId, adminId)` (paymentStatus=confirmado, confirmadoPor, confirmadoEm): Task 4.
- `prizeSummary(poolId)` returning `{total, winner}`, composing computeStandings + rankRows + pickWinner + computePrize, with integration test: Task 5.
- `computePrize` + `pickWinner` pure with unit tests: Task 1.
- Membership list with confirm-payment buttons + prize total + winner shown: Task 14.
- Member management (remove member): Tasks 6, 11, 14.
- Invite link (`env.authUrl()` base, CONTRACT §11.3) with WhatsApp + copy-link share: Tasks 12, 13, 14.
- `Bracket.tsx` from `r32` (mobile phase nav + horizontal scroll; desktop two-sided) + bracket page: Tasks 7, 8, 9, 10.
- Reused, not redefined: `computeStandings`, `rankRows`, `RankingRow`, `pollAndSettle`, `markPaid`, `getMembership`, `scorePrediction`, `prisma`, `auth`, `requireSession` (`@/lib/session`), `Flag` (prop `codigoPais`), `Button`, `env` (function-form accessors, e.g. `env.authUrl()`).
