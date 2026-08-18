'use client'

// Builder PR/PO (K117-K120, K122-K123, Fase 7i) — satu tabel untuk PR & PO
// (K3 diteruskan), pola mengikuti DisbursementBuilder.tsx tapi jauh lebih
// sederhana: aritmatika qty×harga (K118, bukan calc-engine), approval SATU
// level ADMIN (K120 interim P39), PDF memakai ulang ProcurementDocument (K119).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Download, Loader2, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { AttachmentPanel } from '@/components/ops/AttachmentPanel'
import { CommentPanel } from '@/components/ops/CommentPanel'
import { EmailLogPanel } from '@/components/ops/EmailLogPanel'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    particulars: 'Particulars', edit: 'Ubah', save: 'Simpan', cancel: 'Batal',
    fVendor: 'Vendor', fCurrency: 'Mata Uang', fTaxPct: 'Pajak (%)', fDeliveryTo: 'Kirim Ke',
    fNeededBy: 'Dibutuhkan Sebelum', fTerms: 'Termin', fNotes: 'Catatan', selNone: '— tanpa vendor —',
    itemsTitle: 'Baris', thDesc: 'Deskripsi', thQty: 'Kuantitas', thUnit: 'Satuan', thPrice: 'Harga Satuan', thAmount: 'Jumlah', thReceived: 'Diterima', thAction: 'Aksi',
    addItem: 'Tambah Baris', save2: 'Simpan Baris',
    subtotal: 'Subtotal', taxAmount: 'Pajak', grandTotal: 'Grand Total',
    downloadPdf: 'Unduh PDF', convertToPo: 'Konversi ke PO',
    approvalTitle: 'Approval', approve: 'Setujui', reject: 'Tolak', requestRevision: 'Minta Revisi', noteRequired: 'Catatan (wajib untuk tolak/revisi)',
    errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    confirmRemove: 'Hapus baris ini?', readOnlyNote: 'Header/isi baris tidak lagi bisa diubah pada status sekarang.',
  },
  en: {
    particulars: 'Particulars', edit: 'Edit', save: 'Save', cancel: 'Cancel',
    fVendor: 'Vendor', fCurrency: 'Currency', fTaxPct: 'Tax (%)', fDeliveryTo: 'Deliver To',
    fNeededBy: 'Needed By', fTerms: 'Terms', fNotes: 'Notes', selNone: '— no vendor —',
    itemsTitle: 'Lines', thDesc: 'Description', thQty: 'Quantity', thUnit: 'Unit', thPrice: 'Unit Price', thAmount: 'Amount', thReceived: 'Received', thAction: 'Action',
    addItem: 'Add Line', save2: 'Save Line',
    subtotal: 'Subtotal', taxAmount: 'Tax', grandTotal: 'Grand Total',
    downloadPdf: 'Download PDF', convertToPo: 'Convert to PO',
    approvalTitle: 'Approval', approve: 'Approve', reject: 'Reject', requestRevision: 'Request Revision', noteRequired: 'Note (required to reject/request revision)',
    errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    confirmRemove: 'Delete this line?', readOnlyNote: 'Header/line contents can no longer be changed at this status.',
  },
}

export type PoItem = { id: string; description: string; quantity: number; unit: string | null; unitPrice: number; amount: number; receivedQty: number }
export type PoDetail = {
  id: string; kind: 'PR' | 'PO'; docNumber: string; status: string
  voyageId: string | null; voyage: { id: string; voyageNumber: string } | null
  vendorId: string | null; vendor: { id: string; name: string } | null
  currency: string; taxPct: number | null; deliveryTo: string | null; neededBy: string | null; terms: string | null; notes: string | null
  items: PoItem[]
  hitung: { subtotal: number; taxAmount: number; grandTotal: number }
  transisiTersedia?: string[]
  sourceRequisitionId: string | null
}
type VendorOption = { id: string; name: string }

