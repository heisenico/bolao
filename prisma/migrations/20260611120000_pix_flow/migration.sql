-- AlterTable: free pools have no Pix key (valorEntrada = 0 hides the flow).
ALTER TABLE "Pool" ALTER COLUMN "chavePix" DROP NOT NULL;

-- AlterTable: stamp the member's "já paguei" report for auditability.
ALTER TABLE "PoolMembership" ADD COLUMN "pagamentoReportadoEm" TIMESTAMP(3);

-- Backfill: a creator never pays themself — their own membership is confirmed.
-- New pools set this at creation; this fixes pre-existing pools (idempotent).
UPDATE "PoolMembership" m SET "paymentStatus" = 'confirmado'
FROM "Pool" p
WHERE m."poolId" = p."id"
  AND m."userId" = p."ownerId"
  AND m."paymentStatus" <> 'confirmado';
