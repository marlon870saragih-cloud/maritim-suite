'use client'

// Potongan UI Vessel Call Intake (PRD-004 Step 3, dirapikan Step 4F). Status,
// duplikat, dan asal nilai SELALU dibawa ikon + teks, tidak pernah warna saja.
// Usulan AI tidak pernah tampil seolah fakta terverifikasi; hijau hanya untuk
// kecocokan yang memang tidak butuh tindakan lagi.

import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Database,
  Link2,
  PencilLine,
  ShieldQuestion,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/i18n'
import type { HasilCocok } from '@/services/intake/intake-policy'

const pil = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium'
const netral = 'bg-surface-tertiary text-text-secondary border-border-muted'
const biru = 'bg-accent-blue/12 text-accent-blue border-accent-blue/30'
const kuning = 'bg-accent-amber/12 text-accent-amber border-accent-amber/30'
const merah = 'bg-status-danger/12 text-status-danger border-status-danger/30'
const hijau = 'bg-status-success/12 text-status-success border-status-success/30'

export const LABEL_STATUS_INTAKE: Record<Lang, Record<string, string>> = {
  id: {
    NEEDS_REVIEW: 'Perlu ditinjau', CREATING: 'Membuat voyage', COMPLETED: 'Voyage dibuat',
    LINKED_EXISTING: 'Ditautkan ke voyage lama', REJECTED: 'Ditolak', FAILED: 'Gagal dibuat',
  },
  en: {
    NEEDS_REVIEW: 'Needs review', CREATING: 'Creating voyage', COMPLETED: 'Voyage created',
    LINKED_EXISTING: 'Linked to existing voyage', REJECTED: 'Rejected', FAILED: 'Creation failed',
  },
}

export const LABEL_KLASIFIKASI: Record<Lang, Record<string, string>> = {
  id: {
    NEW_NOMINATION: 'Nominasi baru', NEW_APPOINTMENT: 'Appointment baru', NOT_RELEVANT: 'Bukan permintaan kunjungan',
    INSUFFICIENT_INFORMATION: 'Informasi belum cukup', UNSUPPORTED_REQUEST: 'Jenis permintaan belum didukung',
  },
  en: {
    NEW_NOMINATION: 'New nomination', NEW_APPOINTMENT: 'New appointment', NOT_RELEVANT: 'Not a vessel-call request',
    INSUFFICIENT_INFORMATION: 'Insufficient information', UNSUPPORTED_REQUEST: 'Request type not supported yet',
  },
}

export const LABEL_JENIS_INPUT: Record<Lang, Record<string, string>> = {
  id: { TEXT: 'Teks yang ditempel', PDF: 'Berkas PDF', IMAGE: 'Gambar / foto', WORKBOOK: 'Berkas Excel', CSV: 'Berkas CSV' },
  en: { TEXT: 'Pasted text', PDF: 'PDF file', IMAGE: 'Image / photo', WORKBOOK: 'Excel file', CSV: 'CSV file' },
}

export const LABEL_DUPLIKAT: Record<Lang, Record<string, string>> = {
  id: { NO_DUPLICATE: 'Tidak ada duplikat', POSSIBLE_DUPLICATE: 'Mungkin duplikat', LIKELY_DUPLICATE: 'Kemungkinan besar duplikat' },
  en: { NO_DUPLICATE: 'No duplicate', POSSIBLE_DUPLICATE: 'Possible duplicate', LIKELY_DUPLICATE: 'Likely duplicate' },
}

export function IntakeStatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const g =
    status === 'COMPLETED'
      ? { Icon: CheckCircle2, c: hijau }
      : status === 'LINKED_EXISTING'
        ? { Icon: Link2, c: hijau }
        : status === 'FAILED'
          ? { Icon: AlertOctagon, c: merah }
          : status === 'REJECTED'
            ? { Icon: XCircle, c: netral }
            : status === 'CREATING'
              ? { Icon: Clock3, c: biru }
              : { Icon: CircleDashed, c: kuning }
  return (
    <span className={cn(pil, g.c)}>
      <g.Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      {LABEL_STATUS_INTAKE[lang][status] ?? status}
    </span>
  )
}

export function DuplicateBadge({ level, lang }: { level: string; lang: Lang }) {
  const g =
    level === 'LIKELY_DUPLICATE'
      ? { Icon: AlertOctagon, c: merah }
      : level === 'POSSIBLE_DUPLICATE'
        ? { Icon: AlertTriangle, c: kuning }
        : { Icon: CheckCircle2, c: netral }
  return (
    <span className={cn(pil, g.c)}>
      <g.Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      {LABEL_DUPLIKAT[lang][level] ?? level}
    </span>
  )
}

