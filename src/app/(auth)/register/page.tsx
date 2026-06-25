'use client'

import { useState, useRef, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signIn } from 'next-auth/react'

/**
 * Onboarding "Siapkan perusahaan" — input data perusahaan + logo.
 * Signature: panel kanan menampilkan PRATINJAU KOP DOKUMEN secara live, persis seperti
 * data ini muncul di setiap PDF yang di-generate. Warna/font mengikuti landing (navy +
 * Poppins/Open Sans). Submit → buat tenant + admin (Prisma) → auto login → dashboard.
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
  name: '',
  email: '',
  password: '',
  companyName: '',
  companyTagline: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  npwp: '',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
}

export default function RegisterPage() {
  const router = useRouter()
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
        return f.companyName.trim().length < 2 ? 'Nama perusahaan minimal 2 karakter' : undefined
      case 'name':
        return f.name.trim().length < 2 ? 'Nama Anda minimal 2 karakter' : undefined
      case 'email':
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email) ? undefined : 'Format email tidak valid'
      case 'password':
        return f.password.length < 6 ? 'Password minimal 6 karakter' : undefined
      default:
        return undefined
    }
  }

  function onBlur(key: keyof Fields) {
    const err = fieldError(key)
    setErrors((p) => ({ ...p, [key]: err }))
  }

  function readLogo(file?: File | null) {
    setLogoErr('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoErr('File harus berupa gambar (PNG/JPG).')
      return
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoErr('Ukuran logo maksimal 1,5 MB.')
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
      setFormMsg('Lengkapi dulu kolom yang ditandai.')
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
      setFormMsg(json.error ?? 'Gagal membuat akun. Coba lagi.')
      setLoading(false)
      return
    }
    const login = await signIn('credentials', {
      email: f.email,
      password: f.password,
      redirect: false,
    })
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
      {/* top bar */}
      <header className="onb-top">
        <Link href="/" className="onb-brand">
          <Image src="/logo-transparent.png" alt="PT Tribuana Solusi Maritim" width={96} height={96} priority />
          <span>
            PT Tribuana Solusi Maritim<span>Maritime Suite</span>
          </span>
        </Link>
        <div className="onb-top-right">
          Sudah punya akun? <Link href="/login">Masuk</Link>
        </div>
      </header>

      <div className="onb-grid">
        {/* ===== FORM ===== */}
        <main className="onb-form-col">
          <div className="onb-head">
            <div className="onb-eyebrow">
              <span className="onb-pin" aria-hidden="true" /> Uji Coba Gratis 14 Hari
            </div>
            <h1>Siapkan perusahaan Anda</h1>
            <p>
              Data ini menjadi <strong>kop di setiap dokumen &amp; laporan</strong> yang Anda
              terbitkan. Isi sekali, dipakai selamanya — bisa diubah nanti di Pengaturan.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate className="onb-form">
            {/* Akun */}
            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">1</span> Akun Anda
                <small>Untuk masuk ke aplikasi</small>
              </legend>
              <div className="onb-row2">
                <Field
                  label="Nama lengkap"
                  required
                  value={f.name}
                  onChange={set('name')}
                  onBlur={() => onBlur('name')}
                  error={errors.name}
                  placeholder="Nama Anda"
                  autoComplete="name"
                />
                <Field
                  label="Email"
                  required
                  type="email"
                  value={f.email}
                  onChange={set('email')}
                  onBlur={() => onBlur('email')}
                  error={errors.email}
                  placeholder="nama@perusahaan.co.id"
                  autoComplete="email"
                />
              </div>
              <Field
                label="Password"
                required
                type="password"
                value={f.password}
                onChange={set('password')}
                onBlur={() => onBlur('password')}
                error={errors.password}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
              />
            </fieldset>

            {/* Identitas perusahaan */}
            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">2</span> Identitas Perusahaan
                <small>Tampil di kop setiap dokumen</small>
              </legend>
              <Field
                label="Nama perusahaan"
                required
                value={f.companyName}
                onChange={set('companyName')}
                onBlur={() => onBlur('companyName')}
                error={errors.companyName}
                placeholder="PT Pelayaran Anda"
              />
              <Field
                label="Tagline / slogan"
                value={f.companyTagline}
                onChange={set('companyTagline')}
                placeholder="Shipping Agency & Vessel Services"
                hint="opsional"
              />
              <Field
                label="Alamat"
                textarea
                value={f.companyAddress}
                onChange={set('companyAddress')}
                placeholder="Jl. ... No. ..., Kota, Provinsi"
              />
              <div className="onb-row2">
                <Field
                  label="Telepon"
                  type="tel"
                  value={f.companyPhone}
                  onChange={set('companyPhone')}
                  placeholder="0541-..."
                />
                <Field
                  label="Email perusahaan"
                  type="email"
                  value={f.companyEmail}
                  onChange={set('companyEmail')}
                  placeholder="info@perusahaan.co.id"
                />
              </div>
            </fieldset>

            {/* Logo */}
            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">3</span> Logo Perusahaan
                <small>Muncul di pojok kiri kop dokumen</small>
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
                aria-label="Unggah logo perusahaan"
              >
                {logo ? (
                  <div className="onb-drop-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo} alt="Pratinjau logo" />
                    <div>
                      <span className="onb-drop-name">Logo terunggah</span>
                      <button
                        type="button"
                        className="onb-drop-remove"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setLogo('')
                          if (fileRef.current) fileRef.current.value = ''
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <span className="onb-drop-title">Seret logo ke sini atau klik untuk unggah</span>
                    <span className="onb-drop-sub">PNG transparan disarankan · maks 1,5 MB</span>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e: ChangeEvent<HTMLInputElement>) => readLogo(e.target.files?.[0])}
                />
              </div>
              {logoErr && <p className="onb-err">{logoErr}</p>}
            </fieldset>

            {/* Pajak & Bank */}
            <fieldset className="onb-sect">
              <legend>
                <span className="onb-sect-no">4</span> Pajak &amp; Bank
                <small>Untuk invoice &amp; dokumen finansial</small>
              </legend>
              <Field label="NPWP" value={f.npwp} onChange={set('npwp')} placeholder="00.000.000.0-000.000" hint="opsional" />
              <div className="onb-row2">
                <Field label="Nama bank" value={f.bankName} onChange={set('bankName')} placeholder="Bank Mandiri" />
                <Field label="No. rekening" value={f.bankAccount} onChange={set('bankAccount')} placeholder="1234567890" />
              </div>
              <Field label="Atas nama rekening" value={f.bankHolder} onChange={set('bankHolder')} placeholder="PT Pelayaran Anda" />
            </fieldset>

            {formMsg && (
              <p className="onb-formmsg" role="alert">
                {formMsg}
              </p>
            )}

            <button type="submit" className="onb-submit" disabled={loading}>
              {loading && <span className="onb-spinner" aria-hidden="true" />}
              {loading ? 'Membuat akun…' : 'Buat Akun & Mulai Uji Coba'}
            </button>
            <p className="onb-fineprint">
              Dengan mendaftar, Anda mendapat akses penuh semua modul selama 14 hari. Tanpa kartu kredit.
            </p>
          </form>
        </main>

        {/* ===== PRATINJAU KOP DOKUMEN ===== */}
        <aside className="onb-preview-col">
          <div className="onb-preview-sticky">
            <div className="onb-preview-label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Pratinjau kop dokumen
            </div>

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
                  <div className={`onb-paper-name${f.companyName ? '' : ' ph'}`}>
                    {f.companyName || 'PT Pelayaran Anda'}
                  </div>
                  {(f.companyTagline || !f.companyName) && (
                    <div className={`onb-paper-tag${f.companyTagline ? '' : ' ph'}`}>
                      {f.companyTagline || 'Shipping Agency & Vessel Services'}
                    </div>
                  )}
                  <div className={`onb-paper-line${f.companyAddress ? '' : ' ph'}`}>
                    {f.companyAddress || 'Alamat perusahaan akan tampil di sini'}
                  </div>
                  <div className="onb-paper-meta">
                    <span className={f.companyPhone ? '' : 'ph'}>
                      Telp {f.companyPhone || '—'}
                    </span>
                    <span className={f.companyEmail ? '' : 'ph'}>{f.companyEmail || 'email@—'}</span>
                    {(f.npwp || true) && <span className={f.npwp ? '' : 'ph'}>NPWP {f.npwp || '—'}</span>}
                  </div>
                </div>
              </div>

              <div className="onb-paper-rule" />

              {/* badan dokumen (ghost) */}
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
                <span className="onb-paper-foot-k">Pembayaran ke rekening</span>
                <span className={f.bankName || f.bankAccount ? '' : 'ph'}>
                  {f.bankName || 'Nama Bank'} · {f.bankAccount || 'No. Rekening'}
                  {f.bankHolder ? ` · a.n. ${f.bankHolder}` : ''}
                </span>
              </div>
            </div>

            <p className="onb-preview-note">
              Beginilah data Anda muncul di setiap PDF — EPDA, invoice, clearance, dan laporan lain.
            </p>
          </div>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

