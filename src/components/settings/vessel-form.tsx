'use client'

// Primitif form kapal yang dipakai bersama VesselsManager (tambah/ubah manual) dan
// VesselImportDialog (preview hasil AI). Disatukan di sini supaya kedua pintu
// menampilkan field, urutan, label, dan gaya yang PERSIS sama.

import { useT, type Lang } from '@/lib/i18n'

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

export type FormState = Record<string, string>

export const FIELD_KEYS = [
  'name', 'imoNumber', 'callSign', 'flag', 'vesselType',
  'gt', 'nrt', 'loa', 'beam', 'maxDraft', 'yearBuilt',
] as const

export const emptyForm = (): FormState => Object.fromEntries(FIELD_KEYS.map((k) => [k, '']))

export const toForm = (v: Vessel): FormState =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, v[k] == null ? '' : String(v[k])]))

export const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
export const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

const STR: Record<Lang, Record<string, string>> = {
  id: { fName: 'Nama Kapal', fImo: 'No. IMO', fFlag: 'Bendera', fType: 'Tipe Kapal', fDraft: 'Draft Maks (m)', fYear: 'Tahun Bangun' },
  en: { fName: 'Vessel Name', fImo: 'IMO No.', fFlag: 'Flag', fType: 'Vessel Type', fDraft: 'Max Draft (m)', fYear: 'Year Built' },
}

export function Field({
  label, k, form, set, required, type = 'text', placeholder, hint,
}: {
  label: string
  k: string
  form: FormState
  set: (k: string, v: string) => void
  required?: boolean
  type?: string
  placeholder?: string
  hint?: string
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
      {hint && <p className="mt-1 text-[10px] text-text-secondary/80 font-mono truncate" title={hint}>{hint}</p>}
    </div>
  )
}

/**
 * Grid 11 field partikular kapal. `hints` opsional — dipakai preview import untuk
 * menampilkan nilai LAMA di bawah tiap field saat mode update kapal yang sudah ada.
 */
export function VesselFieldsGrid({
  form, set, hints,
}: {
  form: FormState
  set: (k: string, v: string) => void
  hints?: Partial<Record<string, string>>
}) {
  const t = useT(STR)
  const h = (k: string) => hints?.[k]
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label={t.fName} k="name" form={form} set={set} required placeholder="MV Ocean Blue" hint={h('name')} />
      </div>
      <Field label={t.fImo} k="imoNumber" form={form} set={set} placeholder="9123456" hint={h('imoNumber')} />
      <Field label="Call Sign" k="callSign" form={form} set={set} placeholder="YBxx" hint={h('callSign')} />
      <Field label={t.fFlag} k="flag" form={form} set={set} placeholder="Indonesia" hint={h('flag')} />
      <Field label={t.fType} k="vesselType" form={form} set={set} placeholder="Bulk Carrier" hint={h('vesselType')} />
      <Field label="GT" k="gt" form={form} set={set} type="number" placeholder="25000" hint={h('gt')} />
      <Field label="NRT" k="nrt" form={form} set={set} type="number" placeholder="15000" hint={h('nrt')} />
      <Field label="LOA (m)" k="loa" form={form} set={set} type="number" placeholder="180" hint={h('loa')} />
      <Field label="Beam (m)" k="beam" form={form} set={set} type="number" placeholder="28" hint={h('beam')} />
      <Field label={t.fDraft} k="maxDraft" form={form} set={set} type="number" placeholder="10.5" hint={h('maxDraft')} />
      <Field label={t.fYear} k="yearBuilt" form={form} set={set} type="number" placeholder="2015" hint={h('yearBuilt')} />
    </div>
  )
}
