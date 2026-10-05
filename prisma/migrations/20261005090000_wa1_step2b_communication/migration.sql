-- WA-1 Step 2B — penyimpanan komunikasi klien (proof-of-flow INTERNAL_FAKE_TEST).
-- MURNI ADITIF: tiga tabel baru + unique index + FK pada tabel baru. Tanpa ALTER/DROP
-- tabel lama, tanpa backfill, tanpa GRANT (portal default-deny, K147). Kolom
-- approvalRequestId SENGAJA tanpa FK (D-2B-01). Inert sampai service 2C ada DAN
-- gerbang WA1_INTERNAL_FAKE_TEST_ENABLED menyala di lingkungan non-produksi.

-- CreateTable
CREATE TABLE "CommunicationCandidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "signalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "blockReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "logicalMessageKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "successKey" TEXT,
    "recipientFixtureId" TEXT NOT NULL,
    "recipientIdentifier" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "snapshotFingerprint" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "reasonCode" TEXT,
    "previewedAt" TIMESTAMP(3),
    "previewedByUserId" TEXT,
    "approvalRequestId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "fakeReceipt" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED_FAKE',
    "reasonCode" TEXT,
    "receipt" TEXT,
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "externalDelivery" BOOLEAN NOT NULL DEFAULT false,
    "requestedByUserId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCandidate_tenantId_voyageId_sourceType_sourceR_key" ON "CommunicationCandidate"("tenantId", "voyageId", "sourceType", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_candidateId_revision_key" ON "CommunicationMessage"("candidateId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_tenantId_activeKey_key" ON "CommunicationMessage"("tenantId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationMessage_tenantId_successKey_key" ON "CommunicationMessage"("tenantId", "successKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationAttempt_messageId_attemptNo_key" ON "CommunicationAttempt"("messageId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationAttempt_tenantId_idempotencyKey_key" ON "CommunicationAttempt"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CommunicationCandidate" ADD CONSTRAINT "CommunicationCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCandidate" ADD CONSTRAINT "CommunicationCandidate_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CommunicationCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttempt" ADD CONSTRAINT "CommunicationAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAttempt" ADD CONSTRAINT "CommunicationAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CommunicationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

