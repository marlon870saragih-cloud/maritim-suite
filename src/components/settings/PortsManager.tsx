'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Anchor } from 'lucide-react'
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
    addBtn: 'Tambah Pelabuhan',
    errNameReq: 'Nama pelabuhan wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus pelabuhan "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada pelabuhan', emptyDesc: 'Tambah data pelabuhan sekali — dipakai otomatis untuk voyage & dokumen.',
    thName: 'Nama Pelabuhan', thLocode: 'UN/LOCODE', thCountry: 'Negara', thAction: 'Aksi',
    editTitle: 'Ubah Pelabuhan', dialogDesc: 'Data ini dipakai untuk mengisi otomatis partikular pelabuhan di voyage & dokumen.',
    fName: 'Nama Pelabuhan', fLocode: 'UN/LOCODE', fCountry: 'Negara', fTimezone: 'Zona Waktu', fAuthority: 'Otoritas Pelabuhan',
    fLat: 'Lintang', fLng: 'Bujur', fMaxDraft: 'Draft Maks (m)', fMaxLoa: 'LOA Maks (m)', fHours: 'Jam Kerja', fNotes: 'Catatan',
    fPilot: 'Wajib Pandu', fTug: 'Wajib Kapal Tunda', fActive: 'Aktif',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Port',
    errNameReq: 'Port name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete port "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No ports yet', emptyDesc: 'Add a port once — auto-used for voyages & documents.',
    thName: 'Port Name', thLocode: 'UN/LOCODE', thCountry: 'Country', thAction: 'Action',
    editTitle: 'Edit Port', dialogDesc: 'This data auto-fills port particulars in voyages & documents.',
    fName: 'Port Name', fLocode: 'UN/LOCODE', fCountry: 'Country', fTimezone: 'Timezone', fAuthority: 'Port Authority',
    fLat: 'Latitude', fLng: 'Longitude', fMaxDraft: 'Max Draft (m)', fMaxLoa: 'Max LOA (m)', fHours: 'Working Hours', fNotes: 'Notes',
    fPilot: 'Pilot Required', fTug: 'Tug Required', fActive: 'Active',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}

export type Port = {
  id: string
  name: string
  unlocode: string | null
  country: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  portAuthority: string | null
  pilotRequired: boolean
  tugRequired: boolean
  maxDraft: number | null
  maxLoa: number | null
  workingHours: string | null
  notes: string | null
  isActive: boolean
}

type FormState = Record<string, string>

const FIELD_KEYS = [
  'name', 'unlocode', 'country', 'timezone', 'portAuthority',
  'latitude', 'longitude', 'maxDraft', 'maxLoa', 'workingHours', 'notes',
  'pilotRequired', 'tugRequired', 'isActive',
] as const

const emptyForm = (): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'isActive' ? 'true' : '']))

const toForm = (p: Port): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, p[k as keyof Port] == null ? '' : String(p[k as keyof Port])]),
  )

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Field({
  label, k, form, set, required, type = 'text', placeholder,
}: {
  label: string
  k: string
  form: FormState
  set: (k: string, v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className={labelCls}>
        {label} {required && <span className="text-status-danger">*</span>}
      </label>
      <input
        type={type}
        name={k}
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={form[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}

function CheckField({
  label, k, form, set,
}: {
  label: string
  k: string
  form: FormState
  set: (k: string, v: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
      <input
        type="checkbox"
        checked={form[k] === 'true'}
        onChange={(e) => set(k, e.target.checked ? 'true' : 'false')}
        className="w-4 h-4 rounded border-border-muted accent-accent-blue"
      />
      {label}
    </label>
  )
}

export function PortsManager({ ports }: { ports: Port[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Port | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }
  function openEdit(p: Port) {
    setEditing(p)
    setForm(toForm(p))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setError(t.errNameReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/ports/${editing.id}` : '/api/ports', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  async function remove(p: Port) {
    if (!confirm(`${t.confirmPre}${p.name}${t.confirmPost}`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/ports/${p.id}`, { method: 'DELETE' })
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
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {ports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Anchor className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
              <p className="text-text-secondary text-xs mt-1">{t.emptyDesc}</p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 mt-1 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
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
                  <th className="px-5 py-3 font-medium">{t.thLocode}</th>
                  <th className="px-5 py-3 font-medium">{t.thCountry}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {ports.map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < ports.length - 1 && 'border-b border-card-border/50',
                      !p.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{p.name}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{p.unlocode ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{p.country ?? '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p)}
                          disabled={deletingId === p.id}
                          title={t.tipDelete}
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === p.id ? (
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
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-white">
              {editing ? t.editTitle : t.addBtn}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              {t.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label={t.fName} k="name" form={form} set={set} required placeholder="Samarinda" />
            </div>
            <Field label={t.fLocode} k="unlocode" form={form} set={set} placeholder="IDSRI" />
            <Field label={t.fCountry} k="country" form={form} set={set} placeholder="ID" />
            <Field label={t.fTimezone} k="timezone" form={form} set={set} placeholder="Asia/Makassar" />
            <Field label={t.fAuthority} k="portAuthority" form={form} set={set} placeholder="KSOP Samarinda" />
            <Field label={t.fLat} k="latitude" form={form} set={set} type="number" placeholder="-0.502" />
            <Field label={t.fLng} k="longitude" form={form} set={set} type="number" placeholder="117.153" />
            <Field label={t.fMaxDraft} k="maxDraft" form={form} set={set} type="number" placeholder="10.5" />
            <Field label={t.fMaxLoa} k="maxLoa" form={form} set={set} type="number" placeholder="200" />
            <div className="col-span-2">
              <Field label={t.fHours} k="workingHours" form={form} set={set} placeholder="24 jam" />
            </div>
            <div className="col-span-2">
              <Field label={t.fNotes} k="notes" form={form} set={set} />
            </div>
            <div className="col-span-2 flex items-center gap-6 pt-1">
              <CheckField label={t.fPilot} k="pilotRequired" form={form} set={set} />
              <CheckField label={t.fTug} k="tugRequired" form={form} set={set} />
              <CheckField label={t.fActive} k="isActive" form={form} set={set} />
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
