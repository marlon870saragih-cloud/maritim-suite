-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "dataOrigin" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "goLiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Voyage" ADD COLUMN     "dataOrigin" TEXT;
