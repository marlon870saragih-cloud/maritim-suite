'use client'

// "Ambil dari PO/WO/tagihan vendor" (K122 Fase 7i + K172/1 Fase 8g) — dua
// tahap: (1) pilih PO RECEIVED, WO COMPLETED/VERIFIED, atau tagihan vendor
// belum dipakai untuk voyage ini, (2) form baris TERISI tapi TETAP HARUS
// disimpan operator. Batalkan di tahap mana pun → TAK ADA DisbursementItem
// lahir (K122/K172, pemeriksaan inti kedua increment).
//
// PO/WO/tagihan vendor TIDAK PERNAH menulis baris biaya sendiri (K122/K172/K52)
// — dialog ini cuma mengisi form, penyimpanannya lewat endpoint item ad-hoc
// yang SUDAH ADA (`POST /api/disbursements/[id]/items`, tanpa serviceId),
// plus tiga field penanda opsional (sourcePurchaseOrderId/sourceWorkOrderId/
// vendorInvoiceSubmissionId).

import { useEffect, useState } from 'react'
import { Loader2, Package, Wrench, Receipt } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Ambil dari PO/WO', desc: 'Pilih Purchase Order yang sudah diterima, Work Order yang sudah selesai, atau tagihan vendor — form baris terisi, tetap Anda yang menyimpan.',
    tabPo: 'Purchase Order', tabWo: 'Work Order', tabSubmission: 'Tagihan Vendor',
    emptyPo: 'Tidak ada PO RECEIVED yang belum dipakai untuk voyage ini.',
    emptyWo: 'Tidak ada WO COMPLETED/VERIFIED yang belum dipakai untuk voyage ini.',
    emptySubmission: 'Tidak ada tagihan vendor yang belum dipakai untuk voyage ini.',
    fDesc: 'Deskripsi', fQty: 'Kuantitas', fUnit: 'Satuan', fPrice: 'Harga Satuan',
    discrepancy: 'Vendor menyatakan {vendor} vs kesepakatan WO {agreed} — selisih {diff}.',
    cancel: 'Batal', save: 'Simpan Baris', back: 'Kembali ke daftar',
    errSave: 'Gagal menyimpan baris.', errConn: 'Gagal terhubung ke server.', errLoad: 'Gagal memuat daftar.',
  },
  en: {
    title: 'Take from PO/WO', desc: 'Pick a received Purchase Order, completed Work Order, or vendor invoice — the line form is pre-filled, you still save it.',
    tabPo: 'Purchase Order', tabWo: 'Work Order', tabSubmission: 'Vendor Invoice',
    emptyPo: 'No unused RECEIVED PO for this voyage.',
    emptyWo: 'No unused COMPLETED/VERIFIED WO for this voyage.',
    emptySubmission: 'No unused vendor invoice for this voyage.',
    fDesc: 'Description', fQty: 'Quantity', fUnit: 'Unit', fPrice: 'Unit Price',
    discrepancy: 'Vendor states {vendor} vs WO agreement {agreed} — difference {diff}.',
    cancel: 'Cancel', save: 'Save Line', back: 'Back to list',
    errSave: 'Failed to save line.', errConn: 'Failed to connect to server.', errLoad: 'Failed to load list.',
  },
}

