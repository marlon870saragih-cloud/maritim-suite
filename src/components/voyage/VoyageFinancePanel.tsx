'use client'

// Tab Finansial (K49) — daftar dokumen, bukan lagi kartu jumlah statis. Builder
// sungguhan ada di halaman sendiri (/voyages/[id]/disbursements/[disbId]).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, GitBranch, Loader2, Plus, Receipt, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    create: 'Buat EPDA', loading: 'Memuat…', errCreate: 'Gagal membuat dokumen.', errConn: 'Gagal terhubung ke server.',
    emptyTitle: 'Belum ada dokumen finansial', emptyDesc: 'Buat EPDA untuk mulai menghitung estimasi biaya pelabuhan voyage ini.',
    thDoc: 'No. Dokumen', thKind: 'Jenis', thStatus: 'Status', thTotal: 'Total', thDate: 'Tanggal', thAction: 'Aksi',
    createFda: 'Buat FDA', errCreateFda: 'Gagal membuat FDA.',
    createInvoice: 'Buat Invoice', errCreateInvoice: 'Gagal membuat Invoice.',
    invoicesTitle: 'Invoice', thInvoice: 'No. Invoice', thPaid: 'Terbayar', noInvoices: 'Belum ada Invoice.',
  },
  en: {
    create: 'Create EPDA', loading: 'Loading…', errCreate: 'Failed to create document.', errConn: 'Failed to connect to server.',
    emptyTitle: 'No financial documents yet', emptyDesc: 'Create an EPDA to start estimating this voyage’s port costs.',
    thDoc: 'Doc No.', thKind: 'Kind', thStatus: 'Status', thTotal: 'Total', thDate: 'Date', thAction: 'Action',
    createFda: 'Create FDA', errCreateFda: 'Failed to create FDA.',
    createInvoice: 'Create Invoice', errCreateInvoice: 'Failed to create invoice.',
    invoicesTitle: 'Invoices', thInvoice: 'Invoice No.', thPaid: 'Paid', noInvoices: 'No invoices yet.',
  },
}

/** K45: sumber boleh EPDA/FPDA, belum disalip versi lain, sudah disetujui — cermin `KIND_SUMBER`/`STATUS_SUMBER` di fda.service.ts. */
const KIND_SUMBER_FDA = new Set(['EPDA', 'FPDA'])
const STATUS_SUMBER_FDA = new Set(['APPROVED', 'SENT', 'CLOSED'])

/** K47: Invoice hanya boleh dibuat dari FDA berstatus FINAL — cermin fda/invoice.service.ts. */
const STATUS_SUMBER_INVOICE = 'FINAL'

const INVOICE_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  ISSUED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  SENT: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30',
  PARTIALLY_PAID: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  PAID: 'bg-status-success/12 text-status-success border-status-success/30',
  OVERDUE: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  CANCELLED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  PENDING_REVIEW: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  APPROVED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  SENT: 'bg-status-success/12 text-status-success border-status-success/30',
  REVISION_REQUESTED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  REVISED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-status-success/12 text-status-success border-status-success/30',
  CLOSED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

type DisbRow = {
  id: string
  docNumber: string
  kind: string
  status: string
  version: number
  supersededBy: string | null
  baseCurrency: string
  grandTotal: number
  issuedAt: string
}

type InvoiceRow = {
  id: string
  invoiceNumber: string
  status: string
  currency: string
  grandTotal: number
  amountPaid: number
  invoiceDate: string
  sourceDisbursementId: string | null
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID')
const fmtAmount = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 })

export type VoyageFinanceCounts = { disbursements: number; invoices: number; documents: number }

