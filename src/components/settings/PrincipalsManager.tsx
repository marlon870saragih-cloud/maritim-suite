'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DA_FORMATS } from '@/lib/principals'
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
  preferredFormat: string
}

type FormState = Record<string, string>

const FIELD_KEYS = ['name', 'contactPerson', 'email', 'phone', 'address', 'preferredFormat'] as const

const emptyForm = (): FormState => ({
  name: '', contactPerson: '', email: '', phone: '', address: '', preferredFormat: 'FPDA',
})
const toForm = (p: Principal): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, p[k] == null ? '' : String(p[k])])) as FormState

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

export function PrincipalsManager({ principals }: { principals: Principal[] }) {
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
      setError('Nama principal wajib diisi.')
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
        setError((await res.text()) || 'Gagal menyimpan.')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: Principal) {
    if (!confirm(`Hapus principal "${p.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/principals/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert((await res.text()) || 'Gagal menghapus.')
        return
      }
      router.refresh()
    } catch {
      alert('Gagal terhubung ke server.')
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
          className="inline-flex items-center gap-2 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Tambah Principal
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {principals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">Belum ada principal</p>
              <p className="text-text-secondary text-xs mt-1">
                Tambah principal sekali — dipakai otomatis sebagai bill-to di dokumen.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 mt-1 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-4 py-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Tambah Principal
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">Nama Principal</th>
                  <th className="px-5 py-3 font-medium">Kontak</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
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
                          title="Ubah"
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p)}
                          disabled={deletingId === p.id}
                          title="Hapus"
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
              {editing ? 'Ubah Principal' : 'Tambah Principal'}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Data principal dipakai otomatis sebagai pihak tertagih (bill-to) di dokumen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>
                Nama Principal <span className="text-status-danger">*</span>
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
              <label className={labelCls}>Kontak (PIC)</label>
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
              <label className={labelCls}>Telepon</label>
              <input
                name="phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+65 6xxx xxxx"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Format Dokumen Preferensi</label>
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
              <label className={labelCls}>Alamat</label>
              <textarea
                name="address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Alamat lengkap principal"
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
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-[#2E86DE] hover:bg-accent-blue text-white transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Simpan Perubahan' : 'Tambah Principal'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
