'use client'

// Selector "Pilih Port Call" — dipakai bersama oleh EPDA/FPDA (DisbursementForm)
// & Invoice (InvoiceForm) agar dokumen bisa dibuat langsung dari menu Finance
// Generator tanpa harus lewat Port Call Manager. Logika auto-fill tetap di
// masing-masing form (memanggil onSelect dengan id port call terpilih).

import { useEffect, useState } from 'react'
import { Anchor } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type PortCallRow = {
  id: string
  port: string
  vessel: { name: string } | null
  principal: { name: string } | null
}

const STR: Record<Lang, Record<string, string>> = {
  id: {
    label: 'Pilih Port Call',
    hint: 'Pilih port call untuk mengisi partikular kapal & principal secara otomatis.',
    none: '— pilih port call —',
    empty: 'Belum ada port call. Buat dulu di Port Call Manager.',
    loading: 'Memuat…',
  },
  en: {
    label: 'Select Port Call',
    hint: 'Pick a port call to auto-fill vessel particulars & principal.',
    none: '— select port call —',
    empty: 'No port calls yet. Create one in Port Call Manager first.',
    loading: 'Loading…',
  },
}

const optLabel = (pc: PortCallRow) =>
  [pc.vessel?.name, pc.port, pc.principal?.name].filter(Boolean).join(' · ')

export function PortCallPicker({
  value,
  onSelect,
}: {
  value: string
  onSelect: (id: string) => void
}) {
  const t = useT(STR)
  const [rows, setRows] = useState<PortCallRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portcalls')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PortCallRow[]) => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const isEmpty = !loading && rows.length === 0

  return (
    <section className="bg-card-bg border border-accent-blue/30 rounded-lg p-5">
      <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-2">
        <Anchor className="w-3.5 h-3.5 text-accent-blue" />
        {t.label}
      </label>
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        disabled={loading || isEmpty}
        className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary
                   focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40
                   transition-colors disabled:opacity-60"
      >
        <option value="">{loading ? t.loading : t.none}</option>
        {rows.map((pc) => (
          <option key={pc.id} value={pc.id} className="bg-surface text-text-primary">
            {optLabel(pc)}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-secondary mt-2">{isEmpty ? t.empty : t.hint}</p>
    </section>
  )
}
