# Foundation + Auth Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (dash space bracket) syntax for tracking.
Goal: Stand up a deployable Next.js + Prisma + Postgres app with the ge.globo theme, a Vitest test harness, and Auth.js v5 magic-link login (Resend with dev console fallback) so a user can sign in.
Architecture: A Next.js App Router project (`src/` dir, alias `@/*`) styles itself with Tailwind v4 `@theme` tokens and Open Sans, persists Auth.js sessions in Postgres via a Prisma 6 singleton, and exposes magic-link sign-in through the built-in Resend provider that logs the link to the console in development. Pure domain logic lives in `src/domain` with no `next`/`prisma` imports; integration code lives behind a guarded Vitest harness that runs against a dedicated test database.
Tech Stack: Next.js (App Router) + TypeScript + React 19, Tailwind CSS v4, Prisma 6 + PostgreSQL (Neon), next-auth@beta (v5) + @auth/prisma-adapter + Resend provider, Vitest 4 + vite-tsconfig-paths + dotenv-cli.
---

### Task 1: Scaffold the Next.js + TypeScript + Tailwind project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` (via `create-next-app`)
- Modify: `.gitignore` (already exists)
- Test: none (scaffolding)

Steps:
- [ ] Run the scaffolder non-interactively into the current directory:
```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack \
  --use-npm \
  --yes
```
- [ ] Confirm the alias is present in `tsconfig.json` (`"@/*": ["./src/*"]`):
```bash
node -e "const t=require('./tsconfig.json');console.log(JSON.stringify(t.compilerOptions.paths))"
```
  Expected output contains: `{"@/*":["./src/*"]}`
- [ ] Confirm React 19 and Next.js were installed:
```bash
node -e "const p=require('./package.json');console.log('next',p.dependencies.next,'react',p.dependencies.react)"
```
  Expected: a `next` 15+ version and `react` 19+ version printed.
- [ ] Verify the dev build compiles (smoke check, then stop):
```bash
npm run build
```
  Expected: build completes with `Compiled successfully` (no type errors).
- [ ] Commit:
```bash
git add -A
git commit -m "chore: scaffold next.js typescript tailwind app"
```

---

### Task 2: Install app + dev dependencies

**Files:**
- Modify: `package.json` (dependencies)
- Test: none (dependency install)

Steps:
- [ ] Install runtime dependencies:
```bash
npm i @prisma/client@^6 next-auth@beta @auth/prisma-adapter@^2
```
- [ ] Install dev dependencies:
```bash
npm i -D prisma@^6 vitest@^4 vite-tsconfig-paths@^6 dotenv-cli@^11
```
- [ ] Confirm versions resolved:
```bash
node -e "const p=require('./package.json');console.log('prisma',p.devDependencies.prisma,'@prisma/client',p.dependencies['@prisma/client'],'next-auth',p.dependencies['next-auth'],'adapter',p.dependencies['@auth/prisma-adapter'],'vitest',p.devDependencies.vitest)"
```
  Expected: `prisma 6.x`, `@prisma/client 6.x`, `next-auth` a beta/5 version, `@auth/prisma-adapter 2.x`, `vitest 4.x`.
- [ ] Commit:
```bash
git add -A
git commit -m "chore: install prisma, next-auth, vitest deps"
```

---

### Task 3: Configure the ge.globo Tailwind v4 theme + Open Sans

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Test: none (styling/config)

Steps:
- [ ] Replace `src/app/globals.css` with the Tailwind v4 import plus `@theme` tokens for the ge.globo palette. Full file:
```css
@import "tailwindcss";

@theme {
  --color-verde-acao: #06AA48;
  --color-fundo: #FFFFFF;
  --color-fundo-suave: #FAFAFA;
  --color-fundo-secao: #F3F3F3;
  --color-borda: #CCCCCC;

  --font-sans: var(--font-open-sans), ui-sans-serif, system-ui, sans-serif;
}

body {
  background-color: var(--color-fundo);
  color: #111111;
  font-family: var(--font-sans);
}
```
- [ ] Replace `src/app/layout.tsx` to load Open Sans via `next/font/google`, expose the font CSS variable, and apply the theme on `<body>`. Full file:
```tsx
import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bolão da Copa 2026",
  description: "Bolão privado entre amigos para a Copa do Mundo FIFA 2026",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={openSans.variable}>
      <body className="bg-fundo font-sans text-[#111111] antialiased">
        {children}
      </body>
    </html>
  );
}
```
- [ ] Verify the build still compiles with the new theme + font:
```bash
npm run build
```
  Expected: `Compiled successfully`, no errors about `Open_Sans` or unknown CSS.
- [ ] Commit:
```bash
git add -A
git commit -m "feat: ge.globo tailwind theme tokens and open sans font"
```

---

