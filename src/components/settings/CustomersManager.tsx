'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, Users, FileUp, Globe } from 'lucide-react'
import { PortalAccessPanel } from './PortalAccessPanel'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { MasterImportDialog, useMasterImportLabel } from '@/components/ai/MasterImportDialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Tambah Customer',
    errNameReq: 'Nama customer wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus customer "', confirmPost: '"? Akses portal aktif milik pelanggan ini juga akan dicabut. Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada customer', emptyDesc: 'Tambah data customer sekali — dipakai otomatis untuk voyage & invoice.',
    thName: 'Nama Customer', thType: 'Tipe', thCurrency: 'Mata Uang', thAction: 'Aksi',
    editTitle: 'Ubah Customer', dialogDesc: 'Data ini dipakai untuk mengisi otomatis voyage & invoice.',
    fName: 'Nama Customer', fType: 'Tipe', fAddress: 'Alamat', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Telepon',
    fContact: 'Kontak Person', fCurrency: 'Mata Uang', fCreditLimit: 'Limit Kredit', fPaymentTerm: 'Termin Bayar (hari)', fActive: 'Aktif',
    tipEdit: 'Ubah', tipDelete: 'Hapus', tipPortal: 'Akses portal', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
  },
  en: {
    addBtn: 'Add Customer',
    errNameReq: 'Customer name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete customer "', confirmPost: '"? Any active portal access for this customer will also be revoked. This action cannot be undone.',
    emptyTitle: 'No customers yet', emptyDesc: 'Add a customer once — auto-used for voyages & invoices.',
    thName: 'Customer Name', thType: 'Type', thCurrency: 'Currency', thAction: 'Action',
    editTitle: 'Edit Customer', dialogDesc: 'This data auto-fills voyages & invoices.',
    fName: 'Customer Name', fType: 'Type', fAddress: 'Address', fNpwp: 'NPWP', fEmail: 'Email', fPhone: 'Phone',
    fContact: 'Contact Person', fCurrency: 'Currency', fCreditLimit: 'Credit Limit', fPaymentTerm: 'Payment Term (days)', fActive: 'Active',
    tipEdit: 'Edit', tipDelete: 'Delete', tipPortal: 'Portal access', cancel: 'Cancel', saveChanges: 'Save changes',
  },
}

export type Customer = {
  id: string
  name: string
  customerType: string | null
  address: string | null
  npwp: string | null
  email: string | null
  phone: string | null
  contactPerson: string | null
  currency: string
  creditLimit: number | null
  paymentTermDays: number | null
  isActive: boolean
}

type FormState = Record<string, string>

const FIELD_KEYS = [
  'name', 'customerType', 'address', 'npwp', 'email', 'phone',
  'contactPerson', 'currency', 'creditLimit', 'paymentTermDays', 'isActive',
] as const

const emptyForm = (): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, k === 'isActive' ? 'true' : k === 'currency' ? 'IDR' : '']))

const toForm = (c: Customer): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, c[k as keyof Customer] == null ? '' : String(c[k as keyof Customer])]),
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

export function CustomersManager({ customers }: { customers: Customer[] }) {
  const t = useT(STR)
  const router = useRouter()
  const importLabel = useMasterImportLabel('customer')
  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [portalCustomer, setPortalCustomer] = useState<Customer | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }
  function openEdit(c: Customer) {
    setEditing(c)
    setForm(toForm(c))
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
      const res = await fetch(editing ? `/api/customers/${editing.id}` : '/api/customers', {
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

  async function remove(c: Customer) {
    if (!confirm(`${t.confirmPre}${c.name}${t.confirmPost}`)) return
    setDeletingId(c.id)
    try {
      const res = await fetch(`/api/customers/${c.id}`, { method: 'DELETE' })
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
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-purple/50 hover:bg-surface-tertiary rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <FileUp className="w-4 h-4" /> {importLabel}
        </button>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> {t.addBtn}
        </button>
      </div>

      <section className="bg-card-bg border border-card-border rounded-lg overflow-hidden">
        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <Users className="w-6 h-6" />
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
                  <th className="px-5 py-3 font-medium">{t.thCurrency}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {customers.map((c, i) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < customers.length - 1 && 'border-b border-card-border/50',
                      !c.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 text-text-primary">{c.name}</td>
                    <td className="px-5 py-4 text-text-secondary">{c.customerType ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{c.currency}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPortalCustomer(c)}
                          title={t.tipPortal}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors"
                        >
                          <Globe className="w-4 h-4" />
                        </button>
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
              <Field label={t.fName} k="name" form={form} set={set} required placeholder="PT Contoh Sejahtera" />
            </div>
            <Field label={t.fType} k="customerType" form={form} set={set} placeholder="Shipowner / Charterer" />
            <Field label={t.fCurrency} k="currency" form={form} set={set} placeholder="IDR" />
            <div className="col-span-2">
              <Field label={t.fAddress} k="address" form={form} set={set} />
            </div>
            <Field label={t.fNpwp} k="npwp" form={form} set={set} />
            <Field label={t.fEmail} k="email" form={form} set={set} type="email" />
            <Field label={t.fPhone} k="phone" form={form} set={set} />
            <Field label={t.fContact} k="contactPerson" form={form} set={set} />
            <Field label={t.fCreditLimit} k="creditLimit" form={form} set={set} type="number" />
            <Field label={t.fPaymentTerm} k="paymentTermDays" form={form} set={set} type="number" placeholder="30" />
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

      <MasterImportDialog
        target="customer"
        open={importOpen}
        onOpenChange={setImportOpen}
        onSaved={() => router.refresh()}
      />

      <Dialog open={!!portalCustomer} onOpenChange={(o) => !o && setPortalCustomer(null)}>
        <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-white">{portalCustomer?.name}</DialogTitle>
            <DialogDescription className="text-text-secondary">{t.tipPortal}</DialogDescription>
          </DialogHeader>
          {portalCustomer && (
            <PortalAccessPanel pihak="CUSTOMER" id={portalCustomer.id} onClose={() => setPortalCustomer(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
