-- PRD-004 Step 5B-C2F — retensi lampiran (P36, menutup K110).
--
-- ADITIF SEPENUHNYA: satu kolom nullable + satu indeks. Tanpa DROP, tanpa
-- ALTER COLUMN, tanpa NOT NULL baru, tanpa UPDATE/DELETE, tanpa GRANT.
-- Baris yang sudah ada tetap `purgedAt = NULL` — artinya "berkas fisik masih
-- ada", yang memang keadaan sebenarnya sebelum penyapuan pertama berjalan.

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN "purgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Attachment_purgedAt_deletedAt_idx" ON "Attachment"("purgedAt", "deletedAt");