const LABEL_ASAL: Record<Lang, Record<string, string>> = {
  id: {
    SOURCE_DOCUMENT: 'Dibaca AI dari dokumen', VISUAL: 'Dibaca AI dari PDF/gambar',
    MASTER_MATCH: 'Dari data master', USER_EDITED: 'Diisi peninjau',
    SYSTEM_DERIVED: 'Diturunkan sistem', EMPTY: 'Tidak ada di dokumen', NOT_IN_SOURCE: 'Dibuang: tidak tertulis di dokumen',
    DATE_OUT_OF_RANGE: 'Dibuang: tanggal tidak masuk akal', IMO_CHECK_DIGIT: 'Nomor IMO tampak salah ketik',
  },
  en: {
    SOURCE_DOCUMENT: 'Read by AI from the document', VISUAL: 'Read by AI from a PDF/image',
    MASTER_MATCH: 'From master data', USER_EDITED: 'Entered by reviewer',
    SYSTEM_DERIVED: 'Derived by system', EMPTY: 'Not in the document', NOT_IN_SOURCE: 'Discarded: not written in the document',
    DATE_OUT_OF_RANGE: 'Discarded: implausible date', IMO_CHECK_DIGIT: 'IMO number looks mistyped',
  },
}

type FieldLike = { value: unknown; source: string; flags: string[]; extracted: unknown; confirmed: boolean }

/** Lencana asal nilai — hasil AI selalu disebut "dibaca AI", tidak pernah sebagai fakta. */
export function ProvenanceBadge({ f, lang }: { f: FieldLike; lang: Lang }) {
  const L = LABEL_ASAL[lang]
  const g =
    f.source === 'USER_EDITED'
      ? { Icon: PencilLine, c: hijau, t: L.USER_EDITED }
      : f.source === 'MASTER_MATCH'
        ? { Icon: Database, c: hijau, t: L.MASTER_MATCH }
        : f.source === 'SOURCE_DOCUMENT'
          ? f.flags.includes('UNVERIFIED_SOURCE')
            ? { Icon: ShieldQuestion, c: kuning, t: L.VISUAL }
            : { Icon: Bot, c: biru, t: L.SOURCE_DOCUMENT }
          : f.flags.includes('NOT_IN_SOURCE')
            ? { Icon: AlertTriangle, c: kuning, t: L.NOT_IN_SOURCE }
            : f.flags.includes('DATE_OUT_OF_RANGE')
              ? { Icon: AlertTriangle, c: kuning, t: L.DATE_OUT_OF_RANGE }
              : { Icon: CircleDashed, c: netral, t: f.source === 'SYSTEM_DERIVED' ? L.SYSTEM_DERIVED : L.EMPTY }
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={cn(pil, g.c)}>
        <g.Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        {g.t}
      </span>
      {f.flags.includes('IMO_CHECK_DIGIT') && (
        <span className={cn(pil, kuning)}>
          <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          {L.IMO_CHECK_DIGIT}
        </span>
      )}
    </span>
  )
}

/** Dasar kecocokan dalam bahasa operator (tanpa "wajib dikonfirmasi" — itu tugas lencana status). */
export const LABEL_BASIS: Record<Lang, Record<string, string>> = {
  id: {
    EXACT_IMO: 'IMO sama persis', EXACT_MMSI_VERIFIED: 'MMSI terverifikasi sama', EXACT_CALL_SIGN: 'Call sign sama',
    NAME_NORMALIZED: 'Hanya nama yang sama', UNLOCODE: 'Kode pelabuhan sama', SELECTED_BY_REVIEWER: 'Dipilih peninjau',
    CREATED_BY_REVIEWER: 'Dibuat peninjau', MMSI_UNVERIFIED: 'MMSI sama, tetapi MMSI kapal ini belum terverifikasi',
    NAME_PARTIAL: 'Nama mirip', INACTIVE: 'nonaktif',
  },
  en: {
    EXACT_IMO: 'Same IMO', EXACT_MMSI_VERIFIED: 'Same verified MMSI', EXACT_CALL_SIGN: 'Same call sign',
    NAME_NORMALIZED: 'Name only', UNLOCODE: 'Same port code', SELECTED_BY_REVIEWER: 'Selected by reviewer',
    CREATED_BY_REVIEWER: 'Created by reviewer', MMSI_UNVERIFIED: 'Same MMSI, but this vessel’s MMSI is unverified',
    NAME_PARTIAL: 'Similar name', INACTIVE: 'inactive',
  },
}

