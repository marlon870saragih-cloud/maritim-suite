'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DA_FORMATS } from '@/lib/principals'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Tambah Principal',
    errNameReq: 'Nama principal wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus principal "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada principal', emptyDesc: 'Tambah principal sekali — dipakai otomatis sebagai bill-to di dokumen.',
    thName: 'Nama Principal', thContact: 'Kontak', thAction: 'Aksi',
    editTitle: 'Ubah Principal', dialogDesc: 'Data principal dipakai otomatis sebagai pihak tertagih (bill-to) di dokumen.',
    fName: 'Nama Principal', fContact: 'Kontak (PIC)', fPhone: 'Telepon', fNpwp: 'NPWP', fFormat: 'Format Dokumen Preferensi', fAddress: 'Alamat', phAddress: 'Alamat lengkap principal',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Principal',
    errNameReq: 'Principal name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete principal "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No principals yet', emptyDesc: 'Add a principal once — auto-used as the bill-to on documents.',
    thName: 'Principal Name', thContact: 'Contact', thAction: 'Action',
    editTitle: 'Edit Principal', dialogDesc: 'Principal data is auto-used as the bill-to party on documents.',
    fName: 'Principal Name', fContact: 'Contact (PIC)', fPhone: 'Phone', fNpwp: 'NPWP', fFormat: 'Preferred Document Format', fAddress: 'Address', phAddress: 'Full principal address',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export type Principal = {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  npwp: string | null
  preferredFormat: string
}

type FormState = Record<string, string>

const FIELD_KEYS = ['name', 'contactPerson', 'email', 'phone', 'address', 'npwp', 'preferredFormat'] as const

const emptyForm = (): FormState => ({
  name: '', contactPerson: '', email: '', phone: '', address: '', npwp: '', preferredFormat: 'FPDA',
})
const toForm = (p: Principal): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, p[k] == null ? '' : String(p[k])])) as FormState

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function PrincipalsManager({ principals }: { principals: Principal[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Principal | null>(null)
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
  function openEdit(p: Principal) {
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
      const res = await fetch(editing ? `/api/principals/${editing.id}` : '/api/principals', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || t.errSave)
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

  async function remove(p: Principal) {
    if (!confirm(`${t.confirmPre}${p.name}${t.confirmPost}`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/principals/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert((await res.text()) || t.errDelete)
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
        {principals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Building2 className="w-6 h-6" />
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
                  <th className="px-5 py-3 font-medium">{t.thContact}</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {principals.map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < principals.length - 1 && 'border-b border-card-border/50'
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{p.name}</td>
                    <td className="px-5 py-4 text-text-secondary">{p.contactPerson ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{p.email ?? '—'}</td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue rounded text-xs font-mono">
                        {p.preferredFormat}
                      </span>
                    </td>
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
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-xl">
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
              <label className={labelCls}>
                {t.fName} <span className="text-status-danger">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ocean Tankers Pte Ltd"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fContact}</label>
              <input
                name="contactPerson"
                value={form.contactPerson}
                onChange={(e) => set('contactPerson', e.target.value)}
                placeholder="Mr. Lim"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ops@principal.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fPhone}</label>
              <input
                name="phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+65 6xxx xxxx"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fNpwp}</label>
              <input
                name="npwp"
                value={form.npwp}
                onChange={(e) => set('npwp', e.target.value)}
                placeholder="00.000.000.0-000.000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t.fFormat}</label>
              <select
                name="preferredFormat"
                value={form.preferredFormat}
                onChange={(e) => set('preferredFormat', e.target.value)}
                className={inputCls}
              >
                {DA_FORMATS.map((f) => (
                  <option key={f} value={f} className="bg-surface text-text-primary">
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>{t.fAddress}</label>
              <textarea
                name="address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder={t.phAddress}
                rows={2}
                className={inputCls + ' resize-none'}
              />
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
