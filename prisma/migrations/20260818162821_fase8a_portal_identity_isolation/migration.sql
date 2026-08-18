-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "sharedAt" TIMESTAMP(3),
ADD COLUMN     "sharedByUserId" TEXT,
ADD COLUMN     "sharedToPortal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gateway" TEXT,
ADD COLUMN     "gatewayRef" TEXT,
ADD COLUMN     "payMethod" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "addonsEnabled" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "brandPrimaryColor" TEXT,
ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "logoAttachmentId" TEXT,
ADD COLUMN     "onboardingState" JSONB,
ADD COLUMN     "portalSlug" TEXT,
ADD COLUMN     "preferredGateway" TEXT;

-- CreateTable
CREATE TABLE "PortalUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "passwordSetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "pihak" TEXT NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pihak" TEXT NOT NULL,
    "customerId" TEXT,
    "vendorId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoiceItem" (
    "id" TEXT NOT NULL,
    "subscriptionInvoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SubscriptionInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvoiceSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "workOrderId" TEXT,
    "voyageId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "linkedDisbursementItemId" TEXT,
    "submittedByPortalUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorInvoiceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarineDataCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "kunci" TEXT NOT NULL,
    "penyedia" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "diambilPada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "berlakuSampai" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarineDataCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "meta" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "subjek" TEXT NOT NULL,
    "konteks" TEXT,
    "uraian" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BARU',
    "hasil" TEXT,
    "ditanganiUserId" TEXT,
    "selesaiPada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalUser_tenantId_isActive_idx" ON "PortalUser"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PortalUser_tenantId_email_key" ON "PortalUser"("tenantId", "email");

-- CreateIndex
CREATE INDEX "PortalAccess_tenantId_customerId_idx" ON "PortalAccess"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "PortalAccess_tenantId_vendorId_idx" ON "PortalAccess"("tenantId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccess_portalUserId_pihak_customerId_vendorId_key" ON "PortalAccess"("portalUserId", "pihak", "customerId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvitation_tokenHash_key" ON "PortalInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalInvitation_tenantId_email_idx" ON "PortalInvitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_paymentId_key" ON "SubscriptionInvoice"("paymentId");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_tenantId_issuedAt_idx" ON "SubscriptionInvoice"("tenantId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_tenantId_invoiceNumber_key" ON "SubscriptionInvoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SubscriptionInvoiceItem_subscriptionInvoiceId_idx" ON "SubscriptionInvoiceItem"("subscriptionInvoiceId");

-- CreateIndex
CREATE INDEX "VendorInvoiceSubmission_tenantId_vendorId_status_idx" ON "VendorInvoiceSubmission"("tenantId", "vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorInvoiceSubmission_tenantId_status_createdAt_idx" ON "VendorInvoiceSubmission"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MarineDataCache_tenantId_berlakuSampai_idx" ON "MarineDataCache"("tenantId", "berlakuSampai");

-- CreateIndex
CREATE UNIQUE INDEX "MarineDataCache_tenantId_jenis_kunci_penyedia_key" ON "MarineDataCache"("tenantId", "jenis", "kunci", "penyedia");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_nama_createdAt_idx" ON "UsageEvent"("tenantId", "nama", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "DataRequest_tenantId_status_createdAt_idx" ON "DataRequest"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_sharedToPortal_idx" ON "Attachment"("tenantId", "sharedToPortal");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gateway_orderId_key" ON "Payment"("gateway", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_portalSlug_key" ON "Tenant"("portalSlug");

-- AddForeignKey
ALTER TABLE "PortalUser" ADD CONSTRAINT "PortalUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccess" ADD CONSTRAINT "PortalAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccess" ADD CONSTRAINT "PortalAccess_portalUserId_fkey" FOREIGN KEY ("portalUserId") REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccess" ADD CONSTRAINT "PortalAccess_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccess" ADD CONSTRAINT "PortalAccess_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvitation" ADD CONSTRAINT "PortalInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoiceItem" ADD CONSTRAINT "SubscriptionInvoiceItem_subscriptionInvoiceId_fkey" FOREIGN KEY ("subscriptionInvoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceSubmission" ADD CONSTRAINT "VendorInvoiceSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceSubmission" ADD CONSTRAINT "VendorInvoiceSubmission_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarineDataCache" ADD CONSTRAINT "MarineDataCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

