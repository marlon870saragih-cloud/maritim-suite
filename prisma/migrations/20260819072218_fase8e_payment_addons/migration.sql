-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "addons" TEXT[] DEFAULT ARRAY[]::TEXT[];

