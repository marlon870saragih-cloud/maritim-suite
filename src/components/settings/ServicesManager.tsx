'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, ListChecks, DollarSign, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const CATEGORIES = ['PORT_CHARGES', 'MARINE_SERVICES', 'GOVERNMENT', 'HUSBANDRY', 'AGENCY', 'OTHER'] as const
const CALC_METHODS = [
  'FLAT', 'PER_UNIT', 'PER_GT', 'PER_GT_PER_CALL', 'PER_GT_PER_DAY',
  'PER_DAY', 'PER_HOUR', 'PER_TON', 'PERCENTAGE', 'TIERED', 'MANUAL',
] as const

const STR: Record<Lang, Record<string, string>> = {
  id: {
    addBtn: 'Tambah Jasa',
    errCodeReq: 'Kode & nama jasa wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.', errDelete: 'Gagal menghapus.',
    confirmPre: 'Hapus jasa "', confirmPost: '"? Tindakan ini tidak bisa dibatalkan.',
    emptyTitle: 'Belum ada katalog jasa', emptyDesc: 'Tambah jenis jasa sekali (mis. Pilotage, Tug) — dipakai di EPDA/FDA nanti.',
    thCode: 'Kode', thName: 'Nama Jasa', thCategory: 'Kategori', thCalc: 'Cara Hitung', thAction: 'Aksi',
    editTitle: 'Ubah Jasa', dialogDesc: 'Master jenis jasa. Tarif sesungguhnya diatur terpisah lewat tombol Tarif.',
    fCode: 'Kode Jasa', fName: 'Nama Jasa', fCategory: 'Kategori', fCalc: 'Cara Hitung', fUnit: 'Satuan Bawaan', fCurrency: 'Mata Uang Bawaan',
    fTaxable: 'Kena Pajak', fTaxPct: 'Persen Pajak', fSection: 'Seksi (A/B/C/D)', fOrder: 'Urutan Tampil',
    fEstimate: 'Muncul di EPDA', fActual: 'Muncul di FDA', fActive: 'Aktif',
    tipEdit: 'Ubah', tipDelete: 'Hapus', tipRates: 'Kelola Tarif', cancel: 'Batal', saveChanges: 'Simpan Perubahan',
    ratesTitle: 'Tarif untuk', ratesDesc: 'Riwayat tarif — bisa diubah/dihapus bebas, dokumen lama sudah menyimpan angkanya sendiri.',
    rAddBtn: 'Tambah Tarif', rEmpty: 'Belum ada tarif.', rPort: 'Pelabuhan (kosong = umum)', rGtMin: 'GT Min', rGtMax: 'GT Maks',
    rRate: 'Rate', rMinCharge: 'Minimum Charge', rFrom: 'Berlaku Dari', rTo: 'Berlaku Sampai', rSave: 'Simpan Tarif', close: 'Tutup',
    rThPort: 'Pelabuhan', rThGt: 'GT', rThRate: 'Rate', rThFrom: 'Berlaku', rThAction: 'Aksi',
    rErrReq: 'Rate wajib diisi.',
  },
  en: {
    addBtn: 'Add Service',
    errCodeReq: 'Service code & name are required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.', errDelete: 'Failed to delete.',
    confirmPre: 'Delete service "', confirmPost: '"? This action cannot be undone.',
    emptyTitle: 'No service catalog yet', emptyDesc: 'Add a service type once (e.g. Pilotage, Tug) — used in EPDA/FDA later.',
    thCode: 'Code', thName: 'Service Name', thCategory: 'Category', thCalc: 'Calc Method', thAction: 'Action',
    editTitle: 'Edit Service', dialogDesc: 'Service type master. Actual rates are managed separately via the Rates button.',
    fCode: 'Service Code', fName: 'Service Name', fCategory: 'Category', fCalc: 'Calc Method', fUnit: 'Default Unit', fCurrency: 'Default Currency',
    fTaxable: 'Taxable', fTaxPct: 'Tax Percent', fSection: 'Section (A/B/C/D)', fOrder: 'Display Order',
    fEstimate: 'Show in EPDA', fActual: 'Show in FDA', fActive: 'Active',
    tipEdit: 'Edit', tipDelete: 'Delete', tipRates: 'Manage Rates', cancel: 'Cancel', saveChanges: 'Save changes',
    ratesTitle: 'Rates for', ratesDesc: 'Rate history — freely editable/deletable, old documents already keep their own copied numbers.',
    rAddBtn: 'Add Rate', rEmpty: 'No rates yet.', rPort: 'Port (blank = general)', rGtMin: 'GT Min', rGtMax: 'GT Max',
    rRate: 'Rate', rMinCharge: 'Minimum Charge', rFrom: 'Effective From', rTo: 'Effective To', rSave: 'Save Rate', close: 'Close',
    rThPort: 'Port', rThGt: 'GT', rThRate: 'Rate', rThFrom: 'Effective', rThAction: 'Action',
    rErrReq: 'Rate is required.',
  },
}

