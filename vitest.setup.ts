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
    // Delete child-first to respect FK constraints. Plan B's domain tables now
    // exist, so these are live typed deletes (prediction → paymentRecord →
    // poolMembership → pool → match → team → auth models).
    await prisma.prediction.deleteMany();
    await prisma.paymentRecord.deleteMany();
    await prisma.poolMembership.deleteMany();
    await prisma.pool.deleteMany();
    await prisma.match.deleteMany();
    await prisma.team.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
}