const TRANSISI_PO: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['DRAFT', 'CANCELLED'], // APPROVED sengaja tak ada di sini — hanya lewat panel approval
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CLOSED', 'CANCELLED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function PurchaseBuilder({ po: initial }: { po: PoDetail }) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const [po, setPo] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [form, setForm] = useState({
    vendorId: po.vendorId ?? '', taxPct: po.taxPct != null ? String(po.taxPct) : '',
    deliveryTo: po.deliveryTo ?? '', neededBy: po.neededBy ? po.neededBy.slice(0, 10) : '',
    terms: po.terms ?? '', notes: po.notes ?? '',
  })

  const [addingItem, setAddingItem] = useState(false)
  const [itemForm, setItemForm] = useState({ description: '', quantity: '1', unit: '', unitPrice: '0' })

  const [approvalInfo, setApprovalInfo] = useState<{ approvals: { id: string; userName: string | null; userRole: string | null; decision: string; note: string | null; createdAt: string }[]; bolehMemutuskanSekarang: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  const editable = po.status === 'DRAFT'
  const fmt = (n: number) => n.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 })

  useEffect(() => {
    fetch('/api/vendors').then((r) => (r.ok ? r.json() : [])).then(setVendors).catch(() => {})
  }, [])

  useEffect(() => {
    if (po.status !== 'PENDING_APPROVAL') {
      setApprovalInfo(null)
      return
    }
    fetch(`/api/purchase-orders/${po.id}/approvals`).then((r) => (r.ok ? r.json() : null)).then(setApprovalInfo).catch(() => {})
  }, [po.id, po.status])

  async function refresh() {
    const res = await fetch(`/api/purchase-orders/${po.id}`)
    if (res.ok) setPo(await res.json())
    router.refresh()
  }

  async function mutate(fn: () => Promise<Response>) {
    setError('')
    setBusy(true)
    try {
      const res = await fn()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return false
      }
      const body = await res.json()
      if (body.po) setPo(body.po)
      router.refresh()
      return true
    } catch {
      setError(t.errConn)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveHeader() {
    const ok = await mutate(() =>
      fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: form.vendorId || null,
          taxPct: form.taxPct === '' ? null : form.taxPct,
          deliveryTo: form.deliveryTo || null,
          neededBy: form.neededBy || null,
          terms: form.terms || null,
          notes: form.notes || null,
        }),
      }),
    )
    if (ok) setEditing(false)
  }

  async function addItem() {
    const ok = await mutate(() =>
      fetch(`/api/purchase-orders/${po.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemForm),
      }),
    )
    if (ok) {
      setAddingItem(false)
      setItemForm({ description: '', quantity: '1', unit: '', unitPrice: '0' })
    }
  }

  async function removeItem(itemId: string) {
    if (!confirm(t.confirmRemove)) return
    await mutate(() => fetch(`/api/purchase-orders/${po.id}/items/${itemId}`, { method: 'DELETE' }))
  }

  async function updateReceivedQty(itemId: string, receivedQty: string) {
    await mutate(() =>
      fetch(`/api/purchase-orders/${po.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedQty }),
      }),
    )
  }

  async function changeStatus(target: string) {
    await mutate(() =>
      fetch(`/api/purchase-orders/${po.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      }),
    )
  }

  async function decide(decision: 'APPROVED' | 'REJECTED' | 'REQUEST_REVISION') {
    const ok = await mutate(() =>
      fetch(`/api/purchase-orders/${po.id}/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: decisionNote || null }),
      }),
    )
    if (ok) {
      setDecisionNote('')
      await refresh()
    }
  }

  async function convertToPo() {
    if (!form.vendorId) {
      setError(t.errSave)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/convert-to-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: form.vendorId }),
      })
      const body = await res.json()
      if (res.ok) router.push(`/procurement/${body.po.id}`)
      else setError(body?.error?.message ?? t.errSave)
    } finally {
      setBusy(false)
    }
  }

  const availableTargets = po.transisiTersedia ?? TRANSISI_PO[po.status] ?? []

  return (
    <div className="space-y-6">
      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className={labelCls}>{t.particulars}</p>
          {editable && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-accent-blue hover:underline">
              {t.edit}
            </button>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t.fVendor}</label>
              <select value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} className={inputCls}>
                <option value="">{t.selNone}</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fTaxPct}</label>
              <input type="number" value={form.taxPct} onChange={(e) => setForm((f) => ({ ...f, taxPct: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fDeliveryTo}</label>
              <input value={form.deliveryTo} onChange={(e) => setForm((f) => ({ ...f, deliveryTo: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fNeededBy}</label>
              <input type="date" value={form.neededBy} onChange={(e) => setForm((f) => ({ ...f, neededBy: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fTerms}</label>
              <input value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t.fNotes}</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={busy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
                {t.cancel}
              </button>
              <button type="button" onClick={saveHeader} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.save}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className={labelCls}>{t.fVendor}</p><p className="text-text-primary">{po.vendor?.name ?? '—'}</p></div>
            <div><p className={labelCls}>{t.fTaxPct}</p><p className="text-text-primary">{po.taxPct ?? 0}%</p></div>
            <div><p className={labelCls}>{t.fDeliveryTo}</p><p className="text-text-primary">{po.deliveryTo ?? '—'}</p></div>
            <div><p className={labelCls}>{t.fNeededBy}</p><p className="text-text-primary">{po.neededBy ? po.neededBy.slice(0, 10) : '—'}</p></div>
            <div><p className={labelCls}>{t.fTerms}</p><p className="text-text-primary">{po.terms ?? '—'}</p></div>
            <div className="col-span-3"><p className={labelCls}>{t.fNotes}</p><p className="text-text-primary whitespace-pre-wrap">{po.notes ?? '—'}</p></div>
          </div>
        )}
        {!editable && <p className="text-text-secondary text-xs">{t.readOnlyNote}</p>}
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className={labelCls}>{t.itemsTitle}</p>
          <div className="flex items-center gap-2">
            <a href={`/api/purchase-orders/${po.id}/pdf?download=1`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded border border-border-muted px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors">
              <Download className="w-3.5 h-3.5" /> {t.downloadPdf}
            </a>
            {editable && (
              <button type="button" onClick={() => setAddingItem(true)} className="inline-flex items-center gap-1.5 rounded bg-accent-blue hover:bg-primary text-[#231a06] px-2.5 py-1.5 text-xs font-medium transition-colors">
                <Plus className="w-3.5 h-3.5" /> {t.addItem}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-card-border/60 rounded-md">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-3 py-2 font-medium">{t.thDesc}</th>
                <th className="px-3 py-2 font-medium text-right">{t.thQty}</th>
                <th className="px-3 py-2 font-medium">{t.thUnit}</th>
                <th className="px-3 py-2 font-medium text-right">{t.thPrice}</th>
                <th className="px-3 py-2 font-medium text-right">{t.thAmount}</th>
                <th className="px-3 py-2 font-medium text-right">{t.thReceived}</th>
                {editable && <th className="px-3 py-2 font-medium text-right">{t.thAction}</th>}
              </tr>
            </thead>
            <tbody className="text-sm">
              {po.items.map((it, i) => (
                <tr key={it.id} className={cn(i < po.items.length - 1 && 'border-b border-card-border/50')}>
                  <td className="px-3 py-2.5 text-text-primary">{it.description}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">{fmt(it.quantity)}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{it.unit ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-secondary">{fmt(it.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-primary">{fmt(it.amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) ? (
                      <input
                        type="number"
                        defaultValue={it.receivedQty}
                        onBlur={(e) => e.target.value !== String(it.receivedQty) && updateReceivedQty(it.id, e.target.value)}
                        className="w-20 bg-surface border border-border-muted rounded px-1.5 py-1 text-xs text-right font-mono text-text-primary focus:border-accent-blue focus:outline-none"
                      />
                    ) : (
                      <span className="font-mono text-text-secondary">{fmt(it.receivedQty)}</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-2.5 text-right">
                      <button type="button" onClick={() => removeItem(it.id)} className="p-1 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {addingItem && (
                <tr className="border-t border-card-border/50 bg-surface/30">
                  <td className="px-3 py-2">
                    <input value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} autoFocus />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={itemForm.quantity} onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))} className={inputCls} />
                  </td>
                  <td className="px-3 py-2">
                    <input value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} className={inputCls} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={itemForm.unitPrice} onChange={(e) => setItemForm((f) => ({ ...f, unitPrice: e.target.value }))} className={inputCls} />
                  </td>
                  <td colSpan={3} className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setAddingItem(false)} className="p-1.5 rounded text-text-secondary hover:bg-surface-tertiary transition-colors"><X className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={addItem} disabled={busy} className="p-1.5 rounded text-status-success hover:bg-status-success/10 transition-colors disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-text-secondary"><span>{t.subtotal}</span><span className="font-mono">{fmt(po.hitung.subtotal)}</span></div>
          <div className="flex justify-between text-text-secondary"><span>{t.taxAmount}</span><span className="font-mono">{fmt(po.hitung.taxAmount)}</span></div>
          <div className="flex justify-between text-text-primary font-display text-base pt-1.5 border-t border-card-border">
            <span>{t.grandTotal}</span><span className="font-mono">{po.currency} {fmt(po.hitung.grandTotal)}</span>
          </div>
        </div>
      </section>

      {error && <p className="text-status-danger text-sm bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {po.kind === 'PR' && po.status === 'APPROVED' && (
          <button type="button" onClick={convertToPo} disabled={busy} className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium bg-accent-purple hover:bg-accent-purple/80 text-white transition-colors disabled:opacity-50">
            {t.convertToPo}
          </button>
        )}
        {availableTargets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => changeStatus(target)}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
              target === 'CANCELLED' ? 'border border-status-danger/40 text-status-danger hover:bg-status-danger/10' : 'bg-accent-blue hover:bg-primary text-[#231a06]',
            )}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {target}
          </button>
        ))}
      </div>

      {po.status === 'PENDING_APPROVAL' && approvalInfo && (
        <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
          <p className={labelCls}>{t.approvalTitle}</p>
          {approvalInfo.approvals.length > 0 && (
            <ul className="space-y-2 text-sm">
              {approvalInfo.approvals.map((a) => (
                <li key={a.id} className="border-b border-card-border/40 pb-2 last:border-0">
                  <p className="text-text-primary">{a.userName} · {a.userRole} · {a.decision}</p>
                  {a.note && <p className="text-text-secondary text-xs">{a.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {approvalInfo.bolehMemutuskanSekarang && (
            <div className="space-y-2">
              <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder={t.noteRequired} className={inputCls} />
              <div className="flex gap-2">
                <button type="button" onClick={() => decide('APPROVED')} disabled={busy} className="px-3.5 py-2 rounded text-xs font-medium bg-status-success hover:bg-status-success/80 text-white transition-colors disabled:opacity-50">{t.approve}</button>
                <button type="button" onClick={() => decide('REJECTED')} disabled={busy} className="px-3.5 py-2 rounded text-xs font-medium border border-status-danger/40 text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50">{t.reject}</button>
                <button type="button" onClick={() => decide('REQUEST_REVISION')} disabled={busy} className="px-3.5 py-2 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">{t.requestRevision}</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="bg-card-bg border border-card-border rounded-lg p-5 grid gap-6 md:grid-cols-2">
        <AttachmentPanel entityType="PURCHASE_ORDER" entityId={po.id} />
        <CommentPanel entityType="PURCHASE_ORDER" entityId={po.id} />
      </section>

      <section className="bg-card-bg border border-card-border rounded-lg p-5">
        <EmailLogPanel entityType="PURCHASE_ORDER" entityId={po.id} />
      </section>

      {po.voyage && (
        <Link href={`/voyages/${po.voyage.id}`} className="text-xs text-accent-blue hover:underline">
          {po.voyage.voyageNumber}
        </Link>
      )}
    </div>
  )
}
