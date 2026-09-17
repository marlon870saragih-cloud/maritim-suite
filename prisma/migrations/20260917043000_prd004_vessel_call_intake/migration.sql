-- PRD-004 Step 3 — Vessel Call Intake. MURNI ADITIF: satu tabel baru + satu kolom
-- nullable & satu unique index di "Voyage". Tanpa DROP, tanpa ALTER COLUMN, tanpa
-- UPDATE/DELETE, tanpa GRANT (portal tak bisa membaca intake).
-- "Voyage"."sourceIntakeId" SENGAJA tanpa FK (hindari siklus Voyage <-> intake);
-- unique (tenantId, sourceIntakeId) = satu intake menghasilkan maksimal satu voyage.

-- AlterTable
ALTER TABLE "Voyage" ADD COLUMN     "sourceIntakeId" TEXT;

-- CreateTable
CREATE TABLE "VesselCallIntake" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "inputKind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "activeHashKey" TEXT,
    "sourceFileName" TEXT,
    "sourceSizeBytes" INTEGER,
    "attachmentId" TEXT,
    "extractorVersion" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "matches" JSONB NOT NULL,
    "duplicateLevel" TEXT NOT NULL,
    "duplicateCandidates" JSONB NOT NULL,
    "duplicateDecision" TEXT,
    "decisionReason" TEXT,
    "portalExposureAck" BOOLEAN NOT NULL DEFAULT false,
    "postCreateWarnings" JSONB,
    "errorCode" TEXT,
    "submittedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "voyageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VesselCallIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VesselCallIntake_tenantId_status_createdAt_idx" ON "VesselCallIntake"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VesselCallIntake_tenantId_inputHash_idx" ON "VesselCallIntake"("tenantId", "inputHash");

-- CreateIndex
CREATE INDEX "VesselCallIntake_voyageId_idx" ON "VesselCallIntake"("voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "VesselCallIntake_tenantId_activeHashKey_key" ON "VesselCallIntake"("tenantId", "activeHashKey");

-- CreateIndex
CREATE UNIQUE INDEX "Voyage_tenantId_sourceIntakeId_key" ON "Voyage"("tenantId", "sourceIntakeId");

-- AddForeignKey
ALTER TABLE "VesselCallIntake" ADD CONSTRAINT "VesselCallIntake_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselCallIntake" ADD CONSTRAINT "VesselCallIntake_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

