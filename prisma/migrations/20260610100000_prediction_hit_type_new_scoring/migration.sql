-- CreateEnum
CREATE TYPE "HitType" AS ENUM ('exact', 'winner_and_diff', 'winner_only', 'miss', 'pending', 'cancelled');

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN "hitType" "HitType" NOT NULL DEFAULT 'pending',
ADD COLUMN "palpiteAutomatico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pontosBase" INTEGER;

-- Backfill (spec Phase 0): map legacy point literals to explicit hit types.
-- Under the old rules a settled prediction stored 3 = exact ("cravada"),
-- 1 = correct winner/draw, 0 = miss. "Settled" means the match is encerrada.
-- Legacy values had no phase multiplier, so pontosBase = pontosObtidos.
-- Old data has no winner_and_diff tier — that is correct.
UPDATE "Prediction" SET "hitType" = 'exact', "pontosBase" = "pontosObtidos"
WHERE "pontosObtidos" = 3
  AND "matchId" IN (SELECT "id" FROM "Match" WHERE "status" = 'encerrada');

UPDATE "Prediction" SET "hitType" = 'winner_only', "pontosBase" = "pontosObtidos"
WHERE "pontosObtidos" = 1
  AND "matchId" IN (SELECT "id" FROM "Match" WHERE "status" = 'encerrada');

UPDATE "Prediction" SET "hitType" = 'miss', "pontosBase" = 0
WHERE "pontosObtidos" = 0
  AND "matchId" IN (SELECT "id" FROM "Match" WHERE "status" = 'encerrada');

-- Predictions on cancelled matches were zeroed by cancelMatch; mark them
-- 'cancelled' so they never count as outcome hits. Unsettled stay 'pending'.
UPDATE "Prediction" SET "hitType" = 'cancelled'
WHERE "matchId" IN (SELECT "id" FROM "Match" WHERE "status" = 'cancelada');
