'use client'

// Halaman Invoice (Fase 4, K47) — header + baris (read-only, snapshot dari FDA)
// + pembayaran (AR). Baris TIDAK bisa disunting di sini: sudah dibekukan saat
// Invoice dibuat dari FDA FINAL, sama semangatnya dengan snapshot item FDA (K5).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Banknote, CheckCircle2, Download, Loader2, Receipt, Send, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { AttachmentPanel } from '@/components/ops/AttachmentPanel'
import { CommentPanel } from '@/components/ops/CommentPanel'
import { EmailLogPanel } from '@/components/ops/EmailLogPanel'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    thDesc: 'Deskripsi', thQty: 'Kuantitas', thUnitPrice: 'Harga Satuan', thAmount: 'Jumlah',
    itemsTitle: 'Baris Tagihan', paymentsTitle: 'Pembayaran', noPayments: 'Belum ada pembayaran.',
    recordPayment: 'Catat Pembayaran', amount: 'Jumlah', currency: 'Mata Uang', exchangeRate: 'Kurs',
    paymentDate: 'Tanggal Bayar', bankName: 'Bank', referenceNumber: 'No. Referensi', notes: 'Catatan',
    save: 'Simpan', cancel: 'Batal', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    subtotal: 'Subtotal', tax: 'Pajak', grandTotal: 'Grand Total', paid: 'Terbayar', outstanding: 'Sisa Tagihan',
    dueDate: 'Jatuh Tempo', customer: 'Ditagih Kepada', noCustomer: 'Belum ada pelanggan di voyage ini',
    issue: 'Terbitkan', markSent: 'Tandai Terkirim', cancelInvoice: 'Batalkan',
    confirmCancel: 'Batalkan Invoice ini?',
    downloadPdf: 'Unduh PDF', downloadReceipt: 'Unduh Kwitansi', markOverdue: 'Tandai Terlambat',
    confirmOverdue: 'Tandai Invoice ini terlambat bayar (OVERDUE)?',
  },
  en: {
    thDesc: 'Description', thQty: 'Quantity', thUnitPrice: 'Unit Price', thAmount: 'Amount',
    itemsTitle: 'Line Items', paymentsTitle: 'Payments', noPayments: 'No payments yet.',
    recordPayment: 'Record Payment', amount: 'Amount', currency: 'Currency', exchangeRate: 'Exchange Rate',
    paymentDate: 'Payment Date', bankName: 'Bank', referenceNumber: 'Reference No.', notes: 'Notes',
    save: 'Save', cancel: 'Cancel', errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    subtotal: 'Subtotal', tax: 'Tax', grandTotal: 'Grand Total', paid: 'Paid', outstanding: 'Outstanding',
    dueDate: 'Due Date', customer: 'Billed To', noCustomer: 'No customer set on this voyage',
    issue: 'Issue', markSent: 'Mark Sent', cancelInvoice: 'Cancel',
    confirmCancel: 'Cancel this invoice?',
    downloadPdf: 'Download PDF', downloadReceipt: 'Download Receipt', markOverdue: 'Mark Overdue',
    confirmOverdue: 'Mark this invoice as overdue (OVERDUE)?',
  },
}

const TARGET_LABEL: Record<Lang, Record<string, string>> = {
  id: { ISSUED: 'Terbitkan', SENT: 'Tandai Terkirim', OVERDUE: 'Tandai Terlambat', CANCELLED: 'Batalkan' },
  en: { ISSUED: 'Issue', SENT: 'Mark Sent', OVERDUE: 'Mark Overdue', CANCELLED: 'Cancel' },
}
const TARGET_ICON: Record<string, typeof Send> = { ISSUED: CheckCircle2, SENT: Send, OVERDUE: AlertTriangle, CANCELLED: XCircle }

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  ISSUED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  SENT: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30',
  PARTIALLY_PAID: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  PAID: 'bg-status-success/12 text-status-success border-status-success/30',
  OVERDUE: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  CANCELLED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

