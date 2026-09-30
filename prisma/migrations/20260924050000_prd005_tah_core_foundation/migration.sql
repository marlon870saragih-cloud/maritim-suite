-- PRD-005 Step 3A — TAH Core foundation. MURNI ADITIF: tiga tabel baru
-- ("AgentRun", "AgentModelCall", "TahApprovalRequest") beserta index & FK-nya.
-- Tanpa DROP, tanpa ALTER pada tabel lama, tanpa ALTER COLUMN, tanpa
-- INSERT/UPDATE/DELETE (tanpa backfill — keputusan owner D1=C), tanpa GRANT
-- (peran portal `maritime_portal` default-deny, K147 — tak bisa membaca TAH).
-- FK: tenant CASCADE (penghapusan tenant tetap tuntas); voyage/induk/revisi SET NULL.
-- Subjek fitur lama (subjectType/subjectId) SENGAJA tanpa FK (D1).
-- Sengaja TIDAK ada kolom prompt mentah, respons penyedia mentah, atau rahasia (D3).

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "parentRunId" TEXT,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "outcome" TEXT,
    "lateCompletion" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "voyageId" TEXT,
    "inputKind" TEXT,
    "inputHash" TEXT,
    "outputHash" TEXT,
    "resultSummary" TEXT,
    "result" JSONB,
    "resultPurgedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentModelCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "servedModel" TEXT,
    "providerRequestId" TEXT,
    "promptId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "schemaId" TEXT,
    "schemaVersion" TEXT,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "costAmount" DECIMAL(20,10),
    "costCurrency" TEXT,
    "costSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TahApprovalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actionRisk" TEXT NOT NULL,
    "agentRunId" TEXT,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "voyageId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impactSummary" TEXT NOT NULL,
    "risks" JSONB NOT NULL,
    "proposal" JSONB,
    "proposalHash" TEXT NOT NULL,
    "humanEditedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "basisFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "originatorUserId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requiredRoles" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revisionOf" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "executionAttempts" INTEGER NOT NULL DEFAULT 0,
    "executionClaimedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executionErrorCode" TEXT,
    "resultRef" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "payloadPurgedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TahApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_createdAt_idx" ON "AgentRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_agentKey_createdAt_idx" ON "AgentRun"("tenantId", "agentKey", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_subjectType_subjectId_idx" ON "AgentRun"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_resultPurgedAt_finishedAt_idx" ON "AgentRun"("resultPurgedAt", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_tenantId_idempotencyKey_key" ON "AgentRun"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentModelCall_tenantId_createdAt_idx" ON "AgentModelCall"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentModelCall_agentRunId_seq_key" ON "AgentModelCall"("agentRunId", "seq");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_tenantId_status_createdAt_idx" ON "TahApprovalRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_tenantId_executionStatus_idx" ON "TahApprovalRequest"("tenantId", "executionStatus");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_tenantId_subjectType_subjectId_idx" ON "TahApprovalRequest"("tenantId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_status_expiresAt_idx" ON "TahApprovalRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_payloadPurgedAt_finalizedAt_idx" ON "TahApprovalRequest"("payloadPurgedAt", "finalizedAt");

-- CreateIndex
CREATE INDEX "TahApprovalRequest_finalizedAt_idx" ON "TahApprovalRequest"("finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TahApprovalRequest_tenantId_idempotencyKey_key" ON "TahApprovalRequest"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelCall" ADD CONSTRAINT "AgentModelCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentModelCall" ADD CONSTRAINT "AgentModelCall_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TahApprovalRequest" ADD CONSTRAINT "TahApprovalRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TahApprovalRequest" ADD CONSTRAINT "TahApprovalRequest_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TahApprovalRequest" ADD CONSTRAINT "TahApprovalRequest_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TahApprovalRequest" ADD CONSTRAINT "TahApprovalRequest_revisionOf_fkey" FOREIGN KEY ("revisionOf") REFERENCES "TahApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

