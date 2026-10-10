-- WA-2a Step 2B — fondasi kontak WhatsApp, consent, akses principal, pesan klien, konfirmasi jadwal.
-- Desain: WA-2a-A rev2 (owner: DB-1, DB-2, DB-3, B-5 LOCAL ONLY). Bukti: docs/whatsapp/WA-2a-B-EVIDENCE.md.
--
-- MURNI ADITIF: hanya CREATE TABLE/INDEX, FK & CHECK pada tabel BARU, dan trigger yang dipasang pada
-- tabel BARU (membaca tabel lama, tidak pernah mengubahnya). Tidak ada ALTER/DROP pada tabel lama,
-- tanpa backfill, tanpa data seed, tanpa GRANT/role, tanpa kredensial, tanpa nomor telepon.
-- Inert: belum ada kode aplikasi yang membaca/menulis tabel ini (Step 2B = schema saja).
--
-- Penegakan DATABASE (bukan hanya service):
--   CHECK (satu baris)   : WaContact_party_xor, WaContact_active_key, WaGrant_maker_checker,
--                          WaGrant_categories_allowed, VoyageScheduleConfirmation_field.
--   FK komposit          : (tenantId, contactId) / (tenantId, grantId) / (tenantId, contactId, principalId)
--                          → baris anak tak dapat menunjuk kontak/grant tenant lain atau principal lain.
--   Trigger lintas tabel : lihat bagian TRIGGER di bawah (tabel lama hanya DIBACA).
--   WaClientMessage.candidateId SENGAJA tanpa FK (model WA-1 CommunicationCandidate tidak disentuh);
--   keberadaan & tenant kandidat ditegakkan trigger saat INSERT.
-- Yang TETAP tugas service (tidak diklaim ditegakkan DB): format E.164, peran pemutus grant
-- (ADMIN/MANAJER_OPERASI), validitas Voyage.principalId SETELAH grant dibuat (dicek ulang resolver),
-- kedaluwarsa verifikasi/grant, consent saat kirim, freshness.
--
-- FK ke Customer/Principal = NO ACTION (disetujui owner sebagai pengganti RESTRICT): keduanya MENOLAK hapus
-- pihak yang masih punya kontak/grant. Bedanya: RESTRICT diperiksa SEKETIKA per baris, NO ACTION di AKHIR
-- statement — hapus TENANT (cascade ke pihak & kontak dalam statement yang sama) tidak bergantung pada urutan
-- cascade. Catatan jujur: eksperimen check-wa2a-schema.mjs menunjukkan RESTRICT pun berhasil menghapus tenant
-- pada PG16 untuk data uji; NO ACTION dipilih karena lebih tahan terhadap urutan cascade, bukan karena RESTRICT
-- terbukti gagal.

-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "customerId" TEXT,
    "principalId" TEXT,
    "e164" TEXT NOT NULL,
    "activeE164Key" TEXT,
    "displayName" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verificationMethod" TEXT,
    "verificationEvidence" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedByUserId" TEXT,
    "deactivationReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConsentState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NONE',
    "lastEventId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConsentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConsentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPrincipalAccessGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "dataCategories" TEXT[],
    "identityEvidence" TEXT NOT NULL,
    "relationshipEvidence" TEXT NOT NULL,
    "authorityEvidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaPrincipalAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPrincipalAccessGrantVoyage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaPrincipalAccessGrantVoyage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaClientMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "contactId" TEXT NOT NULL,
    "recipientE164Snapshot" TEXT NOT NULL,
    "partyTypeSnapshot" TEXT NOT NULL,
    "partyIdSnapshot" TEXT NOT NULL,
    "grantIdSnapshot" TEXT,
    "consentStateVersion" INTEGER NOT NULL,
    "logicalMessageKey" TEXT NOT NULL,
    "activeKey" TEXT,
    "successKey" TEXT,
    "language" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "snapshotFingerprint" TEXT NOT NULL,
    "freshnessVerdict" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "reasonCode" TEXT,
    "previewedAt" TIMESTAMP(3),
    "previewedByUserId" TEXT,
    "approvalRequestId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaClientMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoyageScheduleConfirmation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voyageId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "confirmedValue" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedByUserId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedByUserId" TEXT,
    "invalidatedReason" TEXT,

    CONSTRAINT "VoyageScheduleConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaContact_tenantId_partyType_customerId_idx" ON "WaContact"("tenantId", "partyType", "customerId");