const LABEL_KEADAAN: Record<Lang, Record<string, string>> = {
  id: {
    PASTI: 'Cocok pasti', PERLU: 'Perlu konfirmasi Anda', DIKONFIRMASI: 'Dikonfirmasi', DIPILIH: 'Dipilih peninjau',
    DIBUAT: 'Master baru dibuat peninjau', KOSONG: 'Sengaja dikosongkan', AMBIGU: 'Beberapa kemungkinan — pilih salah satu',
    KONFLIK: 'Identitas bertentangan — pilih manual', TIDAK_ADA: 'Belum ada di data master',
  },
  en: {
    PASTI: 'Certain match', PERLU: 'Needs your confirmation', DIKONFIRMASI: 'Confirmed', DIPILIH: 'Selected by reviewer',
    DIBUAT: 'New master created by reviewer', KOSONG: 'Intentionally left empty', AMBIGU: 'Several possibilities — choose one',
    KONFLIK: 'Conflicting identity — choose manually', TIDAK_ADA: 'Not in master data yet',
  },
}

/** Satu lencana keadaan kecocokan. Hijau HANYA bila tidak ada tindakan yang tersisa. */
export function MatchBadge({ h, lang }: { h: HasilCocok; lang: Lang }) {
  const L = LABEL_KEADAAN[lang]
  const g = h.leftEmpty
    ? { Icon: CircleDashed, c: netral, t: L.KOSONG }
    : h.basis === 'CREATED_BY_REVIEWER'
      ? { Icon: UserCheck, c: hijau, t: L.DIBUAT }
      : h.basis === 'SELECTED_BY_REVIEWER'
        ? { Icon: UserCheck, c: hijau, t: L.DIPILIH }
        : h.status === 'MATCHED' && h.requiresConfirmation && !h.confirmed
          ? { Icon: ShieldQuestion, c: kuning, t: L.PERLU }
          : h.status === 'MATCHED' && h.confirmed
            ? { Icon: UserCheck, c: hijau, t: L.DIKONFIRMASI }
            : h.status === 'MATCHED'
              ? { Icon: CheckCircle2, c: hijau, t: L.PASTI }
              : h.status === 'CONFLICT'
                ? { Icon: AlertOctagon, c: merah, t: L.KONFLIK }
                : h.status === 'AMBIGUOUS'
                  ? { Icon: AlertTriangle, c: kuning, t: L.AMBIGU }
                  : { Icon: CircleDashed, c: netral, t: L.TIDAK_ADA }
  return (
    <span className={cn(pil, g.c)}>
      <g.Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      {g.t}
    </span>
  )
}

