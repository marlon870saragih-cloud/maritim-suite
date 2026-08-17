-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PurchaseKind" AS ENUM ('PR', 'PO');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CrewChangeStatus" AS ENUM ('PLANNED', 'DOCUMENTS_READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlaybookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT,
    "portCallId" TEXT,
    "disbursementId" TEXT,
    "vendorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "boardOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "anchor" TEXT,
    "offsetHours" INTEGER,
    "dueAt" TIMESTAMP(3),
    "dueAtManual" BOOLEAN NOT NULL DEFAULT false,
    "slaHours" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "sourceTemplateItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portId" TEXT,
    "agencyType" TEXT,
    "vesselType" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "anchor" TEXT NOT NULL DEFAULT 'ETA',
    "offsetHours" INTEGER NOT NULL DEFAULT 0,
    "slaHours" INTEGER,
    "defaultRole" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "kind" TEXT,
    "note" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "voyageId" TEXT,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    "ratedByUserId" TEXT NOT NULL,
    "ratedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT,
    "vendorId" TEXT,
    "sourceRequisitionId" TEXT,
    "kind" "PurchaseKind" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxPct" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryTo" TEXT,
    "neededBy" TIMESTAMP(3),
    "terms" TEXT,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "serviceId" TEXT,
    "woNumber" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "agreedAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "portId" TEXT,
    "plannedDate" TIMESTAMP(3),
    "status" "CrewChangeStatus" NOT NULL DEFAULT 'PLANNED',
    "agentNote" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrewChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewChangeMember" (
    "id" TEXT NOT NULL,
    "crewChangeId" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "rank" TEXT,
    "nationality" TEXT,
    "documentNo" TEXT,
    "flightNo" TEXT,
    "flightAt" TIMESTAMP(3),
    "hotel" TEXT,
    "visaStatus" TEXT,
    "remarks" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrewChangeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoyageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "portCallId" TEXT,
    "eventCode" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "remarks" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VoyageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "template" TEXT,
    "toAddress" TEXT,
    "ccAddress" TEXT,
    "subject" TEXT NOT NULL,
    "bodySnapshot" TEXT,
    "attachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFTED',
    "sentAt" TIMESTAMP(3),
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortPlaybook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "status" "PlaybookStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "summary" TEXT,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PortPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortPlaybookSection" (
    "id" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortPlaybookSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PlaybookStatus" NOT NULL DEFAULT 'DRAFT',
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_tenantId_status_dueAt_idx" ON "Task"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_voyageId_status_boardOrder_idx" ON "Task"("tenantId", "voyageId", "status", "boardOrder");

-- CreateIndex
CREATE INDEX "Task_tenantId_assigneeUserId_status_idx" ON "Task"("tenantId", "assigneeUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_voyageId_sourceTemplateItemId_key" ON "Task"("voyageId", "sourceTemplateItemId");

-- CreateIndex
CREATE INDEX "TaskTemplate_tenantId_portId_idx" ON "TaskTemplate"("tenantId", "portId");

-- CreateIndex
CREATE INDEX "TaskTemplateItem_templateId_idx" ON "TaskTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_entityType_entityId_createdAt_idx" ON "Attachment"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_sha256_idx" ON "Attachment"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_expiresAt_idx" ON "Attachment"("tenantId", "expiresAt");

-- CreateIndex
CREATE INDEX "Comment_tenantId_entityType_entityId_createdAt_idx" ON "Comment"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorRating_tenantId_vendorId_createdAt_idx" ON "VendorRating"("tenantId", "vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_status_idx" ON "PurchaseOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_voyageId_kind_idx" ON "PurchaseOrder"("tenantId", "voyageId", "kind");

-- CreateIndex
CREATE INDEX "PurchaseOrder_tenantId_vendorId_idx" ON "PurchaseOrder"("tenantId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_docNumber_key" ON "PurchaseOrder"("tenantId", "docNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_voyageId_status_idx" ON "WorkOrder"("tenantId", "voyageId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_vendorId_actualEnd_idx" ON "WorkOrder"("tenantId", "vendorId", "actualEnd");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_tenantId_woNumber_key" ON "WorkOrder"("tenantId", "woNumber");

-- CreateIndex
CREATE INDEX "CrewChange_tenantId_voyageId_idx" ON "CrewChange"("tenantId", "voyageId");

-- CreateIndex
CREATE INDEX "CrewChange_tenantId_plannedDate_idx" ON "CrewChange"("tenantId", "plannedDate");

-- CreateIndex
CREATE INDEX "CrewChangeMember_crewChangeId_idx" ON "CrewChangeMember"("crewChangeId");

-- CreateIndex
CREATE INDEX "VoyageEvent_tenantId_voyageId_occurredAt_idx" ON "VoyageEvent"("tenantId", "voyageId", "occurredAt");

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_entityType_entityId_createdAt_idx" ON "EmailLog"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "PortPlaybook_tenantId_portId_status_idx" ON "PortPlaybook"("tenantId", "portId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortPlaybook_tenantId_portId_version_key" ON "PortPlaybook"("tenantId", "portId", "version");

-- CreateIndex
CREATE INDEX "PortPlaybookSection_playbookId_idx" ON "PortPlaybookSection"("playbookId");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_tenantId_status_idx" ON "KnowledgeArticle"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_dedupeKey_key" ON "Notification"("tenantId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_portCallId_fkey" FOREIGN KEY ("portCallId") REFERENCES "PortCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "Disbursement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_portId_fkey" FOREIGN KEY ("portId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplateItem" ADD CONSTRAINT "TaskTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRating" ADD CONSTRAINT "VendorRating_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRating" ADD CONSTRAINT "VendorRating_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewChange" ADD CONSTRAINT "CrewChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewChange" ADD CONSTRAINT "CrewChange_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewChange" ADD CONSTRAINT "CrewChange_portId_fkey" FOREIGN KEY ("portId") REFERENCES "Port"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewChangeMember" ADD CONSTRAINT "CrewChangeMember_crewChangeId_fkey" FOREIGN KEY ("crewChangeId") REFERENCES "CrewChange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageEvent" ADD CONSTRAINT "VoyageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageEvent" ADD CONSTRAINT "VoyageEvent_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageEvent" ADD CONSTRAINT "VoyageEvent_portCallId_fkey" FOREIGN KEY ("portCallId") REFERENCES "PortCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortPlaybook" ADD CONSTRAINT "PortPlaybook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortPlaybook" ADD CONSTRAINT "PortPlaybook_portId_fkey" FOREIGN KEY ("portId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortPlaybookSection" ADD CONSTRAINT "PortPlaybookSection_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "PortPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