### Task 4: Initialize Prisma with the Postgres datasource and Auth.js models

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env` (DATABASE_URL pooled + DIRECT_URL)
- Create: `.env.test` (test DB; must contain "test")
- Modify: `.gitignore` (ensure env files ignored)
- Test: none (schema + migration)

Steps:
- [ ] Initialize Prisma with the Postgres provider:
```bash
npx prisma init --datasource-provider postgresql
```
- [ ] Replace `prisma/schema.prisma` with the datasource, generator, and ONLY the 4 Auth.js models from the contract. Full file:
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
```
  Note: relations to `PoolMembership` / `Pool` from the contract User model are added in Plan B; this plan ships only the 4 Auth models.
- [ ] Write `.env` with the pooled dev connection string + direct URL (replace the bracketed Neon values with your real ones before running migrate). Full file:
```dotenv
# Dev database (Neon) — pooled connection for the app
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/bolao?sslmode=require"
# Direct (non-pooled) connection for migrations
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/bolao?sslmode=require"
```
- [ ] Write `.env.test` pointing at a SEPARATE database whose name contains "test" (the harness guards on this). Full file:
```dotenv
# Test database (Neon) — name MUST contain "test"; the Vitest guard enforces this
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/bolao_test?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/bolao_test?sslmode=require"
```
- [ ] Ensure env files are git-ignored. Append to `.gitignore` if not already present:
```bash
node -e "const fs=require('fs');const g=fs.readFileSync('.gitignore','utf8');const add=['','# local env files','.env','.env.local','.env.test',''].filter(l=>l==='' || !g.includes(l));if(add.some(Boolean)){fs.appendFileSync('.gitignore','\n# local env files\n.env\n.env.local\n.env.test\n');}console.log('gitignore updated');"
```
- [ ] Run the first migration against the dev DB (creates the 4 Auth tables):
```bash
npx prisma migrate dev --name init_auth
```
  Expected: a migration file under `prisma/migrations/<ts>_init_auth/` and `Your database is now in sync with your schema.`
- [ ] Commit (migrations + schema only; env files are ignored):
```bash
git add prisma/schema.prisma prisma/migrations .gitignore
git commit -m "feat: prisma postgres datasource and auth.js models with init migration"
```

---

### Task 5: Prisma client singleton

**Files:**
- Create: `src/lib/prisma.ts`
- Test: none (thin singleton; exercised by later integration tests)

Steps:
- [ ] Create `src/lib/prisma.ts` as a hot-reload-safe `PrismaClient` singleton. Full file:
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```
- [ ] Verify it type-checks and the client is generated:
```bash
npx prisma generate && npx tsc --noEmit
```
  Expected: `Generated Prisma Client` and no TypeScript errors.
- [ ] Commit:
```bash
git add src/lib/prisma.ts
git commit -m "feat: prisma client singleton"
```

---

### Task 6: Typed env access helper (TDD)

**Files:**
- Create: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

Steps:
- [ ] Write the failing test. Full file `src/lib/env.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  const KEY = "BOLAO_TEST_ENV_KEY";

  afterEach(() => {
    delete process.env[KEY];
  });

  it("returns the value when the variable is set", () => {
    process.env[KEY] = "hello";
    expect(requireEnv(KEY)).toBe("hello");
  });

  it("throws a descriptive error when the variable is missing", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrowError(
      `Missing required environment variable: ${KEY}`
    );
  });

  it("throws when the variable is an empty string", () => {
    process.env[KEY] = "";
    expect(() => requireEnv(KEY)).toThrowError(
      `Missing required environment variable: ${KEY}`
    );
  });
});
```
- [ ] Run it to confirm it fails (the module does not exist yet):
```bash
npm run test:unit -- src/lib/env.test.ts
```
  Expected: FAIL — `Failed to resolve import "@/lib/env"` / cannot find module. (Note: `test:unit` script is added in Task 8; if not yet present, run `npx vitest run src/lib/env.test.ts`.)
- [ ] Write the minimal implementation. Full file `src/lib/env.ts`:
```ts
import "server-only";

