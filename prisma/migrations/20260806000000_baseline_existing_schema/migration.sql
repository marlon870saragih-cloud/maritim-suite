-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('TRIAL', 'STARTER', 'PRO', 'FULL_SUITE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PortCallStatus" AS ENUM ('UPCOMING', 'IN_PORT', 'DEPARTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('FAL_BUNDLE', 'FAL_1', 'FAL_2', 'FAL_3', 'FAL_4', 'FAL_5', 'FAL_6', 'FAL_7', 'NOR', 'SOF', 'ARRIVAL_REPORT', 'DEPARTURE_REPORT', 'DAMAGE_REPORT', 'ULLAGE_REPORT', 'PORT_CALL_SUMMARY', 'TIME_SHEET', 'SIB', 'AGENCY_APPOINTMENT', 'SPK', 'LETTER_OF_PROTEST', 'NOTE_OF_PROTEST', 'LETTER_OF_INDEMNITY', 'CREW_CHANGE_NOTICE', 'CREW_SIGN_ON', 'CREW_SIGN_OFF', 'SHORE_PASS', 'MARITIME_DECLARATION_OF_HEALTH', 'NOTICE_OF_ARRIVAL', 'CASH_TO_MASTER', 'LETTER_OF_AUTHORIZATION', 'EPDA', 'FPDA', 'FOA', 'INVOICE', 'PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'BUNKER_REQUISITION', 'BDN', 'DEBIT_NOTE', 'CREDIT_NOTE', 'OFFICIAL_RECEIPT', 'STATEMENT_OF_ACCOUNT', 'BILL_OF_LADING');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'FINAL', 'SENT', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyTagline" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyEmail" TEXT,
    "npwp" TEXT,
    "logoUrl" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankHolder" TEXT,
    "bankSwift" TEXT,
    "signerName" TEXT,
    "signerTitle" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'TRIAL',
    "modulesEnabled" TEXT[],
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "defaultAgencyPct" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "docLanguage" TEXT NOT NULL DEFAULT 'EN',
    "defaultDAFormat" TEXT NOT NULL DEFAULT 'FPDA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "modules" TEXT[],
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "snapToken" TEXT,
    "paidAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imoNumber" TEXT,
    "flag" TEXT,
    "callSign" TEXT,
    "vesselType" TEXT,
    "gt" DOUBLE PRECISION,
    "nrt" DOUBLE PRECISION,
    "loa" DOUBLE PRECISION,
    "beam" DOUBLE PRECISION,
    "maxDraft" DOUBLE PRECISION,
    "yearBuilt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Principal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "npwp" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "contactPerson" TEXT,
    "preferredFormat" TEXT NOT NULL DEFAULT 'FPDA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortCall" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "principalId" TEXT,
    "port" TEXT NOT NULL,
    "portCode" TEXT,
    "eta" TIMESTAMP(3),
    "etd" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "atd" TIMESTAMP(3),
    "cargo" TEXT,
    "cargoQty" TEXT,
    "cargoUnit" TEXT,
    "status" "PortCallStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaritimeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vesselId" TEXT,
    "principalId" TEXT,
    "portCallId" TEXT,
    "docType" "DocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "port" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "exchangeRate" DOUBLE PRECISION,
    "lineItems" JSONB,
    "subtotals" JSONB,
    "grandTotal" DOUBLE PRECISION,
    "agencyPct" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "agencyAmt" DOUBLE PRECISION,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaritimeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Vessel_tenantId_idx" ON "Vessel"("tenantId");

-- CreateIndex
CREATE INDEX "Principal_tenantId_idx" ON "Principal"("tenantId");

-- CreateIndex
CREATE INDEX "PortCall_tenantId_idx" ON "PortCall"("tenantId");

-- CreateIndex
CREATE INDEX "PortCall_status_idx" ON "PortCall"("status");

-- CreateIndex
CREATE INDEX "MaritimeDocument_tenantId_idx" ON "MaritimeDocument"("tenantId");

-- CreateIndex
CREATE INDEX "MaritimeDocument_docType_idx" ON "MaritimeDocument"("docType");

-- CreateIndex
CREATE INDEX "MaritimeDocument_status_idx" ON "MaritimeDocument"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Principal" ADD CONSTRAINT "Principal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCall" ADD CONSTRAINT "PortCall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCall" ADD CONSTRAINT "PortCall_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortCall" ADD CONSTRAINT "PortCall_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Principal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeDocument" ADD CONSTRAINT "MaritimeDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeDocument" ADD CONSTRAINT "MaritimeDocument_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeDocument" ADD CONSTRAINT "MaritimeDocument_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Principal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaritimeDocument" ADD CONSTRAINT "MaritimeDocument_portCallId_fkey" FOREIGN KEY ("portCallId") REFERENCES "PortCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