-- CreateIndex
CREATE INDEX "WaContact_tenantId_partyType_principalId_idx" ON "WaContact"("tenantId", "partyType", "principalId");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_tenantId_activeE164Key_key" ON "WaContact"("tenantId", "activeE164Key");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_tenantId_id_key" ON "WaContact"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_tenantId_id_principalId_key" ON "WaContact"("tenantId", "id", "principalId");

-- CreateIndex
CREATE UNIQUE INDEX "WaConsentState_contactId_purpose_key" ON "WaConsentState"("contactId", "purpose");

-- CreateIndex
CREATE INDEX "WaConsentEvent_tenantId_contactId_occurredAt_idx" ON "WaConsentEvent"("tenantId", "contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "WaPrincipalAccessGrant_tenantId_contactId_status_idx" ON "WaPrincipalAccessGrant"("tenantId", "contactId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WaPrincipalAccessGrant_tenantId_id_key" ON "WaPrincipalAccessGrant"("tenantId", "id");

-- CreateIndex
CREATE INDEX "WaPrincipalAccessGrantVoyage_tenantId_voyageId_idx" ON "WaPrincipalAccessGrantVoyage"("tenantId", "voyageId");

-- CreateIndex
CREATE UNIQUE INDEX "WaPrincipalAccessGrantVoyage_grantId_voyageId_key" ON "WaPrincipalAccessGrantVoyage"("grantId", "voyageId");

-- CreateIndex
CREATE INDEX "WaClientMessage_tenantId_contactId_state_idx" ON "WaClientMessage"("tenantId", "contactId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "WaClientMessage_candidateId_revision_key" ON "WaClientMessage"("candidateId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "WaClientMessage_tenantId_activeKey_key" ON "WaClientMessage"("tenantId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "WaClientMessage_tenantId_successKey_key" ON "WaClientMessage"("tenantId", "successKey");

-- CreateIndex
CREATE INDEX "VoyageScheduleConfirmation_tenantId_voyageId_field_confirme_idx" ON "VoyageScheduleConfirmation"("tenantId", "voyageId", "field", "confirmedAt");

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Principal"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConsentState" ADD CONSTRAINT "WaConsentState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConsentState" ADD CONSTRAINT "WaConsentState_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "WaContact"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConsentEvent" ADD CONSTRAINT "WaConsentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConsentEvent" ADD CONSTRAINT "WaConsentEvent_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "WaContact"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrant" ADD CONSTRAINT "WaPrincipalAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrant" ADD CONSTRAINT "WaPrincipalAccessGrant_tenantId_contactId_principalId_fkey" FOREIGN KEY ("tenantId", "contactId", "principalId") REFERENCES "WaContact"("tenantId", "id", "principalId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrant" ADD CONSTRAINT "WaPrincipalAccessGrant_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "Principal"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrantVoyage" ADD CONSTRAINT "WaPrincipalAccessGrantVoyage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrantVoyage" ADD CONSTRAINT "WaPrincipalAccessGrantVoyage_tenantId_grantId_fkey" FOREIGN KEY ("tenantId", "grantId") REFERENCES "WaPrincipalAccessGrant"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPrincipalAccessGrantVoyage" ADD CONSTRAINT "WaPrincipalAccessGrantVoyage_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaClientMessage" ADD CONSTRAINT "WaClientMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaClientMessage" ADD CONSTRAINT "WaClientMessage_tenantId_contactId_fkey" FOREIGN KEY ("tenantId", "contactId") REFERENCES "WaContact"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageScheduleConfirmation" ADD CONSTRAINT "VoyageScheduleConfirmation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoyageScheduleConfirmation" ADD CONSTRAINT "VoyageScheduleConfirmation_voyageId_fkey" FOREIGN KEY ("voyageId") REFERENCES "Voyage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================================================================
-- CHECK (DB-2) — semua aturan satu baris.
-- =====================================================================================================
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_party_xor" CHECK (
  ("partyType" = 'CUSTOMER' AND "customerId" IS NOT NULL AND "principalId" IS NULL)
  OR ("partyType" = 'PRINCIPAL' AND "principalId" IS NOT NULL AND "customerId" IS NULL)
);
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_active_key" CHECK (
  ("status" = 'ACTIVE' AND "activeE164Key" IS NOT NULL AND "activeE164Key" = "e164")
  OR ("status" <> 'ACTIVE' AND "activeE164Key" IS NULL)
);
ALTER TABLE "WaPrincipalAccessGrant" ADD CONSTRAINT "WaGrant_maker_checker" CHECK (
  "decidedByUserId" IS NULL OR "decidedByUserId" <> "requestedByUserId"
);
ALTER TABLE "WaPrincipalAccessGrant" ADD CONSTRAINT "WaGrant_categories_allowed" CHECK (
  cardinality("dataCategories") > 0
  AND "dataCategories" <@ ARRAY['STATUS', 'SCHEDULE_ESTIMATE', 'SCHEDULE_ACTUAL', 'MILESTONE']::TEXT[]
);
ALTER TABLE "VoyageScheduleConfirmation" ADD CONSTRAINT "VoyageScheduleConfirmation_field" CHECK (
  "field" IN ('eta', 'etb', 'etd')
);

-- =====================================================================================================
-- TRIGGER — aturan lintas baris/tabel. Dipasang HANYA pada tabel baru. Galat memakai SQLSTATE 23514
-- (check_violation) dengan pesan berawalan kode WA2A_* supaya service dapat memetakannya.
-- Baris tabel lama yang menjadi dasar pemeriksaan dikunci FOR SHARE sampai transaksi selesai: hapus/ubah
-- bersamaan (kandidat, voyage, pihak) menunggu, sehingga tidak ada celah balapan antara cek dan commit.
-- =====================================================================================================

-- Hapus hanya boleh sebagai bagian dari penghapusan TENANT (cascade). Hapus langsung baris bukti/identitas
-- ditolak → audit tidak dapat hilang diam-diam. Tenant yang sedang dihapus sudah tak terlihat di sini.
CREATE FUNCTION "wa2a_tolak_hapus_kecuali_tenant"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Tenant" WHERE "id" = OLD."tenantId") THEN
    RAISE EXCEPTION 'WA2A_DELETE_FORBIDDEN: % hanya terhapus bersama tenant-nya', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;

-- WaContact: tenant pihak = tenant kontak; identitas (tenant, pihak, nomor) tak dapat diubah;
-- INACTIVE terminal.
CREATE FUNCTION "wa2a_contact_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."partyType" IS DISTINCT FROM OLD."partyType"
       OR NEW."customerId" IS DISTINCT FROM OLD."customerId" OR NEW."principalId" IS DISTINCT FROM OLD."principalId"
       OR NEW."e164" IS DISTINCT FROM OLD."e164" THEN
      RAISE EXCEPTION 'WA2A_CONTACT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" = 'INACTIVE' AND NEW."status" <> 'INACTIVE' THEN
      RAISE EXCEPTION 'WA2A_CONTACT_INACTIVE_TERMINAL' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."partyType" = 'CUSTOMER' THEN
    SELECT "tenantId" INTO t FROM "Customer" WHERE "id" = NEW."customerId" FOR SHARE;
  ELSIF NEW."partyType" = 'PRINCIPAL' THEN
    SELECT "tenantId" INTO t FROM "Principal" WHERE "id" = NEW."principalId" FOR SHARE;
  END IF;
  IF t IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'WA2A_TENANT_MISMATCH: pihak kontak bukan milik tenant ini' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- WaConsentState: kontak/tujuan/tenant tak dapat diubah.
CREATE FUNCTION "wa2a_consent_state_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
     OR NEW."purpose" IS DISTINCT FROM OLD."purpose" THEN
    RAISE EXCEPTION 'WA2A_CONSENT_STATE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- WaConsentEvent: APPEND-ONLY.
CREATE FUNCTION "wa2a_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'WA2A_APPEND_ONLY: % tidak dapat diubah', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

-- WaPrincipalAccessGrant: dibuat PENDING; transisi PENDING→ACTIVE|REJECTED, ACTIVE→REVOKED|EXPIRED;
-- ACTIVE/REJECTED wajib pemutus + waktu; identitas & bukti & pemutus tak dapat diubah; terminal tak dapat dibuka.
CREATE FUNCTION "wa2a_grant_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' OR NEW."decidedByUserId" IS NOT NULL OR NEW."decidedAt" IS NOT NULL
       OR NEW."revokedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'WA2A_GRANT_MUST_START_PENDING' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
     OR NEW."principalId" IS DISTINCT FROM OLD."principalId" OR NEW."dataCategories" IS DISTINCT FROM OLD."dataCategories"
     OR NEW."identityEvidence" IS DISTINCT FROM OLD."identityEvidence"
     OR NEW."relationshipEvidence" IS DISTINCT FROM OLD."relationshipEvidence"
     OR NEW."authorityEvidence" IS DISTINCT FROM OLD."authorityEvidence"
     OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
     OR (OLD."decidedByUserId" IS NOT NULL AND NEW."decidedByUserId" IS DISTINCT FROM OLD."decidedByUserId")
     OR (OLD."decidedAt" IS NOT NULL AND NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt") THEN
    RAISE EXCEPTION 'WA2A_GRANT_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT ((OLD."status" = 'PENDING' AND NEW."status" IN ('ACTIVE', 'REJECTED'))
            OR (OLD."status" = 'ACTIVE' AND NEW."status" IN ('REVOKED', 'EXPIRED'))) THEN
      RAISE EXCEPTION 'WA2A_GRANT_TRANSITION_FORBIDDEN: % -> %', OLD."status", NEW."status" USING ERRCODE = '23514';
    END IF;
    IF NEW."status" IN ('ACTIVE', 'REJECTED') AND (NEW."decidedByUserId" IS NULL OR NEW."decidedAt" IS NULL) THEN
      RAISE EXCEPTION 'WA2A_GRANT_DECISION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" = 'REVOKED' AND (NEW."revokedAt" IS NULL OR NEW."revokedByUserId" IS NULL OR NEW."revokeReason" IS NULL) THEN
      RAISE EXCEPTION 'WA2A_GRANT_REVOKE_REASON_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD."status" IN ('REJECTED', 'REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'WA2A_GRANT_TERMINAL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- WaPrincipalAccessGrantVoyage: baris tak dapat diubah; hanya boleh DITAMBAH selama grant PENDING
-- (perluasan = grant baru); voyage wajib tenant sama, tidak terhapus, dan Voyage.principalId = grant.principalId.
CREATE FUNCTION "wa2a_grant_voyage_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g_status TEXT; g_principal TEXT; v_tenant TEXT; v_principal TEXT; v_deleted TIMESTAMP(3);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'WA2A_APPEND_ONLY: WaPrincipalAccessGrantVoyage tidak dapat diubah' USING ERRCODE = '23514';
  END IF;
  SELECT "status", "principalId" INTO g_status, g_principal FROM "WaPrincipalAccessGrant"
    WHERE "id" = NEW."grantId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF g_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'WA2A_GRANT_SCOPE_LOCKED: cakupan hanya dapat ditambah selama grant PENDING' USING ERRCODE = '23514';
  END IF;
  SELECT "tenantId", "principalId", "deletedAt" INTO v_tenant, v_principal, v_deleted FROM "Voyage" WHERE "id" = NEW."voyageId" FOR SHARE;
  IF v_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'WA2A_TENANT_MISMATCH: voyage bukan milik tenant ini' USING ERRCODE = '23514';
  END IF;
  IF v_principal IS DISTINCT FROM g_principal OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'WA2A_GRANT_VOYAGE_NOT_AUTHORIZED: voyage bukan milik principal grant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- WaClientMessage: kandidat (tanpa FK, pola approvalRequestId WA-1) wajib ADA & tenant sama; snapshot pihak = pihak kontak saat INSERT; snapshot tak dapat diubah.
CREATE FUNCTION "wa2a_client_message_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c_tenant TEXT; k_type TEXT; k_party TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."candidateId" IS DISTINCT FROM OLD."candidateId"
       OR NEW."revision" IS DISTINCT FROM OLD."revision" OR NEW."contactId" IS DISTINCT FROM OLD."contactId"
       OR NEW."recipientE164Snapshot" IS DISTINCT FROM OLD."recipientE164Snapshot"
       OR NEW."partyTypeSnapshot" IS DISTINCT FROM OLD."partyTypeSnapshot"
       OR NEW."partyIdSnapshot" IS DISTINCT FROM OLD."partyIdSnapshot"
       OR NEW."grantIdSnapshot" IS DISTINCT FROM OLD."grantIdSnapshot"
       OR NEW."consentStateVersion" IS DISTINCT FROM OLD."consentStateVersion"
       OR NEW."logicalMessageKey" IS DISTINCT FROM OLD."logicalMessageKey"
       OR NEW."language" IS DISTINCT FROM OLD."language" OR NEW."templateId" IS DISTINCT FROM OLD."templateId"
       OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion" OR NEW."body" IS DISTINCT FROM OLD."body"
       OR NEW."fields" IS DISTINCT FROM OLD."fields" OR NEW."sourceFingerprint" IS DISTINCT FROM OLD."sourceFingerprint"
       OR NEW."snapshotFingerprint" IS DISTINCT FROM OLD."snapshotFingerprint"
       OR NEW."freshnessVerdict" IS DISTINCT FROM OLD."freshnessVerdict" OR NEW."mode" IS DISTINCT FROM OLD."mode" THEN
      RAISE EXCEPTION 'WA2A_MESSAGE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT "tenantId" INTO c_tenant FROM "CommunicationCandidate" WHERE "id" = NEW."candidateId" FOR SHARE;
  IF c_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'WA2A_TENANT_MISMATCH: kandidat tidak ada atau bukan milik tenant ini' USING ERRCODE = '23514';
  END IF;
  SELECT "partyType", COALESCE("customerId", "principalId") INTO k_type, k_party FROM "WaContact"
    WHERE "id" = NEW."contactId" AND "tenantId" = NEW."tenantId";
  IF k_type IS DISTINCT FROM NEW."partyTypeSnapshot" OR k_party IS DISTINCT FROM NEW."partyIdSnapshot" THEN
    RAISE EXCEPTION 'WA2A_MESSAGE_PARTY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- VoyageScheduleConfirmation: voyage = tenant sama; append-only kecuali SATU kali invalidasi lengkap.
CREATE FUNCTION "wa2a_schedule_confirmation_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_tenant TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "tenantId" INTO v_tenant FROM "Voyage" WHERE "id" = NEW."voyageId" FOR SHARE;
    IF v_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'WA2A_TENANT_MISMATCH: voyage bukan milik tenant ini' USING ERRCODE = '23514';
    END IF;
    IF NEW."invalidatedAt" IS NOT NULL OR NEW."invalidatedByUserId" IS NOT NULL OR NEW."invalidatedReason" IS NOT NULL THEN
      RAISE EXCEPTION 'WA2A_CONFIRMATION_INVALID_AT_INSERT' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."voyageId" IS DISTINCT FROM OLD."voyageId"
     OR NEW."field" IS DISTINCT FROM OLD."field" OR NEW."confirmedValue" IS DISTINCT FROM OLD."confirmedValue"
     OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" OR NEW."confirmedByUserId" IS DISTINCT FROM OLD."confirmedByUserId"
     OR NEW."sourceKind" IS DISTINCT FROM OLD."sourceKind" OR NEW."sourceNote" IS DISTINCT FROM OLD."sourceNote"
     OR OLD."invalidatedAt" IS NOT NULL
     OR NEW."invalidatedAt" IS NULL OR NEW."invalidatedByUserId" IS NULL OR NEW."invalidatedReason" IS NULL THEN
    RAISE EXCEPTION 'WA2A_CONFIRMATION_APPEND_ONLY' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "wa2a_contact_guard" BEFORE INSERT OR UPDATE ON "WaContact"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_contact_guard"();
CREATE TRIGGER "wa2a_contact_no_delete" BEFORE DELETE ON "WaContact"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_tolak_hapus_kecuali_tenant"();
CREATE TRIGGER "wa2a_consent_state_guard" BEFORE UPDATE ON "WaConsentState"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_consent_state_guard"();
CREATE TRIGGER "wa2a_consent_state_no_delete" BEFORE DELETE ON "WaConsentState"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_tolak_hapus_kecuali_tenant"();
CREATE TRIGGER "wa2a_consent_event_append_only" BEFORE UPDATE ON "WaConsentEvent"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_append_only"();
CREATE TRIGGER "wa2a_consent_event_no_delete" BEFORE DELETE ON "WaConsentEvent"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_tolak_hapus_kecuali_tenant"();
CREATE TRIGGER "wa2a_grant_guard" BEFORE INSERT OR UPDATE ON "WaPrincipalAccessGrant"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_grant_guard"();
CREATE TRIGGER "wa2a_grant_no_delete" BEFORE DELETE ON "WaPrincipalAccessGrant"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_tolak_hapus_kecuali_tenant"();
CREATE TRIGGER "wa2a_grant_voyage_guard" BEFORE INSERT OR UPDATE ON "WaPrincipalAccessGrantVoyage"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_grant_voyage_guard"();
CREATE TRIGGER "wa2a_client_message_guard" BEFORE INSERT OR UPDATE ON "WaClientMessage"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_client_message_guard"();
CREATE TRIGGER "wa2a_schedule_confirmation_guard" BEFORE INSERT OR UPDATE ON "VoyageScheduleConfirmation"
  FOR EACH ROW EXECUTE FUNCTION "wa2a_schedule_confirmation_guard"();