export type InvoiceItemRow = {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  amount: number
}

export type InvoicePaymentRow = {
  id: string
  paymentDate: string
  amount: number
  currency: string
  exchangeRate: number
  bankName: string | null
  referenceNumber: string | null
  notes: string | null
}

export type BuilderInvoice = {
  id: string
  invoiceNumber: string
  status: string
  currency: string
  subtotal: number
  taxAmount: number
  grandTotal: number
  amountPaid: number
  outstanding: number
  dueDate: string | null
  invoiceDate: string
  customerName: string | null
  transisiTersedia: readonly string[]
  bolehBayar: boolean
  items: InvoiceItemRow[]
  payments: InvoicePaymentRow[]
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('id-ID') : '—')
const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

const emptyPaymentForm = () => ({
  amount: '', currency: '', exchangeRate: '1', paymentDate: new Date().toISOString().slice(0, 10),
  bankName: '', referenceNumber: '', notes: '',
})

export function InvoiceDetail({ invoice: initial }: { invoice: BuilderInvoice }) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const [inv, setInv] = useState(initial)
  const [statusBusy, setStatusBusy] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleMutation(fn: () => Promise<Response>, busySetter?: (v: boolean) => void) {
    setError('')
    busySetter?.(true)
    try {
      const res = await fn()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return false
      }
      const body = await res.json()
      if (body.invoice) setInv(body.invoice)
      router.refresh()
      return true
    } catch {
      setError(t.errConn)
      return false
    } finally {
      busySetter?.(false)
    }
  }

  function changeStatus(target: string) {
    if (target === 'CANCELLED' && !confirm(t.confirmCancel)) return
    if (target === 'OVERDUE' && !confirm(t.confirmOverdue)) return
    handleMutation(
      () =>
        fetch(`/api/invoices/${inv.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: target }),
        }),
      setStatusBusy,
    )
  }

  function openPaymentForm() {
    setPaymentForm({ ...emptyPaymentForm(), currency: inv.currency })
    setPaymentOpen(true)
  }

  async function submitPayment() {
    const ok = await handleMutation(
      () =>
        fetch(`/api/invoices/${inv.id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentForm),
        }),
      setPaymentBusy,
    )
    if (ok) setPaymentOpen(false)
  }

  return (
    <div className="space-y-6">
      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider inline-block', STATUS_COLOR[inv.status] ?? STATUS_COLOR.DRAFT)}>
              {inv.status}
            </span>
            <p className="text-text-secondary text-xs">
              {t.customer}: <span className="text-text-primary">{inv.customerName ?? t.noCustomer}</span>
            </p>
            <p className="text-text-secondary text-xs">
              {t.dueDate}: <span className="text-text-primary">{fmtDate(inv.dueDate)}</span>
            </p>
          </div>
          <div className="text-right space-y-1 font-mono text-sm">
            <p className="text-text-secondary text-xs">{t.subtotal}: {inv.currency} {fmt(inv.subtotal)}</p>
            {inv.taxAmount > 0 && <p className="text-text-secondary text-xs">{t.tax}: {inv.currency} {fmt(inv.taxAmount)}</p>}
            <p className="text-text-primary text-base font-semibold">{t.grandTotal}: {inv.currency} {fmt(inv.grandTotal)}</p>
            <p className="text-status-success text-xs">{t.paid}: {inv.currency} {fmt(inv.amountPaid)}</p>
            {inv.outstanding > 0 && <p className="text-accent-amber text-xs">{t.outstanding}: {inv.currency} {fmt(inv.outstanding)}</p>}
          </div>
        </div>

        {error && (
          <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {inv.transisiTersedia.map((target) => {
            const Icon = TARGET_ICON[target] ?? Send
            return (
              <button
                key={target}
                type="button"
                onClick={() => changeStatus(target)}
                disabled={statusBusy}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  target === 'CANCELLED' && 'border border-status-danger/40 text-status-danger hover:bg-status-danger/10',
                  target === 'OVERDUE' && 'border border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10',
                  target !== 'CANCELLED' && target !== 'OVERDUE' && 'bg-accent-blue hover:bg-primary text-[#231a06]',
                )}
              >
                {statusBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                {TARGET_LABEL[lang]?.[target] ?? target}
              </button>
            )
          })}
          {inv.bolehBayar && (
            <button
              type="button"
              onClick={openPaymentForm}
              className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium border border-status-success/40 text-status-success hover:bg-status-success/10 transition-colors"
            >
              <Banknote className="w-4 h-4" /> {t.recordPayment}
            </button>
          )}
          <a
            href={`/api/invoices/${inv.id}/pdf?download=1`}
            className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
          >
            <Download className="w-4 h-4" /> {t.downloadPdf}
          </a>
        </div>
      </section>

      {paymentOpen && (
        <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.recordPayment}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{t.amount}</label>
              <input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.currency}</label>
              <input value={paymentForm.currency} onChange={(e) => setPaymentForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.exchangeRate}</label>
              <input type="number" min="0" step="0.0001" value={paymentForm.exchangeRate} onChange={(e) => setPaymentForm((f) => ({ ...f, exchangeRate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.paymentDate}</label>
              <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.bankName}</label>
              <input value={paymentForm.bankName} onChange={(e) => setPaymentForm((f) => ({ ...f, bankName: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.referenceNumber}</label>
              <input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((f) => ({ ...f, referenceNumber: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t.notes}</label>
            <input value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={submitPayment} disabled={paymentBusy} className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {paymentBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {t.save}
            </button>
            <button type="button" onClick={() => setPaymentOpen(false)} className="rounded px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              {t.cancel}
            </button>
          </div>
        </section>
      )}

      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" /> {t.itemsTitle}
        </p>
        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thDesc}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thQty}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thUnitPrice}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thAmount}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {inv.items.map((it, i) => (
                <tr key={it.id} className={cn(i < inv.items.length - 1 && 'border-b border-card-border/50')}>
                  <td className="px-4 py-3 text-text-primary">{it.description}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">{fmt(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-secondary">{fmt(it.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-mono text-text-primary">{fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5" /> {t.paymentsTitle}
        </p>
        {inv.payments.length === 0 ? (
          <p className="text-text-secondary text-sm">{t.noPayments}</p>
        ) : (
          <ul className="space-y-2.5">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 text-sm border-b border-card-border/40 pb-2.5 last:border-0 last:pb-0">
                <div>
                  <p className="text-text-primary font-mono">{p.currency} {fmt(p.amount)} {p.currency !== inv.currency && `(×${p.exchangeRate})`}</p>
                  {(p.bankName || p.referenceNumber) && (
                    <p className="text-text-secondary text-xs mt-0.5">{[p.bankName, p.referenceNumber].filter(Boolean).join(' · ')}</p>
                  )}
                  {p.notes && <p className="text-text-secondary text-xs mt-0.5">{p.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-text-secondary text-[10px] font-mono whitespace-nowrap">{fmtDate(p.paymentDate)}</p>
                  <a
                    href={`/api/invoices/${inv.id}/payments/${p.id}/pdf?download=1`}
                    className="inline-flex items-center gap-1 text-[10px] text-text-secondary hover:text-accent-blue transition-colors mt-1"
                  >
                    <Download className="w-3 h-3" /> {t.downloadReceipt}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5 grid gap-6 md:grid-cols-2">
        <AttachmentPanel entityType="INVOICE" entityId={inv.id} />
        <CommentPanel entityType="INVOICE" entityId={inv.id} />
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <EmailLogPanel entityType="INVOICE" entityId={inv.id} />
      </section>
    </div>
  )
}
