'use client'

// Dashboard (Fase 5) — ringkasan lintas-modul, murni tampilan (semua angka
// sudah dihitung server di dashboard.service.ts). Belum digerbangi per-role
// (Roles 4→7 + permission matrix Fase 5 belum dikerjakan) — jadi satu halaman
// untuk semua yang bisa mengaksesnya, bukan Executive/Ops/Finance terpisah.

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Anchor, Clock, FileText, Route, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kpiActiveVoyages: 'Voyage Aktif', kpiVoyagesMonth: 'Voyage Bulan Ini', kpiOutstanding: 'Total Outstanding',
    kpiPendingApproval: 'Menunggu Approval', kpiBilledMonth: 'Ditagihkan Bulan Ini', kpiOverdue: 'Invoice Terlambat',
    secStatus: 'Voyage per Status', secEta: 'ETA 7 Hari Ke Depan', secApproval: 'Dokumen Menunggu Approval',
    secOutstanding: 'Outstanding Terbesar', noData: 'Tidak ada data.', noEta: 'Tidak ada kedatangan dalam 7 hari ke depan.',
    noApproval: 'Tidak ada dokumen menunggu approval. 🎉', noOutstanding: 'Tidak ada piutang terlambat. 🎉',
    thVoyage: 'Voyage', thVessel: 'Kapal', thPort: 'Pelabuhan', thEta: 'ETA',
    thDoc: 'Dokumen', thAmount: 'Nilai', thPrincipal: 'Principal', thLate: 'Terlambat',
    latePost: 'hari',
  },
  en: {
    kpiActiveVoyages: 'Active Voyages', kpiVoyagesMonth: 'Voyages This Month', kpiOutstanding: 'Total Outstanding',
    kpiPendingApproval: 'Pending Approval', kpiBilledMonth: 'Billed This Month', kpiOverdue: 'Overdue Invoices',
    secStatus: 'Voyages by Status', secEta: 'ETA Next 7 Days', secApproval: 'Documents Pending Approval',
    secOutstanding: 'Largest Outstanding', noData: 'No data.', noEta: 'No arrivals in the next 7 days.',
    noApproval: 'No documents pending approval. 🎉', noOutstanding: 'No overdue receivables. 🎉',
    thVoyage: 'Voyage', thVessel: 'Vessel', thPort: 'Port', thEta: 'ETA',
    thDoc: 'Document', thAmount: 'Amount', thPrincipal: 'Principal', thLate: 'Overdue',
    latePost: 'days',
  },
}

const CHART_COLOR = '#C79A3E' // accent-blue (brass) — samakan dgn tailwind.config.ts
const CHART_GRID = '#14323D' // card-border
const CHART_TEXT = '#8FA6AB' // text-secondary

export type DashboardKpi = {
  activeVoyages: number
  voyagesThisMonth: number
  outstandingAR: number
  pendingApprovals: number
  billedThisMonth: number
  overdueInvoices: number
}
export type UpcomingEta = { id: string; voyageNumber: string; vesselName: string; port: string | null; eta: string }
export type PendingApprovalDoc = {
  id: string; docNumber: string; kind: string; voyageId: string; voyageNumber: string
  grandTotal: number; baseCurrency: string
}
export type TopOutstanding = {
  docNumber: string; principal: string; outstanding: number; currency: string; overdueDays: number; href: string | null
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })

