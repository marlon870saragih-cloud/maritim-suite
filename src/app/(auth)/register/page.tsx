'use client'

import { useState, useRef, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useT, LangToggle } from '@/lib/i18n'

/**
 * Onboarding "Siapkan perusahaan" — tema kuningan + kertas. Signature: panel kanan menampilkan
 * PRATINJAU KOP DOKUMEN live di atas kertas peta — persis seperti data ini muncul di setiap PDF.
 * Bilingual ID/EN via i18n bersama. Submit → buat tenant + admin → auto login → dashboard.
 */
type Fields = {
  name: string
  email: string
  password: string
  companyName: string
  companyTagline: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  npwp: string
  bankName: string
  bankAccount: string
  bankHolder: string
}

const EMPTY: Fields = {
  name: '', email: '', password: '', companyName: '', companyTagline: '', companyAddress: '',
  companyPhone: '', companyEmail: '', npwp: '', bankName: '', bankAccount: '', bankHolder: '',
}

export default function RegisterPage() {
  const router = useRouter()
  const t = useT(STR)
  const [f, setF] = useState<Fields>(EMPTY)
  const [logo, setLogo] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const [logoErr, setLogoErr] = useState('')
  const [formMsg, setFormMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set =
    (key: keyof Fields) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setF((p) => ({ ...p, [key]: e.target.value }))
      if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }))
    }

  function fieldError(key: keyof Fields): string | undefined {
    switch (key) {
      case 'companyName':
        return f.companyName.trim().length < 2 ? t.errCoName : undefined
      case 'name':
        return f.name.trim().length < 2 ? t.errName : undefined
      case 'email':
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? undefined : t.errEmail
      case 'password':
        return f.password.length < 6 ? t.errPw : undefined
      default:
        return undefined
    }
  }

  function onBlur(key: keyof Fields) {
    setErrors((p) => ({ ...p, [key]: fieldError(key) }))
  }

  function readLogo(file?: File | null) {
    setLogoErr('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoErr(t.logoErrType)
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoErr(t.logoErrSize)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogo(String(reader.result))
    reader.readAsDataURL(file)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    readLogo(e.dataTransfer.files?.[0])
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: Partial<Record<keyof Fields, string>> = {}
    ;(['name', 'email', 'password', 'companyName'] as (keyof Fields)[]).forEach((k) => {
      const err = fieldError(k)
      if (err) next[k] = err
    })
    setErrors(next)
    if (Object.keys(next).length) {
      setFormMsg(t.errFormIncomplete)
      return
    }
    setFormMsg('')
    setLoading(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, logoUrl: logo || undefined }),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      setFormMsg(json.error ?? t.errCreate)
      setLoading(false)
      return
    }
    const login = await signIn('credentials', { email: f.email, password: f.password, redirect: false })
    setLoading(false)
    if (login?.error) {
      router.push('/login')
      return
    }
    router.push('/dokumen')
    router.refresh()
  }

  return (
    <div className="onb-root">
      <div className="onb-depth" aria-hidden="true" />

      <header className="onb-top">
        <Link href="/" className="onb-brand">
          <Image src="/logo-transparent.png" alt="PT Tribuana Solusi Maritim" width={96} height={96} priority />
          <span>
            PT Tribuana Solusi Maritim<span>Maritime Suite</span>
          </span>
        </Link>
        <div className="onb-top-right">
          <LangToggle tone="ink" />
          <span className="onb-top-acc">
            {t.haveAccount} <Link href="/login">{t.signIn}</Link>
          </span>
        </div>
      </header>

      <div className="onb-grid">
        {/* ===== FORM ===== */}
        <main className="onb-form-col">
          <div className="onb-head">
            <p className="onb-eyebrow">
              <span className="onb-anchor" aria-hidden="true" /> {t.eyebrow}
            </p>
            <h1 className="onb-h1">{t.h1}</h1>
            <p className="onb-intro">
              {t.introPre} <strong>{t.introStrong}</strong> {t.introPost}
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate className="onb-form">
            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">1</span> {t.sect1}
                <small>{t.sect1sub}</small>
              </legend>
              <div className="onb-row2">
                <Field label={t.nameLabel} required value={f.name} onChange={set('name')} onBlur={() => onBlur('name')} error={errors.name} placeholder={t.namePh} autoComplete="name" />
                <Field label={t.emailLabel} required type="email" value={f.email} onChange={set('email')} onBlur={() => onBlur('email')} error={errors.email} placeholder="nama@perusahaan.co.id" autoComplete="email" />
              </div>
              <Field label={t.pwLabel} required type="password" value={f.password} onChange={set('password')} onBlur={() => onBlur('password')} error={errors.password} placeholder={t.pwPh} autoComplete="new-password" />
            </fieldset>

            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">2</span> {t.sect2}
                <small>{t.sect2sub}</small>
              </legend>
              <Field label={t.coNameLabel} required value={f.companyName} onChange={set('companyName')} onBlur={() => onBlur('companyName')} error={errors.companyName} placeholder={t.coNamePh} />
              <Field label={t.taglineLabel} value={f.companyTagline} onChange={set('companyTagline')} placeholder="Shipping Agency & Vessel Services" hint={t.optional} />
              <Field label={t.addrLabel} textarea value={f.companyAddress} onChange={set('companyAddress')} placeholder={t.addrPh} />
              <div className="onb-row2">
                <Field label={t.phoneLabel} type="tel" value={f.companyPhone} onChange={set('companyPhone')} placeholder="0541-..." />
                <Field label={t.coEmailLabel} type="email" value={f.companyEmail} onChange={set('companyEmail')} placeholder="info@perusahaan.co.id" />
              </div>
            </fieldset>

            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">3</span> {t.sect3}
                <small>{t.sect3sub}</small>
              </legend>
              <div
                className={`onb-drop${dragOver ? ' onb-drop-over' : ''}${logo ? ' onb-drop-has' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileRef.current?.click()
                  }
                }}
                aria-label={t.dropAria}
              >
                {logo ? (
                  <div className="onb-drop-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo} alt={t.logoUploaded} />
                    <div>
                      <span className="onb-drop-name">{t.logoUploaded}</span>
                      <button
                        type="button"
                        className="onb-drop-remove"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setLogo('')
                          if (fileRef.current) fileRef.current.value = ''
                        }}
                      >
                        {t.remove}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <span className="onb-drop-title">{t.dropTitle}</span>
                    <span className="onb-drop-sub">{t.dropSub}</span>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => readLogo(e.target.files?.[0])} />
              </div>
              {logoErr && <p className="onb-err">{logoErr}</p>}
            </fieldset>

            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">4</span> {t.sect4}
                <small>{t.sect4sub}</small>
              </legend>
              <Field label="NPWP" value={f.npwp} onChange={set('npwp')} placeholder="00.000.000.0-000.000" hint={t.optional} />
              <div className="onb-row2">
                <Field label={t.bankNameLabel} value={f.bankName} onChange={set('bankName')} placeholder="Bank Mandiri" />
                <Field label={t.bankAccLabel} value={f.bankAccount} onChange={set('bankAccount')} placeholder="1234567890" />
              </div>
              <Field label={t.bankHolderLabel} value={f.bankHolder} onChange={set('bankHolder')} placeholder={t.coNamePh} />
            </fieldset>

            {formMsg && (
              <p className="onb-formmsg" role="alert">
                {formMsg}
              </p>
            )}

            <button type="submit" className="onb-submit" disabled={loading}>
              {loading && <span className="onb-spinner" aria-hidden="true" />}
              {loading ? t.submitting : t.submit}
            </button>
            <p className="onb-fineprint">{t.fineprint}</p>
          </form>
        </main>

        {/* ===== PRATINJAU KOP DOKUMEN (kertas) ===== */}
        <aside className="onb-preview-col">
          <div className="onb-preview-sticky">
            <p className="onb-preview-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {t.previewLabel}
            </p>

            <div className="onb-paper">
              <div className="onb-paper-head">
                <div className="onb-paper-logo">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="Logo" />
                  ) : (
                    <div className="onb-paper-logo-ph">LOGO</div>
                  )}
                </div>
                <div className="onb-paper-co">
                  <div className={`onb-paper-name${f.companyName ? '' : ' ph'}`}>{f.companyName || t.coNamePh}</div>
                  {(f.companyTagline || !f.companyName) && (
                    <div className={`onb-paper-tag${f.companyTagline ? '' : ' ph'}`}>
                      {f.companyTagline || 'Shipping Agency & Vessel Services'}
                    </div>
                  )}
                  <div className={`onb-paper-line${f.companyAddress ? '' : ' ph'}`}>{f.companyAddress || t.paperAddrPh}</div>
                  <div className="onb-paper-meta">
                    <span className={f.companyPhone ? '' : 'ph'}>{t.paperPhone} {f.companyPhone || '—'}</span>
                    <span className={f.companyEmail ? '' : 'ph'}>{f.companyEmail || 'email@—'}</span>
                    <span className={f.npwp ? '' : 'ph'}>NPWP {f.npwp || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="onb-paper-rule" />

              <div className="onb-paper-title">PROFORMA DISBURSEMENT ACCOUNT</div>
              <div className="onb-paper-docno">No. EPDA/2026/000 · Samarinda</div>
              <div className="onb-ghost">
                <span style={{ width: '70%' }} />
                <span style={{ width: '52%' }} />
                <span style={{ width: '61%' }} />
                <span style={{ width: '40%' }} />
              </div>
              <div className="onb-paper-total">
                <span>TOTAL</span>
                <span className="onb-ghost-amt" />
              </div>

              <div className="onb-paper-foot">
                <span className="onb-paper-foot-k">{t.paperPayK}</span>
                <span className={f.bankName || f.bankAccount ? '' : 'ph'}>
                  {f.bankName || t.paperBankPh} · {f.bankAccount || t.paperAccPh}
                  {f.bankHolder ? ` · ${t.paperHolder} ${f.bankHolder}` : ''}
                </span>
              </div>
            </div>

            <p className="onb-preview-note">{t.previewNote}</p>
          </div>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

/* ---- Field component ---- */
function Field({
  label, required, type = 'text', textarea, value, onChange, onBlur, error, placeholder, hint, autoComplete,
}: {
  label: string
  required?: boolean
  type?: string
  textarea?: boolean
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onBlur?: () => void
  error?: string
  placeholder?: string
  hint?: string
  autoComplete?: string
}) {
  const id = 'f-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <div className="onb-field">
      <label htmlFor={id}>
        {label}
        {required && <span className="onb-req">*</span>}
        {hint && <span className="onb-hint">{hint}</span>}
      </label>
      {textarea ? (
        <textarea id={id} className={`onb-input${error ? ' onb-input-err' : ''}`} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} rows={2} />
      ) : (
        <input id={id} type={type} className={`onb-input${error ? ' onb-input-err' : ''}`} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} autoComplete={autoComplete} />
      )}
      {error && <p className="onb-err">{error}</p>}
    </div>
  )
}

// ===== Konten bilingual =====
const STR = {
  id: {
    haveAccount: 'Sudah punya akun?', signIn: 'Masuk',
    eyebrow: 'Uji coba gratis 7 hari',
    h1: 'Siapkan perusahaan Anda',
    introPre: 'Data ini menjadi', introStrong: 'kop di setiap dokumen & laporan', introPost: 'yang Anda terbitkan. Isi sekali, dipakai selamanya — bisa diubah nanti di Pengaturan.',
    sect1: 'Akun Anda', sect1sub: 'Untuk masuk ke aplikasi',
    nameLabel: 'Nama lengkap', namePh: 'Nama Anda',
    emailLabel: 'Email', pwLabel: 'Kata sandi', pwPh: 'Minimal 6 karakter',
    sect2: 'Identitas perusahaan', sect2sub: 'Tampil di kop setiap dokumen',
    coNameLabel: 'Nama perusahaan', coNamePh: 'PT Pelayaran Anda',
    taglineLabel: 'Tagline / slogan', optional: 'opsional',
    addrLabel: 'Alamat', addrPh: 'Jl. ... No. ..., Kota, Provinsi',
    phoneLabel: 'Telepon', coEmailLabel: 'Email perusahaan',
    sect3: 'Logo perusahaan', sect3sub: 'Muncul di pojok kiri kop dokumen',
    dropTitle: 'Seret logo ke sini atau klik untuk unggah', dropSub: 'PNG transparan disarankan · maks 1,5 MB',
    dropAria: 'Unggah logo perusahaan', logoUploaded: 'Logo terunggah', remove: 'Hapus',
    logoErrType: 'File harus berupa gambar (PNG/JPG).', logoErrSize: 'Ukuran logo maksimal 1,5 MB.',
    sect4: 'Pajak & Bank', sect4sub: 'Untuk invoice & dokumen finansial',
    bankNameLabel: 'Nama bank', bankAccLabel: 'No. rekening', bankHolderLabel: 'Atas nama rekening',
    errFormIncomplete: 'Lengkapi dulu kolom yang ditandai.',
    errCoName: 'Nama perusahaan minimal 2 karakter', errName: 'Nama Anda minimal 2 karakter',
    errEmail: 'Format email tidak valid', errPw: 'Kata sandi minimal 6 karakter',
    errCreate: 'Gagal membuat akun. Coba lagi.',
    submit: 'Buat akun & mulai uji coba', submitting: 'Membuat akun…',
    fineprint: 'Dengan mendaftar, Anda mendapat akses penuh semua modul selama 7 hari. Tanpa kartu kredit.',
    previewLabel: 'Pratinjau kop dokumen',
    paperAddrPh: 'Alamat perusahaan akan tampil di sini', paperPhone: 'Telp',
    paperPayK: 'Pembayaran ke rekening', paperBankPh: 'Nama Bank', paperAccPh: 'No. Rekening', paperHolder: 'a.n.',
    previewNote: 'Beginilah data Anda muncul di setiap PDF — EPDA, invoice, clearance, dan laporan lain.',
  },
  en: {
    haveAccount: 'Already have an account?', signIn: 'Sign in',
    eyebrow: 'Free 7-day trial',
    h1: 'Set up your company',
    introPre: 'This becomes the', introStrong: 'letterhead on every document & report', introPost: 'you issue. Fill it once, use it forever — editable later in Settings.',
    sect1: 'Your account', sect1sub: 'To sign in to the app',
    nameLabel: 'Full name', namePh: 'Your name',
    emailLabel: 'Email', pwLabel: 'Password', pwPh: 'At least 6 characters',
    sect2: 'Company identity', sect2sub: 'Shown on every document letterhead',
    coNameLabel: 'Company name', coNamePh: 'Your Shipping Co.',
    taglineLabel: 'Tagline / slogan', optional: 'optional',
    addrLabel: 'Address', addrPh: 'Street ... No. ..., City, Province',
    phoneLabel: 'Phone', coEmailLabel: 'Company email',
    sect3: 'Company logo', sect3sub: 'Appears at the top-left of the letterhead',
    dropTitle: 'Drag a logo here or click to upload', dropSub: 'Transparent PNG recommended · max 1.5 MB',
    dropAria: 'Upload company logo', logoUploaded: 'Logo uploaded', remove: 'Remove',
    logoErrType: 'File must be an image (PNG/JPG).', logoErrSize: 'Logo must be at most 1.5 MB.',
    sect4: 'Tax & bank', sect4sub: 'For invoices & financial documents',
    bankNameLabel: 'Bank name', bankAccLabel: 'Account no.', bankHolderLabel: 'Account holder',
    errFormIncomplete: 'Please complete the highlighted fields.',
    errCoName: 'Company name needs at least 2 characters', errName: 'Your name needs at least 2 characters',
    errEmail: 'Invalid email format', errPw: 'Password needs at least 6 characters',
    errCreate: 'Could not create account. Please try again.',
    submit: 'Create account & start trial', submitting: 'Creating account…',
    fineprint: 'By registering you get full access to all modules for 7 days. No credit card required.',
    previewLabel: 'Letterhead preview',
    paperAddrPh: 'Your company address appears here', paperPhone: 'Tel',
    paperPayK: 'Payment to account', paperBankPh: 'Bank name', paperAccPh: 'Account no.', paperHolder: 'a/c',
    previewNote: 'This is how your data appears on every PDF — EPDA, invoice, clearance, and other reports.',
  },
}

// ===== CSS (prefix .onb-, tema kuningan via token --ms-*) =====
const CSS = `
.onb-root{
  --ink:var(--ms-ink); --ink-2:var(--ms-ink-2); --chart:var(--ms-chart); --chart-line:var(--ms-chart-line); --chart-ink:var(--ms-chart-ink); --chart-mut:var(--ms-chart-mut);
  --brass:var(--ms-brass); --brass-2:var(--ms-brass-2); --brass-deep:var(--ms-brass-deep); --signal:var(--ms-signal);
  position:fixed; inset:0; overflow-y:auto; background:var(--ink);
  color:#DCE6E6; font-family:var(--font-body),system-ui,sans-serif; -webkit-font-smoothing:antialiased;
}
.onb-root *{box-sizing:border-box}
.onb-root a{color:inherit; text-decoration:none}
.onb-root a:focus-visible, .onb-root button:focus-visible, .onb-root [role="button"]:focus-visible{outline:2px solid var(--brass); outline-offset:3px; border-radius:4px}

.onb-depth{position:fixed; inset:0; z-index:0; pointer-events:none; opacity:.4;
  background:radial-gradient(120% 80% at 90% -10%, rgba(60,107,122,.14), transparent 55%)}

.onb-top{position:relative; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:16px;
  max-width:1200px; margin:0 auto; padding:18px clamp(18px,4vw,40px); border-bottom:1px solid #14323d}
.onb-brand{display:flex; align-items:center; gap:11px; font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:.98rem; color:#F4F0E6}
.onb-brand img{height:40px!important; width:auto!important}
.onb-brand span{display:flex; flex-direction:column; line-height:1.15}
.onb-brand span span{font-family:var(--font-mono),monospace; font-weight:400; font-size:.62rem;
  letter-spacing:.24em; text-transform:uppercase; color:var(--brass); margin-top:2px}
.onb-top-right{display:flex; align-items:center; gap:16px; font-size:.88rem; color:#8fa6ab}
.onb-top-acc a{color:var(--brass); font-weight:600}
.onb-top-acc a:hover{color:#d6a945}

.onb-grid{position:relative; z-index:2; max-width:1200px; margin:0 auto;
  padding:clamp(20px,3vw,40px) clamp(18px,4vw,40px) 80px;
  display:grid; grid-template-columns:1.15fr .85fr; gap:clamp(28px,4vw,56px); align-items:start}

.onb-head{margin-bottom:26px}
.onb-eyebrow{display:inline-flex; align-items:center; gap:10px; font-family:var(--font-mono),monospace;
  font-size:.72rem; letter-spacing:.2em; text-transform:uppercase; color:var(--brass); margin:0 0 14px}
.onb-anchor{width:9px; height:9px; flex:0 0 auto; transform:rotate(45deg); background:var(--brass)}
.onb-h1{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:clamp(1.9rem,3.4vw,2.6rem); color:#F4F0E6; line-height:1.1; margin:0}
.onb-intro{margin-top:12px; font-size:.98rem; line-height:1.6; color:#bcd0d2; max-width:540px}
.onb-intro strong{color:var(--brass); font-weight:600}

.onb-form{display:flex; flex-direction:column; gap:20px}
.onb-sect{border:1px solid #16333d; border-radius:12px; padding:20px 20px 22px; background:var(--ink-2)}
/* legend di-float agar duduk DI DALAM kartu (bukan menempel di garis border atas
   spt perilaku default legend). Elemen setelah legend di-clear supaya mulai di bawahnya. */
.onb-sect legend{float:left; width:100%; display:flex; align-items:center; gap:10px; padding:0; margin:0 0 4px;
  font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:1.15rem; color:#F4F0E6}
.onb-sect legend + *{clear:both}
.onb-sect legend small{font-family:var(--font-mono),monospace; font-weight:400; font-size:.68rem;
  color:#8fa6ab; letter-spacing:.02em; text-transform:none}
.onb-sect-no{display:inline-grid; place-items:center; width:24px; height:24px; border-radius:7px;
  background:rgba(199,154,62,.16); border:1px solid rgba(199,154,62,.34); color:var(--brass); font-family:var(--font-mono),monospace; font-size:.82rem; font-weight:700}
.onb-row2{display:grid; grid-template-columns:1fr 1fr; gap:14px}

.onb-field{display:flex; flex-direction:column; gap:6px; margin-top:14px}
.onb-field:first-of-type{margin-top:16px}
.onb-row2 .onb-field{margin-top:14px}
.onb-field label{display:flex; align-items:center; gap:7px; font-family:var(--font-mono),monospace; font-size:.72rem;
  font-weight:500; letter-spacing:.04em; text-transform:uppercase; color:#9fb6b9}
.onb-req{color:var(--signal)}
.onb-hint{font-weight:400; font-size:.7rem; color:#7d9498; font-style:italic; text-transform:none; letter-spacing:0}
.onb-input{width:100%; height:44px; padding:0 13px; border:1.5px solid #1c4049; border-radius:9px;
  background:var(--ink); color:#F4F0E6; font-size:.94rem; font-family:var(--font-body),sans-serif; transition:border-color .18s, box-shadow .18s}
textarea.onb-input{height:auto; padding:11px 13px; resize:vertical; line-height:1.5}
.onb-input::placeholder{color:#5b727a}
.onb-input:focus{outline:none; border-color:var(--brass); box-shadow:0 0 0 3.5px rgba(199,154,62,.16)}
.onb-input-err{border-color:var(--signal)}
.onb-input-err:focus{box-shadow:0 0 0 3.5px rgba(192,67,46,.18)}
.onb-err{font-size:.78rem; color:#e08c7c; margin-top:1px}

.onb-drop{margin-top:16px; border:1.5px dashed #2a525e; border-radius:11px; padding:24px 18px;
  display:flex; flex-direction:column; align-items:center; gap:7px; text-align:center; cursor:pointer;
  color:#8fa6ab; background:var(--ink); transition:border-color .18s, background .18s}
.onb-drop:hover{border-color:var(--brass); background:#0c222b}
.onb-drop-over{border-color:var(--brass); background:rgba(199,154,62,.08)}
.onb-drop-has{cursor:default; padding:16px}
.onb-drop-title{font-size:.9rem; font-weight:600; color:#cfdcdd}
.onb-drop-sub{font-family:var(--font-mono),monospace; font-size:.7rem; color:#8fa6ab}
.onb-drop-preview{display:flex; align-items:center; gap:14px; width:100%}
.onb-drop-preview img{height:48px; width:auto; max-width:120px; object-fit:contain; background:#fff; border-radius:8px; padding:6px}
.onb-drop-name{display:block; font-size:.88rem; font-weight:600; color:#cfdcdd}
.onb-drop-remove{margin-top:3px; background:none; border:none; color:var(--signal); font-size:.8rem; font-weight:600; cursor:pointer; padding:0; font-family:inherit}
.onb-drop-remove:hover{text-decoration:underline}

.onb-formmsg{font-size:.86rem; color:#e08c7c; background:rgba(192,67,46,.1); border:1px solid rgba(192,67,46,.32); padding:10px 13px; border-radius:9px}
.onb-submit{height:52px; border:none; border-radius:12px; color:#231a06; font-weight:700; font-size:1.02rem;
  font-family:var(--font-body),sans-serif; cursor:pointer; background:var(--brass);
  box-shadow:0 16px 32px -14px rgba(199,154,62,.6); transition:background .2s, transform .08s;
  display:flex; align-items:center; justify-content:center; gap:10px}
.onb-submit:hover{background:#d6a945}
.onb-submit:active{transform:translateY(1px)}
.onb-submit:disabled{opacity:.7; cursor:not-allowed}
.onb-spinner{width:18px; height:18px; border:2.5px solid rgba(35,26,6,.3); border-top-color:#231a06; border-radius:50%; animation:onbspin .7s linear infinite}
@keyframes onbspin{to{transform:rotate(360deg)}}
.onb-fineprint{text-align:center; font-size:.78rem; color:#8fa6ab; margin-top:-6px}

/* ===== PRATINJAU KOP (kertas ivory) ===== */
.onb-preview-sticky{position:sticky; top:24px}
.onb-preview-label{display:flex; align-items:center; gap:8px; font-family:var(--font-mono),monospace; font-size:.7rem;
  font-weight:500; letter-spacing:.16em; text-transform:uppercase; color:var(--brass); margin:0 0 14px}
.onb-paper{position:relative; background:var(--chart); color:var(--chart-ink); border-radius:6px; padding:26px 26px 22px;
  box-shadow:0 40px 80px -30px rgba(0,0,0,.7); border:1px solid #cdbf98;
  background-image:linear-gradient(var(--chart-line) 1px, transparent 1px); background-size:100% 30px}
.onb-paper::before{content:""; position:absolute; left:0; top:0; bottom:0; width:5px; border-radius:6px 0 0 6px; background:var(--brass)}
.onb-paper-head{display:flex; gap:16px; align-items:flex-start}
.onb-paper-logo{flex:0 0 auto; width:64px; height:64px; display:grid; place-items:center}
.onb-paper-logo img{max-width:64px; max-height:64px; object-fit:contain}
.onb-paper-logo-ph{width:60px; height:60px; border:1.5px dashed #c2b485; border-radius:8px;
  display:grid; place-items:center; font-family:var(--font-mono),monospace; font-size:.6rem; font-weight:700; letter-spacing:.1em; color:#a59a78}
.onb-paper-co{min-width:0; flex:1}
.onb-paper-name{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:1.24rem; line-height:1.15; color:#16201f; word-break:break-word}
.onb-paper-tag{font-size:.76rem; color:var(--brass-deep); font-weight:600; margin-top:2px}
.onb-paper-line{font-size:.74rem; color:#4b554f; margin-top:5px; line-height:1.4}
.onb-paper-meta{display:flex; flex-wrap:wrap; gap:3px 12px; margin-top:5px; font-family:var(--font-mono),monospace; font-size:.66rem; color:var(--chart-mut)}
.onb-paper .ph{opacity:.45; font-style:italic}
.onb-paper-rule{height:2px; background:var(--brass); margin:14px 0; opacity:.8}
.onb-paper-title{text-align:center; font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:.98rem; letter-spacing:.02em; color:#16201f}
.onb-paper-docno{text-align:center; font-family:var(--font-mono),monospace; font-size:.64rem; color:var(--chart-mut); margin-top:3px; letter-spacing:.04em}
.onb-ghost{display:flex; flex-direction:column; gap:8px; margin:16px 0}
.onb-ghost span{height:8px; border-radius:4px; background:#e6dcc0}
.onb-paper-total{display:flex; align-items:center; justify-content:space-between; margin-top:6px;
  padding:9px 12px; background:#ece2c8; border-radius:6px; font-family:var(--font-mono),monospace; font-size:.74rem; font-weight:700; color:#16201f}
.onb-ghost-amt{width:74px; height:9px; border-radius:4px; background:#cdbf98}
.onb-paper-foot{margin-top:16px; padding-top:12px; border-top:1px solid #d8cca6; display:flex; flex-direction:column; gap:2px}
.onb-paper-foot-k{font-family:var(--font-mono),monospace; font-size:.62rem; text-transform:uppercase; letter-spacing:.08em; color:var(--chart-mut); font-weight:700}
.onb-paper-foot span:last-child{font-size:.74rem; color:#33433f}
.onb-preview-note{margin-top:14px; font-size:.82rem; line-height:1.55; color:#8fa6ab}

@media(max-width:980px){
  .onb-grid{grid-template-columns:1fr; gap:24px}
  .onb-preview-col{order:-1}
  .onb-preview-sticky{position:static}
  .onb-paper{max-width:520px}
}
@media(max-width:560px){
  .onb-row2{grid-template-columns:1fr; gap:0}
  .onb-top-acc{display:none}
}
@media(prefers-reduced-motion:reduce){
  .onb-root *,.onb-root *::before,.onb-root *::after{transition:none!important; animation:none!important}
}
`
