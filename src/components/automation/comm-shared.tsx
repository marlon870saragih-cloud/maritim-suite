'use client'

// Potongan UI bersama Komunikasi (Simulasi) — WA-1 Step 2I.
// Komponen client HANYA memanggil /api/automation/communications (Step 2H); tak pernah mengimpor
// service, prisma, atau modul server saat jalan (impor `type` saja).

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/i18n'

export const API_KOMUNIKASI = '/api/automation/communications'

/** Teks wajib PRD §8 butir 3 di setiap tampilan pengiriman. */
export const LABEL_SIMULASI: Record<Lang, string> = {
  id: 'SIMULASI — TIDAK DIKIRIM KE WHATSAPP',
  en: 'SIMULATION — NOT SENT TO WHATSAPP',
}

export function SimulasiBanner({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <p
      role="note"
      data-testid="label-simulasi"
      className={cn(
        'flex items-center gap-2 rounded border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs font-mono font-semibold tracking-wider text-status-warning',
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {LABEL_SIMULASI[lang]}
    </p>
  )
}

export const LABEL_KELUARGA: Record<Lang, Record<string, string>> = {
  id: { SCHEDULE_CHANGE: 'Perubahan jadwal (ETA/ETD)', EOSP: 'EOSP', ALL_FAST: 'All Fast', SAILED: 'Sailed' },
  en: { SCHEDULE_CHANGE: 'Schedule change (ETA/ETD)', EOSP: 'EOSP', ALL_FAST: 'All Fast', SAILED: 'Sailed' },
}

export const LABEL_STATE_PESAN: Record<Lang, Record<string, string>> = {
  id: {
    DRAFT: 'Draf', PREVIEWED: 'Sudah dipratinjau', APPROVED: 'Disetujui', QUEUED_FAKE: 'Diproses',
    FAKE_SENT: 'FAKE terkirim (simulasi)', FAKE_FAILED: 'FAKE gagal (simulasi)', NEEDS_REVIEW: 'Perlu tinjauan ulang',
    BLOCKED: 'Diblokir', CANCELED: 'Dibatalkan',
  },
  en: {
    DRAFT: 'Draft', PREVIEWED: 'Previewed', APPROVED: 'Approved', QUEUED_FAKE: 'Processing',
    FAKE_SENT: 'FAKE sent (simulation)', FAKE_FAILED: 'FAKE failed (simulation)', NEEDS_REVIEW: 'Needs review',
    BLOCKED: 'Blocked', CANCELED: 'Canceled',
  },
}

export const LABEL_STATE_CANDIDATE: Record<Lang, Record<string, string>> = {
  id: { ACTIVE: 'Aktif', BLOCKED: 'Diblokir' },
  en: { ACTIVE: 'Active', BLOCKED: 'Blocked' },
}

/** Kode alasan service (comm-policy KODE_ALASAN) → penjelasan singkat. Kode tak dikenal ditampilkan apa adanya. */
export const LABEL_ALASAN: Record<Lang, Record<string, string>> = {
  id: {
    EVENT_NOT_ALLOWED: 'Jenis sinyal bukan event pilot WA-1.', SOURCE_NOT_FOUND: 'Sumber tidak ditemukan.',
    SOURCE_DELETED: 'Sumber sudah dihapus.', SOURCE_SUPERSEDED: 'Sumber sudah digantikan perubahan lebih baru.',
    SCHEDULE_FIRST_SET: 'Jadwal baru diisi pertama kali — tak ada perubahan untuk dikabarkan.',
    SCHEDULE_CLEARED: 'Jadwal dikosongkan — tidak dikabarkan.', PORT_MISSING: 'Pelabuhan voyage belum diisi.',
    PORT_AMBIGUOUS: 'Pelabuhan event tidak cocok dengan voyage.', TIMEZONE_MISSING: 'Zona waktu pelabuhan belum diisi.',
    TIMEZONE_INVALID: 'Zona waktu pelabuhan tidak sah.', TIME_IN_FUTURE: 'Waktu event ada di masa depan.',
    REQUIRED_DATA_MISSING: 'Data wajib belum lengkap.', CONTACT_INELIGIBLE: 'Penerima uji tidak layak.',
    CONSENT_NOT_GRANTED: 'Izin uji penerima tidak ada.', PREVIEW_REQUIRED: 'Pratinjau diperlukan lebih dulu.',
    APPROVAL_REQUIRED: 'Approval diperlukan sebelum FAKE Send.', APPROVAL_STALE: 'Approval sudah tidak berlaku — buat revisi baru.',
    SELF_APPROVAL_FORBIDDEN: 'Tidak boleh menyetujui usulan sendiri.', MODE_NOT_FAKE: 'Mode bukan simulasi FAKE.',
    ENV_NOT_ALLOWED: 'Tidak diizinkan di lingkungan ini.', FEATURE_DISABLED: 'Fitur tidak aktif.',
    ALREADY_FAKE_SENT: 'Sudah FAKE terkirim.', AUDIT_PERSIST_FAILED: 'Audit gagal disimpan.',
    FAKE_SIMULATED_FAILURE: 'Kegagalan simulasi FAKE.', SIGNAL_DISMISSED: 'Sinyal sudah diabaikan.',
    SIGNAL_EXPIRED: 'Sinyal sudah kedaluwarsa.', SIGNAL_STATE_INVALID: 'Status sinyal tidak sah.',
    REVISED: 'Digantikan revisi baru.', APPROVAL_REJECTED: 'Approval ditolak.', CANCELED_BY_USER: 'Dibatalkan pengguna.',
    CANCEL_NOT_ALLOWED: 'Pesan ini tidak dapat dibatalkan pada status sekarang.',
    EXECUTION_ATTEMPTS_EXHAUSTED: 'Batas percobaan (5) sudah habis.',
  },
  en: {
    EVENT_NOT_ALLOWED: 'Signal type is not a WA-1 pilot event.', SOURCE_NOT_FOUND: 'Source not found.',
    SOURCE_DELETED: 'Source was deleted.', SOURCE_SUPERSEDED: 'Source superseded by a newer change.',
    SCHEDULE_FIRST_SET: 'Schedule set for the first time — nothing to announce.',
    SCHEDULE_CLEARED: 'Schedule cleared — not announced.', PORT_MISSING: 'Voyage port is missing.',
    PORT_AMBIGUOUS: 'Event port does not match the voyage.', TIMEZONE_MISSING: 'Port time zone is missing.',
    TIMEZONE_INVALID: 'Port time zone is invalid.', TIME_IN_FUTURE: 'Event time is in the future.',
    REQUIRED_DATA_MISSING: 'Required data is incomplete.', CONTACT_INELIGIBLE: 'Test recipient is not eligible.',
    CONSENT_NOT_GRANTED: 'Test recipient permission missing.', PREVIEW_REQUIRED: 'Preview required first.',
    APPROVAL_REQUIRED: 'Approval required before FAKE Send.', APPROVAL_STALE: 'Approval no longer valid — create a new revision.',
    SELF_APPROVAL_FORBIDDEN: 'You cannot approve your own proposal.', MODE_NOT_FAKE: 'Mode is not FAKE simulation.',
    ENV_NOT_ALLOWED: 'Not allowed in this environment.', FEATURE_DISABLED: 'Feature disabled.',
    ALREADY_FAKE_SENT: 'Already FAKE sent.', AUDIT_PERSIST_FAILED: 'Audit could not be saved.',
    FAKE_SIMULATED_FAILURE: 'Simulated FAKE failure.', SIGNAL_DISMISSED: 'Signal was dismissed.',
    SIGNAL_EXPIRED: 'Signal expired.', SIGNAL_STATE_INVALID: 'Invalid signal state.',
    REVISED: 'Replaced by a new revision.', APPROVAL_REJECTED: 'Approval rejected.', CANCELED_BY_USER: 'Canceled by user.',
    CANCEL_NOT_ALLOWED: 'This message cannot be canceled in its current state.',
    EXECUTION_ATTEMPTS_EXHAUSTED: 'Attempt limit (5) reached.',
  },
}

export const jelaskanAlasan = (kode: string | null | undefined, lang: Lang): string =>
  kode ? (LABEL_ALASAN[lang][kode] ?? kode) : ''

const WARNA_STATE: Record<string, string> = {
  FAKE_SENT: 'bg-status-success/10 text-status-success border-status-success/30',
  APPROVED: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  PREVIEWED: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  FAKE_FAILED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
  BLOCKED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
  NEEDS_REVIEW: 'bg-status-warning/10 text-status-warning border-status-warning/30',
}

export function StateBadge({ state, lang, kamus = LABEL_STATE_PESAN }: { state: string; lang: Lang; kamus?: Record<Lang, Record<string, string>> }) {
  return (
    <span
      data-testid="state-badge"
      data-state={state}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider',
        WARNA_STATE[state] ?? 'bg-surface-tertiary text-text-secondary border-border-muted',
      )}
    >
      {kamus[lang][state] ?? state}
    </span>
  )
}

export type JawabanApi<T = Record<string, unknown>> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; kode: string; pesan: string }

/**
 * Panggil API komunikasi. POST selalu `Content-Type: application/json` (juga tanpa body) — syarat pagar
 * CSRF Step 2H; peramban mengirim Origin sendiri. Galat HTTP → { ok:false, kode, pesan } dari server.
 */
export async function panggilApi<T = Record<string, unknown>>(path: string, metode: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<JawabanApi<T>> {
  try {
    const res = await fetch(`${API_KOMUNIKASI}${path}`, {
      method: metode,
      cache: 'no-store',
      headers: metode === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: metode === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.ok && json && json.ok === true) return { ok: true, status: res.status, data: json as T }
    const g = (json?.error ?? {}) as { code?: string; message?: string }
    return { ok: false, status: res.status, kode: g.code ?? 'ERR', pesan: g.message ?? `HTTP ${res.status}` }
  } catch {
    return { ok: false, status: 0, kode: 'NETWORK', pesan: 'Koneksi gagal.' }
  }
}

/** Kunci idempotensi per klik untuk FAKE Send (requestKey 8–128 karakter A-Z a-z 0-9 . _ : -). */
export function kunciPermintaan(): string {
  const acak = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `ui-${acak}`
}
