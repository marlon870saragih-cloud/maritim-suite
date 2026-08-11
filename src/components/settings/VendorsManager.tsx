'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Truck } from 'lucide-react'
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
    addBtn: 'Tambah Vendor',
    errNameReq: 'Nama vendor wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus vendor "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada vendor', emptyDesc: 'Tambah data vendor sekali — dipakai otomatis untuk katalog jasa & disbursement.',
    thName: 'Nama Vendor', thType: 'Tipe', thPhone: 'Telepon', thAction: 'Aksi',
    editTitle: 'Ubah Vendor', dialogDesc: 'Data ini dipakai untuk mengisi otomatis katalog jasa & disbursement.',
    fName: 'Nama Vendor', fType: 'Tipe', fAddress: 'Alamat', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Telepon',
    fContact: 'Kontak Person', fBankName: 'Nama Bank', fBankAccount: 'No. Rekening', fPaymentTerm: 'Termin Bayar (hari)', fActive: 'Aktif',
    tipEdit: 'Ubah', tipDelete: 'Hapus', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Vendor',
    errNameReq: 'Vendor name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete vendor "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No vendors yet', emptyDesc: 'Add a vendor once — auto-used for service catalog & disbursements.',
    thName: 'Vendor Name', thType: 'Type', thPhone: 'Phone', thAction: 'Action',
    editTitle: 'Edit Vendor', dialogDesc: 'This data auto-fills service catalog & disbursements.',
    fName: 'Vendor Name', fType: 'Type', fAddress: 'Address', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Phone',
    fContact: 'Contact Person', fBankName: 'Bank Name', fBankAccount: 'Account No.', fPaymentTerm: 'Payment Term (days)', fActive: 'Active',
    tipEdit: 'Edit', tipDelete: 'Delete', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}

export type Vendor = {
  id: string
  name: string
  vendorType: string | null
  address: string | null
  npwp: string | null
  email: string | null
  phone: string | null
  contactPerson: string | null
  bankName: string | null
  bankAccount: string | null
  paymentTermDays: number | null
  isActive: boolean
}

type FormState = Record<string, string>

const FIELD_KEYS = [
  'name', 'vendorType', 'address', 'npwp', 'email', 'phone',
  'contactPerson', 'bankName', 'bankAccount', 'paymentTermDays', 'isActive',
] as const

const emptyForm = (): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'isActive' ? 'true' : '']))

const toForm = (v: Vendor): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, v[k as keyof Vendor] == null ? '' : String(v[k as keyof Vendor])]),
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

export function VendorsManager({ vendors }: { vendors: Vendor[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
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
  function openEdit(v: Vendor) {
    setEditing(v)
    setForm(toForm(v))
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
      const res = await fetch(editing ? `/api/vendors/${editing.id}` : '/api/vendors', {
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

  async function remove(v: Vendor) {
    if (!confirm(`${t.confirmPre}${v.name}${t.confirmPost}`)) return
    setDeletingId(v.id)
    try {
      const res = await fetch(`/api/vendors/${v.id}`, { method: 'DELETE' })
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
        {vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Truck className="w-6 h-6" />
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
                  <th className="px-5 py-3 font-medium">{t.thType}</th>
                  <th className="px-5 py-3 font-medium">{t.thPhone}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {vendors.map((v, i) => (
                  <tr
                    key={v.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < vendors.length - 1 && 'border-b border-card-border/50',
                      !v.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{v.name}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.vendorType ?? '—'}</td>
                    <td className="px-5 py-4 text-text-secondary">{v.phone ?? '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(v)}
                          disabled={deletingId === v.id}
                          title={t.tipDelete}
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
              <Field label={t.fName} k="name" form={form} set={set} required placeholder="PT Pandu Bahari" />
            </div>
            <Field label={t.fType} k="vendorType" form={form} set={set} placeholder="PILOT / TUG / FRESH_WATER" />
            <Field label={t.fPaymentTerm} k="paymentTermDays" form={form} set={set} type="number" placeholder="14" />
            <div className="col-span-2">
              <Field label={t.fAddress} k="address" form={form} set={set} />
            </div>
            <Field label={t.fNpwp} k="npwp" form={form} set={set} />
            <Field label={t.fEmail} k="email" form={form} set={set} type="email" />
            <Field label={t.fPhone} k="phone" form={form} set={set} />
            <Field label={t.fContact} k="contactPerson" form={form} set={set} />
            <Field label={t.fBankName} k="bankName" form={form} set={set} />
            <Field label={t.fBankAccount} k="bankAccount" form={form} set={set} />
            <div className="col-span-2 pt-1">
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
