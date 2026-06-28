'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wallet, CheckCircle2, AlertTriangle, Loader2, Download, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgingKey } from '@/lib/receivables'

export type InvoiceRow = {
  id: string
  docNumber: string
  principal: string
  vessel: string
  currency: string
  amount: number
  status: string
  dueLabel: string
  overdueDays: number
  bucket: AgingKey
  outstanding: number
}
export type PrincipalSummary = { principal: string; count: number; outstanding: number }
export type AgingSummary = { key: AgingKey; label: string; count: number; value: number }

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const STATUS_OPTS = ['DRAFT', 'SENT', 'PAID', 'CANCELLED'] as const
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  SENT: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  PAID: 'bg-status-success/10 text-status-success border-status-success/30',
  CANCELLED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}

export function ReceivablesTracker({
  rows,
  byPrincipal,
  aging,
  totals,
  currency,
}: {
  rows: InvoiceRow[]
  byPrincipal: PrincipalSummary[]
  aging: AgingSummary[]
  totals: { outstanding: number; paid: number; overdueCount: number }
  currency: string
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function setStatus(id: string, status: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      alert('Gagal memperbarui status.')
    } finally {
      setBusyId(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card-bg border border-card-border rounded-lg p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
          <FileText className="w-5 h-5 text-text-secondary" />
        </div>
        <p className="text-text-primary text-sm font-medium">Belum ada invoice</p>
        <p className="text-text-secondary text-xs mt-1 mb-5 max-w-sm mx-auto">
          Buat &amp; simpan Invoice di Finance Generator — tagihan akan otomatis muncul di sini untuk dilacak.
        </p>
        <Link href="/finance/invoice/baru" className="inline-flex items-center gap-2 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-5 py-2 text-sm font-medium transition-colors">
          Buat Invoice
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KARTU RINGKASAN */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card-bg border border-card-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2"><Wallet className="w-4 h-4 text-accent-blue" /><span className="text-xs font-mono uppercase tracking-wider">Total Outstanding</span></div>
          <p className="font-display text-2xl text-white">{currency} {fmt(totals.outstanding)}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2"><CheckCircle2 className="w-4 h-4 text-status-success" /><span className="text-xs font-mono uppercase tracking-wider">Sudah Dibayar</span></div>
          <p className="font-display text-2xl text-status-success">{currency} {fmt(totals.paid)}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2"><AlertTriangle className="w-4 h-4 text-status-danger" /><span className="text-xs font-mono uppercase tracking-wider">Lewat Jatuh Tempo</span></div>
          <p className="font-display text-2xl text-white">{totals.overdueCount} <span className="text-base text-text-secondary">invoice</span></p>
        </div>
      </div>

      {/* AGING + PER PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <h2 className="font-display text-base text-white mb-4">Aging Piutang</h2>
          <div className="space-y-2">
            {aging.map((a) => {
              const danger = a.key === 'd90' || a.key === 'd90p'
              const warn = a.key === 'd30' || a.key === 'd60'
              return (
                <div key={a.key} className="flex items-center justify-between text-sm py-1.5 border-b border-card-border/50 last:border-0">
                  <span className={cn('flex items-center gap-2', danger ? 'text-status-danger' : warn ? 'text-accent-amber' : 'text-text-secondary')}>
                    <span className={cn('w-2 h-2 rounded-full', danger ? 'bg-status-danger' : warn ? 'bg-accent-amber' : 'bg-status-success')} />
                    {a.label}
                  </span>
                  <span className="font-mono text-text-primary">
                    {currency} {fmt(a.value)} <span className="text-text-secondary/60 text-xs">({a.count})</span>
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <h2 className="font-display text-base text-white mb-4">Outstanding per Principal</h2>
          {byPrincipal.length === 0 ? (
            <p className="text-text-secondary text-sm py-6 text-center">Tidak ada piutang berjalan — semua invoice lunas. 🎉</p>
          ) : (
            <div className="space-y-2">
              {byPrincipal.map((p) => (
                <div key={p.principal} className="flex items-center justify-between text-sm py-1.5 border-b border-card-border/50 last:border-0">
                  <span className="text-text-primary">{p.principal} <span className="text-text-secondary/60 text-xs">· {p.count} inv</span></span>
                  <span className="font-mono text-text-primary">{currency} {fmt(p.outstanding)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* DAFTAR INVOICE */}
      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-card-border flex items-center justify-between">
          <h2 className="font-display text-base text-white">Daftar Invoice</h2>
          <span className="text-xs font-mono text-text-secondary">{rows.length} invoice</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="text-left px-5 py-3 font-medium">No. Invoice</th>
                <th className="text-left px-5 py-3 font-medium">Principal</th>
                <th className="text-left px-5 py-3 font-medium">Jatuh Tempo</th>
                <th className="text-right px-5 py-3 font-medium">Nilai</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.outstanding > 0 && r.overdueDays > 0
                return (
                  <tr key={r.id} className="border-b border-card-border/50 last:border-0 hover:bg-surface-tertiary/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-text-primary whitespace-nowrap">{r.docNumber}</td>
                    <td className="px-5 py-3.5 text-text-primary">
                      {r.principal}
                      <span className="block text-text-secondary/60 text-xs">{r.vessel}</span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className={cn('font-mono', overdue ? 'text-status-danger' : 'text-text-secondary')}>{r.dueLabel}</span>
                      {overdue && <span className="block text-[10px] text-status-danger">telat {r.overdueDays} hari</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-text-primary whitespace-nowrap">{r.currency} {fmt(r.amount)}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn('text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border', STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT)}>{r.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {r.status !== 'PAID' && r.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => setStatus(r.id, 'PAID')}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1.5 rounded border border-status-success/40 text-status-success text-xs px-2.5 py-1.5 hover:bg-status-success/10 transition-colors disabled:opacity-50"
                          >
                            {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Tandai Lunas
                          </button>
                        )}
                        <select
                          value={STATUS_OPTS.includes(r.status as (typeof STATUS_OPTS)[number]) ? r.status : 'DRAFT'}
                          onChange={(e) => setStatus(r.id, e.target.value)}
                          disabled={busyId === r.id}
                          className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue focus:outline-none"
                        >
                          {STATUS_OPTS.map((s) => (
                            <option key={s} value={s} className="bg-surface">{s}</option>
                          ))}
                        </select>
                        <a
                          href={`/api/documents/invoice?id=${r.id}&download=1`}
                          title="Unduh PDF"
                          className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
