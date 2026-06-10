-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('champion', 'top_scorer', 'best_goalkeeper', 'golden_ball', 'runner_up');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PrizePrediction" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "prizeType" "PrizeType" NOT NULL,
    "value" TEXT NOT NULL,
    "pointsAwarded" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrizePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeResult" (
    "id" TEXT NOT NULL,
    "prizeType" "PrizeType" NOT NULL,
    "value" TEXT NOT NULL,
    "pointsValue" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrizeResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrizePrediction_membershipId_prizeType_key" ON "PrizePrediction"("membershipId", "prizeType");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeResult_prizeType_key" ON "PrizeResult"("prizeType");

-- AddForeignKey
ALTER TABLE "PrizePrediction" ADD CONSTRAINT "PrizePrediction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PoolMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