export const LABEL_SYARAT: Record<Lang, Record<string, string>> = {
  id: {
    STATUS_NOT_REVIEWABLE: 'Intake ini tidak dalam status yang bisa disetujui.',
    CLASSIFICATION_NOT_SUPPORTED: 'Hanya nominasi/appointment kunjungan baru yang bisa disetujui.',
    PRIMARY_VESSEL_UNRESOLVED: 'Kapal utama belum dipastikan — pilih, konfirmasi, atau buat kapal di bagian Kapal.',
    VESSEL_UNRESOLVED: 'Ada kapal tambahan yang belum dipastikan — pilih/buat, atau keluarkan dari usulan.',
    VESSEL_CONFIRMATION_REQUIRED: 'Ada kecocokan kapal yang masih perlu Anda konfirmasi.',
    DUPLICATE_VESSEL_SELECTED: 'Kapal yang sama dipilih lebih dari sekali.',
    PORT_UNRESOLVED: 'Pelabuhan belum dipilih dari data master pelabuhan.',
    PORT_CONFIRMATION_REQUIRED: 'Kecocokan pelabuhan masih perlu Anda konfirmasi.',
    ETA_MISSING: 'ETA belum diisi.',
    PRINCIPAL_UNRESOLVED: 'Principal belum dipastikan — konfirmasi/pilih, atau pilih "Biarkan kosong".',
    CUSTOMER_UNRESOLVED: 'Customer (pihak ditagih) belum dipastikan — pilih, atau pilih "Biarkan kosong".',
    SOURCE_FIELDS_UNCONFIRMED: 'Nilai dari PDF/gambar belum dipastikan.',
    DUPLICATE_DECISION_REQUIRED: 'Ada kemungkinan duplikat: di Pemeriksaan duplikat, tautkan ke voyage yang ada atau centang "Ini kunjungan BERBEDA" — atau tolak intake.',
    DUPLICATE_REVIEW_CONFIRMATION_REQUIRED: 'Centang bahwa voyage kandidat sudah Anda periksa.',
    DUPLICATE_REASON_REQUIRED: 'Kemungkinan besar duplikat: tulis alasan (minimal 10 karakter) mengapa ini kunjungan berbeda.',
    PORTAL_ACK_REQUIRED: 'Customer punya akses portal: centang pernyataan paparan portal.',
  },
  en: {
    STATUS_NOT_REVIEWABLE: 'This intake is not in an approvable state.',
    CLASSIFICATION_NOT_SUPPORTED: 'Only new vessel-call nominations/appointments can be approved.',
    PRIMARY_VESSEL_UNRESOLVED: 'The primary vessel is not settled — choose, confirm or create it in Vessels.',
    VESSEL_UNRESOLVED: 'An additional vessel is not settled — choose/create it, or exclude it.',
    VESSEL_CONFIRMATION_REQUIRED: 'A vessel match still needs your confirmation.',
    DUPLICATE_VESSEL_SELECTED: 'The same vessel is selected more than once.',
    PORT_UNRESOLVED: 'The port is not selected from the port master.',
    PORT_CONFIRMATION_REQUIRED: 'The port match still needs your confirmation.',
    ETA_MISSING: 'ETA is missing.',
    PRINCIPAL_UNRESOLVED: 'Principal not settled — confirm/choose, or choose "Leave empty".',
    CUSTOMER_UNRESOLVED: 'Customer (billed party) not settled — choose, or choose "Leave empty".',
    SOURCE_FIELDS_UNCONFIRMED: 'Values read from a PDF/image are not settled.',
    DUPLICATE_DECISION_REQUIRED: 'Possible duplicate: in Duplicate check, link to the existing voyage or tick "This is a DIFFERENT call" — or reject.',
    DUPLICATE_REVIEW_CONFIRMATION_REQUIRED: 'Tick that you checked the candidate voyages.',
    DUPLICATE_REASON_REQUIRED: 'Likely duplicate: write why this is a different call (min. 10 characters).',
    PORTAL_ACK_REQUIRED: 'The customer has portal access: tick the portal exposure acknowledgement.',
  },
}

/** Step 4F — kegagalan pembuatan voyage dalam bahasa operator + langkah berikutnya. Kode mesin tetap di audit/log. */
export const LABEL_GAGAL: Record<Lang, Record<string, { judul: string; langkah: string }>> = {
  id: {
    VOYAGE_NUMBER_COLLISION: {
      judul: 'Nomor voyage bentrok dengan voyage lain yang dibuat hampir bersamaan.',
      langkah: 'Tekan "Coba buat lagi" — sistem akan mengambil nomor voyage berikutnya. Tidak ada voyage ganda yang terbentuk.',
    },
    CREATE_FORBIDDEN: {
      judul: 'Voyage tidak boleh dibuat dengan akun ini, atau batas paket langganan sudah tercapai.',
      langkah: 'Hubungi administrator perusahaan, lalu tekan "Coba buat lagi".',
    },
    MASTER_NOT_FOUND: {
      judul: 'Kapal, pelabuhan, principal, atau customer yang dipilih sudah tidak ada di data master.',
      langkah: 'Tolak intake ini lalu kirim ulang permintaannya agar dicocokkan dengan data master terbaru.',
    },
    VALIDATION: {
      judul: 'Data voyage tidak lolos pemeriksaan (mis. tanggal atau isian tidak sah).',
      langkah: 'Tolak intake ini lalu kirim ulang dengan data yang benar, atau buat voyage secara manual.',
    },
    CONFLICT: {
      judul: 'Voyage bentrok dengan data lain.',
      langkah: 'Tekan "Coba buat lagi". Bila tetap gagal, hubungi administrator.',
    },
    CREATING_INTERRUPTED: {
      judul: 'Proses pembuatan voyage terputus sebelum selesai. Tidak ada voyage yang terbentuk.',
      langkah: 'Tekan "Coba buat lagi".',
    },
    AUDIT_FAILED: {
      judul: 'Catatan persetujuan gagal disimpan, sehingga voyage sengaja tidak dibuat.',
      langkah: 'Tekan "Coba buat lagi". Bila berulang, hubungi administrator.',
    },
    CREATE_FAILED: {
      judul: 'Terjadi kendala saat membuat voyage.',
      langkah: 'Tekan "Coba buat lagi". Bila berulang, hubungi administrator.',
    },
  },
  en: {
    VOYAGE_NUMBER_COLLISION: {
      judul: 'The voyage number clashed with another voyage created at the same moment.',
      langkah: 'Press "Try creating again" — the next voyage number will be used. No duplicate voyage was created.',
    },
    CREATE_FORBIDDEN: {
      judul: 'This account may not create voyages, or the subscription limit was reached.',
      langkah: 'Contact your company administrator, then press "Try creating again".',
    },
    MASTER_NOT_FOUND: {
      judul: 'The selected vessel, port, principal or customer no longer exists in master data.',
      langkah: 'Reject this intake and submit the request again so it is matched against current master data.',
    },
    VALIDATION: {
      judul: 'The voyage data did not pass validation (e.g. an invalid date).',
      langkah: 'Reject this intake and resubmit with correct data, or create the voyage manually.',
    },
    CONFLICT: { judul: 'The voyage clashed with other data.', langkah: 'Press "Try creating again". If it keeps failing, contact the administrator.' },
    CREATING_INTERRUPTED: {
      judul: 'Voyage creation was interrupted before finishing. No voyage was created.',
      langkah: 'Press "Try creating again".',
    },
    AUDIT_FAILED: {
      judul: 'The approval record could not be saved, so the voyage was deliberately not created.',
      langkah: 'Press "Try creating again". If it repeats, contact the administrator.',
    },
    CREATE_FAILED: { judul: 'Something went wrong while creating the voyage.', langkah: 'Press "Try creating again". If it repeats, contact the administrator.' },
  },
}