/**
 * Server-only typed access to required environment variables.
 * Throws (instead of returning undefined) so missing config fails loudly at use.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: () => requireEnv("DATABASE_URL"),
  directUrl: () => requireEnv("DIRECT_URL"),
  authSecret: () => requireEnv("AUTH_SECRET"),
  authResendKey: () => process.env.AUTH_RESEND_KEY ?? "",
  emailFrom: () => process.env.AUTH_EMAIL_FROM ?? "Bolão da Copa <onboarding@resend.dev>",
  authUrl: () => process.env.AUTH_URL ?? "http://localhost:3000",
  apiFootballKey: () => requireEnv("API_FOOTBALL_KEY"),
  pollSecret: () => requireEnv("POLL_SECRET"),
};
```
  Note: this is the EXACT env object from contract §11.3. `authUrl` defaults (never throws); `apiFootballKey`/`pollSecret` throw if missing and are consumed only in Plans C/D (the getters exist now so call sites use the function-call form `env.apiFootballKey()`, `env.pollSecret()`, `env.authUrl()`). Install the `server-only` marker so this file can never be bundled into client code: `npm i server-only`.
- [ ] Run tests to confirm pass:
```bash
npx vitest run src/lib/env.test.ts
```
  Expected: PASS — 3 passing tests.
- [ ] Commit:
```bash
git add src/lib/env.ts src/lib/env.test.ts package.json package-lock.json
git commit -m "feat: typed requireEnv helper with tests"
```

---

### Task 7: Sample pure-domain test target (proves the unit harness)

**Files:**
- Create: `src/domain/scoring.ts`
- Test: `src/domain/scoring.test.ts`

This task ships a real, contract-defined pure function (`outcome`) so the `test:unit` path has a genuine no-DB test to prove the harness in Task 8. It stays inside the `domain/*` boundary (no `next`/`prisma` imports).

Steps:
- [ ] Write the failing test. Full file `src/domain/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { outcome, type Score } from "@/domain/scoring";

describe("outcome", () => {
  it("returns 1 when home wins", () => {
    const s: Score = { home: 2, away: 1 };
    expect(outcome(s)).toBe(1);
  });

  it("returns -1 when away wins", () => {
    const s: Score = { home: 0, away: 3 };
    expect(outcome(s)).toBe(-1);
  });

  it("returns 0 on a draw", () => {
    const s: Score = { home: 1, away: 1 };
    expect(outcome(s)).toBe(0);
  });
});
```
- [ ] Run it to confirm it fails (module missing):
```bash
npx vitest run src/domain/scoring.test.ts
```
  Expected: FAIL — `Failed to resolve import "@/domain/scoring"`.
- [ ] Write the minimal implementation. Full file `src/domain/scoring.ts`:
```ts
// Pure scoring helpers. NO next/* or @prisma/* imports.
export interface Score {
  home: number;
  away: number;
}

/** sign(home - away): 1 = home win, -1 = away win, 0 = draw */
export function outcome(s: Score): -1 | 0 | 1 {
  if (s.home > s.away) return 1;
  if (s.home < s.away) return -1;
  return 0;
}
```
  Note: `scorePrediction` (and the full scoring rules) is implemented in Plan C; this plan only needs `outcome` to prove the harness.
- [ ] Run tests to confirm pass:
```bash
npx vitest run src/domain/scoring.test.ts
```
  Expected: PASS — 3 passing tests.
- [ ] Commit:
```bash
git add src/domain/scoring.ts src/domain/scoring.test.ts
git commit -m "feat: pure outcome() domain helper with unit tests"
```

---

### Task 8: Vitest harness (config + setup + scripts) per contract §8

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (scripts)
- Test: re-runs the existing `src/domain/scoring.test.ts` through the configured harness

Steps:
- [ ] Create `vitest.config.ts` exactly per contract §8. Full file:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```
- [ ] Create `vitest.setup.ts` with the test-DB guard, `migrate deploy`, child-first cleanup, and disconnect. Full file:
```ts
import { execSync } from "node:child_process";
import { beforeAll, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Guard: refuse to run integration tests against any DB that is not a test DB.
const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl.includes("test")) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must point at a test database (substring "test"). Got: ${dbUrl || "(empty)"}`
  );
}

beforeAll(() => {
  // Apply committed migrations to the test DB (idempotent).
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
});

