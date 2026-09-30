-- CreateTable
CREATE TABLE "AisObservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "mmsi" TEXT NOT NULL,
    "providerRef" TEXT,
    "positionAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "sogKnots" DOUBLE PRECISION,
    "cogDeg" DOUBLE PRECISION,
    "headingDeg" INTEGER,
    "navStatus" INTEGER,
    "positionAccuracy" BOOLEAN,
    "sourceType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "ageSecAtFetch" INTEGER NOT NULL,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AisObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AisPollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "vesselsEligible" INTEGER NOT NULL DEFAULT 0,
    "vesselsSkippedUnverified" INTEGER NOT NULL DEFAULT 0,
    "vesselsRequested" INTEGER NOT NULL DEFAULT 0,
    "vesselsCapped" INTEGER NOT NULL DEFAULT 0,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "observationsAccepted" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejectedInvalid" INTEGER NOT NULL DEFAULT 0,
    "rejectedStale" INTEGER NOT NULL DEFAULT 0,
    "rejectedMismatch" INTEGER NOT NULL DEFAULT 0,
    "noData" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,

    CONSTRAINT "AisPollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AisProviderState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "outageStartedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "backoffUntil" TIMESTAMP(3),
    "rateLimitResetAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AisProviderState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AisObservation_tenantId_vesselId_positionAt_idx" ON "AisObservation"("tenantId", "vesselId", "positionAt" DESC);

-- CreateIndex
CREATE INDEX "AisObservation_tenantId_fetchedAt_idx" ON "AisObservation"("tenantId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AisObservation_tenantId_vesselId_provider_positionAt_key" ON "AisObservation"("tenantId", "vesselId", "provider", "positionAt");

-- CreateIndex
CREATE INDEX "AisPollRun_tenantId_startedAt_idx" ON "AisPollRun"("tenantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AisProviderState_tenantId_provider_key" ON "AisProviderState"("tenantId", "provider");

-- AddForeignKey
ALTER TABLE "AisObservation" ADD CONSTRAINT "AisObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AisObservation" ADD CONSTRAINT "AisObservation_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AisObservation" ADD CONSTRAINT "AisObservation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AisPollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AisPollRun" ADD CONSTRAINT "AisPollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AisProviderState" ADD CONSTRAINT "AisProviderState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
