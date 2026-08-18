-- AlterTable
ALTER TABLE "DisbursementItem" ADD COLUMN     "sourcePurchaseOrderId" TEXT,
ADD COLUMN     "sourceWorkOrderId" TEXT;

-- CreateIndex
CREATE INDEX "DisbursementItem_sourcePurchaseOrderId_idx" ON "DisbursementItem"("sourcePurchaseOrderId");

-- CreateIndex
CREATE INDEX "DisbursementItem_sourceWorkOrderId_idx" ON "DisbursementItem"("sourceWorkOrderId");