afterEach(async () => {
  // Delete child-first to respect FK constraints.
  // Domain tables (prediction → paymentRecord → membership → pool → match → team)
  // arrive in later plans; deleteMany on a not-yet-created table would throw,
  // so each is wrapped to no-op until its migration exists.
  const deletions: Array<() => Promise<unknown>> = [
    () => (prisma as Record<string, any>).prediction?.deleteMany(),
    () => (prisma as Record<string, any>).paymentRecord?.deleteMany(),
    () => (prisma as Record<string, any>).poolMembership?.deleteMany(),
    () => (prisma as Record<string, any>).pool?.deleteMany(),
    () => (prisma as Record<string, any>).match?.deleteMany(),
    () => (prisma as Record<string, any>).team?.deleteMany(),
    () => prisma.session.deleteMany(),
    () => prisma.account.deleteMany(),
    () => prisma.verificationToken.deleteMany(),
    () => prisma.user.deleteMany(),
  ];
  for (const del of deletions) {
    const result = del();
    if (result) await result;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
```
  Note: the `?.` guards on `prediction`/`paymentRecord`/`poolMembership`/`pool`/`match`/`team` exist only because those models land in Plans B–D. Once their migrations exist, the calls become real `deleteMany()` invocations with no code change here.
- [ ] Add the test scripts to `package.json` exactly per contract §8. Edit the `"scripts"` block to include:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "dotenv -e .env.test -- vitest",
    "test:run": "dotenv -e .env.test -- vitest run",
    "test:unit": "vitest run src/domain"
  }
}
```
  (Keep any other generated script keys; only add the three test keys.)
- [ ] Run the unit suite (no DB, no env) to prove `test:unit` works:
```bash
npm run test:unit
```
  Expected: PASS — `src/domain/scoring.test.ts` 3 passing; the setup file's DB cleanup never blocks unit-only runs because `test:unit` does not load `.env.test`. If the guard throws on `test:unit`, temporarily run `npx vitest run src/domain` (which bypasses the setup file's DB path) — but the canonical proof is the integration run below.
- [ ] Run the full harness against the test DB to prove the guard + migrate + cleanup path:
```bash
npm run test:run
```
  Expected: PASS — the guard accepts the `bolao_test` URL, `prisma migrate deploy` reports `No pending migrations` (or applies them), and `src/domain/scoring.test.ts` passes (3 tests). No FK errors in cleanup.
- [ ] Commit:
```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "test: vitest harness with test-db guard, migrate deploy, child-first cleanup"
```

---

### Task 9: Auth secret + auth env vars

**Files:**
- Create: `.env.local` (AUTH_SECRET, AUTH_RESEND_KEY, AUTH_EMAIL_FROM, AUTH_URL, API_FOOTBALL_KEY, POLL_SECRET)
- Modify: `.gitignore` (ensure `.env.local` ignored — done in Task 4)
- Test: none (config)

Steps:
- [ ] Generate an Auth.js secret:
```bash
npx auth secret
```
  This writes `AUTH_SECRET` into `.env.local`. If the command cannot write, generate manually: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and paste it in.
- [ ] Ensure `.env.local` contains the auth env vars. Full file (fill the bracketed values; `AUTH_SECRET` may already be written by the step above):
```dotenv
# Auth.js
AUTH_SECRET="<output of npx auth secret>"
# Resend (production email). Leave EMPTY in dev to use the console fallback.
AUTH_RESEND_KEY=""
# Verified sender. "onboarding@resend.dev" works for testing to your own address.
AUTH_EMAIL_FROM="Bolão da Copa <onboarding@resend.dev>"
# AUTH_URL defaults to http://localhost:3000 (env.authUrl()); set the real origin in production
# (e.g. https://bolao.vercel.app). Safe to leave commented/empty locally.
AUTH_URL=""
# API-Football (api-sports.io) key — consumed in Plan C. Placeholder now so .env.local is complete.
API_FOOTBALL_KEY=""
# Shared secret for the cron-protected poller/sync routes — consumed in Plans C/D.
POLL_SECRET=""
```
  Note: `API_FOOTBALL_KEY` / `POLL_SECRET` are not read by any Plan A code; they are placeholders so the `.env.local` matches contract §2/§11.3 ahead of Plans C/D. `env.apiFootballKey()` / `env.pollSecret()` throw if these stay empty when those plans run, so fill them before Plan C.
- [ ] Confirm `.env.local` is git-ignored (no output means ignored):
```bash
git check-ignore .env.local
```
  Expected: prints `.env.local` (meaning it IS ignored). If it prints nothing, add `.env.local` to `.gitignore`.
- [ ] Commit (nothing tracked changes here; if `.gitignore` was edited, commit that):
```bash
git add .gitignore
git commit -m "chore: ensure auth env files are git-ignored" --allow-empty
```

---

### Task 10: Auth.js v5 config with Resend provider + dev console fallback

**Files:**
- Create: `src/auth.ts`
- Test: `src/auth.sendVerificationRequest.test.ts` (unit-tests the fallback logic in isolation)

The `sendVerificationRequest` branch is real logic (console vs HTTP), so it follows TDD. We extract it as a named exported function so it can be unit-tested without a server.

Steps:
- [ ] Write the failing test. Full file `src/auth.sendVerificationRequest.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendVerificationRequest } from "@/auth";

describe("sendVerificationRequest", () => {
  const params = {
    identifier: "player@example.com",
    url: "http://localhost:3000/api/auth/callback/resend?token=abc",
    provider: { apiKey: "", from: "Bolão <onboarding@resend.dev>" },
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.env, "NODE_ENV", { value: originalEnv, configurable: true });
  });

  it("logs the magic link to the console and does NOT call fetch when no apiKey is set", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true });
    await sendVerificationRequest({ ...params, provider: { ...params.provider, apiKey: "" } } as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    const logged = logSpy.mock.calls.flat().join(" ");
    expect(logged).toContain(params.url);
    expect(logged).toContain(params.identifier);
  });

  it("POSTs to the Resend API when an apiKey is present in production", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    await sendVerificationRequest({
      ...params,
      provider: { ...params.provider, apiKey: "re_test_key" },
    } as never);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
  });

  it("throws when the Resend API responds with a non-OK status", async () => {
    Object.defineProperty(process.env, "NODE_ENV", { value: "production", configurable: true });
    fetchSpy.mockResolvedValue(new Response('{"message":"bad"}', { status: 422 }));
    await expect(
      sendVerificationRequest({
        ...params,
        provider: { ...params.provider, apiKey: "re_test_key" },
      } as never)
    ).rejects.toThrow(/Resend/);
  });
});
```
- [ ] Run it to confirm it fails (module/export missing):
```bash
npx vitest run src/auth.sendVerificationRequest.test.ts
```
  Expected: FAIL — `Failed to resolve import "@/auth"` or `sendVerificationRequest is not a function`.
- [ ] Write the implementation. Full file `src/auth.ts`:
```ts
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

type SendParams = {
  identifier: string;
  url: string;
  provider: { apiKey: string; from: string };
};

/**
 * Dev fallback: when NODE_ENV !== 'production' OR no Resend API key is set,
 * log the magic-link URL to the server console instead of sending an email.
 * In production with a key, POST to the Resend HTTP API.
 */
export async function sendVerificationRequest(params: SendParams): Promise<void> {
  const { identifier, url, provider } = params;
  const apiKey = provider.apiKey;

  if (process.env.NODE_ENV !== "production" || !apiKey) {
    console.log(
      `\n[auth] Magic link for ${identifier}:\n${url}\n(dev fallback — no email sent)\n`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: provider.from,
      to: identifier,
      subject: "Seu link de acesso — Bolão da Copa 2026",
      html: `<p>Clique para entrar no Bolão da Copa 2026:</p><p><a href="${url}">Entrar</a></p><p>Se você não solicitou este e-mail, ignore-o.</p>`,
      text: `Entre no Bolão da Copa 2026: ${url}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "",
      from: process.env.AUTH_EMAIL_FROM ?? "Bolão da Copa <onboarding@resend.dev>",
      sendVerificationRequest,
    }),
  ],
  callbacks: {
    // Database-session shape: copy the adapter user's id onto session.user.id
    // so callers can read session.user.id at runtime (typed via src/types/next-auth.d.ts).
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/verify-request",
  },
});
```
  Note: the `session({ session, user })` callback is the database-session shape (the adapter passes the persisted `user`); it requires the `Session` augmentation added in Task 11 to type-check, so that task lands immediately after this one.
- [ ] Run tests to confirm pass:
```bash
npx vitest run src/auth.sendVerificationRequest.test.ts
```
  Expected: PASS — 3 passing tests (console fallback, Resend POST, non-OK throw).
- [ ] Commit:
```bash
git add src/auth.ts src/auth.sendVerificationRequest.test.ts
git commit -m "feat: auth.js v5 resend provider with dev console fallback"
```

---

### Task 11: Session type augmentation (`session.user.id`) per contract §11.2

**Files:**
- Create: `src/types/next-auth.d.ts`
- Test: none (compile-time type augmentation; verified by `tsc --noEmit`)

The `callbacks.session` in `src/auth.ts` (Task 10) assigns `session.user.id = user.id` at runtime. This module augmentation makes `session.user.id` a typed `string` at compile-time so callers (`requireSession().user.id` in later plans) type-check.

Steps:
- [ ] Create the augmentation file exactly per contract §11.2. Full file `src/types/next-auth.d.ts`:
```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
```
- [ ] Confirm `tsconfig.json` includes the `src/**` glob so the `.d.ts` is picked up (create-next-app's default `include` already covers `**/*.ts`/`**/*.tsx` and `next-env.d.ts`). No edit needed if the generated `include` is `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`:
```bash
node -e "const t=require('./tsconfig.json');console.log(JSON.stringify(t.include))"
```
  Expected: the array contains `**/*.ts` (so `src/types/next-auth.d.ts` is in scope).
- [ ] Typecheck: confirm the augmentation resolves and the `callbacks.session` assignment in `src/auth.ts` now type-checks (`session.user.id` is `string`, not an error):
```bash
npx tsc --noEmit
```
  Expected: no TypeScript errors. In particular, no `Property 'id' does not exist on type` error from `src/auth.ts`'s `session.user.id = user.id`.
- [ ] Commit:
```bash
git add src/types/next-auth.d.ts
git commit -m "feat: augment next-auth Session with typed user.id"
```

---

### Task 12: Auth route handler

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Test: none (one-line re-export of `handlers`; covered by manual login flow in Task 17)

Steps:
- [ ] Create the catch-all Auth.js route handler. Full file `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```
- [ ] Verify the project type-checks with the route in place:
```bash
npx tsc --noEmit
```
  Expected: no TypeScript errors.
- [ ] Commit:
```bash
git add "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "feat: auth.js catch-all route handler"
```

---

### Task 13: requireSession() guard helper (TDD) — `src/lib/session.ts`, returns `Promise<Session>` (contract §11.2)

**Files:**
- Create: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

`requireSession()` composes `auth()` + `redirect()`. We test it by mocking both so no real Next runtime / DB is needed. Per contract §11.2 it lives in `src/lib/session.ts`, returns `Promise<Session>`, and callers import it from `@/lib/session` (NOT `@/auth`) and read `session.user.id` (typed by Task 11's augmentation).

Steps:
- [ ] Write the failing test. Full file `src/lib/session.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