/* ---- Field component ---- */
function Field({
  label,
  required,
  type = 'text',
  textarea,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  hint,
  autoComplete,
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
        <textarea
          id={id}
          className={`onb-input${error ? ' onb-input-err' : ''}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={2}
        />
      ) : (
        <input
          id={id}
          type={type}
          className={`onb-input${error ? ' onb-input-err' : ''}`}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
      )}
      {error && <p className="onb-err">{error}</p>}
    </div>
  )
}

const CSS = `
.onb-root{
  --navy-900:#08182e; --navy-850:#0a1e36; --navy-800:#0a2540;
  --blue-700:#1E40AF; --blue-600:#2563EB; --blue-500:#3B82F6; --blue-300:#93C5FD;
  --teal:#52DCC1; --ink:#0F172A; --slate-600:#475569; --slate-400:#94A3B8; --slate-200:#E2E8F0;
  --white:#fff;
  position:fixed; inset:0; overflow-y:auto; background:var(--navy-900);
  color:#eaf2fd; font-family:var(--font-opensans),system-ui,sans-serif; -webkit-font-smoothing:antialiased;
}
.onb-root *{box-sizing:border-box}
.onb-root a{color:inherit; text-decoration:none}

.onb-top{display:flex; align-items:center; justify-content:space-between; gap:16px;
  max-width:1200px; margin:0 auto; padding:18px clamp(18px,4vw,40px);
  border-bottom:1px solid #122842}
.onb-brand{display:flex; align-items:center; gap:11px; font-family:var(--font-poppins),sans-serif;
  font-weight:700; font-size:.98rem; color:#fff}
.onb-brand img{height:40px!important; width:auto!important; filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.onb-brand span{display:flex; flex-direction:column; line-height:1.15}
.onb-brand span span{font-family:var(--font-opensans),sans-serif; font-weight:500; font-size:.66rem;
  letter-spacing:.2em; text-transform:uppercase; color:var(--blue-300); margin-top:2px}
.onb-top-right{font-size:.88rem; color:var(--slate-400)}
.onb-top-right a{color:var(--blue-300); font-weight:600}
.onb-top-right a:hover{text-decoration:underline}

.onb-grid{max-width:1200px; margin:0 auto; padding:clamp(20px,3vw,40px) clamp(18px,4vw,40px) 80px;
  display:grid; grid-template-columns:1.15fr .85fr; gap:clamp(28px,4vw,56px); align-items:start}

.onb-head{margin-bottom:26px}
.onb-eyebrow{display:inline-flex; align-items:center; gap:9px; font-size:.74rem; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--blue-300); margin-bottom:14px}
.onb-pin{width:8px; height:8px; border-radius:50%; background:var(--blue-500);
  box-shadow:0 0 0 0 rgba(59,130,246,.6); animation:onbpulse 2.4s infinite}
@keyframes onbpulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)} 70%{box-shadow:0 0 0 9px rgba(59,130,246,0)} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
.onb-head h1{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:clamp(1.7rem,3.2vw,2.3rem);
  color:#fff; line-height:1.12; letter-spacing:-.01em}
.onb-head p{margin-top:12px; font-size:.98rem; line-height:1.6; color:#b7c8e2; max-width:520px}
.onb-head strong{color:var(--blue-300); font-weight:700}

.onb-form{display:flex; flex-direction:column; gap:22px}
.onb-sect{border:1px solid #16304f; border-radius:16px; padding:20px 20px 22px;
  background:linear-gradient(180deg,#0c1d35,#0a1a30)}
.onb-sect legend{display:flex; align-items:center; gap:10px; padding:0 8px; margin-left:-4px;
  font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1rem; color:#fff}
.onb-sect legend small{font-family:var(--font-opensans),sans-serif; font-weight:400; font-size:.76rem;
  color:var(--slate-400); letter-spacing:0; text-transform:none}
.onb-sect-no{display:inline-grid; place-items:center; width:24px; height:24px; border-radius:7px;
  background:rgba(59,130,246,.16); border:1px solid rgba(59,130,246,.32); color:var(--blue-300);
  font-size:.82rem; font-weight:700}
.onb-row2{display:grid; grid-template-columns:1fr 1fr; gap:14px}

.onb-field{display:flex; flex-direction:column; gap:6px; margin-top:14px}
.onb-field:first-of-type{margin-top:16px}
.onb-row2 .onb-field{margin-top:14px}
.onb-field label{display:flex; align-items:center; gap:7px; font-size:.82rem; font-weight:600; color:#c4d6f0}
.onb-req{color:#f87171}
.onb-hint{font-weight:400; font-size:.72rem; color:var(--slate-400); font-style:italic}
.onb-input{width:100%; height:44px; padding:0 13px; border:1.5px solid #1c3a5e; border-radius:10px;
  background:#08182e; color:#fff; font-size:.94rem; font-family:var(--font-opensans),sans-serif;
  transition:border-color .18s, box-shadow .18s}
textarea.onb-input{height:auto; padding:11px 13px; resize:vertical; line-height:1.5}
.onb-input::placeholder{color:#516a8a}
.onb-input:focus{outline:none; border-color:var(--blue-500); box-shadow:0 0 0 3.5px rgba(59,130,246,.16)}
.onb-input-err{border-color:#ef4444}
.onb-input-err:focus{box-shadow:0 0 0 3.5px rgba(239,68,68,.16)}
.onb-err{font-size:.78rem; color:#fca5a5; margin-top:1px}

/* dropzone logo */
.onb-drop{margin-top:16px; border:1.5px dashed #2a4d7a; border-radius:13px; padding:24px 18px;
  display:flex; flex-direction:column; align-items:center; gap:7px; text-align:center; cursor:pointer;
  color:var(--slate-400); background:#08182e; transition:border-color .18s, background .18s}
.onb-drop:hover{border-color:var(--blue-500); background:#0a1e38}
.onb-drop:focus-visible{outline:none; border-color:var(--blue-500); box-shadow:0 0 0 3.5px rgba(59,130,246,.16)}
.onb-drop-over{border-color:var(--blue-500); background:rgba(59,130,246,.1)}
.onb-drop-has{cursor:default; padding:16px}
.onb-drop-title{font-size:.9rem; font-weight:600; color:#cfe0f5}
.onb-drop-sub{font-size:.76rem; color:var(--slate-400)}
.onb-drop-preview{display:flex; align-items:center; gap:14px; width:100%}
.onb-drop-preview img{height:48px; width:auto; max-width:120px; object-fit:contain;
  background:#fff; border-radius:8px; padding:6px}
.onb-drop-name{display:block; font-size:.88rem; font-weight:600; color:#cfe0f5}
.onb-drop-remove{margin-top:3px; background:none; border:none; color:#f87171; font-size:.8rem;
  font-weight:600; cursor:pointer; padding:0; font-family:inherit}
.onb-drop-remove:hover{text-decoration:underline}

.onb-formmsg{font-size:.86rem; color:#fca5a5; background:rgba(239,68,68,.1);
  border:1px solid rgba(239,68,68,.3); padding:10px 13px; border-radius:9px}
.onb-submit{height:52px; border:none; border-radius:13px; color:#fff; font-weight:700; font-size:1.02rem;
  font-family:var(--font-opensans),sans-serif; cursor:pointer;
  background:linear-gradient(135deg,var(--blue-600),var(--blue-700));
  box-shadow:0 16px 30px -12px rgba(37,99,235,.8); transition:filter .2s, transform .08s;
  display:flex; align-items:center; justify-content:center; gap:10px}
.onb-submit:hover{filter:brightness(1.08)}
.onb-submit:active{transform:translateY(1px)}
.onb-submit:disabled{opacity:.7; cursor:not-allowed}
.onb-spinner{width:18px; height:18px; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff;
  border-radius:50%; animation:onbspin .7s linear infinite}
@keyframes onbspin{to{transform:rotate(360deg)}}
.onb-fineprint{text-align:center; font-size:.78rem; color:var(--slate-400); margin-top:-6px}

/* ===== PRATINJAU KOP ===== */
.onb-preview-sticky{position:sticky; top:24px}
.onb-preview-label{display:flex; align-items:center; gap:8px; font-size:.74rem; font-weight:700;
  letter-spacing:.12em; text-transform:uppercase; color:var(--blue-300); margin-bottom:14px}
.onb-paper{background:#fff; color:#0f172a; border-radius:14px; padding:26px 26px 22px;
  box-shadow:0 30px 70px -24px rgba(0,0,0,.65); border:1px solid rgba(255,255,255,.5)}
.onb-paper-head{display:flex; gap:16px; align-items:flex-start}
.onb-paper-logo{flex:0 0 auto; width:64px; height:64px; display:grid; place-items:center}
.onb-paper-logo img{max-width:64px; max-height:64px; object-fit:contain}
.onb-paper-logo-ph{width:60px; height:60px; border:1.5px dashed #cbd5e1; border-radius:8px;
  display:grid; place-items:center; font-size:.64rem; font-weight:700; letter-spacing:.1em; color:#94a3b8}
.onb-paper-co{min-width:0; flex:1}
.onb-paper-name{font-family:var(--font-poppins),sans-serif; font-weight:800; font-size:1.18rem;
  line-height:1.15; color:#0a2540; word-break:break-word}
.onb-paper-tag{font-size:.76rem; color:#2563EB; font-weight:600; margin-top:1px}
.onb-paper-line{font-size:.74rem; color:#475569; margin-top:5px; line-height:1.4}
.onb-paper-meta{display:flex; flex-wrap:wrap; gap:3px 12px; margin-top:5px; font-size:.7rem; color:#64748b}
.onb-paper .ph{opacity:.4; font-style:italic}
.onb-paper-rule{height:2.5px; background:linear-gradient(90deg,#0a2540,#2563EB 60%,#52DCC1);
  border-radius:2px; margin:14px 0}
.onb-paper-title{text-align:center; font-family:var(--font-poppins),sans-serif; font-weight:700;
  font-size:.82rem; letter-spacing:.06em; color:#0a2540}
.onb-paper-docno{text-align:center; font-size:.66rem; color:#94a3b8; margin-top:3px; letter-spacing:.04em}
.onb-ghost{display:flex; flex-direction:column; gap:8px; margin:16px 0}
.onb-ghost span{height:8px; border-radius:4px; background:#eef2f7}
.onb-paper-total{display:flex; align-items:center; justify-content:space-between; margin-top:6px;
  padding:9px 12px; background:#f1f5f9; border-radius:8px; font-size:.74rem; font-weight:700; color:#0a2540}
.onb-ghost-amt{width:74px; height:9px; border-radius:4px; background:#cbd5e1}
.onb-paper-foot{margin-top:16px; padding-top:12px; border-top:1px solid #e2e8f0;
  display:flex; flex-direction:column; gap:2px}
.onb-paper-foot-k{font-size:.64rem; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; font-weight:700}
.onb-paper-foot span:last-child{font-size:.74rem; color:#334155}
.onb-preview-note{margin-top:14px; font-size:.82rem; line-height:1.55; color:var(--slate-400)}

/* responsif */
@media(max-width:980px){
  .onb-grid{grid-template-columns:1fr; gap:24px}
  .onb-preview-col{order:-1}
  .onb-preview-sticky{position:static}
  .onb-paper{max-width:520px}
}
@media(max-width:560px){
  .onb-row2{grid-template-columns:1fr; gap:0}
}
`
