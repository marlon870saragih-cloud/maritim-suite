'use client'

// Potongan UI bersama Pesan Klien WhatsApp — WA-2a 2a-G (T3).
// Komponen client HANYA memanggil /api/automation/client-messages (API 2a-G, origin sendiri). Tidak mengimpor
// modul server: tipe DTO di bawah dideklarasikan lokal mengikuti kontrak API (preflight §6.7 + OD-20 opsi B).
// UI hanya menampilkan; semua aturan (tenant, peran, maker-checker, freshness, consent) diputus server.

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/i18n'

export const API_PESAN_KLIEN = '/api/automation/client-messages'
export const RUTE_PESAN_KLIEN = '/automation/client-messages'
/** Batas tunggu satu permintaan; lewat batas → "status tidak pasti", data dimuat ulang, tanpa kirim ulang. */
export const BATAS_TUNGGU_MS = 15_000

// ---------------------------------------------------------------- DTO (kontrak API)

export type ApprovalRingkas = { id: string; status: string; expiresAt: string | null }
export type RingkasanPesan = {
  id: string
  revision: number
  state: string
  reasonCode: string | null
  language: string
  templateId: string
  templateVersion: number
  partyType: string
  penerimaTersamar: string
  konteks: { voyageId: string | null; keluarga: string | null }
  approval: ApprovalRingkas | null
  createdAt: string
  updatedAt: string
  finalizedAt: string | null
}
export type AksiPesan = 'PRATINJAU' | 'MINTA_APPROVAL' | 'SETUJUI' | 'TOLAK' | 'BATALKAN' | 'BUAT_REVISI'
export type DetailPesan = Omit<RingkasanPesan, 'konteks' | 'approval'> & {
  contactId: string
  body: string
  fields: Record<string, unknown>
  snapshotFingerprint: string
  freshness: { status: string | null; aturan: string | null; buktiRingkas: Record<string, string>[] }
  konteks: { voyageId: string | null; keluarga: string | null; signalIds: string[] }
  approval: { id: string; status: string; proposalHash: string; expiresAt: string | null; decidedAt: string | null } | null
  previewedAt: string | null
  approvedAt: string | null
  aksiTersedia: AksiPesan[]
  labelPengiriman: string
}
export type PeristiwaPesan = {
  id: string
  waktu: string
  objek: 'PESAN' | 'APPROVAL'
  peristiwa: string | null
  stateDari: string | null
  stateKe: string | null
  alasan: string | null
  aktor: { userId: string | null; nama: string | null }
}
export type KandidatSinyal = { id: string; voyageId: string; keluarga: string; kind: string; reviewState: string; detectedAt: string }
export type KandidatKontak = { contactId: string; penerimaTersamar: string; partyType: string; bahasa: string; layak: boolean; alasan: string | null }
export type Halaman<T> = { items: T[]; nextCursor: string | null }

export const STATUS_PESAN = ['DRAFT', 'PREVIEWED', 'PENDING_APPROVAL', 'APPROVED', 'NEEDS_REVIEW', 'EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'] as const
export const STATUS_TERMINAL = ['EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'] as const
/** Kode `hasil` service F3/F4 yang boleh dibawa lewat ?hasil= saat berpindah halaman (selain itu diabaikan). */
export const HASIL_DIKENAL = [
  'DRAFT_DIBUAT', 'SUDAH_ADA', 'DIPRATINJAU', 'DITOLAK', 'DITAHAN', 'DIBLOKIR', 'APPROVAL_DIMINTA', 'DISETUJUI',
  'DITOLAK_PEMUTUS', 'SUDAH_DIPUTUSKAN', 'KEDALUWARSA', 'DIBATALKAN', 'SUDAH_DIBATALKAN',
] as const

// ---------------------------------------------------------------- label

/** Label pengiriman wajib (sama dengan `labelPengiriman` server) di daftar dan detail, termasuk APPROVED. */
export const LABEL_BELUM_DIKIRIM: Record<Lang, string> = {
  id: 'BELUM DIKIRIM — tidak ada pengiriman pada fase ini',
  en: 'NOT SENT — no sending in this phase',
}

