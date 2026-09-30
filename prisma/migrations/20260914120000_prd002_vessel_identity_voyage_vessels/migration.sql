-- PRD-002 Step 2 — Domain Foundation (Tribuana Automation Hub).
--
-- ADITIF SEPENUHNYA: 0 DROP, 0 ALTER COLUMN, 0 kolom lama diubah. `Voyage.vesselId`
-- TIDAK disentuh dan tetap satu-satunya penentu kapal utama.
--
-- 1. Vessel: tiga kolom nullable (mmsi, mmsiSource, mmsiVerifiedAt) + unique
--    (tenantId, mmsi). Semua baris lama mendapat NULL — tidak ada MMSI yang dikarang.
--    Dua NULL tak pernah bertabrakan di PostgreSQL, jadi kapal tanpa MMSI tetap sah.
-- 2. VoyageVessel: tabel anak Voyage (pola Cargo). FK voyage ON DELETE CASCADE
--    (baris anak tak bermakna tanpa voyage; voyage sendiri hanya di-soft-delete
--    oleh aplikasi), FK vessel ON DELETE RESTRICT (sama dengan Voyage_vesselId_fkey).
-- 3. Backfill: SATU baris per voyage untuk kapal utamanya (Voyage.vesselId).

-- AlterTable
ALTER TABLE "Vessel" ADD COLUMN     "mmsi" TEXT,
ADD COLUMN     "mmsiSource" TEXT,
ADD COLUMN     "mmsiVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VoyageVessel" (
    "id" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "role" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoyageVessel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoyageVessel_vesselId_idx" ON "VoyageVessel"("vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "VoyageVessel_voyageId_vesselId_key" ON "VoyageVessel"("voyageId", "vesselId");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_tenantId_mmsi_key" ON "Vessel"("tenantId", "mmsi");

-- AddForeignKey
ALTER TABLE "VoyageVessel" ADD CONSTRAINT "VoyageVessel_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageVessel" ADD CONSTRAINT "VoyageVessel_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill (PRD-002 Step 2)
--   * Deterministik: id = 'vvbf_' || Voyage.id — jalan ulang menghasilkan id yang sama.
--   * Idempoten: ON CONFLICT (voyageId, vesselId) DO NOTHING.
--   * Mencakup SEMUA voyage, termasuk yang sudah di-soft-delete (deletedAt terisi),
--     supaya invarian "kapal utama selalu punya baris" berlaku seragam.
--   * role = NULL (tidak diketahui — tidak ditebak), sortOrder = 0.
--   * Voyage.vesselId NOT NULL + FK RESTRICT menjamin setiap baris sumber sah.
INSERT INTO "VoyageVessel" ("id", "voyageId", "vesselId", "role", "sortOrder", "createdAt", "updatedAt")
SELECT 'vvbf_' || v."id", v."id", v."vesselId", NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Voyage" v
ON CONFLICT ("voyageId", "vesselId") DO NOTHING;
