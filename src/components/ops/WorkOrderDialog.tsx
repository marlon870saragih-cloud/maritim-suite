'use client'

// WorkOrder (K121, K123, Fase 7i) — buat/ubah + transisi status dalam satu
// dialog (beda dari PurchaseBuilder yang jadi halaman penuh: WO tak punya
// baris/items, jadi tak butuh layar sendiri).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AttachmentPanel } from './AttachmentPanel'
import { CommentPanel } from './CommentPanel'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    titleCreate: 'Work Order Baru', titleEdit: 'Work Order',
    fVoyage: 'Voyage', selVoyage: '— pilih voyage —', fVendor: 'Vendor', selVendor: '— pilih vendor —',
    fScope: 'Uraian Pekerjaan', fPlannedStart: 'Rencana Mulai', fPlannedEnd: 'Rencana Selesai',
    fAgreedAmount: 'Nilai Disepakati', fNotes: 'Catatan',
    cancel: 'Batal', save: 'Simpan', create: 'Buat',
    errVoyageReq: 'Voyage wajib dipilih.', errVendorReq: 'Vendor wajib dipilih.', errScopeReq: 'Uraian pekerjaan wajib diisi.',
    errDateOrder: 'Rencana selesai tidak boleh sebelum rencana mulai.',
    errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    titleCreate: 'New Work Order', titleEdit: 'Work Order',
    fVoyage: 'Voyage', selVoyage: '— select voyage —', fVendor: 'Vendor', selVendor: '— select vendor —',
    fScope: 'Scope of Work', fPlannedStart: 'Planned Start', fPlannedEnd: 'Planned End',
    fAgreedAmount: 'Agreed Amount', fNotes: 'Notes',
    cancel: 'Cancel', save: 'Save', create: 'Create',
    errVoyageReq: 'Voyage is required.', errVendorReq: 'Vendor is required.', errScopeReq: 'Scope of work is required.',
    errDateOrder: 'Planned end cannot be before planned start.',
    errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
  },
}

export type WoRow = {
  id: string; woNumber: string; scope: string; status: string
  voyageId: string; vendorId: string; plannedStart: string | null; plannedEnd: string | null
  agreedAmount: number | null; currency: string; notes: string | null
}
type Option = { id: string; name?: string; voyageNumber?: string }

const TRANSISI_WO: Record<string, string[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: [],
  CANCELLED: [],
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function WorkOrderDialog({
  open,
  onOpenChange,
  wo,
  fixedVoyageId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  wo?: WoRow | null
  fixedVoyageId?: string
  onSaved?: () => void
}) {
  const t = useT(STR)
  const router = useRouter()
  const isEdit = !!wo
  const [voyages, setVoyages] = useState<Option[]>([])
  const [vendors, setVendors] = useState<Option[]>([])
  const [form, setForm] = useState({
    voyageId: wo?.voyageId ?? fixedVoyageId ?? '', vendorId: wo?.vendorId ?? '',
    scope: wo?.scope ?? '', plannedStart: wo?.plannedStart?.slice(0, 10) ?? '', plannedEnd: wo?.plannedEnd?.slice(0, 10) ?? '',
    agreedAmount: wo?.agreedAmount != null ? String(wo.agreedAmount) : '', notes: wo?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      voyageId: wo?.voyageId ?? fixedVoyageId ?? '', vendorId: wo?.vendorId ?? '',
      scope: wo?.scope ?? '', plannedStart: wo?.plannedStart?.slice(0, 10) ?? '', plannedEnd: wo?.plannedEnd?.slice(0, 10) ?? '',
      agreedAmount: wo?.agreedAmount != null ? String(wo.agreedAmount) : '', notes: wo?.notes ?? '',
    })
    setError('')
    if (!fixedVoyageId) fetch('/api/voyages').then((r) => (r.ok ? r.json() : [])).then(setVoyages).catch(() => {})
    fetch('/api/vendors').then((r) => (r.ok ? r.json() : [])).then(setVendors).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wo?.id])

  async function submit() {
    if (!form.voyageId) return setError(t.errVoyageReq)
    if (!form.vendorId) return setError(t.errVendorReq)
    if (!form.scope.trim()) return setError(t.errScopeReq)
    if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) return setError(t.errDateOrder)

    setBusy(true)
    setError('')
    try {
      const url = isEdit ? `/api/work-orders/${wo!.id}` : '/api/work-orders'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? {} : { voyageId: form.voyageId, vendorId: form.vendorId }),
          scope: form.scope,
          plannedStart: form.plannedStart || null,
          plannedEnd: form.plannedEnd || null,
          agreedAmount: form.agreedAmount === '' ? null : form.agreedAmount,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      onSaved?.()
      router.refresh()
      onOpenChange(false)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(target: string) {
    if (!wo) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      onSaved?.()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const editableHeader = !isEdit || wo?.status === 'DRAFT'
  const availableTargets = wo ? (TRANSISI_WO[wo.status] ?? []) : []

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{isEdit ? `${t.titleEdit} — ${wo!.woNumber} (${wo!.status})` : t.titleCreate}</DialogTitle>
          <DialogDescription className="text-text-secondary" />
        </DialogHeader>

        <div className="space-y-3">
          {!fixedVoyageId && (
            <div>
              <label className={labelCls}>{t.fVoyage}</label>
              <select value={form.voyageId} onChange={(e) => setForm((f) => ({ ...f, voyageId: e.target.value }))} disabled={isEdit} className={inputCls}>
                <option value="">{t.selVoyage}</option>
                {voyages.map((v) => (
                  <option key={v.id} value={v.id}>{v.voyageNumber}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>{t.fVendor}</label>
            <select value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} disabled={isEdit} className={inputCls}>
              <option value="">{t.selVendor}</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.fScope}</label>
            <textarea value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} disabled={!editableHeader} rows={2} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t.fPlannedStart}</label>
              <input type="date" value={form.plannedStart} onChange={(e) => setForm((f) => ({ ...f, plannedStart: e.target.value }))} disabled={!editableHeader} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fPlannedEnd}</label>
              <input type="date" value={form.plannedEnd} onChange={(e) => setForm((f) => ({ ...f, plannedEnd: e.target.value }))} disabled={!editableHeader} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t.fAgreedAmount}</label>
            <input type="number" value={form.agreedAmount} onChange={(e) => setForm((f) => ({ ...f, agreedAmount: e.target.value }))} disabled={!editableHeader} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t.fNotes}</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={!editableHeader} rows={2} className={inputCls} />
          </div>

          {error && <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">{error}</p>}

          <div className="flex justify-between items-center gap-2 pt-1 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {availableTargets.map((target) => (
                <button key={target} type="button" onClick={() => changeStatus(target)} disabled={busy} className="px-3 py-1.5 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
                  {target}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50">
                {t.cancel}
              </button>
              {editableHeader && (
                <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEdit ? t.save : t.create}
                </button>
              )}
            </div>
          </div>

          {isEdit && wo && (
            <div className="grid gap-4 md:grid-cols-2 pt-3 border-t border-card-border">
              <AttachmentPanel entityType="WORK_ORDER" entityId={wo.id} />
              <CommentPanel entityType="WORK_ORDER" entityId={wo.id} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