export type ServiceCatalogRow = {
  id: string
  serviceCode: string
  serviceName: string
  category: (typeof CATEGORIES)[number]
  calcMethod: (typeof CALC_METHODS)[number]
  defaultUnit: string | null
  defaultCurrency: string
  taxable: boolean
  taxPct: number | null
  sectionLetter: string | null
  displayOrder: number
  usedInEstimate: boolean
  usedInActual: boolean
  isActive: boolean
}

export type ServiceRateRow = {
  id: string
  serviceId: string
  portId: string | null
  gtMin: number | null
  gtMax: number | null
  rate: number
  currency: string
  minCharge: number | null
  effectiveFrom: string | Date
  effectiveTo: string | Date | null
}

export type PortOption = { id: string; name: string }

type FormState = Record<string, string>

const FIELD_KEYS = [
  'serviceCode', 'serviceName', 'category', 'calcMethod', 'defaultUnit', 'defaultCurrency',
  'taxable', 'taxPct', 'sectionLetter', 'displayOrder', 'usedInEstimate', 'usedInActual', 'isActive',
] as const

const emptyForm = (): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [
      k,
      k === 'isActive' || k === 'usedInEstimate' || k === 'usedInActual'
        ? 'true'
        : k === 'calcMethod'
          ? 'MANUAL'
          : k === 'category'
            ? 'OTHER'
            : k === 'defaultCurrency'
              ? 'IDR'
              : k === 'displayOrder'
                ? '0'
                : '',
    ]),
  )

