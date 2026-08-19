'use client'

// Beranda Customer Portal (K167) — ringkasan: tagihan terbuka, outstanding, kunjungan berjalan.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Ship, ArrowRight } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type Dashboard = { tagihanTerbuka: number; totalOutstanding: number; mataUangUtama: string | null; kunjunganBerjalan: number }

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Beranda', desc: 'Ringkasan tagihan dan kunjungan kapal Anda.',
    openInvoices: 'Tagihan Terbuka', outstanding: 'Total Outstanding', ongoing: 'Kunjungan Berjalan',
    viewInvoices: 'Lihat semua tagihan', viewVoyages: 'Lihat kunjungan kapal',
  },
  en: {
    title: 'Home', desc: 'Summary of your invoices and vessel visits.',
    openInvoices: 'Open Invoices', outstanding: 'Total Outstanding', ongoing: 'Ongoing Visits',
    viewInvoices: 'View all invoices', viewVoyages: 'View vessel visits',
  },
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

export default function PortalDashboardPage() {
  const t = useT(T)
  const [data, setData] = useState<Dashboard | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/dashboard').then((r) => (r.ok ? r.json() : null)).then((d) => hidup && setData(d))
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.openInvoices}</p>
          <p className="font-display text-2xl text-white">{data ? data.tagihanTerbuka : '—'}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.outstanding}</p>
          <p className="font-display text-2xl text-white">
            {data ? `${data.mataUangUtama ?? ''} ${fmt(data.totalOutstanding)}`.trim() : '—'}
          </p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
          <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.ongoing}</p>
          <p className="font-display text-2xl text-white">{data ? data.kunjunganBerjalan : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/portal/invoices"
          className="group flex items-center gap-3 bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent-blue/50 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
            <FileText className="h-4 w-4" />
          </span>
          <span className="flex-1 text-white text-sm">{t.viewInvoices}</span>
          <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-blue transition-colors" />
        </Link>
        <Link
          href="/portal/voyages"
          className="group flex items-center gap-3 bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent-blue/50 transition-colors"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
            <Ship className="h-4 w-4" />
          </span>
          <span className="flex-1 text-white text-sm">{t.viewVoyages}</span>
          <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-blue transition-colors" />
        </Link>
      </div>
    </div>
  )
}
