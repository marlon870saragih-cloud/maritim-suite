'use client'

// Potongan UI Vessel Call Intake (PRD-004 Step 3). Status, duplikat, dan asal nilai
// SELALU dibawa ikon + teks, tidak pernah warna saja. Usulan AI tidak pernah tampil
// seolah fakta terverifikasi.

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
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/i18n'

const pil = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap'
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
    NEW_NOMINATION: 'Nominasi baru', NEW_APPOINTMENT: 'Appointment baru', NOT_RELEVANT: 'Tidak relevan',
    INSUFFICIENT_INFORMATION: 'Informasi belum cukup', UNSUPPORTED_REQUEST: 'Permintaan belum didukung',
  },
  en: {
    NEW_NOMINATION: 'New nomination', NEW_APPOINTMENT: 'New appointment', NOT_RELEVANT: 'Not relevant',
    INSUFFICIENT_INFORMATION: 'Insufficient information', UNSUPPORTED_REQUEST: 'Unsupported request',
  },
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
      <g.Icon className="w-3 h-3" aria-hidden="true" />
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
      <g.Icon className="w-3 h-3" aria-hidden="true" />
      {LABEL_DUPLIKAT[lang][level] ?? level}
    </span>
  )
}

const LABEL_ASAL: Record<Lang, Record<string, string>> = {
  id: {
    SOURCE_DOCUMENT: 'Usulan AI dari dokumen', UNVERIFIED: 'Usulan AI — belum dicek terhadap dokumen',
    CONFIRMED: 'Usulan AI — sudah dicek peninjau', MASTER_MATCH: 'Dari master data', USER_EDITED: 'Diisi peninjau',
    SYSTEM_DERIVED: 'Diturunkan sistem', EMPTY: 'Belum ada', NOT_IN_SOURCE: 'Dibuang: tidak tertulis di sumber',
    DATE_OUT_OF_RANGE: 'Dibuang: tanggal tidak sah', IMO_CHECK_DIGIT: 'Check digit IMO tidak cocok',
  },
  en: {
    SOURCE_DOCUMENT: 'AI proposal from document', UNVERIFIED: 'AI proposal — not yet checked against document',
    CONFIRMED: 'AI proposal — checked by reviewer', MASTER_MATCH: 'From master data', USER_EDITED: 'Entered by reviewer',
    SYSTEM_DERIVED: 'Derived by system', EMPTY: 'Not available', NOT_IN_SOURCE: 'Discarded: not written in source',
    DATE_OUT_OF_RANGE: 'Discarded: invalid date', IMO_CHECK_DIGIT: 'IMO check digit mismatch',
  },
}

type FieldLike = { value: unknown; source: string; flags: string[]; extracted: unknown; confirmed: boolean }

/** Lencana asal nilai — AI selalu disebut sebagai "usulan", tidak pernah sebagai fakta. */
export function ProvenanceBadge({ f, lang }: { f: FieldLike; lang: Lang }) {
  const L = LABEL_ASAL[lang]
  const tidakTerverifikasi = f.flags.includes('UNVERIFIED_SOURCE')
  const g =
    f.source === 'USER_EDITED'
      ? { Icon: PencilLine, c: hijau, t: L.USER_EDITED }
      : f.source === 'MASTER_MATCH'
        ? { Icon: Database, c: hijau, t: L.MASTER_MATCH }
        : f.source === 'SOURCE_DOCUMENT'
          ? tidakTerverifikasi && !f.confirmed
            ? { Icon: ShieldQuestion, c: kuning, t: L.UNVERIFIED }
            : { Icon: Bot, c: biru, t: tidakTerverifikasi ? L.CONFIRMED : L.SOURCE_DOCUMENT }
          : f.flags.includes('NOT_IN_SOURCE')
            ? { Icon: AlertTriangle, c: kuning, t: L.NOT_IN_SOURCE }
            : f.flags.includes('DATE_OUT_OF_RANGE')
              ? { Icon: AlertTriangle, c: kuning, t: L.DATE_OUT_OF_RANGE }
              : { Icon: CircleDashed, c: netral, t: f.source === 'SYSTEM_DERIVED' ? L.SYSTEM_DERIVED : L.EMPTY }
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={cn(pil, g.c)}>
        <g.Icon className="w-3 h-3" aria-hidden="true" />
        {g.t}
      </span>
      {f.flags.includes('IMO_CHECK_DIGIT') && (
        <span className={cn(pil, kuning)}>
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          {L.IMO_CHECK_DIGIT}
        </span>
      )}
    </span>
  )
}

export const LABEL_COCOK: Record<Lang, Record<string, string>> = {
  id: {
    MATCHED: 'Cocok', AMBIGUOUS: 'Ambigu — pilih', NOT_FOUND: 'Tidak ditemukan', CONFLICT: 'Bertentangan — pilih manual',
    EXACT_IMO: 'IMO sama persis', EXACT_MMSI_VERIFIED: 'MMSI terverifikasi sama', EXACT_CALL_SIGN: 'Call sign sama (unik)',
    NAME_NORMALIZED: 'Nama saja — wajib dikonfirmasi', UNLOCODE: 'UN/LOCODE sama', SELECTED_BY_REVIEWER: 'Dipilih peninjau',
    CREATED_BY_REVIEWER: 'Dibuat peninjau', MMSI_UNVERIFIED: 'MMSI belum terverifikasi', NAME_PARTIAL: 'Nama mirip',
    LEFT_EMPTY: 'Sengaja dikosongkan', INACTIVE: 'nonaktif',
  },
  en: {
    MATCHED: 'Matched', AMBIGUOUS: 'Ambiguous — choose', NOT_FOUND: 'Not found', CONFLICT: 'Conflicting — choose manually',
    EXACT_IMO: 'Exact IMO', EXACT_MMSI_VERIFIED: 'Exact verified MMSI', EXACT_CALL_SIGN: 'Exact call sign (unique)',
    NAME_NORMALIZED: 'Name only — confirmation required', UNLOCODE: 'Exact UN/LOCODE', SELECTED_BY_REVIEWER: 'Selected by reviewer',
    CREATED_BY_REVIEWER: 'Created by reviewer', MMSI_UNVERIFIED: 'Unverified MMSI', NAME_PARTIAL: 'Similar name',
    LEFT_EMPTY: 'Intentionally left empty', INACTIVE: 'inactive',
  },
}