const toForm = (s: ServiceCatalogRow): FormState =>
  Object.fromEntries(
    FIELD_KEYS.map((k) => [k, s[k as keyof ServiceCatalogRow] == null ? '' : String(s[k as keyof ServiceCatalogRow])]),
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

function SelectField({
  label, k, form, set, options,
}: {
  label: string
  k: string
  form: FormState
  set: (k: string, v: string) => void
  options: readonly string[]
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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

export function ServicesManager({ services, ports }: { services: ServiceCatalogRow[]; ports: PortOption[] }) {
  const t = useT(STR)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceCatalogRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [ratesFor, setRatesFor] = useState<ServiceCatalogRow | null>(null)

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError('')
    setOpen(true)
  }
  function openEdit(s: ServiceCatalogRow) {
    setEditing(s)
    setForm(toForm(s))
    setError('')
    setOpen(true)
  }

  async function submit() {
    if (!form.serviceCode.trim() || !form.serviceName.trim()) {
      setError(t.errCodeReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(editing ? `/api/services/${editing.id}` : '/api/services', {
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

  async function remove(s: ServiceCatalogRow) {
    if (!confirm(`${t.confirmPre}${s.serviceName}${t.confirmPost}`)) return
    setDeletingId(s.id)
    try {
      const res = await fetch(`/api/services/${s.id}`, { method: 'DELETE' })
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
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
              <ListChecks className="w-6 h-6" />
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
                  <th className="px-5 py-3 font-medium">{t.thCategory}</th>
                  <th className="px-5 py-3 font-medium">{t.thCalc}</th>
                  <th className="px-5 py-3 font-medium text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {services.map((s, i) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'hover:bg-surface-tertiary/30 transition-colors',
                      i < services.length - 1 && 'border-b border-card-border/50',
                      !s.isActive && 'opacity-50',
                    )}
                  >
                    <td className="px-5 py-4 font-mono text-text-primary">{s.serviceCode}</td>
                    <td className="px-5 py-4 text-text-primary">{s.serviceName}</td>
                    <td className="px-5 py-4 text-text-secondary">{s.category}</td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{s.calcMethod}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRatesFor(s)}
                          title={t.tipRates}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-teal hover:bg-surface-tertiary transition-colors"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          title={t.tipEdit}
                          className="p-1.5 rounded text-text-secondary hover:text-accent-blue hover:bg-surface-tertiary transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(s)}
                          disabled={deletingId === s.id}
                          title={t.tipDelete}
                          className="p-1.5 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                        >
                          {deletingId === s.id ? (
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
            <Field label={t.fCode} k="serviceCode" form={form} set={set} required placeholder="PILOT" />
            <Field label={t.fName} k="serviceName" form={form} set={set} required placeholder="Pilotage" />
            <SelectField label={t.fCategory} k="category" form={form} set={set} options={CATEGORIES} />
            <SelectField label={t.fCalc} k="calcMethod" form={form} set={set} options={CALC_METHODS} />
            <Field label={t.fUnit} k="defaultUnit" form={form} set={set} placeholder="call / GT / day" />
            <Field label={t.fCurrency} k="defaultCurrency" form={form} set={set} placeholder="IDR" />
            <Field label={t.fSection} k="sectionLetter" form={form} set={set} placeholder="B" />
            <Field label={t.fOrder} k="displayOrder" form={form} set={set} type="number" placeholder="0" />
            <div className="flex items-center gap-2">
              <CheckField label={t.fTaxable} k="taxable" form={form} set={set} />
              {form.taxable === 'true' && (
                <input
                  type="number"
                  value={form.taxPct}
                  onChange={(e) => set('taxPct', e.target.value)}
                  placeholder="11"
                  className={cn(inputCls, 'w-20')}
                />
              )}
            </div>
            <div className="col-span-2 flex items-center gap-6 pt-1">
              <CheckField label={t.fEstimate} k="usedInEstimate" form={form} set={set} />
              <CheckField label={t.fActual} k="usedInActual" form={form} set={set} />
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

      {ratesFor && (
        <RatesDialog service={ratesFor} ports={ports} onClose={() => setRatesFor(null)} t={t} />
      )}
    </>
  )
}

type RatesFormState = {
  portId: string
  gtMin: string
  gtMax: string
  rate: string
  minCharge: string
  effectiveFrom: string
  effectiveTo: string
}

const today = () => new Date().toISOString().slice(0, 10)
const emptyRateForm = (): RatesFormState => ({
  portId: '', gtMin: '', gtMax: '', rate: '', minCharge: '', effectiveFrom: today(), effectiveTo: '',
})

function RatesDialog({
  service, ports, onClose, t,
}: {
  service: ServiceCatalogRow
  ports: PortOption[]
  onClose: () => void
  t: Record<string, string>
}) {
  const router = useRouter()
  const [rates, setRates] = useState<ServiceRateRow[] | null>(null)
  const [form, setForm] = useState<RatesFormState>(emptyRateForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const set = (k: keyof RatesFormState, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const portName = (id: string | null) => (id ? ports.find((p) => p.id === id)?.name ?? id : '—')

  async function load() {
    const res = await fetch(`/api/service-rates?serviceId=${service.id}`)
    setRates(res.ok ? await res.json() : [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit() {
    if (!form.rate.trim()) {
      setError(t.rErrReq)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/service-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, serviceId: service.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      setForm(emptyRateForm())
      await load()
      router.refresh()
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/service-rates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await load()
        router.refresh()
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-white flex items-center justify-between">
            <span>{t.ratesTitle} {service.serviceName}</span>
            <button type="button" onClick={onClose} className="text-text-secondary hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </DialogTitle>
          <DialogDescription className="text-text-secondary">{t.ratesDesc}</DialogDescription>
        </DialogHeader>

        <div className="border border-card-border rounded overflow-hidden">
          {rates === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
            </div>
          ) : rates.length === 0 ? (
            <p className="text-text-secondary text-xs text-center py-6">{t.rEmpty}</p>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-surface-secondary text-text-secondary font-mono uppercase tracking-widest border-b border-card-border text-[10px]">
                  <th className="px-3 py-2 font-medium">{t.rThPort}</th>
                  <th className="px-3 py-2 font-medium">{t.rThGt}</th>
                  <th className="px-3 py-2 font-medium text-right">{t.rThRate}</th>
                  <th className="px-3 py-2 font-medium">{t.rThFrom}</th>
                  <th className="px-3 py-2 font-medium text-right">{t.rThAction}</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b border-card-border/50 last:border-0">
                    <td className="px-3 py-2 text-text-secondary">{portName(r.portId)}</td>
                    <td className="px-3 py-2 font-mono text-text-secondary">
                      {r.gtMin ?? '—'}–{r.gtMax ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-primary text-right">
                      {r.currency} {r.rate.toLocaleString('id-ID')}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {new Date(r.effectiveFrom).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={deletingId === r.id}
                        className="p-1 rounded text-text-secondary hover:text-status-danger hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div>
            <label className={labelCls}>{t.rPort}</label>
            <select value={form.portId} onChange={(e) => set('portId', e.target.value)} className={inputCls}>
              <option value="">—</option>
              {ports.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.rGtMin}</label>
            <input type="number" value={form.gtMin} onChange={(e) => set('gtMin', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t.rGtMax}</label>
            <input type="number" value={form.gtMax} onChange={(e) => set('gtMax', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>
              {t.rRate} <span className="text-status-danger">*</span>
            </label>
            <input type="number" value={form.rate} onChange={(e) => set('rate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t.rMinCharge}</label>
            <input type="number" value={form.minCharge} onChange={(e) => set('minCharge', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t.rFrom}</label>
            <input type="date" value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} className={inputCls} />
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
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors"
          >
            {t.close}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.rSave}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
