'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Ship } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export type Vessel = {
  id: string
  name: string
  imoNumber: string | null
  flag: string | null
  callSign: string | null
  vesselType: string | null
  gt: number | null
  nrt: number | null
  loa: number | null
  beam: number | null
  maxDraft: number | null
  yearBuilt: number | null
}

type FormState = Record<string, string>

const FIELD_KEYS = [
  'name', 'imoNumber', 'callSign', 'flag', 'vesselType',
  'gt', 'nrt', 'loa', 'beam', 'maxDraft', 'yearBuilt',
] as const

const emptyForm = (): FormState => Object.fromEntries(FIELD_KEYS.map((k) => [k, '']))

const toForm = (v: Vessel): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, v[k] == null ? '' : String(v[k])]))

const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'))

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

export function VesselsManager({ vessels }: { vessels: Vessel[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vessel | null>(null)
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
  function openEdit(v: Vessel) {
    setEditing(v)
    setForm(toForm(v))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setError('Nama kapal wajib diisi.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/vessels/${editing.id}` : '/api/vessels', {
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

  async function remove(v: Vessel) {
    if (!confirm(`Hapus kapal "${v.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setDeletingId(v.id)
    try {
      const res = await fetch(`/api/vessels/${v.id}`, { method: 'DELETE' })
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
          <Plus className="w-4 h-4" /> Tambah Kapal
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {vessels.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Ship className="w-6 h-6" />
            </div>
            <div>
              <p className="text-text-primary text-sm font-medium">Belum ada kapal</p>
              <p className="text-text-secondary text-xs mt-1">
                Tambah data kapal sekali — dipakai otomatis untuk port call &amp; dokumen.
              </p>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 mt-1 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-4 py-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Tambah Kapal
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-5 py-3 font-medium">Nama Kapal</th>
                  <th className="px-5 py-3 font-medium">IMO</th>
                  <th className="px-5 py-3 font-medium">Bendera</th>
                  <th className="px-5 py-3 font-medium">Tipe</th>
                  <th className="px-5 py-3 font-medium text-right">GT</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {vessels.map((v, i) => (
                  <tr
                    key={v.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < vessels.length - 1 && 'border-b border-card-border/50'
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{v.name}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{v.imoNumber ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.flag ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.vesselType ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-text-primary text-right">{num(v.gt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          title="Ubah"
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(v)}
                          disabled={deletingId === v.id}
                          title="Hapus"
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === v.id ? (
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
              {editing ? 'Ubah Kapal' : 'Tambah Kapal'}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              Data ini dipakai untuk mengisi otomatis partikular kapal di port call &amp; dokumen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nama Kapal" k="name" form={form} set={set} required placeholder="MV Ocean Blue" />
            </div>
            <Field label="No. IMO" k="imoNumber" form={form} set={set} placeholder="9123456" />
            <Field label="Call Sign" k="callSign" form={form} set={set} placeholder="YBxx" />
            <Field label="Bendera" k="flag" form={form} set={set} placeholder="Indonesia" />
            <Field label="Tipe Kapal" k="vesselType" form={form} set={set} placeholder="Bulk Carrier" />
            <Field label="GT" k="gt" form={form} set={set} type="number" placeholder="25000" />
            <Field label="NRT" k="nrt" form={form} set={set} type="number" placeholder="15000" />
            <Field label="LOA (m)" k="loa" form={form} set={set} type="number" placeholder="180" />
            <Field label="Beam (m)" k="beam" form={form} set={set} type="number" placeholder="28" />
            <Field label="Draft Maks (m)" k="maxDraft" form={form} set={set} type="number" placeholder="10.5" />
            <Field label="Tahun Bangun" k="yearBuilt" form={form} set={set} type="number" placeholder="2015" />
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
              {editing ? 'Simpan Perubahan' : 'Tambah Kapal'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