function KpiCard({ label, value, icon: Icon, tone = 'default' }: {
  label: string
  value: string
  icon: typeof Wallet
  tone?: 'default' | 'danger' | 'amber'
}) {
  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{label}</p>
        <Icon
          className={cn(
            'w-4 h-4',
            tone === 'danger' ? 'text-status-danger' : tone === 'amber' ? 'text-accent-amber' : 'text-accent-blue',
          )}
        />
      </div>
      <p
        className={cn(
          'text-2xl font-display',
          tone === 'danger' ? 'text-status-danger' : tone === 'amber' ? 'text-accent-amber' : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function DashboardView({
  kpi,
  currency,
  voyagesByStatus,
  upcomingEtas,
  pendingApprovalDocs,
  topOutstanding,
}: {
  kpi: DashboardKpi
  currency: string
  voyagesByStatus: { status: string; count: number }[]
  upcomingEtas: UpcomingEta[]
  pendingApprovalDocs: PendingApprovalDoc[]
  topOutstanding: TopOutstanding[]
}) {
  const t = useT(STR)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label={t.kpiActiveVoyages} value={fmt(kpi.activeVoyages)} icon={Route} />
        <KpiCard label={t.kpiVoyagesMonth} value={fmt(kpi.voyagesThisMonth)} icon={Anchor} />
        <KpiCard label={t.kpiOutstanding} value={`${currency} ${fmt(kpi.outstandingAR)}`} icon={Wallet} tone={kpi.outstandingAR > 0 ? 'amber' : 'default'} />
        <KpiCard label={t.kpiPendingApproval} value={fmt(kpi.pendingApprovals)} icon={FileText} tone={kpi.pendingApprovals > 0 ? 'amber' : 'default'} />
        <KpiCard label={t.kpiBilledMonth} value={`${currency} ${fmt(kpi.billedThisMonth)}`} icon={Wallet} />
        <KpiCard label={t.kpiOverdue} value={fmt(kpi.overdueInvoices)} icon={AlertTriangle} tone={kpi.overdueInvoices > 0 ? 'danger' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5" /> {t.secStatus}
          </p>
          {voyagesByStatus.length === 0 ? (
            <p className="text-text-secondary text-sm">{t.noData}</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={voyagesByStatus} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="status" tick={{ fill: CHART_TEXT, fontSize: 10 }} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: CHART_TEXT, fontSize: 10 }} axisLine={{ stroke: CHART_GRID }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0E2731', border: '1px solid #14323D', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#EDF1EE' }}
                    cursor={{ fill: 'rgba(199,154,62,0.08)' }}
                  />
                  <Bar dataKey="count" fill={CHART_COLOR} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> {t.secEta}
          </p>
          {upcomingEtas.length === 0 ? (
            <p className="text-text-secondary text-sm">{t.noEta}</p>
          ) : (
            <ul className="space-y-2.5">
              {upcomingEtas.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/voyages/${v.id}`}
                    className="flex items-center justify-between gap-3 text-sm border-b border-card-border/40 pb-2.5 hover:text-accent-blue transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-text-primary font-mono truncate">{v.voyageNumber}</p>
                      <p className="text-text-secondary text-xs truncate">{v.vesselName}{v.port ? ` · ${v.port}` : ''}</p>
                    </div>
                    <span className="text-text-secondary text-xs font-mono whitespace-nowrap">{fmtDate(v.eta)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {t.secApproval}
          </p>
          {pendingApprovalDocs.length === 0 ? (
            <p className="text-text-secondary text-sm">{t.noApproval}</p>
          ) : (
            <ul className="space-y-2.5">
              {pendingApprovalDocs.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/voyages/${d.voyageId}/disbursements/${d.id}`}
                    className="flex items-center justify-between gap-3 text-sm border-b border-card-border/40 pb-2.5 hover:text-accent-blue transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-text-primary font-mono truncate">{d.docNumber}</p>
                      <p className="text-text-secondary text-xs truncate">{d.voyageNumber}</p>
                    </div>
                    <span className="text-text-primary text-xs font-mono whitespace-nowrap">{d.baseCurrency} {fmt(d.grandTotal)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {t.secOutstanding}
          </p>
          {topOutstanding.length === 0 ? (
            <p className="text-text-secondary text-sm">{t.noOutstanding}</p>
          ) : (
            <ul className="space-y-2.5">
              {topOutstanding.map((r, i) => {
                const content = (
                  <div className="flex items-center justify-between gap-3 text-sm border-b border-card-border/40 pb-2.5">
                    <div className="min-w-0">
                      <p className="text-text-primary font-mono truncate">{r.docNumber}</p>
                      <p className="text-text-secondary text-xs truncate">{r.principal} · {t.thLate} {r.overdueDays} {t.latePost}</p>
                    </div>
                    <span className="text-status-danger text-xs font-mono whitespace-nowrap">{r.currency} {fmt(r.outstanding)}</span>
                  </div>
                )
                return (
                  <li key={`${r.docNumber}-${i}`}>
                    {r.href ? (
                      <Link href={r.href} className="block hover:text-accent-blue transition-colors">{content}</Link>
                    ) : (
                      content
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
