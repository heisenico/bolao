import { execSync } from "node:child_process";
import { beforeAll, afterEach, afterAll } from "vitest";

// `test:unit` sets VITEST_UNIT=1: pure-domain tests need no DB, no env, and must
// not trigger the test-DB guard, migrations, or cleanup. Importing @prisma/client
// (done lazily below) would also pull the dev `.env` into process.env, so it is
// skipped entirely in unit mode.
const UNIT_ONLY = process.env.VITEST_UNIT === "1";

if (!UNIT_ONLY) {
  // Guard: refuse to run integration tests against any DB that is not a test DB.
  // Read DATABASE_URL before importing Prisma (its dotenv load could otherwise
  // backfill a non-test URL); `dotenv -e .env.test` presets the test URL here.
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("test")) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL must point at a test database (substring "test"). Got: ${dbUrl || "(empty)"}`
    );
  }

  beforeAll(() => {
    // The test connection targets a dedicated `schema=test` on Neon. Postgres will
    // not create that schema implicitly, so ensure it exists before migrating.
    const directUrl = process.env.DIRECT_URL ?? dbUrl;
    execSync(`npx prisma db execute --url "${directUrl}" --stdin`, {
      input: "CREATE SCHEMA IF NOT EXISTS test;",
      stdio: ["pipe", "inherit", "inherit"],
    });

    // Apply committed migrations to the test DB (idempotent).
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
  });

  afterEach(async () => {
    // Imported lazily so unit runs never load Prisma (or the dev `.env`).
    const { prisma } = await import("@/lib/prisma");
    // Delete child-first to respect FK constraints.
    // Domain tables (prediction → paymentRecord → membership → pool → match → team)
    // arrive in later plans; deleteMany on a not-yet-created table would throw,
    // so each is wrapped to no-op until its migration exists.
    // Domain model delegates don't exist on the typed client until Plan B's
    // migrations land; reach them through a structural cast (no `any`) so each
    // no-ops until its table exists. Plan B replaces these with typed calls.
    type Deletable = { deleteMany: () => Promise<unknown> };
    const futureModels = prisma as unknown as Record<string, Deletable | undefined>;
    const deletions: Array<() => Promise<unknown> | undefined> = [
      () => futureModels.prediction?.deleteMany(),
      () => futureModels.paymentRecord?.deleteMany(),
      () => futureModels.poolMembership?.deleteMany(),
      () => futureModels.pool?.deleteMany(),
      () => futureModels.match?.deleteMany(),
      () => futureModels.team?.deleteMany(),
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
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
}
