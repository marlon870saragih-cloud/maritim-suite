'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wallet, CheckCircle2, AlertTriangle, Loader2, Download, FileText, Sparkles, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgingKey } from '@/lib/receivables'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    emptyTitle: 'Belum ada invoice', emptyDesc: 'Buat & simpan Invoice di Finance Generator — tagihan akan otomatis muncul di sini untuk dilacak.', createInvoice: 'Buat Invoice',
    cardPaid: 'Sudah Dibayar', cardOverdue: 'Lewat Jatuh Tempo', invoiceWord: 'invoice',
    aiTitle: 'Tanya AI tentang piutang', aiDesc: 'AI membaca & merangkum angka piutang (yang sudah dihitung sistem) — tidak mengubah data.',
    chip1: 'Berapa total tagihan belum dibayar?', chip2: 'Principal mana yang nunggak paling banyak?', chip3: 'Invoice apa saja yang lewat jatuh tempo?',
    aiPlaceholder: 'Tanyakan sesuatu tentang piutang…', askBtn: 'Tanya', aiFailGeneric: 'Gagal', aiFailProc: 'Gagal memproses dengan AI',
    secAging: 'Aging Piutang', allPaid: 'Tidak ada piutang berjalan — semua invoice lunas. 🎉',
    secList: 'Daftar Invoice', thNo: 'No. Invoice', thDue: 'Jatuh Tempo', thValue: 'Nilai', thAction: 'Aksi',
    latePre: 'telat', latePost: 'hari', markPaid: 'Tandai Lunas', errStatus: 'Gagal memperbarui status.', dlPdf: 'Unduh PDF',
  },
  en: {
    emptyTitle: 'No invoices yet', emptyDesc: 'Create & save an Invoice in the Finance Generator — it will appear here to track automatically.', createInvoice: 'Create Invoice',
    cardPaid: 'Paid', cardOverdue: 'Overdue', invoiceWord: 'invoices',
    aiTitle: 'Ask AI about receivables', aiDesc: 'The AI reads & summarizes receivable figures (already computed by the system) — it does not change data.',
    chip1: 'What is the total unpaid?', chip2: 'Which principal owes the most?', chip3: 'Which invoices are overdue?',
    aiPlaceholder: 'Ask something about receivables…', askBtn: 'Ask', aiFailGeneric: 'Failed', aiFailProc: 'Failed to process with AI',
    secAging: 'Receivables Aging', allPaid: 'No outstanding receivables — all invoices paid. 🎉',
    secList: 'Invoice List', thNo: 'Invoice No.', thDue: 'Due', thValue: 'Value', thAction: 'Action',
    latePre: 'late', latePost: 'days', markPaid: 'Mark Paid', errStatus: 'Failed to update status.', dlPdf: 'Download PDF',
  },
}

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
  const t = useT(STR)
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [aiQ, setAiQ] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiErr, setAiErr] = useState('')

  async function askAi(q?: string) {
    const question = (q ?? aiQ).trim()
    if (!question) return
    setAiQ(question)
    setAiBusy(true)
    setAiErr('')
    setAiAnswer('')
    try {
      const res = await fetch('/api/ai/tracker/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) throw new Error((await res.text()) || t.aiFailGeneric)
      const { answer } = (await res.json()) as { answer: string }
      setAiAnswer(answer)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : t.aiFailProc)
    } finally {
      setAiBusy(false)
    }
  }

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
      alert(t.errStatus)
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
        <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
        <p className="text-text-secondary text-xs mt-1 mb-5 max-w-sm mx-auto">{t.emptyDesc}</p>
        <Link href="/finance/invoice/baru" className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-5 py-2 text-sm font-medium transition-colors">
          {t.createInvoice}
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
          <div className="flex items-center gap-2 text-text-secondary mb-2"><CheckCircle2 className="w-4 h-4 text-status-success" /><span className="text-xs font-mono uppercase tracking-wider">{t.cardPaid}</span></div>
          <p className="font-display text-2xl text-status-success">{currency} {fmt(totals.paid)}</p>
        </div>
        <div className="bg-card-bg border border-card-border rounded-lg p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2"><AlertTriangle className="w-4 h-4 text-status-danger" /><span className="text-xs font-mono uppercase tracking-wider">{t.cardOverdue}</span></div>
          <p className="font-display text-2xl text-white">{totals.overdueCount} <span className="text-base text-text-secondary">{t.invoiceWord}</span></p>
        </div>
      </div>

      {/* TANYA AI — analisa piutang */}
      <section className="bg-card-bg border border-accent-purple/30 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-accent-purple" />
          <h2 className="font-display text-base text-white">{t.aiTitle}</h2>
          <span className="text-[9px] font-mono uppercase tracking-wider text-accent-purple/70 ml-auto">Haiku · OpenRouter</span>
        </div>
        <p className="text-text-secondary text-xs mb-3">{t.aiDesc}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[t.chip1, t.chip2, t.chip3].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => askAi(q)}
              disabled={aiBusy}
              className="text-[11px] border border-border-muted text-text-secondary hover:text-text-primary
                         hover:border-accent-purple/40 rounded-full px-3 py-1 transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={aiQ}
            onChange={(e) => setAiQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') askAi() }}
            placeholder={t.aiPlaceholder}
            disabled={aiBusy}
            className="flex-1 bg-surface border border-border-muted rounded-lg px-3 py-2 text-sm text-text-primary
                       placeholder:text-text-secondary/40 focus:border-accent-purple focus:outline-none
                       focus:ring-1 focus:ring-accent-purple/40 transition-colors disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => askAi()}
            disabled={aiBusy || !aiQ.trim()}
            className="inline-flex items-center gap-2 bg-accent-purple/90 hover:bg-accent-purple text-white
                       rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t.askBtn}
          </button>
        </div>
        {aiErr && <p className="text-xs text-status-danger mt-2">{aiErr}</p>}
        {aiAnswer && (
          <div className="mt-3 rounded-md bg-surface/60 border border-border-muted px-4 py-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{aiAnswer}</p>
          </div>
        )}
      </section>

      {/* AGING + PER PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <h2 className="font-display text-base text-white mb-4">{t.secAging}</h2>
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
            <p className="text-text-secondary text-sm py-6 text-center">{t.allPaid}</p>
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
          <h2 className="font-display text-base text-white">{t.secList}</h2>
          <span className="text-xs font-mono text-text-secondary">{rows.length} {t.invoiceWord}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="text-left px-5 py-3 font-medium">{t.thNo}</th>
                <th className="text-left px-5 py-3 font-medium">Principal</th>
                <th className="text-left px-5 py-3 font-medium">{t.thDue}</th>
                <th className="text-right px-5 py-3 font-medium">{t.thValue}</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">{t.thAction}</th>
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
                      {overdue && <span className="block text-[10px] text-status-danger">{t.latePre} {r.overdueDays} {t.latePost}</span>}
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
                            {t.markPaid}
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
                          title={t.dlPdf}
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
