'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Coins } from 'lucide-react'
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
    addBtn: 'Tambah Mata Uang',
    errCodeReq: 'Kode mata uang wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus mata uang "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada mata uang', emptyDesc: 'Tambah mata uang yang dipakai (mis. IDR, USD, SGD).',
    thCode: 'Kode', thName: 'Nama', thSymbol: 'Simbol', thDecimals: 'Desimal', thAction: 'Aksi',
    editTitle: 'Ubah Mata Uang', dialogDesc: 'Kode ISO 4217, mis. IDR / USD / SGD.',
    fCode: 'Kode', fName: 'Nama', fSymbol: 'Simbol', fDecimals: 'Jumlah Desimal', fActive: 'Aktif',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Currency',
    errCodeReq: 'Currency code is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete currency "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No currencies yet', emptyDesc: 'Add the currencies you use (e.g. IDR, USD, SGD).',
    thCode: 'Code', thName: 'Name', thSymbol: 'Symbol', thDecimals: 'Decimals', thAction: 'Action',
    editTitle: 'Edit Currency', dialogDesc: 'ISO 4217 code, e.g. IDR / USD / SGD.',
    fCode: 'Code', fName: 'Name', fSymbol: 'Symbol', fDecimals: 'Decimal Places', fActive: 'Active',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}

export type Currency = {
  id: string
  code: string
  name: string | null
  symbol: string | null
  decimals: number
  isActive: boolean
}

type FormState = Record<string, string>

const FIELD_KEYS = ['code', 'name', 'symbol', 'decimals', 'isActive'] as const

const emptyForm = (): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'isActive' ? 'true' : k === 'decimals' ? '2' : '']))

const toForm = (c: Currency): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, c[k as keyof Currency] == null ? '' : String(c[k as keyof Currency])]),
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

export function CurrenciesManager({ currencies }: { currencies: Currency[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Currency | null>(null)
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
  function openEdit(c: Currency) {
    setEditing(c)
    setForm(toForm(c))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.code.trim()) {
      setError(t.errCodeReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/currencies/${editing.id}` : '/api/currencies', {
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

  async function remove(c: Currency) {
    if (!confirm(`${t.confirmPre}${c.code}${t.confirmPost}`)) return
    setDeletingId(c.id)
    try {
      const res = await fetch(`/api/currencies/${c.id}`, { method: 'DELETE' })
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
        {currencies.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Coins className="w-6 h-6" />
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
                  <th className="px-5 py-3 font-medium">{t.thCode}</th>
                  <th className="px-5 py-3 font-medium">{t.thName}</th>
                  <th className="px-5 py-3 font-medium">{t.thSymbol}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thDecimals}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {currencies.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < currencies.length - 1 && 'border-b border-card-border/50',
                      !c.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 font-mono text-text-primary">{c.code}</td>
                    <td className="px-5 py-4 text-text-secondary">{c.name ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{c.symbol ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-text-primary text-right">{c.decimals}</td>
                    <td className="px-5 py-4">
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
      </section>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-white">
              {editing ? t.editTitle : t.addBtn}
            </DialogTitle>
            <DialogDescription className="text-text-secondary">
              {t.dialogDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.fCode} k="code" form={form} set={set} required placeholder="USD" />
            <Field label={t.fSymbol} k="symbol" form={form} set={set} placeholder="$" />
            <div className="col-span-2">
              <Field label={t.fName} k="name" form={form} set={set} placeholder="US Dollar" />
            </div>
            <Field label={t.fDecimals} k="decimals" form={form} set={set} type="number" placeholder="2" />
            <div className="flex items-end pb-2">
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
