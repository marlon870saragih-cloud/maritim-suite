'use client'

// Daftar pesanan (PO) vendor (K171) — hanya milik pihak ini (dibuktikan
// portal-guard+RLS di server). Hanya status SENT ke atas yang tampil.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type PoRow = {
  id: string; nomor: string; tanggal: string; status: string
  mataUang: string; total: number; jatuhTempo: string | null; kirimKe: string | null
  kapal: string | null; voyage: string | null
}

const T: Record<Lang, Record<string, string>> = {
  id: { title: 'Pesanan', desc: 'Purchase Order yang ditujukan kepada Anda.', empty: 'Belum ada pesanan.' },
  en: { title: 'Purchase Orders', desc: 'Purchase orders addressed to you.', empty: 'No purchase orders yet.' },
}

const STATUS_WARNA: Record<string, string> = {
  SENT: 'bg-accent-blue/15 text-accent-blue',
  PARTIALLY_RECEIVED: 'bg-status-warning/15 text-status-warning',
  RECEIVED: 'bg-status-success/15 text-status-success',
  CLOSED: 'bg-surface-tertiary text-text-secondary',
  CANCELLED: 'bg-status-danger/15 text-status-danger',
}

function fmtTanggal(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export default function PortalPurchaseOrdersPage() {
  const t = useT(T)
  const [rows, setRows] = useState<PoRow[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/purchase-orders').then((r) => (r.ok ? r.json() : [])).then((d) => hidup && setRows(d))
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
        {(rows ?? []).map((po) => (
          <Link
            key={po.id}
            href={`/portal/purchase-orders/${po.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-surface-tertiary/30 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white text-sm font-mono">{po.nomor}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono ${STATUS_WARNA[po.status] ?? 'bg-surface-tertiary text-text-secondary'}`}>
                  {po.status}
                </span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5">
                {fmtTanggal(po.tanggal)}{po.kapal ? ` · ${po.kapal}` : ''}{po.voyage ? ` · ${po.voyage}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-white text-sm font-mono">{po.mataUang} {po.total.toLocaleString('en-US')}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-text-secondary shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