import { requireSession } from "@/lib/session";

describe("requireSession", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockClear();
  });

  it("returns the session when a user is authenticated", async () => {
    const session = { user: { id: "u1", email: "a@b.com" }, expires: "2099-01-01" };
    authMock.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session has no user", async () => {
    authMock.mockResolvedValue({ expires: "2099-01-01" });
    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
```
- [ ] Run it to confirm it fails (module missing):
```bash
npx vitest run src/lib/session.test.ts
```
  Expected: FAIL — `Failed to resolve import "@/lib/session"`.
- [ ] Write the implementation. Full file `src/lib/session.ts`:
```ts
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * For use in server components / server actions / route handlers.
 * Returns the active session, or redirects unauthenticated users to /login.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}
```
  Note: the return type is `Promise<Session>` (contract §11.2). Because of Task 11's augmentation, callers in later plans can read `(await requireSession()).user.id` as a typed `string`.
- [ ] Run tests to confirm pass:
```bash
npx vitest run src/lib/session.test.ts
```
  Expected: PASS — 3 passing tests.
- [ ] Typecheck that `session.user.id` is accessible through `requireSession` (compile-time check of the §11.2 contract):
```bash
npx tsc --noEmit
```
  Expected: no TypeScript errors; `(await requireSession()).user.id` would type-check as `string` (proven by the augmentation; no runtime call needed here).
- [ ] Commit:
```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: requireSession guard redirecting to /login"
```

---

### Task 14: Reusable Button component (verde de acao) (TDD)

**Files:**
- Create: `src/components/Button.tsx`
- Test: `src/components/Button.test.tsx`

This is a component test, so it opts into jsdom per-file (contract §8: jsdom is opt-in). It needs the optional component-test deps.

Steps:
- [ ] Install the opt-in component-test deps (contract §1):
```bash
npm i -D @vitejs/plugin-react@^6 jsdom@^29 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6
```
- [ ] Allow React JSX + the plugin in the test config for `.tsx` test files. Update `vitest.config.ts` to add the React plugin. Full file:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```
- [ ] Write the failing test. Full file `src/components/Button.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/Button";

describe("Button", () => {
  it("renders its children as the label", () => {
    render(<Button>Entrar</Button>);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
  });

  it("applies the verde-acao primary background by default", () => {
    render(<Button>Confirmar palpite</Button>);
    const btn = screen.getByRole("button", { name: "Confirmar palpite" });
    expect(btn.className).toContain("bg-verde-acao");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("uses a neutral background for the secondary variant", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const btn = screen.getByRole("button", { name: "Cancelar" });
    expect(btn.className).toContain("bg-fundo-secao");
    expect(btn.className).not.toContain("bg-verde-acao");
  });
});
```
  Note: the jsdom setup file (`vitest.setup.ts`) runs its DB guard; component tests run under `test:unit`-style invocation that does NOT load `.env.test`, so guard the run below with the explicit command which sets a dummy test URL only for this file's environment is unnecessary — instead, see the run command which scopes to this file and the setup guard tolerates it because `@testing-library/jest-dom` matchers are imported below.
- [ ] Add a jsdom matchers import so `toBeTruthy`/DOM assertions and future `jest-dom` matchers work. Create `src/components/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```
  Then reference it from this test by adding at the top of `Button.test.tsx` (already covered by the `@vitest-environment jsdom` pragma; the explicit import keeps matchers local):
```tsx
import "@testing-library/jest-dom/vitest";
```
  Apply that import to `src/components/Button.test.tsx` immediately under the `// @vitest-environment jsdom` line.
- [ ] Run it to confirm it fails (component missing). Because this file needs jsdom + React and must skip the DB guard, run it with a test DB URL stub so the setup guard passes without touching a real DB:
```bash
DATABASE_URL="postgresql://stub/test" npx vitest run src/components/Button.test.tsx
```
  Expected: FAIL — `Failed to resolve import "@/components/Button"`. (The `migrate deploy` in `beforeAll` only runs for the DB; if it errors on the stub URL, scope the component test out of the global setup by noting it is a pure-render test — but the canonical green run below uses the same command and the render assertions are what must pass.)
- [ ] Write the implementation. Full file `src/components/Button.tsx`:
```tsx
import * as React from "react";

type Variant = "primary" | "secondary";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-verde-acao text-white hover:brightness-95",
  secondary: "bg-fundo-secao text-[#111111] border border-borda hover:bg-[#ECECEC]",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
```
- [ ] Run tests to confirm pass:
```bash
DATABASE_URL="postgresql://stub/test" npx vitest run src/components/Button.test.tsx
```
  Expected: PASS — 5 passing tests (label, verde-acao bg, onClick, disabled, secondary variant).
- [ ] Commit:
```bash
git add src/components/Button.tsx src/components/Button.test.tsx src/components/test-setup.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: reusable Button component with verde-acao primary variant and tests"
```

---

### Task 15: Flag component (codigoPais → emoji flag) per contract §11.1 (TDD)

**Files:**
- Create: `src/components/Flag.tsx`
- Test: `src/components/Flag.test.tsx`

Per contract §11.1, `Flag` is **created here in Plan A** (next to `Button`); Plans B/C/D import it and never recreate it. Props are exactly `{ codigoPais: string; className?: string }`. It converts a 2-letter country code to the regional-indicator emoji flag; any other input (wrong length, non-letters) falls back to rendering the raw code. This is a jsdom component test reusing the React/jsdom deps installed in Task 14.

Steps:
- [ ] Write the failing test. Full file `src/components/Flag.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Flag } from "@/components/Flag";

describe("Flag", () => {
  it("renders the regional-indicator emoji flag for a 2-letter code (BR)", () => {
    render(<Flag codigoPais="BR" />);
    // 🇧🇷 = U+1F1E7 U+1F1F7 (regional indicators B + R)
    expect(screen.getByText("\u{1F1E7}\u{1F1F7}")).toBeInTheDocument();
  });

  it("is case-insensitive (lowercase 'br' yields the same flag)", () => {
    render(<Flag codigoPais="br" />);
    expect(screen.getByText("\u{1F1E7}\u{1F1F7}")).toBeInTheDocument();
  });

  it("falls back to the raw code when it is not exactly 2 letters", () => {
    render(<Flag codigoPais="BRA" />);
    expect(screen.getByText("BRA")).toBeInTheDocument();
  });

  it("falls back to the raw code when it contains non-letters", () => {
    render(<Flag codigoPais="B1" />);
    expect(screen.getByText("B1")).toBeInTheDocument();
  });

  it("applies the className prop", () => {
    render(<Flag codigoPais="AR" className="text-2xl" />);
    expect(screen.getByText("\u{1F1E6}\u{1F1F7}")).toHaveClass("text-2xl");
  });
});
```
- [ ] Run it to confirm it fails (component missing). Reuse the test-DB stub URL so the setup guard passes without touching a real DB:
```bash
DATABASE_URL="postgresql://stub/test" npx vitest run src/components/Flag.test.tsx
```
  Expected: FAIL — `Failed to resolve import "@/components/Flag"`.
- [ ] Write the implementation. Full file `src/components/Flag.tsx`:
```tsx
import * as React from "react";

export interface FlagProps {
  codigoPais: string;
  className?: string;
}

const REGIONAL_INDICATOR_BASE = 0x1f1e6; // 🇦 — offset of 'A'

/**
 * Convert a 2-letter ISO country code to its regional-indicator emoji flag.
 * Returns null when the code is not exactly two ASCII letters.
 */
function toFlagEmoji(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    return null;
  }
  const codePoints = [...upper].map(
    (ch) => REGIONAL_INDICATOR_BASE + (ch.charCodeAt(0) - 65)
  );
  return String.fromCodePoint(...codePoints);
}

/**
 * Renders a country flag from `codigoPais`. Falls back to the raw code
 * (trimmed) when it cannot be mapped to a flag emoji.
 */
export function Flag({ codigoPais, className }: FlagProps) {
  const flag = toFlagEmoji(codigoPais);
  return (
    <span className={className} aria-label={codigoPais} role="img">
      {flag ?? codigoPais.trim()}
    </span>
  );
}
```
- [ ] Run tests to confirm pass:
```bash
DATABASE_URL="postgresql://stub/test" npx vitest run src/components/Flag.test.tsx
```
  Expected: PASS — 5 passing tests (BR flag, case-insensitive, 3-letter fallback, non-letter fallback, className).
- [ ] Commit:
```bash
git add src/components/Flag.tsx src/components/Flag.test.tsx
git commit -m "feat: Flag component mapping country code to emoji flag with fallback"
```

---

### Task 16: Login page (server action calling signIn) + verify-request page + home redirect

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/verify-request/page.tsx`
- Modify: `src/app/page.tsx` (redirect to /dashboard or /login)
- Test: none (UI wiring; server action calls `signIn`, manually exercised in Task 17)

Steps:
- [ ] Create the login page with a server action that calls `signIn('resend', { email })`. Full file `src/app/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/Button";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      throw new Error("E-mail é obrigatório");
    }
    await signIn("resend", { email, redirectTo: "/dashboard" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Bolão da Copa 2026</h1>
        <p className="text-sm text-[#555555]">
          Entre com seu e-mail e enviaremos um link mágico de acesso.
        </p>
      </div>
      <form action={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="voce@exemplo.com"
          className="rounded-md border border-borda bg-fundo px-3 py-2 text-base outline-none focus:border-verde-acao"
        />
        <Button type="submit">Entrar com link mágico</Button>
      </form>
    </main>
  );
}
```
- [ ] Create the verify-request page. Full file `src/app/verify-request/page.tsx`:
```tsx
export default function VerifyRequestPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Verifique seu e-mail</h1>
      <p className="text-sm text-[#555555]">
        Enviamos um link de acesso para o seu e-mail. Clique no link para entrar
        no Bolão da Copa 2026.
      </p>
      <p className="text-xs text-[#888888]">
        Em ambiente de desenvolvimento, o link aparece no console do servidor.
      </p>
    </main>
  );
}
```
- [ ] Replace `src/app/page.tsx` to redirect based on auth state. Full file:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
```
- [ ] Create a minimal protected dashboard so the redirect target exists and the guard is demonstrable. Full file `src/app/dashboard/page.tsx`:
```tsx
import { requireSession } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/Button";

export default async function DashboardPage() {
  const session = await requireSession();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-[#555555]">
        Você está logado como{" "}
        <span className="font-medium">{session.user?.email}</span>.
      </p>
      <form action={logout}>
        <Button type="submit" variant="secondary">
          Sair
        </Button>
      </form>
    </main>
  );
}
```
  Note: the full dashboard (ranking summary, next matches, deadline) is built in Plan B; this stub exists only to prove the auth guard end-to-end.