export function MatchBadge({ status, lang }: { status: string; lang: Lang }) {
  const g =
    status === 'MATCHED'
      ? { Icon: CheckCircle2, c: hijau }
      : status === 'CONFLICT'
        ? { Icon: AlertOctagon, c: merah }
        : status === 'AMBIGUOUS'
          ? { Icon: AlertTriangle, c: kuning }
          : { Icon: CircleDashed, c: netral }
  return (
    <span className={cn(pil, g.c)}>
      <g.Icon className="w-3 h-3" aria-hidden="true" />
      {LABEL_COCOK[lang][status] ?? status}
    </span>
  )
}

export const LABEL_SYARAT: Record<Lang, Record<string, string>> = {
  id: {
    STATUS_NOT_REVIEWABLE: 'Intake tidak dalam status yang bisa disetujui.',
    CLASSIFICATION_NOT_SUPPORTED: 'Hanya nominasi/appointment baru yang bisa disetujui.',
    PRIMARY_VESSEL_UNRESOLVED: 'Kapal utama belum dipastikan.',
    VESSEL_UNRESOLVED: 'Ada kapal yang belum dipilih/dibuat (atau keluarkan dari usulan).',
    VESSEL_CONFIRMATION_REQUIRED: 'Kecocokan kapal lewat nama saja belum dikonfirmasi.',
    DUPLICATE_VESSEL_SELECTED: 'Kapal yang sama dipilih lebih dari sekali.',
    PORT_UNRESOLVED: 'Pelabuhan belum dipilih dari master pelabuhan.',
    PORT_CONFIRMATION_REQUIRED: 'Kecocokan pelabuhan lewat nama belum dikonfirmasi.',
    ETA_MISSING: 'ETA belum diisi.',
    PRINCIPAL_UNRESOLVED: 'Principal belum dikonfirmasi/dipilih — atau pilih "Biarkan kosong".',
    CUSTOMER_UNRESOLVED: 'Customer belum dipilih — atau pilih "Biarkan kosong".',
    SOURCE_FIELDS_UNCONFIRMED: 'Nilai dari PDF/gambar belum dicek terhadap dokumen asli.',
    DUPLICATE_DECISION_REQUIRED: 'Putuskan: tautkan ke voyage lama, lanjut sebagai voyage baru, atau batalkan.',
    DUPLICATE_REVIEW_CONFIRMATION_REQUIRED: 'Centang bahwa kandidat duplikat sudah diperiksa.',
    DUPLICATE_REASON_REQUIRED: 'Kemungkinan besar duplikat: alasan (min. 10 karakter) wajib diisi.',
    PORTAL_ACK_REQUIRED: 'Customer punya akses portal: centang pernyataan paparan portal.',
  },
  en: {
    STATUS_NOT_REVIEWABLE: 'The intake is not in an approvable state.',
    CLASSIFICATION_NOT_SUPPORTED: 'Only new nominations/appointments can be approved.',
    PRIMARY_VESSEL_UNRESOLVED: 'The primary vessel is not resolved.',
    VESSEL_UNRESOLVED: 'A vessel is not selected/created yet (or exclude it).',
    VESSEL_CONFIRMATION_REQUIRED: 'A name-only vessel match is not confirmed.',
    DUPLICATE_VESSEL_SELECTED: 'The same vessel is selected more than once.',
    PORT_UNRESOLVED: 'The port is not selected from the port master.',
    PORT_CONFIRMATION_REQUIRED: 'A name-based port match is not confirmed.',
    ETA_MISSING: 'ETA is missing.',
    PRINCIPAL_UNRESOLVED: 'Principal not confirmed/selected — or choose "Leave empty".',
    CUSTOMER_UNRESOLVED: 'Customer not selected — or choose "Leave empty".',
    SOURCE_FIELDS_UNCONFIRMED: 'Values read from a PDF/image are not yet checked against the original.',
    DUPLICATE_DECISION_REQUIRED: 'Decide: link to the existing voyage, continue as new, or cancel.',
    DUPLICATE_REVIEW_CONFIRMATION_REQUIRED: 'Tick that the duplicate candidates were checked.',
    DUPLICATE_REASON_REQUIRED: 'Likely duplicate: a reason (min. 10 characters) is required.',
    PORTAL_ACK_REQUIRED: 'The customer has portal access: tick the portal exposure acknowledgement.',
  },
}

export const LABEL_PERINGATAN: Record<Lang, Record<string, string>> = {
  id: {
    VESSELS_NOT_ATTACHED: 'Kapal tambahan (tug/barge) gagal dipasang — tambahkan manual di halaman voyage.',
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