export function penjelasanGagal(kode: string | null | undefined, lang: Lang) {
  return LABEL_GAGAL[lang][kode ?? ''] ?? LABEL_GAGAL[lang].CREATE_FAILED
}

/**
 * F-1 — penolakan server yang BISA dialami peninjau, dalam bahasa UI. Pesan asli
 * server tetap Bahasa Indonesia (untuk klien API & log) dan hanya dipakai sebagai
 * cadangan bila kodenya tak dikenal di sini. Placeholder `{field}` / `{mundur}` /
 * `{maju}` diisi dari `details`.
 */
export const LABEL_GALAT_SERVER: Record<Lang, Record<string, string>> = {
  id: {
    VERSION_CONFLICT:
      'Intake ini berubah sejak Anda membukanya — mungkin disunting peninjau lain, atau data master ikut berubah. Layar sudah dimuat ulang; periksa lagi sebelum melanjutkan.',
    MASTER_CHANGED:
      'Data master berubah sejak Anda meninjau, jadi kecocokannya dihitung ulang. Layar sudah dimuat ulang; periksa lagi kecocokan kapal, pelabuhan dan pihak sebelum menyetujui.',
    DUPLICATE_LEVEL_INCREASED:
      'Sejak Anda meninjau, muncul voyage atau intake yang mungkin sama. Layar sudah dimuat ulang; periksa lagi bagian Pemeriksaan duplikat sebelum menyetujui.',
    ALREADY_CLAIMED: 'Peninjau lain sedang memproses intake ini. Tunggu sampai selesai, lalu muat ulang untuk melihat hasilnya.',
    INTAKE_ALREADY_PROCESSED: 'Intake ini sudah selesai diproses dan tidak bisa diubah lagi. Layar sudah dimuat ulang dengan keadaan terakhirnya.',
    NOT_IN_REVIEW: 'Intake ini tidak lagi berstatus perlu ditinjau, jadi suntingan tak bisa disimpan. Layar sudah dimuat ulang dengan keadaan terakhirnya.',
    PREVIOUS_CREATE_FAILED: 'Percobaan membuat voyage sebelumnya gagal. Gunakan "Coba buat lagi", atau tolak intake ini.',
    RETRY_NOT_FAILED: 'Hanya intake yang gagal membuat voyage yang bisa dicoba lagi.',
    NOTHING_TO_CONFIRM: 'Tidak ada kecocokan yang bisa dikonfirmasi di sini — pilihannya sudah berubah. Layar sudah dimuat ulang.',
    MINIMUM_NOT_MET: 'Identitas kapal serta pelabuhan/ETA harus lengkap lebih dulu.',
    NOT_DUPLICATE_CANDIDATE: 'Voyage itu bukan kandidat duplikat untuk intake ini. Pilih dari daftar di bagian Pemeriksaan duplikat.',
    DATE_INVALID: '{field} harus berupa tanggal yang sah (YYYY-MM-DD, tahun 4 digit).',
    DATE_OUTSIDE_WINDOW: '{field} di luar rentang yang diterima: paling jauh {mundur} hari ke belakang dan {maju} hari ke depan dari hari ini.',
    INTAKE_CORRUPT: 'Data intake ini tidak utuh sehingga tidak bisa diproses. Tolak intake ini, lalu kirim ulang permintaannya.',
  },
  en: {
    VERSION_CONFLICT:
      'This intake changed since you opened it — another reviewer may have edited it, or master data changed. The screen has been refreshed; check it again before continuing.',
    MASTER_CHANGED:
      'Master data changed since you reviewed, so the matches were recalculated. The screen has been refreshed; re-check the vessel, port and party matches before approving.',
    DUPLICATE_LEVEL_INCREASED:
      'Since you reviewed, a voyage or intake that may be the same one appeared. The screen has been refreshed; re-check Duplicate check before approving.',
    ALREADY_CLAIMED: 'Another reviewer is processing this intake. Wait until they finish, then reload to see the result.',
    INTAKE_ALREADY_PROCESSED: 'This intake has already been processed and can no longer be changed. The screen has been refreshed with its latest state.',
    NOT_IN_REVIEW: 'This intake is no longer awaiting review, so your edit could not be saved. The screen has been refreshed with its latest state.',
    PREVIOUS_CREATE_FAILED: 'The previous attempt to create the voyage failed. Use "Try creating again", or reject this intake.',
    RETRY_NOT_FAILED: 'Only an intake whose voyage creation failed can be retried.',
    NOTHING_TO_CONFIRM: 'There is no match to confirm here — the selection has changed. The screen has been refreshed.',
    MINIMUM_NOT_MET: 'The vessel identity and the port/ETA must be complete first.',
    NOT_DUPLICATE_CANDIDATE: 'That voyage is not a duplicate candidate for this intake. Pick one from the list in Duplicate check.',
    DATE_INVALID: '{field} must be a valid date (YYYY-MM-DD, 4-digit year).',
    DATE_OUTSIDE_WINDOW: '{field} is outside the accepted range: at most {mundur} days back and {maju} days ahead of today.',
    INTAKE_CORRUPT: 'This intake data is incomplete, so it cannot be processed. Reject it, then submit the request again.',
  },
}

