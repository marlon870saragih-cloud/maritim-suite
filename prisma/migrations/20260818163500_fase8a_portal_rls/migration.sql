-- Fase 8a / K147 — lapis KEDUA isolasi portal: peran database `maritime_portal`
-- + kebijakan RLS. Ditegakkan database, BUKAN ditegakkan aplikasi — supaya
-- kebocoran menuntut DUA kegagalan yang tak berkorelasi (bug TypeScript DAN
-- kebijakan SQL yang salah), bukan satu (lihat §3 docs/FASE-8-SAAS-COMMERCIAL.md).
--
-- Peran aplikasi yang sudah ada (dipakai lewat DATABASE_URL, mis. `postgres`
-- di dev lokal) TIDAK disentuh migrasi ini sama sekali: superuser Postgres
-- SELALU melewati RLS secara bawaan (properti Postgres, bukan sesuatu yang
-- perlu ditambahkan), jadi 54 route lama & seluruh jalur internal berperilaku
-- identik sebelum-sesudah. Migrasi ini HANYA menambah satu peran baru yang
-- sebelumnya tidak ada.
--
-- ⚠️ Catatan deploy (bukan desain deploy): password di bawah adalah nilai dev
-- lokal, sama semangat DATABASE_URL="postgresql://postgres:postgres@..." yang
-- sudah dipakai proyek ini. WAJIB dirotasi sebelum lingkungan produksi
-- dijalankan — lihat PORTAL_DATABASE_URL di .env.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maritime_portal') THEN
    CREATE ROLE maritime_portal LOGIN PASSWORD 'maritime_portal_dev_2026'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE maritime_suite TO maritime_portal;
GRANT USAGE ON SCHEMA public TO maritime_portal;

-- Baca (K148 MODEL_PORTAL — lima tabel, apa adanya. Tabel lain TIDAK diberi
-- GRANT sama sekali: default-deny, K147).
GRANT SELECT ON TABLE "Invoice"                 TO maritime_portal;
GRANT SELECT ON TABLE "Voyage"                  TO maritime_portal;
GRANT SELECT ON TABLE "PurchaseOrder"           TO maritime_portal;
GRANT SELECT ON TABLE "WorkOrder"               TO maritime_portal;
GRANT SELECT ON TABLE "VendorInvoiceSubmission" TO maritime_portal;

-- Tulis (K148 MODEL_PORTAL_TULIS — satu tabel sejauh 8a, K172).
GRANT INSERT ON TABLE "VendorInvoiceSubmission" TO maritime_portal;

ALTER TABLE "Invoice"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Voyage"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorInvoiceSubmission" ENABLE ROW LEVEL SECURITY;

-- FORCE supaya kebijakan berlaku juga untuk pemilik tabel (bawaannya pemilik
-- tabel selalu lolos RLS) — maritime_portal bukan pemiliknya jadi ini tidak
-- mengubah perilaku untuk peran itu, tapi ditulis eksplisit sebagai jaring
-- pengaman kalau suatu hari kepemilikan tabel berubah.
ALTER TABLE "Invoice"                 FORCE ROW LEVEL SECURITY;
ALTER TABLE "Voyage"                  FORCE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder"           FORCE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder"               FORCE ROW LEVEL SECURITY;
ALTER TABLE "VendorInvoiceSubmission" FORCE ROW LEVEL SECURITY;

-- Kebijakan menyaring DUA sumbu sekaligus (sumbu 1: tenantId, sama seperti
-- tenant-guard.ts; sumbu 2: kolom kunci pihak) DAN jenis pihak (app.party_kind)
-- supaya sesi CUSTOMER tak pernah cocok dengan tabel berkunci vendorId hanya
-- karena kebetulan nilai id-nya sama secara string. current_setting(..., true)
-- — argumen ketiga `true` membuatnya mengembalikan NULL (bukan galat) kalau
-- belum di-SET, sehingga baris manapun TIDAK PERNAH cocok tanpa SET LOCAL
-- lebih dulu (fail-closed, bukti butir 3 K150 — psql tanpa SET app.tenant_id
-- mengembalikan 0 baris, bukan galat izin).
CREATE POLICY portal_isolasi ON "Invoice"
  FOR SELECT TO maritime_portal
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'CUSTOMER'
    AND "customerId" = current_setting('app.party_id', true)
  );

CREATE POLICY portal_isolasi ON "Voyage"
  FOR SELECT TO maritime_portal
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'CUSTOMER'
    AND "customerId" = current_setting('app.party_id', true)
  );

CREATE POLICY portal_isolasi ON "PurchaseOrder"
  FOR SELECT TO maritime_portal
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'VENDOR'
    AND "vendorId" = current_setting('app.party_id', true)
  );

CREATE POLICY portal_isolasi ON "WorkOrder"
  FOR SELECT TO maritime_portal
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'VENDOR'
    AND "vendorId" = current_setting('app.party_id', true)
  );

-- VendorInvoiceSubmission dapat DUA kebijakan (SELECT dan INSERT terpisah) —
-- WITH CHECK pada INSERT memastikan vendor tak bisa mengunggah tagihan atas
-- nama vendorId lain sekalipun lolos pagar aplikasi (lapis kedua, K147).
CREATE POLICY portal_isolasi_baca ON "VendorInvoiceSubmission"
  FOR SELECT TO maritime_portal
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'VENDOR'
    AND "vendorId" = current_setting('app.party_id', true)
  );

CREATE POLICY portal_isolasi_tulis ON "VendorInvoiceSubmission"
  FOR INSERT TO maritime_portal
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
    AND current_setting('app.party_kind', true) = 'VENDOR'
    AND "vendorId" = current_setting('app.party_id', true)
  );
