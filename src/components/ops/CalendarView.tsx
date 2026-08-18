'use client'

// Kalender (K134-K135, Fase 7h) — tampilan bulan atas enam sumber tanggal
// yang sudah ada, TIDAK ADA tabel baru. Tampilan pekan & penyaring
// voyage/penanggung-jawab SENGAJA belum ada (P-ringan, di luar cakupan
// verifikasi 7h) — grid bulan + penyaring JENIS sudah menjawab kebutuhan
// inti "apa saja yang jatuh tempo/terjadi pada rentang ini".

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    today: 'Hari ini', empty: 'Tidak ada butir pada bulan ini.',
    errLoad: 'Gagal memuat kalender.', errConn: 'Gagal terhubung ke server.',
    jenis_VOYAGE_ARRIVAL: 'Kedatangan Kapal', jenis_VOYAGE_BERTH: 'Sandar', jenis_VOYAGE_DEPARTURE: 'Keberangkatan Kapal',
    jenis_TASK_DUE: 'Tenggat Tugas', jenis_CREW_CHANGE: 'Pergantian Awak',
    jenis_WORK_ORDER_START: 'Mulai Pekerjaan Vendor', jenis_WORK_ORDER_END: 'Selesai Pekerjaan Vendor',
    jenis_INVOICE_DUE: 'Jatuh Tempo Invoice', jenis_ATTACHMENT_EXPIRE: 'Dokumen Kedaluwarsa',
  },
  en: {
    today: 'Today', empty: 'No entries this month.',
    errLoad: 'Failed to load calendar.', errConn: 'Failed to connect to server.',
    jenis_VOYAGE_ARRIVAL: 'Vessel Arrival', jenis_VOYAGE_BERTH: 'Berthing', jenis_VOYAGE_DEPARTURE: 'Vessel Departure',
    jenis_TASK_DUE: 'Task Due', jenis_CREW_CHANGE: 'Crew Change',
    jenis_WORK_ORDER_START: 'Work Order Start', jenis_WORK_ORDER_END: 'Work Order End',
    jenis_INVOICE_DUE: 'Invoice Due', jenis_ATTACHMENT_EXPIRE: 'Document Expiring',
  },
}

type ButirKalender = {
  tanggal: string
  jenis: string
  judul: string
  href: string | null
  sla: string | null
}

const WARNA_JENIS: Record<string, string> = {
  VOYAGE_ARRIVAL: 'bg-accent-teal/15 text-accent-teal border-accent-teal/30',
  VOYAGE_BERTH: 'bg-accent-teal/15 text-accent-teal border-accent-teal/30',
  VOYAGE_DEPARTURE: 'bg-status-success/15 text-status-success border-status-success/30',
  TASK_DUE: 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
  CREW_CHANGE: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
  WORK_ORDER_START: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
  WORK_ORDER_END: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
  INVOICE_DUE: 'bg-status-danger/15 text-status-danger border-status-danger/30',
  ATTACHMENT_EXPIRE: 'bg-text-secondary/15 text-text-secondary border-border-muted',
}

const WARNA_SLA: Record<string, string> = {
  DILANGGAR: 'bg-status-danger/15 text-status-danger border-status-danger/30',
  TERLAMBAT: 'bg-status-danger/15 text-status-danger border-status-danger/30',
  MENDEKATI: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
  AMAN: 'bg-status-success/15 text-status-success border-status-success/30',
  TIDAK_BER_SLA: 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarView() {
  const t = useT(STR)
  const { lang } = useLang()
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [rows, setRows] = useState<ButirKalender[] | null>(null)
  const [error, setError] = useState('')

  const rangeStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor])
  const rangeEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor])

  useEffect(() => {
    setError('')
    fetch(`/api/calendar?from=${ymd(rangeStart)}&to=${ymd(rangeEnd)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setRows)
      .catch(() => setError(t.errLoad))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd])

  const byDay = useMemo(() => {
    const m = new Map<string, ButirKalender[]>()
    for (const r of rows ?? []) {
      const key = ymd(new Date(r.tanggal))
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return m
  }, [rows])

  // Grid Minggu(0)..Sabtu(6), sel sebelum tgl 1 & sesudah akhir bulan dibiarkan kosong.
  const firstWeekday = rangeStart.getDay()
  const daysInMonth = rangeEnd.getDate()
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = ymd(new Date())
  const monthLabel = cursor.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' })
  const weekdayLabels =
    lang === 'id'
      ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className="p-1.5 rounded border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className="p-1.5 rounded border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="font-display text-lg text-white capitalize">{monthLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => setCursor(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })}
          className="px-3 py-1.5 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors"
        >
          {t.today}
        </button>
      </div>

      {error && <p className="text-status-danger text-sm">{error}</p>}

      <div className="grid grid-cols-7 gap-px bg-card-border rounded-lg overflow-hidden border border-card-border">
        {weekdayLabels.map((w) => (
          <div key={w} className="bg-surface-secondary text-text-secondary text-[10px] font-mono uppercase tracking-widest text-center py-2">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const key = d ? ymd(d) : `blank-${i}`
          const butir = d ? (byDay.get(key) ?? []) : []
          const isToday = d && key === todayKey
          return (
            <div key={key} className={cn('bg-card-bg min-h-[92px] p-1.5 space-y-1', !d && 'bg-surface/30')}>
              {d && (
                <p className={cn('text-[11px] font-mono', isToday ? 'text-accent-blue font-bold' : 'text-text-secondary')}>
                  {d.getDate()}
                </p>
              )}
              {butir.slice(0, 4).map((b, j) => {
                const warna = b.sla ? (WARNA_SLA[b.sla] ?? WARNA_JENIS[b.jenis]) : WARNA_JENIS[b.jenis]
                const isi = (
                  <p className={cn('truncate text-[10px] px-1.5 py-0.5 rounded border', warna)} title={b.judul}>
                    {b.judul}
                  </p>
                )
                return b.href ? (
                  <a key={j} href={b.href} className="block hover:opacity-80 transition-opacity">
                    {isi}
                  </a>
                ) : (
                  <div key={j}>{isi}</div>
                )
              })}
              {butir.length > 4 && <p className="text-[10px] text-text-secondary px-1.5">+{butir.length - 4}</p>}
            </div>
          )
        })}
      </div>

      {rows && rows.length === 0 && <p className="text-text-secondary text-sm">{t.empty}</p>}
    </div>
  )
}
