'use client'

// Kunjungan kapal (K167) — nomor, kapal, pelabuhan, status, ETA/ETB/ETD/ATA.
// TANPA notes/biaya/tugas/komentar internal (K167 daftar putih).

import { useEffect, useState } from 'react'
import { Ship } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type VoyageRow = {
  id: string; nomor: string; kapal: string | null; pelabuhan: string | null; status: string
  eta: string | null; etb: string | null; etd: string | null; ata: string | null
}

const T: Record<Lang, Record<string, string>> = {
  id: { title: 'Kunjungan Kapal', desc: 'Jadwal & status kunjungan kapal untuk Anda.', empty: 'Belum ada kunjungan kapal.', eta: 'ETA', etb: 'ETB', etd: 'ETD', ata: 'ATA' },
  en: { title: 'Vessel Visits', desc: 'Schedule & status of vessel visits for you.', empty: 'No vessel visits yet.', eta: 'ETA', etb: 'ETB', etd: 'ETD', ata: 'ATA' },
}

const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—')

export default function PortalVoyagesPage() {
  const t = useT(T)
  const [rows, setRows] = useState<VoyageRow[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/voyages').then((r) => (r.ok ? r.json() : [])).then((d) => hidup && setRows(d))
    return () => {
      hidup = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">{t.title}</h1>
        <p className="text-text-secondary text-sm">{t.desc}</p>
      </div>

      {rows && rows.length === 0 && (
        <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center text-text-secondary text-sm">{t.empty}</div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {(rows ?? []).map((v) => (
          <div key={v.id} className="bg-card-bg border border-card-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
                  <Ship className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-white text-sm font-mono">{v.nomor}</p>
                  <p className="text-text-secondary text-xs">{v.kapal ?? '—'}{v.pelabuhan ? ` · ${v.pelabuhan}` : ''}</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono bg-surface-tertiary text-text-secondary">
                {v.status}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-card-border">
              <div><p className="text-[10px] text-text-secondary font-mono uppercase">{t.eta}</p><p className="text-white text-xs mt-0.5">{fmt(v.eta)}</p></div>
              <div><p className="text-[10px] text-text-secondary font-mono uppercase">{t.etb}</p><p className="text-white text-xs mt-0.5">{fmt(v.etb)}</p></div>
              <div><p className="text-[10px] text-text-secondary font-mono uppercase">{t.etd}</p><p className="text-white text-xs mt-0.5">{fmt(v.etd)}</p></div>
              <div><p className="text-[10px] text-text-secondary font-mono uppercase">{t.ata}</p><p className="text-white text-xs mt-0.5">{fmt(v.ata)}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
