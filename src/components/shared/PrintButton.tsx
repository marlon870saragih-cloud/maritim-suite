'use client'

import { Printer } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const L: Record<Lang, string> = { id: 'Cetak / PDF', en: 'Print / PDF' }

/** Tombol cetak halaman (window.print). Print CSS di globals.css menyembunyikan
 *  chrome (sidebar/topbar/tombol) & memakai tema terang agar hasil cetak rapi. */
export function PrintButton() {
  const label = useT(L)
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 bg-card-bg border border-card-border hover:border-accent-blue/60 hover:bg-surface-tertiary text-text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap"
    >
      <Printer className="w-4 h-4 text-accent-blue" />
      {label}
    </button>
  )
}
