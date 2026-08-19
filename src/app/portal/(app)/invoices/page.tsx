'use client'

// Daftar tagihan (K167) — hanya milik pihak ini (dibuktikan portal-guard+RLS
// di server; layar ini murni menampilkan apa yang dikembalikan API).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type InvoiceRow = {
  id: string; nomor: string; tanggal: string; jatuhTempo: string | null
  mataUang: string; total: number; sudahDibayar: number; sisa: number
  status: string; kapal: string | null; voyage: string | null
}

const T: Record<Lang, Record<string, string>> = {
  id: { title: 'Tagihan Saya', desc: 'Daftar invoice yang ditujukan kepada Anda.', empty: 'Belum ada tagihan.', total: 'Total', sisa: 'Sisa' },
  en: { title: 'My Invoices', desc: 'Invoices addressed to you.', empty: 'No invoices yet.', total: 'Total', sisa: 'Balance' },
}

const STATUS_WARNA: Record<string, string> = {
  PAID: 'bg-status-success/15 text-status-success',
  OVERDUE: 'bg-status-danger/15 text-status-danger',
  PARTIALLY_PAID: 'bg-status-warning/15 text-status-warning',
}

function fmtTanggal(iso: string, lang: 'id' | 'en') {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export default function PortalInvoicesPage() {
  const t = useT(T)
  const [rows, setRows] = useState<InvoiceRow[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/invoices').then((r) => (r.ok ? r.json() : [])).then((d) => hidup && setRows(d))
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

      <div className="divide-y divide-card-border bg-card-bg border border-card-border rounded-lg">
        {(rows ?? []).map((inv) => (
          <Link
            key={inv.id}
            href={`/portal/invoices/${inv.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-surface-tertiary/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-mono">{inv.nomor}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono ${STATUS_WARNA[inv.status] ?? 'bg-surface-tertiary text-text-secondary'}`}>
                  {inv.status}
                </span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5">
                {fmtTanggal(inv.tanggal, 'id')}{inv.kapal ? ` · ${inv.kapal}` : ''}{inv.voyage ? ` · ${inv.voyage}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-white text-sm font-mono">{inv.mataUang} {inv.total.toLocaleString('en-US')}</p>
              {inv.sisa > 0 && <p className="text-status-warning text-xs">{t.sisa}: {inv.mataUang} {inv.sisa.toLocaleString('en-US')}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
