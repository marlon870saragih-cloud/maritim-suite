// WA-2a Step 2B — kosakata sah tabel fondasi WhatsApp klien (DATA SAJA).
//
// Pasangan kolom String di schema.prisma (pola K55 WA-1): daftar di sini adalah satu-satunya
// sumber nilai sah untuk service WA-2a berikutnya. TANPA impor, tanpa DB, tanpa jaringan,
// tanpa process.env. Belum dipakai kode aplikasi mana pun (Step 2B = schema saja).
//
// Yang DITEGAKKAN DATABASE (migrasi 20261010180000_wa2a_contact_consent_access) ditandai [DB];
// sisanya tugas service di langkah 2a-C…2a-F dan TIDAK boleh diklaim sebagai penegakan DB.

/** [DB] CHECK WaContact_party_xor. */
export const JENIS_PIHAK_KONTAK = ['CUSTOMER', 'PRINCIPAL'] as const
/** [DB] CHECK WaContact_active_key + trigger: INACTIVE terminal. */
export const STATUS_KONTAK = ['ACTIVE', 'INACTIVE'] as const
export const STATUS_VERIFIKASI_KONTAK = ['UNVERIFIED', 'VERIFIED'] as const
export const METODE_VERIFIKASI_KONTAK = ['CALL_BACK', 'EMAIL_FROM_KNOWN_DOMAIN', 'DOCUMENT', 'IN_PERSON'] as const
export const BAHASA_KONTAK = ['ID', 'EN'] as const

export const TUJUAN_CONSENT = ['PROACTIVE_OPERATIONAL_UPDATE'] as const
export const STATUS_CONSENT = ['NONE', 'OPT_IN', 'OPT_OUT'] as const
export const AKSI_CONSENT = ['OPT_IN', 'OPT_OUT'] as const
export const KANAL_CONSENT = ['WHATSAPP', 'EMAIL', 'FORM', 'CONTRACT', 'STAFF_RECORDED'] as const
export const AKTOR_CONSENT = ['STAFF', 'SYSTEM'] as const

/** [DB] CHECK WaGrant_categories_allowed — tidak ada kategori biaya/invoice/dokumen. */
export const KATEGORI_DATA_GRANT = ['STATUS', 'SCHEDULE_ESTIMATE', 'SCHEDULE_ACTUAL', 'MILESTONE'] as const
/** [DB] trigger wa2a_grant_guard: PENDING→ACTIVE|REJECTED, ACTIVE→REVOKED|EXPIRED; lainnya terminal. */
export const STATUS_GRANT = ['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED'] as const
export const TRANSISI_GRANT: Readonly<Record<(typeof STATUS_GRANT)[number], readonly (typeof STATUS_GRANT)[number][]>> = {
  PENDING: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['REVOKED', 'EXPIRED'],
  REJECTED: [],
  REVOKED: [],
  EXPIRED: [],
}

export const MODE_PESAN_KLIEN = 'CLIENT_REAL' as const
export const STATUS_PESAN_KLIEN = [
  'DRAFT',
  'PREVIEWED',
  'PENDING_APPROVAL',
  'APPROVED',
  'NEEDS_REVIEW',
  'EXPIRED',
  'REJECTED',
  'BLOCKED',
  'CANCELED',
] as const

/** [DB] CHECK VoyageScheduleConfirmation_field. */
export const FIELD_KONFIRMASI_JADWAL = ['eta', 'etb', 'etd'] as const
export const SUMBER_KONFIRMASI_JADWAL = ['MASTER_OR_SHIP', 'PRINCIPAL_OR_OWNER', 'PORT_OR_TERMINAL', 'AGENT_INTERNAL', 'OTHER'] as const

/** Awalan pesan galat trigger (SQLSTATE 23514) — untuk dipetakan service ke kode alasan. */
export const KODE_GALAT_DB_WA2A = [
  'WA2A_TENANT_MISMATCH',
  'WA2A_CONTACT_IDENTITY_IMMUTABLE',
  'WA2A_CONTACT_INACTIVE_TERMINAL',
  'WA2A_CONSENT_STATE_IDENTITY_IMMUTABLE',
  'WA2A_APPEND_ONLY',
  'WA2A_DELETE_FORBIDDEN',
  'WA2A_GRANT_MUST_START_PENDING',
  'WA2A_GRANT_IDENTITY_IMMUTABLE',
  'WA2A_GRANT_TRANSITION_FORBIDDEN',
  'WA2A_GRANT_DECISION_REQUIRED',
  'WA2A_GRANT_REVOKE_REASON_REQUIRED',
  'WA2A_GRANT_TERMINAL',
  'WA2A_GRANT_SCOPE_LOCKED',
  'WA2A_GRANT_VOYAGE_NOT_AUTHORIZED',
  'WA2A_MESSAGE_SNAPSHOT_IMMUTABLE',
  'WA2A_MESSAGE_PARTY_MISMATCH',
  'WA2A_CONFIRMATION_INVALID_AT_INSERT',
  'WA2A_CONFIRMATION_APPEND_ONLY',
] as const

