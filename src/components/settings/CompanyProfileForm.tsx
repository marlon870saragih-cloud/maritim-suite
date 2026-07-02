'use client'

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Building2, Lock, Upload, Trash2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    errNameReq: 'Nama perusahaan wajib diisi.', errSave: 'Gagal menyimpan.', errConn: 'Gagal terhubung ke server.',
    logoAlt: 'Logo perusahaan', logoTitle: 'Logo perusahaan', logoActive: 'Logo aktif — muncul di kop semua dokumen.', logoNone: 'Belum ada logo.',
    logoUpload: 'Unggah / ganti logo', logoHint: 'PNG transparan disarankan · maks ~2 MB · otomatis diperkecil.', logoRemove: 'Hapus logo', logoErrType: 'File harus berupa gambar.', logoReady: 'Logo baru siap — tekan Simpan Perubahan.',
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
    logoAlt: 'Company logo', logoTitle: 'Company logo', logoActive: 'Logo active — appears on every document letterhead.', logoNone: 'No logo yet.',
    logoUpload: 'Upload / replace logo', logoHint: 'Transparent PNG recommended · max ~2 MB · auto-resized.', logoRemove: 'Remove logo', logoErrType: 'File must be an image.', logoReady: 'New logo ready — press Save changes.',
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
  const [logo, setLogo] = useState<string | null>(logoUrl)
  const [logoChanged, setLogoChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (k: string, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  // Perkecil logo di sisi klien (maks 480px, PNG transparan) sebelum simpan —
  // menjaga base64 tetap kecil di DB & kop dokumen. SVG dibiarkan apa adanya.
  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // izinkan pilih file yang sama lagi
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t.logoErrType)
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      if (file.type === 'image/svg+xml') {
        setLogo(src)
        setLogoChanged(true)
        setSaved(false)
        return
      }
      const img = new Image()
      img.onload = () => {
        const max = 480
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setLogo(src)
        } else {
          ctx.drawImage(img, 0, 0, w, h)
          setLogo(canvas.toDataURL('image/png'))
        }
        setLogoChanged(true)
        setSaved(false)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setLogo(null)
    setLogoChanged(true)
    setSaved(false)
  }

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
      // logoUrl hanya disertakan bila berubah (null = hapus) — agar simpan teks
      // biasa tidak menimpa/menghapus logo yang sudah ada.
      const payload = logoChanged ? { ...form, logoUrl: logo } : form
      const res = await fetch('/api/tenant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError((await res.text()) || t.errSave)
        return
      }
      setLogoChanged(false)
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
          {logo ? (
            <img src={logo} alt={t.logoAlt} className="max-w-full max-h-full object-contain" />
          ) : (
            <Building2 className="w-7 h-7 text-text-secondary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-text-primary text-sm font-medium">{t.logoTitle}</p>
          <p className="text-text-secondary text-xs mt-0.5">
            {logoChanged ? t.logoReady : logo ? t.logoActive : t.logoNone}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={onPickLogo}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded border border-border-muted px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-accent-blue/60 hover:bg-surface-tertiary transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {t.logoUpload}
            </button>
            {logo && (
              <button
                type="button"
                onClick={removeLogo}
                className="inline-flex items-center gap-1.5 rounded border border-transparent px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-status-danger transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t.logoRemove}
              </button>
            )}
          </div>
          <p className="text-text-secondary/70 text-[11px] mt-1.5">{t.logoHint}</p>
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