export function BelumDikirimBanner({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <p
      role="note"
      data-testid="label-belum-dikirim"
      className={cn(
        'flex items-center gap-2 rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs font-mono font-semibold tracking-wider text-status-warning',
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {LABEL_BELUM_DIKIRIM[lang]}
    </p>
  )
}

export const LABEL_STATE: Record<Lang, Record<string, string>> = {
  id: {
    DRAFT: 'Draf', PREVIEWED: 'Sudah dipratinjau', PENDING_APPROVAL: 'Menunggu approval', APPROVED: 'Disetujui — BELUM DIKIRIM',
    NEEDS_REVIEW: 'Perlu tinjauan ulang', EXPIRED: 'Kedaluwarsa', REJECTED: 'Ditolak', BLOCKED: 'Diblokir', CANCELED: 'Dibatalkan',
  },
  en: {
    DRAFT: 'Draft', PREVIEWED: 'Previewed', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved — NOT SENT',
    NEEDS_REVIEW: 'Needs review', EXPIRED: 'Expired', REJECTED: 'Rejected', BLOCKED: 'Blocked', CANCELED: 'Canceled',
  },
}

export const LABEL_KELUARGA: Record<Lang, Record<string, string>> = {
  id: { SCHEDULE_CHANGE: 'Perubahan jadwal (ETA/ETD)', EOSP: 'EOSP', ALL_FAST: 'All Fast', SAILED: 'Sailed' },
  en: { SCHEDULE_CHANGE: 'Schedule change (ETA/ETD)', EOSP: 'EOSP', ALL_FAST: 'All Fast', SAILED: 'Sailed' },
}

export const LABEL_HASIL: Record<Lang, Record<string, string>> = {
  id: {
    DRAFT_DIBUAT: 'Draft dibuat', SUDAH_ADA: 'Draft dengan isi sama sudah ada', DIPRATINJAU: 'Sudah dipratinjau', DITOLAK: 'Ditolak server',
    DITAHAN: 'Ditahan — perlu tinjauan ulang', DIBLOKIR: 'Diblokir', APPROVAL_DIMINTA: 'Approval diminta', DISETUJUI: 'Disetujui (belum dikirim)',
    DITOLAK_PEMUTUS: 'Ditolak checker', SUDAH_DIPUTUSKAN: 'Approval sudah diputuskan sebelumnya', KEDALUWARSA: 'Approval kedaluwarsa',
    DIBATALKAN: 'Dibatalkan', SUDAH_DIBATALKAN: 'Sudah dibatalkan sebelumnya',
  },
  en: {
    DRAFT_DIBUAT: 'Draft created', SUDAH_ADA: 'A draft with the same content already exists', DIPRATINJAU: 'Previewed', DITOLAK: 'Rejected by server',
    DITAHAN: 'Held — needs review', DIBLOKIR: 'Blocked', APPROVAL_DIMINTA: 'Approval requested', DISETUJUI: 'Approved (not sent)',
    DITOLAK_PEMUTUS: 'Rejected by checker', SUDAH_DIPUTUSKAN: 'Approval was already decided', KEDALUWARSA: 'Approval expired',
    DIBATALKAN: 'Canceled', SUDAH_DIBATALKAN: 'Already canceled',
  },
}

/** Kode alasan / `details.code` server → penjelasan singkat. Kode tak dikenal ditampilkan apa adanya. */
export const LABEL_ALASAN: Record<Lang, Record<string, string>> = {
  id: {
    SELF_APPROVAL_FORBIDDEN: 'Peminta approval tidak boleh memutuskan approval-nya sendiri.',
    CHECKER_IS_MAKER: 'Pembuat draft tidak boleh menjadi checker.',
    CHECKER_IS_EVIDENCE_RECORDER: 'Pencatat bukti (konfirmasi/peristiwa) tidak boleh menjadi checker.',
    APPROVAL_POLICY_MISMATCH: 'Data approval tidak memenuhi kebijakan.', ROLE_NOT_ALLOWED: 'Peran Anda tidak berhak.',
    DECISION_NOTE_INVALID: 'Catatan/alasan wajib 3–1000 karakter.', PROPOSAL_HASH_MISMATCH: 'Isi yang disetujui sudah berubah — muat ulang.',
    SNAPSHOT_MISMATCH: 'Isi pesan sudah berubah — muat ulang.', MESSAGE_STATE_INVALID: 'Aksi tidak berlaku pada status pesan sekarang.',
    CONCURRENCY_CONFLICT: 'Data diubah bersamaan — muat ulang.', MESSAGE_TRANSITION_FORBIDDEN: 'Perubahan status tidak sah.',
    EVENT_NOT_ALLOWED: 'Jenis sinyal tidak didukung.', SOURCE_INVALID: 'Sumber sinyal tidak lagi sah.', SOURCE_CHANGED: 'Sumber sudah berubah.',
    SIGNAL_DISMISSED: 'Sinyal sudah diabaikan.', SIGNAL_EXPIRED: 'Sinyal sudah kedaluwarsa.', CANDIDATE_BLOCKED: 'Kandidat diblokir.',
    CONTACT_INELIGIBLE: 'Kontak tidak layak (verifikasi/status).', CONSENT_NOT_GRANTED: 'Kontak belum memberi persetujuan (opt-in).',
    CONSENT_CHANGED: 'Persetujuan kontak berubah.', ACCESS_DENIED: 'Kontak tidak berhak atas voyage ini.',
    CATEGORY_NOT_GRANTED: 'Kategori pesan tidak diizinkan untuk kontak ini.', GRANT_NOT_ELIGIBLE: 'Izin akses kontak tidak berlaku.',
    VOYAGE_NOT_ELIGIBLE: 'Voyage tidak memenuhi syarat.', TEMPLATE_DATA_INVALID: 'Data template tidak lengkap.',
    FRESHNESS_EVIDENCE_MISSING: 'Bukti kesegaran data belum ada.', CONFIRMATION_MISSING: 'Konfirmasi jadwal staf belum ada.',
    CONFIRMATION_INVALIDATED: 'Konfirmasi jadwal sudah dibatalkan.', CONFIRMATION_EXPIRED: 'Konfirmasi jadwal sudah kedaluwarsa.',
    EVENT_TOO_OLD: 'Peristiwa terlalu lama.', EVENT_IN_FUTURE: 'Waktu peristiwa di masa depan.', REVISION_SUPERSEDED: 'Digantikan revisi baru.',
    MESSAGE_CANCELED_BY_STAFF: 'Dibatalkan staf.', MESSAGE_HELD: 'Ditahan karena perubahan kontak/consent/izin.',
    EVIDENCE_CHANGED: 'Bukti berubah sejak diminta.', APPROVAL_REJECTED: 'Approval ditolak.',
    WA2_DISABLED: 'Fitur pesan klien tidak aktif.', WA2_ENV_NOT_ALLOWED: 'Tidak diizinkan di lingkungan ini.',
  },
  en: {
    SELF_APPROVAL_FORBIDDEN: 'The approval requester cannot decide their own approval.',
    CHECKER_IS_MAKER: 'The draft author cannot be the checker.',
    CHECKER_IS_EVIDENCE_RECORDER: 'The evidence recorder (confirmation/event) cannot be the checker.',
    APPROVAL_POLICY_MISMATCH: 'Approval data does not satisfy the policy.', ROLE_NOT_ALLOWED: 'Your role is not allowed.',
    DECISION_NOTE_INVALID: 'Note/reason must be 3–1000 characters.', PROPOSAL_HASH_MISMATCH: 'The approved content changed — reload.',
    SNAPSHOT_MISMATCH: 'Message content changed — reload.', MESSAGE_STATE_INVALID: 'Action not valid for the current message state.',
    CONCURRENCY_CONFLICT: 'Data changed concurrently — reload.', MESSAGE_TRANSITION_FORBIDDEN: 'Invalid state change.',
    EVENT_NOT_ALLOWED: 'Signal type not supported.', SOURCE_INVALID: 'Signal source is no longer valid.', SOURCE_CHANGED: 'Source changed.',
    SIGNAL_DISMISSED: 'Signal was dismissed.', SIGNAL_EXPIRED: 'Signal expired.', CANDIDATE_BLOCKED: 'Candidate blocked.',
    CONTACT_INELIGIBLE: 'Contact not eligible (verification/status).', CONSENT_NOT_GRANTED: 'Contact has not opted in.',
    CONSENT_CHANGED: 'Contact consent changed.', ACCESS_DENIED: 'Contact has no access to this voyage.',
    CATEGORY_NOT_GRANTED: 'Message category not granted for this contact.', GRANT_NOT_ELIGIBLE: 'Contact access grant not valid.',
    VOYAGE_NOT_ELIGIBLE: 'Voyage not eligible.', TEMPLATE_DATA_INVALID: 'Template data incomplete.',
    FRESHNESS_EVIDENCE_MISSING: 'Freshness evidence missing.', CONFIRMATION_MISSING: 'Staff schedule confirmation missing.',
    CONFIRMATION_INVALIDATED: 'Schedule confirmation was invalidated.', CONFIRMATION_EXPIRED: 'Schedule confirmation expired.',
    EVENT_TOO_OLD: 'Event too old.', EVENT_IN_FUTURE: 'Event time is in the future.', REVISION_SUPERSEDED: 'Replaced by a new revision.',
    MESSAGE_CANCELED_BY_STAFF: 'Canceled by staff.', MESSAGE_HELD: 'Held due to a contact/consent/grant change.',
    EVIDENCE_CHANGED: 'Evidence changed since requested.', APPROVAL_REJECTED: 'Approval rejected.',
    WA2_DISABLED: 'Client messaging is disabled.', WA2_ENV_NOT_ALLOWED: 'Not allowed in this environment.',
  },
}

export const jelaskan = (kode: string | null | undefined, lang: Lang): string => (kode ? (LABEL_ALASAN[lang][kode] ?? kode) : '')
export const labelHasil = (hasil: string | null | undefined, lang: Lang): string => (hasil ? (LABEL_HASIL[lang][hasil] ?? hasil) : '')

const WARNA_STATE: Record<string, string> = {
  APPROVED: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  PREVIEWED: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  PENDING_APPROVAL: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  NEEDS_REVIEW: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  BLOCKED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
  REJECTED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}

export function StateBadge({ state, lang }: { state: string; lang: Lang }) {
  return (
    <span
      data-testid="state-badge"
      data-state={state}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider',
        WARNA_STATE[state] ?? 'bg-surface-tertiary text-text-secondary border-border-muted',
      )}
    >
      {LABEL_STATE[lang][state] ?? state}
    </span>
  )
}

