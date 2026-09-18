'use client'

// Potongan UI bersama Automation Hub (PRD-002 Step 5B).
// Severity & kesehatan SELALU dibawa ikon + teks, tidak pernah warna saja.

import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Clock3, Info, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lang } from '@/lib/i18n'

export const LABEL_SEVERITY: Record<Lang, Record<string, string>> = {
  id: { INFO: 'Info', WARNING: 'Peringatan', ERROR: 'Galat' },
  en: { INFO: 'Info', WARNING: 'Warning', ERROR: 'Error' },
}

export const LABEL_JENIS: Record<Lang, Record<string, string>> = {
  id: {
    ETA_CHANGED: 'Perubahan ETA/ETD',
    VOYAGE_STATUS_CHANGED: 'Perubahan status',
    OPERATIONAL_EVENT_RECORDED: 'Peristiwa operasional',
    ACTUAL_DATE_MISSING: 'Tanggal aktual belum lengkap',
    DATA_STALE: 'Tanpa pembaruan',
    MONITORING_ERROR: 'Galat pemantauan',
    AIS_STALE: 'Posisi AIS basi',
    AIS_PROVIDER_DOWN: 'Penyedia AIS gagal',
  },
  en: {
    ETA_CHANGED: 'ETA/ETD changed',
    VOYAGE_STATUS_CHANGED: 'Status changed',
    OPERATIONAL_EVENT_RECORDED: 'Operational event',
    ACTUAL_DATE_MISSING: 'Actual date missing',
    DATA_STALE: 'No recent update',
    MONITORING_ERROR: 'Monitoring error',
    AIS_STALE: 'AIS position stale',
    AIS_PROVIDER_DOWN: 'AIS provider failing',
  },
}

export const LABEL_REVIEW: Record<Lang, Record<string, string>> = {
  id: { OPEN: 'Terbuka', ACKNOWLEDGED: 'Diakui', DISMISSED: 'Diabaikan', EXPIRED: 'Kedaluwarsa' },
  en: { OPEN: 'Open', ACKNOWLEDGED: 'Acknowledged', DISMISSED: 'Dismissed', EXPIRED: 'Expired' },
}

export function SeverityBadge({ severity, lang }: { severity: string; lang: Lang }) {
  const gaya =
    severity === 'ERROR'
      ? { Icon: AlertOctagon, cls: 'bg-status-danger/12 text-status-danger border-status-danger/30' }
      : severity === 'WARNING'
        ? { Icon: AlertTriangle, cls: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30' }
        : { Icon: Info, cls: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30' }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider',
        gaya.cls,
      )}
    >
      <gaya.Icon className="w-3 h-3" aria-hidden="true" />
      {LABEL_SEVERITY[lang][severity] ?? severity}
    </span>
  )
}

const LABEL_KESEHATAN: Record<Lang, Record<string, string>> = {
  id: { SEHAT: 'Sehat', TERLAMBAT: 'Pengecekan terlambat', BELUM_DICEK: 'Belum dicek', BERHENTI: 'Berhenti' },
  en: { SEHAT: 'Healthy', TERLAMBAT: 'Check overdue', BELUM_DICEK: 'Not checked yet', BERHENTI: 'Stopped' },
}

export function HealthBadge({ kesehatan, lang }: { kesehatan: string; lang: Lang }) {
  const gaya =
    kesehatan === 'SEHAT'
      ? { Icon: CheckCircle2, cls: 'bg-status-success/12 text-status-success border-status-success/30' }
      : kesehatan === 'TERLAMBAT'
        ? { Icon: Clock3, cls: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30' }
        : kesehatan === 'BERHENTI'
          ? { Icon: PauseCircle, cls: 'bg-surface-tertiary text-text-secondary border-border-muted' }
          : { Icon: CircleDashed, cls: 'bg-surface-tertiary text-text-secondary border-border-muted' }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', gaya.cls)}>
      <gaya.Icon className="w-3 h-3" aria-hidden="true" />
      {LABEL_KESEHATAN[lang][kesehatan] ?? kesehatan}
    </span>
  )
}

/** Waktu untuk manusia — selalu WITA (Asia/Makassar), apa pun zona browser. */
export function fmtWaktu(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return (
    d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', {
      timeZone: 'Asia/Makassar',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' WITA'
  )
}

/**
 * Tautan teks yang sekaligus target sentuh. WCAG 2.2 SC 2.5.8 meminta 24×24 CSS px.
 * TIDAK dipakai untuk tautan yang tertanam di dalam kalimat: SC itu mengecualikannya,
 * dan memaksakan tinggi di sana justru merusak alir baris teksnya.
 */
export const tautanSentuhCls = 'inline-flex items-center gap-1 min-h-[24px]'

export const btnCls =
  'inline-flex items-center justify-center gap-1.5 min-h-[36px] rounded px-3 py-1.5 text-xs font-medium transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 disabled:opacity-50 disabled:cursor-not-allowed'
