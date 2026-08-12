'use client'

import Link from 'next/link'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    download: 'Unduh Excel', noData: 'Belum ada voyage.',
    thVoyage: 'Voyage', thVessel: 'Kapal', thPrincipal: 'Principal', thPort: 'Pelabuhan', thStatus: 'Status',
    thEta: 'ETA', thEpda: 'EPDA/FPDA', thFda: 'FDA', thInvoice: 'Invoice', thOutstanding: 'Outstanding',
  },
  en: {
    download: 'Download Excel', noData: 'No voyages yet.',
    thVoyage: 'Voyage', thVessel: 'Vessel', thPrincipal: 'Principal', thPort: 'Port', thStatus: 'Status',
    thEta: 'ETA', thEpda: 'EPDA/FPDA', thFda: 'FDA', thInvoice: 'Invoice', thOutstanding: 'Outstanding',
  },
}

const STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CONFIRMED: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  ARRIVED: 'bg-accent-teal/10 text-accent-teal border-accent-teal/30',
  BERTHED: 'bg-accent-teal/10 text-accent-teal border-accent-teal/30',
  WORKING: 'bg-accent-amber/10 text-accent-amber border-accent-amber/30',
  COMPLETED: 'bg-status-success/10 text-status-success border-status-success/30',
  DEPARTED: 'bg-status-success/10 text-status-success border-status-success/30',
  CLOSED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}

export type VoyageRegisterRow = {
  voyageId: string
  voyageNumber: string
  vesselName: string
  principal: string | null
  port: string | null
  status: string
  eta: string | null
  etd: string | null
  baseCurrency: string
  epdaTotal: number
  fdaTotal: number
  invoiceTotal: number
  invoicePaid: number
  invoiceOutstanding: number
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID') : '—')

export function VoyageRegisterTable({ rows }: { rows: VoyageRegisterRow[] }) {
  const t = useT(STR)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a
          href="/api/reports/voyage-register/xlsx"
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" /> {t.download}
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
          <p className="text-text-secondary text-sm">{t.noData}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thVoyage}</th>
                <th className="px-4 py-2.5 font-medium">{t.thVessel}</th>
                <th className="px-4 py-2.5 font-medium">{t.thPrincipal}</th>
                <th className="px-4 py-2.5 font-medium">{t.thPort}</th>
                <th className="px-4 py-2.5 font-medium">{t.thStatus}</th>
                <th className="px-4 py-2.5 font-medium">{t.thEta}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thEpda}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thFda}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thInvoice}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thOutstanding}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r, i) => (
                <tr
                  key={r.voyageId}
                  className={cn('hover:bg-surface-tertiary/30 transition-colors', i < rows.length - 1 && 'border-b border-card-border/50')}
                >
                  <td className="px-4 py-3 font-mono text-text-primary">
                    <Link href={`/voyages/${r.voyageId}`} className="hover:text-accent-blue hover:underline">{r.voyageNumber}</Link>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{r.vesselName}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.principal ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.port ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', STATUS_COLOR[r.status] ?? STATUS_COLOR.PLANNED)}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary font-mono">{fmtDate(r.eta)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">{r.epdaTotal > 0 ? `${r.baseCurrency} ${fmt(r.epdaTotal)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">{r.fdaTotal > 0 ? `${r.baseCurrency} ${fmt(r.fdaTotal)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{r.invoiceTotal > 0 ? `${r.baseCurrency} ${fmt(r.invoiceTotal)}` : '—'}</td>
                  <td className={cn('px-4 py-3 text-right font-mono', r.invoiceOutstanding > 0 ? 'text-status-danger' : 'text-text-secondary')}>
                    {r.invoiceOutstanding > 0 ? `${r.baseCurrency} ${fmt(r.invoiceOutstanding)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
