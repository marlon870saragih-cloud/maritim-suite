'use client'

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Building2 } from 'lucide-react'

export type CompanyProfile = {
  companyName: string
  companyTagline: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  npwp: string
  bankName: string
  bankAccount: string
  bankHolder: string
  bankSwift: string
  defaultAgencyPct: string
  defaultCurrency: string
  logoUrl: string | null
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-3 py-2.5 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1.5'

export function CompanyProfileForm({ initial }: { initial: CompanyProfile }) {
  const router = useRouter()
  const { logoUrl, ...initialFields } = initial
  const [form, setForm] = useState<Record<string, string>>(initialFields)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const set = (k: string, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  function onChange(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSaved(false)
      set(k, e.target.value)
    }
  }

  async function save() {
    if (!form.companyName.trim()) {
      setError('Nama perusahaan wajib diisi.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError((await res.text()) || 'Gagal menyimpan.')
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-card-bg border border-card-border rounded-lg p-6 space-y-6">
      {/* Logo + identitas */}
      <div className="flex items-center gap-4 pb-5 border-b border-card-border/60">
        <div className="w-16 h-16 rounded-lg bg-surface border border-border-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo perusahaan" className="max-w-full max-h-full object-contain" />
          ) : (
            <Building2 className="w-7 h-7 text-text-secondary" />
          )}
        </div>
        <div>
          <p className="text-text-primary text-sm font-medium">Logo perusahaan</p>
          <p className="text-text-secondary text-xs mt-0.5">
            {logoUrl ? 'Logo aktif — muncul di kop semua dokumen.' : 'Belum ada logo.'} Ganti logo akan
            ditambahkan menyusul.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className={labelCls}>
            Nama Perusahaan <span className="text-status-danger">*</span>
          </label>
          <input value={form.companyName} onChange={onChange('companyName')} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Tagline</label>
          <input value={form.companyTagline} onChange={onChange('companyTagline')} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Alamat</label>
          <textarea
            value={form.companyAddress}
            onChange={onChange('companyAddress')}
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelCls}>Telepon</label>
          <input value={form.companyPhone} onChange={onChange('companyPhone')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input value={form.companyEmail} onChange={onChange('companyEmail')} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>NPWP</label>
          <input value={form.npwp} onChange={onChange('npwp')} placeholder="00.000.000.0-000.000" className={inputCls} />
        </div>

        <div className="md:col-span-2 pt-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-teal">Rekening Bank</p>
        </div>
        <div>
          <label className={labelCls}>Nama Bank</label>
          <input value={form.bankName} onChange={onChange('bankName')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>No. Rekening</label>
          <input value={form.bankAccount} onChange={onChange('bankAccount')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Atas Nama</label>
          <input value={form.bankHolder} onChange={onChange('bankHolder')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>SWIFT (opsional)</label>
          <input value={form.bankSwift} onChange={onChange('bankSwift')} className={inputCls} />
        </div>

        <div className="md:col-span-2 pt-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-teal">Default Dokumen</p>
        </div>
        <div>
          <label className={labelCls}>Agency Fee (%)</label>
          <input
            type="number"
            inputMode="decimal"
            value={form.defaultAgencyPct}
            onChange={onChange('defaultAgencyPct')}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Mata Uang Default</label>
          <input value={form.defaultCurrency} onChange={onChange('defaultCurrency')} placeholder="IDR" className={inputCls} />
        </div>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-text-secondary text-xs">
          Data ini dipakai sebagai kop &amp; rekening di semua dokumen (EPDA · FPDA · Invoice).
        </p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-accent-teal text-xs font-medium">
              <Check className="w-4 h-4" /> Tersimpan
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-[#2E86DE] hover:bg-accent-blue text-white rounded px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan Perubahan
          </button>
        </div>
      </div>
    </section>
  )
}