/** Pesan UI untuk penolakan server berkode; null bila kodenya tak dikenal (pakai pesan server). */
export function pesanGalatServer(details: Record<string, unknown> | undefined, lang: Lang): string | null {
  const kode = typeof details?.code === 'string' ? details.code : null
  const pola = kode ? LABEL_GALAT_SERVER[lang][kode] : undefined
  if (!pola) return null
  return pola.replace(/\{(field|mundur|maju)\}/g, (_, k: string) => String(details?.[k] ?? ''))
}

export const LABEL_PERINGATAN: Record<Lang, Record<string, string>> = {
  id: {
    VESSELS_NOT_ATTACHED: 'Kapal tambahan (tug/tongkang) gagal dipasang — tambahkan manual di halaman voyage.',
    CARGO_NOT_CREATED: 'Sebagian muatan gagal dibuat — periksa tab cargo di halaman voyage.',
    VOYAGE_AUDIT_FAILED: 'Jejak audit pembuatan voyage gagal ditulis.',
    RECONCILED: 'Status dipulihkan dari voyage yang sudah ada.',
    RECONCILED_AFTER_ERROR: 'Voyage ternyata sudah terbentuk — status dipulihkan.',
    ORIGINAL_NOT_SAVED: 'Dokumen asli gagal disimpan sebagai lampiran.',
  },
  en: {
    VESSELS_NOT_ATTACHED: 'Additional vessels (tug/barge) could not be attached — add them on the voyage page.',
    CARGO_NOT_CREATED: 'Some cargo could not be created — check the voyage cargo tab.',
    VOYAGE_AUDIT_FAILED: 'The voyage creation audit entry could not be written.',
    RECONCILED: 'Status recovered from the existing voyage.',
    RECONCILED_AFTER_ERROR: 'The voyage already existed — status recovered.',
    ORIGINAL_NOT_SAVED: 'The original document could not be saved as an attachment.',
  },
}
