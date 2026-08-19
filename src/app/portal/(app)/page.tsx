'use client'

// Beranda portal (K167/K171) — bercabang menurut BENTUK respons API (bukan
// fetch pihak terpisah): dashboard pelanggan dan vendor sengaja punya field
// yang berbeda sama sekali, jadi 'tagihanTerbuka' in data cukup jadi penanda.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Ship, Package, Wrench, Receipt, ArrowRight } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type DashboardCustomer = { tagihanTerbuka: number; totalOutstanding: number; mataUangUtama: string | null; kunjunganBerjalan: number }
type DashboardVendor = { poTerbuka: number; woTerbuka: number; tagihanMenunggu: number }
type Dashboard = DashboardCustomer | DashboardVendor

function isCustomer(d: Dashboard): d is DashboardCustomer {
  return 'tagihanTerbuka' in d
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Beranda',
    descCustomer: 'Ringkasan tagihan dan kunjungan kapal Anda.',
    descVendor: 'Ringkasan pesanan, perintah kerja, dan tagihan Anda.',
    openInvoices: 'Tagihan Terbuka', outstanding: 'Total Outstanding', ongoing: 'Kunjungan Berjalan',
    poOpen: 'Pesanan Terbuka', woOpen: 'Perintah Kerja Terbuka', invoicesPending: 'Tagihan Menunggu',
    viewInvoices: 'Lihat semua tagihan', viewVoyages: 'Lihat kunjungan kapal',
    viewPo: 'Lihat semua pesanan', viewWo: 'Lihat semua perintah kerja', viewSubmissions: 'Lihat tagihan saya',
  },
  en: {
    title: 'Home',
    descCustomer: 'Summary of your invoices and vessel visits.',
    descVendor: 'Summary of your purchase orders, work orders, and invoices.',
    openInvoices: 'Open Invoices', outstanding: 'Total Outstanding', ongoing: 'Ongoing Visits',
    poOpen: 'Open Purchase Orders', woOpen: 'Open Work Orders', invoicesPending: 'Invoices Pending Review',
    viewInvoices: 'View all invoices', viewVoyages: 'View vessel visits',
    viewPo: 'View all purchase orders', viewWo: 'View all work orders', viewSubmissions: 'View my invoices',
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

  const vendor = data && !isCustomer(data) ? data : null
  const customer = data && isCustomer(data) ? data : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">{t.title}</h1>
        <p className="text-text-secondary text-sm">{vendor ? t.descVendor : t.descCustomer}</p>
      </div>

      {customer && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.openInvoices}</p>
              <p className="font-display text-2xl text-white">{customer.tagihanTerbuka}</p>
            </div>
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.outstanding}</p>
              <p className="font-display text-2xl text-white">
                {`${customer.mataUangUtama ?? ''} ${fmt(customer.totalOutstanding)}`.trim()}
              </p>
            </div>
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.ongoing}</p>
              <p className="font-display text-2xl text-white">{customer.kunjunganBerjalan}</p>
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
        </>
      )}

      {vendor && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.poOpen}</p>
              <p className="font-display text-2xl text-white">{vendor.poTerbuka}</p>
            </div>
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.woOpen}</p>
              <p className="font-display text-2xl text-white">{vendor.woTerbuka}</p>
            </div>
            <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-1">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest">{t.invoicesPending}</p>
              <p className="font-display text-2xl text-white">{vendor.tagihanMenunggu}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/portal/purchase-orders"
              className="group flex items-center gap-3 bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent-blue/50 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
                <Package className="h-4 w-4" />
              </span>
              <span className="flex-1 text-white text-sm">{t.viewPo}</span>
              <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-blue transition-colors" />
            </Link>
            <Link
              href="/portal/work-orders"
              className="group flex items-center gap-3 bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent-blue/50 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
                <Wrench className="h-4 w-4" />
              </span>
              <span className="flex-1 text-white text-sm">{t.viewWo}</span>
              <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-blue transition-colors" />
            </Link>
            <Link
              href="/portal/submissions"
              className="group flex items-center gap-3 bg-card-bg border border-card-border rounded-lg p-4 hover:border-accent-blue/50 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-blue/15 text-accent-blue">
                <Receipt className="h-4 w-4" />
              </span>
              <span className="flex-1 text-white text-sm">{t.viewSubmissions}</span>
              <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-blue transition-colors" />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