// ===================================================================== WA-2a Step 2C
// Kontak & consent (desain historis 2a-C "kontak" + 2a-D "consent", digabung — keputusan owner C-1).

/** Flag fitur WA-2a (harus PERSIS "true"; default mati). Produksi selalu ditolak di WA-2a. */
export const FLAG_WA2 = 'WA2_CLIENT_FOUNDATION_ENABLED'

/** C-2 — masa berlaku verifikasi kontak maksimum (bulan kalender). */
export const MAKS_BULAN_VERIFIKASI = 12

/** C-2 — alasan pembatalan verifikasi lebih cepat. Selalu mencabut grant ACTIVE kontak itu. */
export const ALASAN_CABUT_VERIFIKASI = [
  'PIC_CHANGED_COMPANY',
  'RELATIONSHIP_ENDED',
  'AUTHORITY_CHANGED',
  'REVOKED_BY_AUTHORIZED_PARTY',
  'EVIDENCE_INVALID',
] as const

/** Kanal yang sah sebagai bukti re-opt-in SETELAH OPT_OUT: pernyataan pelanggan, bukan catatan staf saja. */
export const KANAL_REOPTIN_SAH = ['WHATSAPP', 'EMAIL', 'FORM', 'CONTRACT'] as const

/** Status pesan klien yang masih bisa dibatalkan → NEEDS_REVIEW saat consent/kontak/akses dicabut. */
export const STATUS_PESAN_DAPAT_DITAHAN = ['DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED'] as const

/** Kode alasan service 2a-C (dipakai di `details.code` ServiceError & AuditLog). */
export const KODE_ALASAN_WA2C = [
  'WA2_DISABLED',
  'WA2_ENV_NOT_ALLOWED',
  'WA2_SYSTEM_CONTEXT_FORBIDDEN',
  'PHONE_INVALID',
  'PARTY_NOT_ELIGIBLE',
  'CONTACT_NUMBER_IN_USE',
  'CONTACT_INACTIVE',
  'CONTACT_NOT_VERIFIED',
  'VERIFICATION_EVIDENCE_REQUIRED',
  'VERIFICATION_EXPIRY_INVALID',
  'CONSENT_EVIDENCE_REQUIRED',
  'CONSENT_REOPTIN_EVIDENCE_REQUIRED',
  'CONSENT_NOT_GRANTED',
  'CONTACT_INELIGIBLE',
  'CONTACT_DEACTIVATED',
  'VERIFICATION_REVOKED',
  'CONCURRENCY_CONFLICT',
] as const
export type KodeAlasanWa2c = (typeof KODE_ALASAN_WA2C)[number]

// ===================================================================== WA-2a Step 2E
// Akses principal & resolver otorisasi (keputusan owner E-1..E-6).

/** E-3 — masa berlaku grant maksimum, dihitung sejak PERSETUJUAN (bulan kalender). */
export const MAKS_BULAN_GRANT = 12
/** Batas jumlah voyage per pengajuan grant (cakupan eksplisit, bukan per kapal). */
export const MAKS_VOYAGE_PER_GRANT = 50
/** E-2 — hanya data operasional NYATA yang boleh menjadi informasi pelanggan. */
export const ASAL_DATA_SAH = 'NYATA' as const
/** E-5 — tak pernah dapat diakses lewat resolver. */
export const STATUS_VOYAGE_TERTUTUP_UNTUK_SEMUA = ['CANCELLED'] as const
/** E-5 — mengakhiri grant principal (customer tetap melihat CLOSED sesuai aturan portal). */
export const STATUS_VOYAGE_TERTUTUP_UNTUK_PRINCIPAL = ['CLOSED', 'CANCELLED'] as const
/** Kode milestone yang boleh dibaca kategori MILESTONE (sama dengan pilot WA-1). */
export const MILESTONE_TERBACA = ['EOSP', 'ALL_FAST', 'SAILED'] as const

/**
 * E-1 — allowlist kolom per kategori. Identitas (nomor voyage, nama kapal, pelabuhan & zona)
 * ikut bila ada SATU kategori apa pun (setara portal). Tidak ada kolom biaya/catatan/pihak lain.
 */
export const KOLOM_PER_KATEGORI = {
  STATUS: ['status'],
  SCHEDULE_ESTIMATE: ['eta', 'etb', 'etd'],
  SCHEDULE_ACTUAL: ['ata', 'atb', 'atd'],
  MILESTONE: ['milestoneTerakhir'],
} as const
export const KOLOM_IDENTITAS = ['voyageId', 'voyageNumber', 'namaKapal', 'namaPelabuhan', 'zonaWaktu'] as const

