'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const OPERATIONS = ['LOAD', 'DISCHARGE'] as const

const STR: Record<Lang, Record<string, string>> = {
  id: {
    add: 'Tambah Cargo',
    emptyTitle: 'Belum ada muatan',
    emptyDesc: 'Catat muatan yang dimuat/dibongkar pada pelayaran ini — dipakai sebagai rujukan dokumen & tagihan.',
    thName: 'Muatan', thQty: 'Jumlah', thOp: 'Operasi', thShipper: 'Shipper', thConsignee: 'Consignee', thAction: 'Aksi',
    dialogAdd: 'Tambah Cargo', dialogEdit: 'Ubah Cargo',
    dialogDesc: 'Satu baris = satu jenis muatan. Kosongkan operasi bila belum pasti muat atau bongkar.',
    fName: 'Nama muatan', fQty: 'Jumlah', fUnit: 'Satuan', fOp: 'Operasi', fShipper: 'Shipper', fConsignee: 'Consignee',
    selOpNone: '— belum ditentukan —', opLOAD: 'Muat (LOAD)', opDISCHARGE: 'Bongkar (DISCHARGE)',
    errNameReq: 'Nama muatan wajib diisi.', errSave: 'Gagal menyimpan.', errDelete: 'Gagal menghapus.', errConn: 'Gagal terhubung ke server.',
    confirmPre: 'Hapus muatan "', confirmPost: '"?',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', save: 'Simpan',
  },
  en: {
    add: 'Add Cargo',
    emptyTitle: 'No cargo yet',
    emptyDesc: 'Record what is loaded/discharged on this voyage — used as reference for documents & billing.',
    thName: 'Cargo', thQty: 'Quantity', thOp: 'Operation', thShipper: 'Shipper', thConsignee: 'Consignee', thAction: 'Action',
    dialogAdd: 'Add Cargo', dialogEdit: 'Edit Cargo',
    dialogDesc: 'One row = one cargo type. Leave operation empty if load/discharge is not decided yet.',
    fName: 'Cargo name', fQty: 'Quantity', fUnit: 'Unit', fOp: 'Operation', fShipper: 'Shipper', fConsignee: 'Consignee',
    selOpNone: '— not set —', opLOAD: 'Load', opDISCHARGE: 'Discharge',
    errNameReq: 'Cargo name is required.', errSave: 'Failed to save.', errDelete: 'Failed to delete.', errConn: 'Failed to connect to server.',
    confirmPre: 'Delete cargo "', confirmPost: '"?',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', save: 'Save',
  },
}

export type CargoRow = {
  id: string
  cargoName: string
  quantity: number | null
  unit: string | null
  operation: string | null
  shipper: string | null
  consignee: string | null
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

const emptyForm = () => ({ cargoName: '', quantity: '', unit: '', operation: '', shipper: '', consignee: '' })

export function VoyageCargoPanel({ voyageId, cargoes }: { voyageId: string; cargoes: CargoRow[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CargoRow | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (k: keyof ReturnType<typeof emptyForm>, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }

  function openEdit(c: CargoRow) {
    setEditing(c)
    setForm({
      cargoName: c.cargoName,
      quantity: c.quantity == null ? '' : String(c.quantity),
      unit: c.unit ?? '',
      operation: c.operation ?? '',
      shipper: c.shipper ?? '',
      consignee: c.consignee ?? '',
    })
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.cargoName.trim()) {
      setError(t.errNameReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        editing ? `/api/voyages/${voyageId}/cargoes/${editing.id}` : `/api/voyages/${voyageId}/cargoes`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: CargoRow) {
    if (!confirm(`${t.confirmPre}${c.cargoName}${t.confirmPost}`)) return
    setDeletingId(c.id)
    try {
      const res = await fetch(`/api/voyages/${voyageId}/cargoes/${c.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error?.message ?? t.errDelete)
        return
      }
      router.refresh()
    } catch {
      alert(t.errConn)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t.add}
        </button>
      </div>

      {cargoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-text-secondary text-xs mt-1 max-w-md">{t.emptyDesc}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                <th className="px-4 py-2.5 font-medium">{t.thName}</th>
                <th className="px-4 py-2.5 font-medium">{t.thQty}</th>
                <th className="px-4 py-2.5 font-medium">{t.thOp}</th>
                <th className="px-4 py-2.5 font-medium">{t.thShipper}</th>
                <th className="px-4 py-2.5 font-medium">{t.thConsignee}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t.thAction}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {cargoes.map((c, i) => (
                <tr
                  key={c.id}
                  className={cn(
                    'hover:bg-surface-tertiary/30 transition-colors',
                    i < cargoes.length - 1 && 'border-b border-card-border/50',
                  )}
                >
                  <td className="px-4 py-3 text-text-primary">{c.cargoName}</td>
                  <td className="px-4 py-3 font-mono text-text-secondary">
                    {c.quantity == null ? '—' : c.quantity.toLocaleString('en-US')} {c.unit ?? ''}
                  </td>
                  <td className="px-4 py-3">
                    {c.operation ? (
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                          c.operation === 'LOAD'
                            ? 'bg-accent-teal/12 text-accent-teal border-accent-teal/30'
                            : 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
                        )}
                      >
                        {c.operation}
                      </span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.shipper ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.consignee ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        title={t.tipEdit}
                        className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        disabled={deletingId === c.id}
                        title={t.tipDelete}
                        className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{editing ? t.dialogEdit : t.dialogAdd}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>
                {t.fName} <span className="text-status-danger">*</span>
              </label>
              <input
                value={form.cargoName}
                onChange={(e) => set('cargoName', e.target.value)}
                placeholder="Coal / CPO / Container"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fQty}</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="50000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fUnit}</label>
              <input
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="MT / m3 / TEU"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fOp}</label>
              <select value={form.operation} onChange={(e) => set('operation', e.target.value)} className={inputCls}>
                <option value="">{t.selOpNone}</option>
                {OPERATIONS.map((o) => (
                  <option key={o} value={o}>{t['op' + o]}</option>
                ))}
              </select>
            </div>
            <div />
            <div>
              <label className={labelCls}>{t.fShipper}</label>
              <input value={form.shipper} onChange={(e) => set('shipper', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fConsignee}</label>
              <input value={form.consignee} onChange={(e) => set('consignee', e.target.value)} className={inputCls} />
            </div>
          </div>

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.save}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
