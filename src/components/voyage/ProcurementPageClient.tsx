'use client'

// Daftar Pengadaan (Fase 7i) — tab PR/PO/WO, tiap baris berklik ke detailnya.

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { CreatePurchaseDialog } from './CreatePurchaseDialog'
import { WorkOrderDialog, type WoRow } from '@/components/ops/WorkOrderDialog'
import type { PoDetail } from './PurchaseBuilder'

type WoListRow = WoRow & { vendor: { name: string } | null; voyage: { voyageNumber: string } | null }

const STR: Record<Lang, Record<string, string>> = {
  id: {
    tabPr: 'Requisition', tabPo: 'Purchase Order', tabWo: 'Work Order',
    newPr: 'PR/PO Baru', newWo: 'Work Order Baru',
    thDoc: 'No. Dokumen', thVoyage: 'Voyage', thVendor: 'Vendor', thStatus: 'Status', thTotal: 'Total',
    thScope: 'Uraian', empty: 'Belum ada dokumen.',
  },
  en: {
    tabPr: 'Requisition', tabPo: 'Purchase Order', tabWo: 'Work Order',
    newPr: 'New PR/PO', newWo: 'New Work Order',
    thDoc: 'Doc No.', thVoyage: 'Voyage', thVendor: 'Vendor', thStatus: 'Status', thTotal: 'Total',
    thScope: 'Scope', empty: 'No documents yet.',
  },
}

export function ProcurementPageClient({ purchaseOrders, workOrders }: { purchaseOrders: PoDetail[]; workOrders: WoListRow[] }) {
  const t = useT(STR)
  const [tab, setTab] = useState<'PR' | 'PO' | 'WO'>('PO')
  const [createOpen, setCreateOpen] = useState(false)
  const [woOpen, setWoOpen] = useState(false)
  const [editWo, setEditWo] = useState<WoRow | null>(null)

  const rows = tab === 'WO' ? workOrders : purchaseOrders.filter((p) => p.kind === tab)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-border-muted">
          {(['PR', 'PO', 'WO'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                'px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                tab === k ? 'border-accent-blue text-white' : 'border-transparent text-text-secondary hover:text-white',
              )}
            >
              {k === 'PR' ? t.tabPr : k === 'PO' ? t.tabPo : t.tabWo}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (tab === 'WO') {
              setEditWo(null)
              setWoOpen(true)
            } else {
              setCreateOpen(true)
            }
          }}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {tab === 'WO' ? t.newWo : t.newPr}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-text-secondary text-sm text-center py-12">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thDoc}</th>
                  <th className="px-5 py-3 font-medium">{t.thVoyage}</th>
                  <th className="px-5 py-3 font-medium">{t.thVendor}</th>
                  {tab === 'WO' && <th className="px-5 py-3 font-medium">{t.thScope}</th>}
                  <th className="px-5 py-3 font-medium">{t.thStatus}</th>
                  {tab !== 'WO' && <th className="px-5 py-3 font-medium text-right">{t.thTotal}</th>}
                </tr>
              </thead>
              <tbody className="text-sm">
                {tab === 'WO'
                  ? (rows as WoListRow[]).map((w, i) => (
                      <tr
                        key={w.id}
                        onClick={() => {
                          setEditWo(w)
                          setWoOpen(true)
                        }}
                        className={cn('hover:bg-surface-tertiary/30 transition-colors cursor-pointer', i < rows.length - 1 && 'border-b border-card-border/50')}
                      >
                        <td className="px-5 py-3.5 text-text-primary">{w.woNumber}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{w.voyage?.voyageNumber ?? '—'}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{w.vendor?.name ?? '—'}</td>
                        <td className="px-5 py-3.5 text-text-secondary truncate max-w-xs">{w.scope}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={w.status} /></td>
                      </tr>
                    ))
                  : (rows as PoDetail[]).map((p, i) => (
                      <tr key={p.id} className={cn(i < rows.length - 1 && 'border-b border-card-border/50')}>
                        <td className="px-5 py-3.5">
                          <Link href={`/procurement/${p.id}`} className="text-text-primary hover:text-accent-blue transition-colors">
                            {p.docNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-text-secondary">{p.voyage?.voyageNumber ?? '—'}</td>
                        <td className="px-5 py-3.5 text-text-secondary">{p.vendor?.name ?? '—'}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={p.status} /></td>
                        <td className="px-5 py-3.5 text-right font-mono text-text-primary">{p.currency} {p.hitung.grandTotal.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreatePurchaseDialog open={createOpen} onOpenChange={setCreateOpen} />
      <WorkOrderDialog open={woOpen} onOpenChange={setWoOpen} wo={editWo} />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const warna =
    status === 'CANCELLED'
      ? 'bg-status-danger/12 text-status-danger border-status-danger/30'
      : status === 'CLOSED' || status === 'RECEIVED' || status === 'VERIFIED'
        ? 'bg-status-success/12 text-status-success border-status-success/30'
        : status === 'PENDING_APPROVAL'
          ? 'bg-accent-amber/12 text-accent-amber border-accent-amber/30'
          : 'bg-surface-tertiary text-text-secondary border-border-muted'
  return <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', warna)}>{status}</span>
}
