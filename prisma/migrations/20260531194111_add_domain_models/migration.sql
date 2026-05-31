-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('aberto', 'fechado');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pendente', 'pago', 'confirmado');

-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('grupos', 'r32', 'oitavas', 'quartas', 'semi', 'terceiro', 'final');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('agendada', 'ao_vivo', 'encerrada', 'adiada', 'cancelada');

-- CreateEnum
CREATE TYPE "ResultadoFonte" AS ENUM ('api', 'manual');

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "valorEntrada" INTEGER NOT NULL,
    "chavePix" TEXT NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'aberto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolMembership" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pendente',

    CONSTRAINT "PoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoPais" TEXT NOT NULL,
    "grupo" TEXT,
    "apiFootballId" INTEGER,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "fase" "MatchPhase" NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "placarHome" INTEGER,
    "placarAway" INTEGER,
    "status" "MatchStatus" NOT NULL DEFAULT 'agendada',
    "resultadoFonte" "ResultadoFonte",
    "apiFootballId" INTEGER,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "palpiteHome" INTEGER NOT NULL,
    "palpiteAway" INTEGER NOT NULL,
    "pontosObtidos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'PIX',
    "comprovanteRef" TEXT,
    "confirmadoPor" TEXT,
    "confirmadoEm" TIMESTAMP(3),

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pool_inviteCode_key" ON "Pool"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "PoolMembership_poolId_userId_key" ON "PoolMembership"("poolId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_apiFootballId_key" ON "Team"("apiFootballId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_apiFootballId_key" ON "Match"("apiFootballId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_membershipId_matchId_key" ON "Prediction"("membershipId", "matchId");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolMembership" ADD CONSTRAINT "PoolMembership_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolMembership" ADD CONSTRAINT "PoolMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PoolMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PoolMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
