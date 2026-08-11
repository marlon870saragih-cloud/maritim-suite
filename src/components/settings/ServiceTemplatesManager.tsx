'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, LayoutList, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Tambah Template',
    errNameReq: 'Nama template wajib diisi.', errItemsReq: 'Template harus punya minimal 1 jasa.',
    errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus template "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada template', emptyDesc: 'Kumpulkan jasa yang sering dipakai bareng jadi satu template — sekali pilih, semua item termuat di EPDA.',
    thName: 'Nama Template', thPort: 'Pelabuhan', thItems: 'Jumlah Jasa', thAction: 'Aksi',
    editTitle: 'Ubah Template', dialogDesc: 'Item ini akan otomatis termuat saat template dipilih di EPDA.',
    fName: 'Nama Template', fPort: 'Pelabuhan (kosong = umum)', fVesselType: 'Tipe Kapal', fDefault: 'Jadikan Bawaan', fActive: 'Aktif',
    itemsTitle: 'Daftar Jasa', addItem: 'Tambah Baris', fService: 'Jasa', fQty: 'Qty Bawaan',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Template',
    errNameReq: 'Template name is required.', errItemsReq: 'Template must have at least 1 service.',
    errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete template "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No templates yet', emptyDesc: 'Bundle services often used together into a template — pick once, all items load into the EPDA.',
    thName: 'Template Name', thPort: 'Port', thItems: 'Service Count', thAction: 'Action',
    editTitle: 'Edit Template', dialogDesc: 'These items auto-load when the template is picked in an EPDA.',
    fName: 'Template Name', fPort: 'Port (blank = general)', fVesselType: 'Vessel Type', fDefault: 'Set as Default', fActive: 'Active',
    itemsTitle: 'Service List', addItem: 'Add Row', fService: 'Service', fQty: 'Default Qty',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}

export type ServiceOption = { id: string; serviceCode: string; serviceName: string }
export type PortOption = { id: string; name: string }

export type TemplateItemRow = { serviceId: string; defaultQty: number | null; displayOrder: number }

export type ServiceTemplateRow = {
  id: string
  name: string
  portId: string | null
  vesselType: string | null
  isDefault: boolean
  isActive: boolean
  items: { serviceId: string; defaultQty: number | null; displayOrder: number; service: ServiceOption }[]
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function ServiceTemplatesManager({
  templates, services, ports,
}: {
  templates: ServiceTemplateRow[]
  services: ServiceOption[]
  ports: PortOption[]
}) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceTemplateRow | null>(null)
  const [name, setName] = useState('')
  const [portId, setPortId] = useState('')
  const [vesselType, setVesselType] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [items, setItems] = useState<TemplateItemRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const portName = (id: string | null) => (id ? ports.find((p) => p.id === id)?.name ?? id : '—')

  function resetForm() {
    setName('')
    setPortId('')
    setVesselType('')
    setIsDefault(false)
    setIsActive(true)
    setItems([{ serviceId: services[0]?.id ?? '', defaultQty: null, displayOrder: 0 }])
  }

  function openAdd() {
    setEditing(null)
    resetForm()
    setError('')
    setOpen(true)
  }
  function openEdit(tpl: ServiceTemplateRow) {
    setEditing(tpl)
    setName(tpl.name)
    setPortId(tpl.portId ?? '')
    setVesselType(tpl.vesselType ?? '')
    setIsDefault(tpl.isDefault)
    setIsActive(tpl.isActive)
    setItems(
      tpl.items.map((it) => ({ serviceId: it.serviceId, defaultQty: it.defaultQty, displayOrder: it.displayOrder })),
    )
    setError('')
    setOpen(true)
  }

  function addItemRow() {
    setItems((p) => [...p, { serviceId: services[0]?.id ?? '', defaultQty: null, displayOrder: p.length }])
  }
  function removeItemRow(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i))
  }
  function setItemField(i: number, patch: Partial<TemplateItemRow>) {
    setItems((p) => p.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  async function submit() {
    if (!name.trim()) {
      setError(t.errNameReq)
      return
    }
    if (items.length === 0 || items.some((it) => !it.serviceId)) {
      setError(t.errItemsReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = {
        name, portId, vesselType, isDefault, isActive,
        items: items.map((it, i) => ({ ...it, displayOrder: i })),
      }
      const res = await fetch(editing ? `/api/service-templates/${editing.id}` : '/api/service-templates', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
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

  async function remove(tpl: ServiceTemplateRow) {
    if (!confirm(`${t.confirmPre}${tpl.name}${t.confirmPost}`)) return
    setDeletingId(tpl.id)
    try {
      const res = await fetch(`/api/service-templates/${tpl.id}`, { method: 'DELETE' })
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          disabled={services.length === 0}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <LayoutList className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1 max-w-md">{t.emptyDesc}</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              disabled={services.length === 0}
              className="inline-flex items-center gap-2 mt-1 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> {t.addBtn}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">{t.thName}</th>
                  <th className="px-5 py-3 font-medium">{t.thPort}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thItems}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {templates.map((tpl, i) => (
                  <tr
                    key={tpl.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < templates.length - 1 && 'border-b border-card-border/50',
                      !tpl.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">
                      <span className="inline-flex items-center gap-1.5">
                        {tpl.isDefault && <Star className="w-3.5 h-3.5 text-accent-teal fill-accent-teal" />}
                        {tpl.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{portName(tpl.portId)}</td>
                    <td className="px-5 py-4 font-mono text-text-primary text-right">{tpl.items.length}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(tpl)}
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(tpl)}
                          disabled={deletingId === tpl.id}
                          title={t.tipDelete}
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === tpl.id ? (
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
      </section>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-white">
              {editing ? t.editTitle : t.addBtn}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">{t.dialogDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>
                {t.fName} <span className="text-status-danger">*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Bulk Carrier Standar" />
            </div>
            <div>
              <label className={labelCls}>{t.fPort}</label>
              <select value={portId} onChange={(e) => setPortId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {ports.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.fVesselType}</label>
              <input value={vesselType} onChange={(e) => setVesselType(e.target.value)} className={inputCls} placeholder="Bulk Carrier" />
            </div>
            <div className="col-span-2 flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="w-4 h-4 rounded border-border-muted accent-accent-blue" />
                {t.fDefault}
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 rounded border-border-muted accent-accent-blue" />
                {t.fActive}
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-card-border/50">
            <div className="flex items-center justify-between py-2">
              <p className={labelCls}>{t.itemsTitle}</p>
              <button
                type="button"
                onClick={addItemRow}
                className="inline-flex items-center gap-1 text-xs text-accent-blue hover:text-primary transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t.addItem}
              </button>
            </div>
            <div className="space-y-2">
              {items.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.serviceId}
                    onChange={(e) => setItemField(i, { serviceId: e.target.value })}
                    className={cn(inputCls, 'flex-1')}
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.serviceCode} — {s.serviceName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={row.defaultQty ?? ''}
                    onChange={(e) => setItemField(i, { defaultQty: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder={t.fQty}
                    className={cn(inputCls, 'w-28')}
                  />
                  <button
                    type="button"
                    onClick={() => removeItemRow(i)}
                    className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
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
              {editing ? t.saveChanges : t.addBtn}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