export function VoyageFinancePanel({ voyageId, counts }: { voyageId: string; counts: VoyageFinanceCounts }) {
  const t = useT(STR)
  const router = useRouter()
  const [rows, setRows] = useState<DisbRow[] | null>(null)
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [fdaBusyId, setFdaBusyId] = useState<string | null>(null)
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function refreshInvoices() {
    fetch(`/api/voyages/${voyageId}/invoices`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setInvoiceRows)
      .catch(() => setInvoiceRows([]))
  }

  useEffect(() => {
    fetch(`/api/voyages/${voyageId}/disbursements`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]))
    refreshInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId])

  async function createEpda() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/voyages/${voyageId}/disbursements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'EPDA' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errCreate)
        return
      }
      const body = await res.json()
      router.push(`/voyages/${voyageId}/disbursements/${body.disbursement.id}`)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function createFda(sourceId: string) {
    setFdaBusyId(sourceId)
    setError('')
    try {
      const res = await fetch(`/api/disbursements/${sourceId}/fda`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errCreateFda)
        return
      }
      const body = await res.json()
      router.push(`/voyages/${voyageId}/disbursements/${body.disbursement.id}`)
    } catch {
      setError(t.errConn)
    } finally {
      setFdaBusyId(null)
    }
  }

  async function createInvoice(sourceId: string) {
    setInvoiceBusyId(sourceId)
    setError('')
    try {
      const res = await fetch(`/api/disbursements/${sourceId}/invoice`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errCreateInvoice)
        return
      }
      const body = await res.json()
      router.push(`/voyages/${voyageId}/invoices/${body.invoice.id}`)
    } catch {
      setError(t.errConn)
    } finally {
      setInvoiceBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={createEpda}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t.create}
        </button>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {rows === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-text-secondary text-xs mt-1 max-w-md">{t.emptyDesc}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thDoc}</th>
                <th className="px-4 py-2.5 font-medium">{t.thKind}</th>
                <th className="px-4 py-2.5 font-medium">{t.thStatus}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thTotal}</th>
                <th className="px-4 py-2.5 font-medium">{t.thDate}</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="text-sm">
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < rows.length - 1 && 'border-b border-card-border/50',
                  )}
                >
                  <td className="px-4 py-3 font-mono text-text-primary">
                    <Link href={`/voyages/${voyageId}/disbursements/${r.id}`} className="hover:text-accent-blue hover:underline inline-flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-text-secondary" />
                      {r.docNumber}
                      {r.version > 1 && (
                        <span className="text-[9px] px-1 py-0.5 rounded-full border border-accent-blue/40 bg-accent-blue/10 text-accent-blue">
                          v{r.version}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-secondary font-mono">{r.kind}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', STATUS_COLOR[r.status] ?? STATUS_COLOR.DRAFT)}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">
                    {r.baseCurrency} {fmtAmount(r.grandTotal)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{fmtDate(r.issuedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {KIND_SUMBER_FDA.has(r.kind) && r.supersededBy === null && STATUS_SUMBER_FDA.has(r.status) && (
                      <button
                        type="button"
                        onClick={() => createFda(r.id)}
                        disabled={fdaBusyId !== null}
                        className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                      >
                        {fdaBusyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                        {t.createFda}
                      </button>
                    )}
                    {r.kind === 'FDA' && r.supersededBy === null && r.status === STATUS_SUMBER_INVOICE && (
                      <button
                        type="button"
                        onClick={() => createInvoice(r.id)}
                        disabled={invoiceBusyId !== null}
                        className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                      >
                        {invoiceBusyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
                        {t.createInvoice}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoiceRows !== null && invoiceRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.invoicesTitle}</p>
          <div className="overflow-x-auto border border-card-border/60 rounded-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-4 py-2.5 font-medium">{t.thInvoice}</th>
                  <th className="px-4 py-2.5 font-medium">{t.thStatus}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.thTotal}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t.thPaid}</th>
                  <th className="px-4 py-2.5 font-medium">{t.thDate}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {invoiceRows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn('hover:bg-surface-tertiary/30 transition-colors', i < invoiceRows.length - 1 && 'border-b border-card-border/50')}
                  >
                    <td className="px-4 py-3 font-mono text-text-primary">
                      <Link href={`/voyages/${voyageId}/invoices/${r.id}`} className="hover:text-accent-blue hover:underline inline-flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-text-secondary" />
                        {r.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider', INVOICE_STATUS_COLOR[r.status] ?? INVOICE_STATUS_COLOR.DRAFT)}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-primary">{r.currency} {fmtAmount(r.grandTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-text-secondary">{r.currency} {fmtAmount(r.amountPaid)}</td>
                    <td className="px-4 py-3 text-text-secondary">{fmtDate(r.invoiceDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {counts.documents > 0 && (
        <p className="text-text-secondary text-xs">{counts.documents} dokumen lama terkait</p>
      )}
    </div>
  )
}
