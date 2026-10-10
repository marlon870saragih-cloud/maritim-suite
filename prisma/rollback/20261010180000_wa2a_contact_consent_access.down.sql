-- ROLLBACK migrasi 20261010180000_wa2a_contact_consent_access (WA-2a Step 2B).
--
-- HANYA untuk database LOKAL/UJI sekali pakai yang TIDAK berisi data nyata.
-- JANGAN dijalankan pada database yang memuat kontak/consent/grant nyata: baris consent & bukti
-- verifikasi adalah data pribadi dan bukti hukum. Bila data nyata sudah ada, rollback = matikan flag
-- fitur (tabel dibiarkan) dan minta keputusan owner.
--
-- Hanya menghapus objek yang dibuat migrasi ini; tabel lama tidak disentuh. Revert kode (schema.prisma)
-- wajib dilakukan bersamaan. Diuji oleh prosedur di docs/whatsapp/WA-2a-B-EVIDENCE.md.
BEGIN;
DROP TABLE IF EXISTS "VoyageScheduleConfirmation";
DROP TABLE IF EXISTS "WaClientMessage";
DROP TABLE IF EXISTS "WaPrincipalAccessGrantVoyage";
DROP TABLE IF EXISTS "WaPrincipalAccessGrant";
DROP TABLE IF EXISTS "WaConsentEvent";
DROP TABLE IF EXISTS "WaConsentState";
DROP TABLE IF EXISTS "WaContact";
DROP FUNCTION IF EXISTS "wa2a_tolak_hapus_kecuali_tenant"();
DROP FUNCTION IF EXISTS "wa2a_contact_guard"();
DROP FUNCTION IF EXISTS "wa2a_consent_state_guard"();
DROP FUNCTION IF EXISTS "wa2a_append_only"();
DROP FUNCTION IF EXISTS "wa2a_grant_guard"();
DROP FUNCTION IF EXISTS "wa2a_grant_voyage_guard"();
DROP FUNCTION IF EXISTS "wa2a_client_message_guard"();
DROP FUNCTION IF EXISTS "wa2a_schedule_confirmation_guard"();
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261010180000_wa2a_contact_consent_access';
COMMIT;