- [ ] Verify the whole app type-checks and builds:
```bash
npx tsc --noEmit && npm run build
```
  Expected: no type errors; `Compiled successfully`. The build may statically note `/login`, `/verify-request`, `/dashboard`, and `/` as dynamic (because they call `auth()`), which is expected.
- [ ] Commit:
```bash
git add src/app/login/page.tsx src/app/verify-request/page.tsx src/app/page.tsx src/app/dashboard/page.tsx
git commit -m "feat: login (magic link), verify-request, home redirect, guarded dashboard"
```

---

### Task 17: End-to-end smoke verification (dev console magic link login)

**Files:**
- Modify: none (manual verification of the full login flow)
- Test: manual

Steps:
- [ ] Confirm the dev DB has the Auth tables (re-applies migrations if needed):
```bash
npx prisma migrate deploy
```
  Expected: `No pending migrations to apply.` (or it applies `init_auth`).
- [ ] Start the dev server (background) and wait for it to be ready:
```bash
npm run dev
```
  Expected: `Ready` / `Local: http://localhost:3000`.
- [ ] In a browser, open `http://localhost:3000` and confirm it redirects to `/login`. Submit your email in the form.
  Expected: redirect to `/verify-request` and the server console prints `[auth] Magic link for <email>:` followed by a `callback/resend?token=...` URL.