export const KODE_ALASAN_WA2E = [
  'CONTACT_INELIGIBLE',
  'CONTACT_NOT_PRINCIPAL',
  'GRANT_EVIDENCE_REQUIRED',
  'GRANT_EXPIRY_INVALID',
  'GRANT_SCOPE_INVALID',
  'VOYAGE_NOT_AUTHORIZED',
  'GRANT_SELF_DECISION_FORBIDDEN',
  'GRANT_NOT_PENDING',
  'GRANT_NOT_ACTIVE',
  'GRANT_SCOPE_STALE',
  'ACCESS_REVOKED',
  'ACCESS_DENIED',
] as const

// ===================================================================== WA-2a Step 2F (F1)
// Kebijakan pesan klien & approval eksternal — DATA saja. Fungsi murni ada di wa-message-policy.ts
// dan wa-approval-def.ts. Keputusan owner 2a-F: TTL approval eksternal 2 jam; pembuat draft &
// peminta approval bukan checker; ETA/ETD & waktu milestone tanpa aturan freshness tervalidasi →
// gagal tertutup; NYATA bukan satu-satunya verifikasi data; 2a-F berhenti di APPROVED.

/** Status terminal: tak ada transisi keluar; activeKey dilepas. APPROVED BUKAN terminal (Send = WA-2b). */
export const STATUS_PESAN_KLIEN_TERMINAL = ['EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'] as const

/**
 * Mesin status WaClientMessage (DB tidak menjaga transisi — tugas service, WA-2a-B §3.2).
 * • Penahanan 2a-C/2a-E (STATUS_PESAN_DAPAT_DITAHAN → NEEDS_REVIEW) WAJIB sah dari setiap status itu.
 * • NEEDS_REVIEW tidak kembali ke DRAFT: snapshot (termasuk consentStateVersion) immutable, jadi
 *   pemulihan = revisi BARU setelah yang lama dibatalkan.
 * • Tidak ada transisi ke state kirim di 2a-F.
 */
export const TRANSISI_PESAN_KLIEN: Readonly<Record<(typeof STATUS_PESAN_KLIEN)[number], readonly (typeof STATUS_PESAN_KLIEN)[number][]>> = {
  DRAFT: ['PREVIEWED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  PREVIEWED: ['PENDING_APPROVAL', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED', 'NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  APPROVED: ['NEEDS_REVIEW', 'BLOCKED', 'CANCELED'],
  NEEDS_REVIEW: ['BLOCKED', 'CANCELED'],
  EXPIRED: [],
  REJECTED: [],
  BLOCKED: [],
  CANCELED: [],
}

/** Approval eksternal pesan klien (keputusan D1: memakai TahApprovalRequest, definisi terpisah dari registry TAH). */
export const JENIS_APPROVAL_PESAN_KLIEN = 'CLIENT_WA_UPDATE' as const
export const SUBJEK_APPROVAL_PESAN_KLIEN = 'WaClientMessage' as const
/** Keputusan owner 2a-F — TTL approval eksternal TEPAT 2 jam (dalam rentang beku TAH 1..720). */
export const TTL_APPROVAL_PESAN_KLIEN_JAM = 2

/** Keluarga event pesan klien (sama dengan kosakata pilot WA-1; keselarasan dikunci uji). */
export const KELUARGA_PESAN_KLIEN = ['SCHEDULE_CHANGE', 'EOSP', 'ALL_FAST', 'SAILED'] as const
/** Medan waktu yang tampil di pesan per keluarga — semuanya tunduk pada aturan freshness. */
export const MEDAN_WAKTU_PER_KELUARGA: Readonly<Record<(typeof KELUARGA_PESAN_KLIEN)[number], readonly string[]>> = {
  SCHEDULE_CHANGE: ['eta', 'etd'],
  EOSP: ['occurredAt'],
  ALL_FAST: ['occurredAt'],
  SAILED: ['occurredAt'],
}
/**
 * Aturan freshness yang DISETUJUI owner, per keluarga. SENGAJA KOSONG: belum ada aturan yang
 * disetujui → semua keluarga gagal tertutup (FRESHNESS_RULE_MISSING). Menambah aturan = keputusan
 * owner + ulasan kode; tak ada ambang bawaan.
 */
export const ATURAN_FRESHNESS_DISETUJUI: Readonly<Partial<Record<(typeof KELUARGA_PESAN_KLIEN)[number], never>>> = Object.freeze({})

export const KODE_ALASAN_WA2F = [
  'MESSAGE_STATE_INVALID',
  'MESSAGE_TRANSITION_FORBIDDEN',
  'FRESHNESS_RULE_MISSING',
  'DATA_ORIGIN_INSUFFICIENT',
  'SOURCE_NOT_REVALIDATED',
  'APPROVAL_POLICY_MISMATCH',
  'APPROVAL_ENV_NOT_ALLOWED',
  'APPROVAL_EXPIRED',
  'SYSTEM_CONTEXT_FORBIDDEN',
  'ROLE_NOT_ALLOWED',
  'SELF_APPROVAL_FORBIDDEN',
  'CHECKER_IS_MAKER',
] as const
export type KodeAlasanWa2f = (typeof KODE_ALASAN_WA2F)[number]