// ---------------------------------------------------------------- panggilan API

export type JawabanApi<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; kode: string; pesan: string; kodeRinci: string | null; tidakPasti: boolean }

/**
 * Panggil API pesan klien di origin sendiri. POST selalu `Content-Type: application/json` (pagar CSRF server);
 * peramban mengirim Origin sendiri. Lewat BATAS_TUNGGU_MS atau putus jaringan → `tidakPasti` (hasil mutasi
 * tidak diketahui; pemanggil wajib memuat ulang, TIDAK mengirim ulang).
 */
export async function panggilApi<T>(path: string, metode: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<JawabanApi<T>> {
  const henti = new AbortController()
  const jam = setTimeout(() => henti.abort(), BATAS_TUNGGU_MS)
  try {
    const res = await fetch(`${API_PESAN_KLIEN}${path}`, {
      method: metode,
      cache: 'no-store',
      signal: henti.signal,
      headers: metode === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: metode === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.ok && json && json.ok === true) return { ok: true, status: res.status, data: json as T }
    const g = (json?.error ?? {}) as { code?: string; message?: string; details?: { code?: string } }
    if (res.status === 401 && typeof window !== 'undefined') window.location.assign('/login')
    return { ok: false, status: res.status, kode: g.code ?? 'ERR', pesan: g.message ?? `HTTP ${res.status}`, kodeRinci: g.details?.code ?? null, tidakPasti: false }
  } catch {
    return { ok: false, status: 0, kode: 'TIDAK_PASTI', pesan: '', kodeRinci: null, tidakPasti: true }
  } finally {
    clearTimeout(jam)
  }
}

export const TEKS_UMUM: Record<Lang, Record<string, string>> = {
  id: {
    tidakPasti: 'Status tidak pasti (waktu habis/koneksi terputus) — data dimuat ulang. Periksa status sebelum mencoba lagi.',
    konflik: 'Data berubah, tinjau ulang.',
    gagalMuat: 'Gagal memuat data.',
  },
  en: {
    tidakPasti: 'Status uncertain (timeout/connection lost) — data reloaded. Check the status before trying again.',
    konflik: 'Data changed, please review again.',
    gagalMuat: 'Failed to load data.',
  },
}

/** Pesan galat untuk pengguna: kode server + penjelasan details.code (teks statis, tanpa logika kebijakan). */
export function pesanGalat(r: { status: number; kode: string; pesan: string; kodeRinci: string | null; tidakPasti: boolean }, lang: Lang): string {
  if (r.tidakPasti) return TEKS_UMUM[lang].tidakPasti
  if (r.status === 409) return `${TEKS_UMUM[lang].konflik} (${r.kode})`
  const rinci = r.kodeRinci ? ` — ${jelaskan(r.kodeRinci, lang)}` : ''
  const wa2 = /WA2_(DISABLED|ENV_NOT_ALLOWED)/.exec(r.pesan)?.[0]
  return `${r.status} ${r.kode}: ${wa2 ? jelaskan(wa2, lang) : r.pesan}${rinci}`
}
