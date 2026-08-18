'use client'

// Tab "Pekerjaan" pada detail vendor (K116, Fase 7j) — daftar PO & WO milik
// vendor ini, pakai filter vendorId yang sudah ada di listPurchaseOrders/
// listWorkOrders (Fase 7i). Cuma daftar baca; buat/ubah tetap lewat halaman
// Procurement / VoyageWorkspace masing-masing.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    po: 'Purchase Order', wo: 'Work Order', empty: 'Belum ada.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    po: 'Purchase Orders', wo: 'Work Orders', empty: 'None yet.', errConn: 'Failed to connect to server.',
  },
}

type PoRow = { id: string; docNumber: string; status: string; grandTotal: number; currency: string; voyage: { id: string; voyageNumber: string } | null }
type WoRow = { id: string; woNumber: string; scope: string; status: string; agreedAmount: number | null; currency: string; voyage: { id: string; voyageNumber: string } | null }

function fmt(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
}

export function VendorWorkPanel({ vendorId }: { vendorId: string }) {
  const t = useT(STR)
  const [pos, setPos] = useState<PoRow[] | null>(null)
  const [wos, setWos] = useState<WoRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [poRes, woRes] = await Promise.all([
          fetch(`/api/purchase-orders?vendorId=${vendorId}`),
          fetch(`/api/work-orders?vendorId=${vendorId}`),
        ])
        if (!poRes.ok || !woRes.ok) throw new Error()
        const [poData, woData] = await Promise.all([poRes.json(), woRes.json()])
        if (!cancelled) {
          setPos(poData)
          setWos(woData)
        }
      } catch {
        if (!cancelled) setError(t.errConn)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [vendorId, t.errConn])

  if (error) return <p className="text-status-danger text-sm">{error}</p>

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.po}</p>
        {pos && pos.length === 0 && <p className="text-text-secondary text-sm">{t.empty}</p>}
        <ul className="space-y-1.5">
          {pos?.map((po) => (
            <li key={po.id}>
              <Link
                href={`/procurement/${po.id}`}
                className="flex items-center justify-between gap-2 rounded border border-card-border/60 px-3 py-2 text-sm hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <span className="font-mono text-text-primary">{po.docNumber}</span>
                <span className="text-text-secondary text-xs">{po.status}</span>
                <span className="font-mono text-text-primary text-xs shrink-0">{fmt(po.grandTotal, po.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.wo}</p>
        {wos && wos.length === 0 && <p className="text-text-secondary text-sm">{t.empty}</p>}
        <ul className="space-y-1.5">
          {wos?.map((wo) => (
            <li key={wo.id}>
              <Link
                href={wo.voyage ? `/voyages/${wo.voyage.id}` : '#'}
                className="flex items-center justify-between gap-2 rounded border border-card-border/60 px-3 py-2 text-sm hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
              >
                <span className="font-mono text-text-primary">{wo.woNumber}</span>
                <span className="text-text-secondary text-xs truncate">{wo.scope}</span>
                <span className="text-text-secondary text-xs shrink-0">{wo.status}</span>
                <span className="font-mono text-text-primary text-xs shrink-0">
                  {wo.agreedAmount != null ? fmt(wo.agreedAmount, wo.currency) : '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
