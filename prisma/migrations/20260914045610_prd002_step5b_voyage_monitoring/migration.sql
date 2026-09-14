-- CreateTable
CREATE TABLE "MonitoredVoyage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByUserId" TEXT NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredVoyage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "voyagesChecked" INTEGER NOT NULL DEFAULT 0,
    "voyagesFailed" INTEGER NOT NULL DEFAULT 0,
    "signalsCreated" INTEGER NOT NULL DEFAULT 0,
    "signalsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,

    CONSTRAINT "MonitoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "sourceAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reviewState" TEXT NOT NULL DEFAULT 'OPEN',
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoredVoyage_tenantId_enabled_idx" ON "MonitoredVoyage"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredVoyage_tenantId_voyageId_key" ON "MonitoredVoyage"("tenantId", "voyageId");

-- CreateIndex
CREATE INDEX "MonitoringRun_tenantId_startedAt_idx" ON "MonitoringRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "MonitoringSignal_tenantId_reviewState_detectedAt_idx" ON "MonitoringSignal"("tenantId", "reviewState", "detectedAt");

-- CreateIndex
CREATE INDEX "MonitoringSignal_tenantId_voyageId_detectedAt_idx" ON "MonitoringSignal"("tenantId", "voyageId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringSignal_tenantId_dedupeKey_key" ON "MonitoringSignal"("tenantId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "MonitoredVoyage" ADD CONSTRAINT "MonitoredVoyage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredVoyage" ADD CONSTRAINT "MonitoredVoyage_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSignal" ADD CONSTRAINT "MonitoringSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSignal" ADD CONSTRAINT "MonitoringSignal_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSignal" ADD CONSTRAINT "MonitoringSignal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MonitoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