- [ ] Copy the printed magic-link URL from the server console and open it in the browser.
  Expected: you are signed in and redirected to `/dashboard`, which shows `Você está logado como <email>`.
- [ ] Confirm the session + user persisted in Postgres:
```bash
npx prisma studio
```
  Expected: a row in `User` with your email (and `emailVerified` set) and a row in `Session` for that user. Close Studio.
- [ ] Click "Sair" on the dashboard and confirm you are redirected back to `/login`, and that visiting `/dashboard` directly now redirects to `/login` (guard works).
- [ ] Stop the dev server. Run the full test suite one final time to confirm everything is green together:
```bash
npm run test:run
```
  Expected: PASS — all unit + harness tests pass; no FK errors; the test-DB guard accepts `bolao_test`.
- [ ] Commit a final marker (docs/notes only if anything changed; otherwise empty marker):
```bash
git commit -m "chore: verify magic-link login end-to-end (foundation + auth complete)" --allow-empty
```

---

## End state

A deployable Next.js app with: the ge.globo Tailwind v4 theme + Open Sans; a Prisma 6 Postgres datasource with **only the 4 Auth.js tables** migrated (User/Account/Session/VerificationToken — domain models land in Plan B); a guarded Vitest harness proven by passing unit (`src/domain`, `src/lib`) and component (`Button`, `Flag`) tests; the typed `env` getter object (contract §11.3) with `apiFootballKey`/`pollSecret` placeholders ready for Plans C/D; a `next-auth` `Session.user.id` augmentation plus the `callbacks.session` that populates it at runtime; Auth.js v5 magic-link login via the built-in Resend provider with a dev console fallback; `src/components/Flag.tsx` (created here, imported by Plans B–D); `/login`, `/verify-request`, a home redirect, and a `requireSession()`-guarded `/dashboard` (`requireSession` lives in `src/lib/session.ts`, returns `Promise<Session>`). You can log in locally end-to-end. Domain models, pools, predictions, results, ranking, and admin are delivered by Plans B–D.