type PoOption = { id: string; docNumber: string; vendor: { id: string; name: string } | null; items: { description: string; quantity: number; unit: string | null; unitPrice: number }[]; currency: string }
type WoOption = { id: string; woNumber: string; scope: string; vendorId: string; vendor: { id: string; name: string } | null; agreedAmount: number | null; currency: string }
type SubmissionOption = {
  id: string; invoiceNo: string; currency: string; amount: number; note: string | null
  vendor: { id: string; name: string } | null
  purchaseOrderId: string | null; workOrderId: string | null
  workOrderAgreedAmount: number | null
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function ProcurementPickerDialog({
  open,
  onOpenChange,
  voyageId,
  disbursementId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  voyageId: string
  disbursementId: string
  onSaved: () => void
}) {
  const t = useT(STR)
  const [tab, setTab] = useState<'po' | 'wo' | 'submission'>('po')
  const [po, setPo] = useState<PoOption[] | null>(null)
  const [wo, setWo] = useState<WoOption[] | null>(null)
  const [submission, setSubmission] = useState<SubmissionOption[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [picked, setPicked] = useState<{ source: 'po' | 'wo' | 'submission'; id: string; vendorId: string | null } | null>(null)
  const [form, setForm] = useState({ description: '', quantity: '1', unit: '', unitPrice: '0' })
  const [selisih, setSelisih] = useState<{ vendor: number; agreed: number; currency: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setTab('po')
    setPicked(null)
    setSelisih(null)
    setError('')
    Promise.all([
      fetch(`/api/voyages/${voyageId}/procurement-sources`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`/api/voyages/${voyageId}/vendor-submissions`).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([sumber, submisi]: [{ po: PoOption[]; wo: WoOption[] }, SubmissionOption[]]) => {
        setPo(sumber.po)
        setWo(sumber.wo)
        setSubmission(submisi)
      })
      .catch(() => setError(t.errLoad))
  }, [open, voyageId, t.errLoad])

  function pickPo(p: PoOption) {
    const first = p.items[0]
    setForm({
      description: first?.description ?? p.docNumber,
      quantity: String(first?.quantity ?? 1),
      unit: first?.unit ?? '',
      unitPrice: String(first?.unitPrice ?? 0),
    })
    setPicked({ source: 'po', id: p.id, vendorId: p.vendor?.id ?? null })
    setSelisih(null)
  }

  function pickWo(w: WoOption) {
    setForm({ description: w.scope, quantity: '1', unit: '', unitPrice: String(w.agreedAmount ?? 0) })
    setPicked({ source: 'wo', id: w.id, vendorId: w.vendor?.id ?? null })
    setSelisih(null)
  }

  function pickSubmission(s: SubmissionOption) {
    setForm({ description: `Tagihan vendor ${s.invoiceNo}`, quantity: '1', unit: '', unitPrice: String(s.amount) })
    setPicked({ source: 'submission', id: s.id, vendorId: s.vendor?.id ?? null })
    // K172/3 — selisih ditampilkan, tidak menolak apa pun.
    setSelisih(
      s.workOrderAgreedAmount !== null
        ? { vendor: s.amount, agreed: s.workOrderAgreedAmount, currency: s.currency }
        : null,
    )
  }

  async function save() {
    if (!picked) return
    setBusy(true)
    setError('')
    try {
      const sumberField =
        picked.source === 'po'
          ? { sourcePurchaseOrderId: picked.id }
          : picked.source === 'wo'
            ? { sourceWorkOrderId: picked.id }
            : { vendorInvoiceSubmissionId: picked.id }
      const res = await fetch(`/api/disbursements/${disbursementId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description,
          quantity: form.quantity,
          unit: form.unit || null,
          unitPrice: form.unitPrice,
          vendorId: picked.vendorId,
          ...sumberField,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      onSaved()
      onOpenChange(false)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {picked ? (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t.fDesc}</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{t.fQty}</label>
                <input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fUnit}</label>
                <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t.fPrice}</label>
                <input type="number" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} className={inputCls} />
              </div>
            </div>
            {selisih && (
              <p className="text-status-warning text-xs bg-status-warning/10 border border-status-warning/30 rounded px-3 py-2">
                {t.discrepancy
                  .replace('{vendor}', `${selisih.currency} ${selisih.vendor.toLocaleString('en-US')}`)
                  .replace('{agreed}', `${selisih.currency} ${selisih.agreed.toLocaleString('en-US')}`)
                  .replace('{diff}', `${selisih.currency} ${Math.abs(selisih.vendor - selisih.agreed).toLocaleString('en-US')}`)}
              </p>
            )}
            {error && <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPicked(null)} disabled={busy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
                {t.back}
              </button>
              <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.save}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1 border-b border-border-muted">
              {(['po', 'wo', 'submission'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === k ? 'border-accent-blue text-white' : 'border-transparent text-text-secondary hover:text-white'}`}
                >
                  {k === 'po' ? t.tabPo : k === 'wo' ? t.tabWo : t.tabSubmission}
                </button>
              ))}
            </div>

            {error && <p className="text-status-danger text-xs">{error}</p>}

            {tab === 'po' ? (
              !po ? null : po.length === 0 ? (
                <p className="text-text-secondary text-sm">{t.emptyPo}</p>
              ) : (
                <ul className="space-y-2">
                  {po.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickPo(p)}
                        className="w-full flex items-center gap-3 text-left rounded-md border border-border-muted px-3 py-2.5 hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                      >
                        <Package className="w-4 h-4 text-accent-blue shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">{p.docNumber}</p>
                          <p className="text-xs text-text-secondary truncate">{p.vendor?.name ?? '—'} · {p.items.length} baris</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : tab === 'wo' ? (
              !wo ? null : wo.length === 0 ? (
                <p className="text-text-secondary text-sm">{t.emptyWo}</p>
              ) : (
                <ul className="space-y-2">
                  {wo.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        onClick={() => pickWo(w)}
                        className="w-full flex items-center gap-3 text-left rounded-md border border-border-muted px-3 py-2.5 hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                      >
                        <Wrench className="w-4 h-4 text-accent-amber shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-text-primary">{w.woNumber}</p>
                          <p className="text-xs text-text-secondary truncate">{w.vendor?.name ?? '—'} · {w.scope}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : !submission ? null : submission.length === 0 ? (
              <p className="text-text-secondary text-sm">{t.emptySubmission}</p>
            ) : (
              <ul className="space-y-2">
                {submission.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickSubmission(s)}
                      className="w-full flex items-center gap-3 text-left rounded-md border border-border-muted px-3 py-2.5 hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
                    >
                      <Receipt className="w-4 h-4 text-accent-teal shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary">{s.invoiceNo}</p>
                        <p className="text-xs text-text-secondary truncate">{s.vendor?.name ?? '—'} · {s.currency} {s.amount.toLocaleString('en-US')}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end pt-1">
              <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors">
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
