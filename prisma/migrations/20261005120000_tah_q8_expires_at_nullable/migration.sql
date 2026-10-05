-- WA-1 Step 2D — Q8 (keputusan owner D-2D-01): TahApprovalRequest.expiresAt boleh NULL.
-- NULL = TANPA TTL produk; validasiRegistry (tah-policy.ts) hanya mengizinkannya untuk jenis
-- hanyaNonProduksi berkelas internal (WA_INTERNAL_FAKE_TEST). Satu-satunya perubahan:
-- DROP NOT NULL — tanpa backfill, tanpa ALTER lain. Baris lama tetap memiliki nilai.

-- AlterTable
ALTER TABLE "TahApprovalRequest" ALTER COLUMN "expiresAt" DROP NOT NULL;
