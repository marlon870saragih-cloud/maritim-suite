'use client'

import { useState } from 'react'
import { FileCode, AlertTriangle } from 'lucide-react'

export type MasaOption = { value: string; label: string }

export function EfakturExport({
  ready,
  sellerNpwpOk,
  masaList,
}: {
  ready: boolean
  sellerNpwpOk: boolean
  masaList: MasaOption[]
}) {
  const [masa, setMasa] = useState('') // '' = semua masa
  const href = `/api/efaktur/coretax${masa ? `?masa=${masa}` : ''}`

  if (!ready) {
    return (
      <a
        href={href}
        title={
          !sellerNpwpOk
            ? 'NPWP perusahaan belum diisi — kolom <TIN> penjual kosong & XML belum valid untuk Coretax. Isi di Profil Perusahaan.'
            : 'Belum ada invoice untuk diekspor.'
        }
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border bg-accent-amber/10 border-accent-amber/40 hover:bg-accent-amber/15 text-accent-amber"
      >
        <AlertTriangle className="w-4 h-4" />
        e-Faktur Coretax (XML)
      </a>
    )
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-card-border bg-card-bg overflow-hidden">
      {masaList.length > 0 && (
        <select
          value={masa}
          onChange={(e) => setMasa(e.target.value)}
          title="Pilih masa pajak (bulan invoice) — kosongkan untuk semua"
          className="bg-transparent text-text-secondary text-xs font-mono pl-3 pr-1 py-2.5 focus:outline-none border-r border-card-border cursor-pointer"
        >
          <option value="" className="bg-surface">Semua masa</option>
          {masaList.map((m) => (
            <option key={m.value} value={m.value} className="bg-surface">
              {m.label}
            </option>
          ))}
        </select>
      )}
      <a
        href={href}
        title="XML impor Faktur Pajak Keluaran untuk Coretax DJP (periksa kode transaksi sebelum impor)"
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary hover:text-accent-teal transition-colors whitespace-nowrap"
      >
        <FileCode className="w-4 h-4 text-accent-teal" />
        e-Faktur Coretax (XML)
      </a>
    </div>
  )
}
