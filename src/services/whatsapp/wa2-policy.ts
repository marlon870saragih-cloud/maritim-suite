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
