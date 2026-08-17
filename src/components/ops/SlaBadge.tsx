'use client'

// Badge keadaan SLA (Fase 7d, K100) — precedent langsung: ConfidenceBadge.tsx
// (Fase 6d). Sama-sama menghitung ULANG di klien dari modul MURNI, bukan
// mempercayai string yang sudah dibakukan server — tapi alasannya BERBEDA dari
// ConfidenceBadge, dan itu keputusan yang disengaja, bukan tiru-tempel:
//
//   - ConfidenceBadge menghitung ulang supaya teksnya ikut berganti bahasa
//     tanpa request kedua (bahasa berubah, ANGKA yang mendasarinya tidak).
//   - SlaBadge menghitung ulang karena K100 menegaskan keadaan SLA "berubah
//     SETIAP DETIK tanpa ada yang menyentuh datanya" — papan Kanban yang
//     dibiarkan terbuka 20 menit tidak boleh terus menampilkan AMAN padahal
//     tenggatnya sudah lewat. `sekarang` di sini berasal dari jam KLIEN
//     (di-refresh berkala lewat interval), bukan dari body respons API yang
//     dibekukan pada saat fetch.
//
// `nilaiSla` + `AMBANG_MENDEKATI_JAM` diimpor LANGSUNG dari service/ops murni
// (K51) — bukan field `sla` yang sudah dikirim server. Server tetap menghitung
// `sla` yang sama persis (task.service.ts → denganSla()) untuk kebutuhan lain
// (filter/urutan/laporan); badge ini sengaja tidak bergantung padanya supaya ia
// tetap akurat di antara dua fetch.

import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { nilaiSla, type KeadaanSla } from '@/services/ops/sla'
import { AMBANG_MENDEKATI_JAM } from '@/services/ops/sla-policy'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    AMAN: 'Aman',
    MENDEKATI: 'Mendekati',
    TERLAMBAT: 'Terlambat',
    DILANGGAR: 'Dilanggar',
    TIDAK_BER_SLA: 'Tanpa SLA',
    sisa: 'sisa',
    telat: 'telat',
    jam: 'jam',
    tanpaTenggat: 'Tugas ini tidak punya tenggat (SLA).',
    tenggat: 'Tenggat',
    target: 'Target',
    selesai: 'Selesai',
    kalender: 'Dihitung dalam jam kalender (24/7), bukan jam kerja.',
  },
  en: {
    AMAN: 'On track',
    MENDEKATI: 'Approaching',
    TERLAMBAT: 'Overdue',
    DILANGGAR: 'Breached',
    TIDAK_BER_SLA: 'No SLA',
    sisa: 'left',
    telat: 'late',
    jam: 'h',
    tanpaTenggat: 'This task has no due date (SLA).',
    tenggat: 'Due',
    target: 'Target',
    selesai: 'Done',
    kalender: 'Calculated in calendar hours (24/7), not working hours.',
  },
}

/** Warna murni fungsi KEADAAN — sama pola dengan VOYAGE_STATUS_COLOR/ConfidenceBadge WARNA. */
const WARNA: Record<KeadaanSla, string> = {
  DILANGGAR: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  TERLAMBAT: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  MENDEKATI: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  AMAN: 'bg-status-success/12 text-status-success border-status-success/30',
  TIDAK_BER_SLA: 'bg-surface-tertiary text-text-secondary border-border-muted',
}

/** Segarkan "sekarang" tiap menit — cukup untuk badge yang dibiarkan terbuka lama, tanpa membebani render. */
const INTERVAL_SEGAR_MS = 60_000

function fmtJam(n: number, lang: Lang): string {
  const abs = Math.abs(n)
  const bulat = abs < 10 ? Math.round(abs * 10) / 10 : Math.round(abs)
  return lang === 'id' ? `${bulat} jam` : `${bulat}h`
}

export function SlaBadge({
  dueAt,
  completedAt,
  slaHours,
  className,
}: {
  dueAt: string | Date | null
  completedAt: string | Date | null
  slaHours?: number | null
  className?: string
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const [sekarang, setSekarang] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setSekarang(new Date()), INTERVAL_SEGAR_MS)
    return () => clearInterval(id)
  }, [])

  const due = dueAt ? new Date(dueAt) : null
  const done = completedAt ? new Date(completedAt) : null

  const hasil = nilaiSla({
    dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    completedAt: done && !Number.isNaN(done.getTime()) ? done : null,
    slaHours: slaHours ?? null,
    sekarang,
    ambangMendekatiJam: AMBANG_MENDEKATI_JAM,
  })

  const label = t[hasil.keadaan]
  const jamTeks =
    hasil.keadaan === 'TERLAMBAT' || hasil.keadaan === 'DILANGGAR'
      ? hasil.telatJam !== null
        ? `${fmtJam(hasil.telatJam, lang)} ${t.telat}`
        : null
      : hasil.keadaan === 'MENDEKATI' && hasil.sisaJam !== null
        ? `${fmtJam(hasil.sisaJam, lang)} ${t.sisa}`
        : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-mono uppercase tracking-wider cursor-default whitespace-nowrap',
            WARNA[hasil.keadaan],
            className,
          )}
        >
          {label}
          {jamTeks && <span className="normal-case tracking-normal opacity-80">· {jamTeks}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed space-y-1">
        {hasil.keadaan === 'TIDAK_BER_SLA' ? (
          <p>{t.tanpaTenggat}</p>
        ) : (
          <>
            <p>
              {t.tenggat}: {due ? due.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB') : '—'}
            </p>
            {done && (
              <p>
                {t.selesai}: {done.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB')}
              </p>
            )}
            {slaHours != null && (
              <p>
                {t.target}: {slaHours} {t.jam}
              </p>
            )}
            <p className="opacity-60">{t.kalender}</p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
