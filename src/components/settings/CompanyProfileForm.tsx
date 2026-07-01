'use client'

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Building2, Lock } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    errNameReq: 'Nama perusahaan wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    logoAlt: 'Logo perusahaan', logoTitle: 'Logo perusahaan', logoActive: 'Logo aktif — muncul di kop semua dokumen.', logoNone: 'Belum ada logo.', logoChange: 'Ganti logo akan ditambahkan menyusul.',
    fCompanyName: 'Nama Perusahaan', fTagline: 'Tagline', fAddress: 'Alamat', fPhone: 'Telepon',
    nameLocked: 'Terkunci sesuai pendaftaran — tak bisa diubah demi mencegah manipulasi identitas dokumen. Hubungi admin bila perlu ganti.',
    secBank: 'Rekening Bank', fBankName: 'Nama Bank', fBankAcc: 'No. Rekening', fBankHolder: 'Atas Nama', fSwift: 'SWIFT (opsional)',
    secSigner: 'Penanda Tangan Dokumen', fSignerName: 'Nama Penanda Tangan', phSignerName: 'mis. Marlon Saragih', fSignerTitle: 'Jabatan', phSignerTitle: 'mis. Branch Manager',
    secDefaults: 'Default Dokumen', fCurrency: 'Mata Uang Default',
    footNote: 'Data ini dipakai sebagai kop & rekening di semua dokumen (EPDA · FPDA · Invoice).',
    saved: 'Tersimpan', saveChanges: 'Simpan Perubahan',
  },
  en: {
    errNameReq: 'Company name is required.', errSave: 'Failed to save.', errConn: 'Failed to connect to server.',
    logoAlt: 'Company logo', logoTitle: 'Company logo', logoActive: 'Logo active — appears on every document letterhead.', logoNone: 'No logo yet.', logoChange: 'Logo replacement coming soon.',
    fCompanyName: 'Company Name', fTagline: 'Tagline', fAddress: 'Address', fPhone: 'Phone',
    nameLocked: 'Locked to your registration — cannot be changed, to prevent tampering with document identity. Contact admin if a change is needed.',
    secBank: 'Bank Account', fBankName: 'Bank Name', fBankAcc: 'Account No.', fBankHolder: 'Account Holder', fSwift: 'SWIFT (optional)',
    secSigner: 'Document Signatory', fSignerName: 'Signatory Name', phSignerName: 'e.g. Marlon Saragih', fSignerTitle: 'Title', phSignerTitle: 'e.g. Branch Manager',
    secDefaults: 'Document Defaults', fCurrency: 'Default Currency',
    footNote: 'This data is used as the letterhead & bank details on all documents (EPDA · FPDA · Invoice).',
    saved: 'Saved', saveChanges: 'Save changes',
  },
}

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
  signerName: string
  signerTitle: string
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
  const t = useT(STR)
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
      setError(t.errNameReq)
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
        setError((await res.text()) || t.errSave)
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError(t.errConn)
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
            <img src={logoUrl} alt={t.logoAlt} className="max-w-full max-h-full object-contain" />
          ) : (
            <Building2 className="w-7 h-7 text-text-secondary" />
          )}
        </div>
        <div>
          <p className="text-text-primary text-sm font-medium">{t.logoTitle}</p>
          <p className="text-text-secondary text-xs mt-0.5">
            {logoUrl ? t.logoActive : t.logoNone} {t.logoChange}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className={labelCls}>
            {t.fCompanyName} <Lock className="inline w-3 h-3 -mt-0.5 text-text-secondary" />
          </label>
          <input
            value={form.companyName}
            readOnly
            disabled
            className={inputCls + ' cursor-not-allowed opacity-70 select-none'}
            aria-readonly="true"
          />
          <p className="mt-1.5 text-[11px] text-text-secondary/80 leading-relaxed flex items-start gap-1.5">
            <Lock className="w-3 h-3 mt-0.5 shrink-0 text-accent-amber" />
            {t.nameLocked}
          </p>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>{t.fTagline}</label>
          <input value={form.companyTagline} onChange={onChange('companyTagline')} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>{t.fAddress}</label>
          <textarea
            value={form.companyAddress}
            onChange={onChange('companyAddress')}
            rows={2}
            className={inputCls + ' resize-none'}
          />
        </div>
        <div>
          <label className={labelCls}>{t.fPhone}</label>
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
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-teal">{t.secBank}</p>
        </div>
        <div>
          <label className={labelCls}>{t.fBankName}</label>
          <input value={form.bankName} onChange={onChange('bankName')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t.fBankAcc}</label>
          <input value={form.bankAccount} onChange={onChange('bankAccount')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t.fBankHolder}</label>
          <input value={form.bankHolder} onChange={onChange('bankHolder')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t.fSwift}</label>
          <input value={form.bankSwift} onChange={onChange('bankSwift')} className={inputCls} />
        </div>

        <div className="md:col-span-2 pt-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-teal">{t.secSigner}</p>
        </div>
        <div>
          <label className={labelCls}>{t.fSignerName}</label>
          <input value={form.signerName} onChange={onChange('signerName')} placeholder={t.phSignerName} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t.fSignerTitle}</label>
          <input value={form.signerTitle} onChange={onChange('signerTitle')} placeholder={t.phSignerTitle} className={inputCls} />
        </div>

        <div className="md:col-span-2 pt-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-accent-teal">{t.secDefaults}</p>
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
          <label className={labelCls}>{t.fCurrency}</label>
          <input value={form.defaultCurrency} onChange={onChange('defaultCurrency')} placeholder="IDR" className={inputCls} />
        </div>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-text-secondary text-xs">{t.footNote}</p>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-accent-teal text-xs font-medium">
              <Check className="w-4 h-4" /> {t.saved}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.saveChanges}
          </button>
        </div>
      </div>
    </section>
  )
}
