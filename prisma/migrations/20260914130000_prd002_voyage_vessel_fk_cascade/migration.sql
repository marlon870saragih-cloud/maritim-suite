-- PRD-002 Step 2 — perbaikan regresi yang ditemukan uji regresi SEBELUM rilis.
--
-- MASALAH: VoyageVessel_vesselId_fkey dibuat ON DELETE RESTRICT, dan penghapusan tenant
-- yang punya voyage GAGAL (P2003) — merusak offboarding K188 (prisma/delete-tenant.mjs).
-- PostgreSQL menjalankan tiap aksi cascade sebagai statement internal tersendiri: cascade
-- SATU tingkat Tenant→Vessel selesai (termasuk pemeriksaan FK-nya) SEBELUM cascade DUA
-- tingkat Tenant→Voyage→VoyageVessel menghapus baris anaknya. Karena itu RESTRICT maupun
-- NO ACTION sama-sama gagal; dibuktikan dengan eksperimen ber-ROLLBACK di DB dev
-- (NO ACTION → violates foreign key constraint; CASCADE → tenant terhapus bersih).
--
-- PERBAIKAN: ON DELETE CASCADE. Konsekuensi yang disengaja & ditangani:
--   * Penolakan "kapal masih dipakai voyage" kini DITEGAKKAN APLIKASI:
--     DELETE /api/vessels/:id memeriksa Voyage.vesselId DAN VoyageVessel sebelum menghapus → 409.
--   * Kapal UTAMA tetap juga dijaga database oleh Voyage_vesselId_fkey (RESTRICT, tidak disentuh).
--
-- Hanya menukar constraint; tidak ada tabel/kolom/baris yang dihapus atau diubah.

-- DropForeignKey
ALTER TABLE "VoyageVessel" DROP CONSTRAINT "VoyageVessel_vesselId_fkey";

-- AddForeignKey
ALTER TABLE "VoyageVessel" ADD CONSTRAINT "VoyageVessel_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
