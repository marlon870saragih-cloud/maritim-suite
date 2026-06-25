'use client'

import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signIn } from 'next-auth/react'

/**
 * Login gate — desain & branding mengikuti website TSM (tribuanagency.com):
 * video latar maritim, font Poppins + Open Sans, kartu login putih, kontak perusahaan.
 * Autentikasi memakai NextAuth (credentials), bukan Supabase.
 * Video: klip 1:00–1:08 dari laode2.mp4 → public/login-bg.mp4 (loop).
 */
export default function LoginPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'err' | 'ok'; text: string } | null>(null)

  // Autoplay video (muted) + hormati prefers-reduced-motion (pakai poster diam).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      v.removeAttribute('autoplay')
      try {
        v.pause()
      } catch {}
      return
    }
    v.muted = true
    const tryPlay = () => {
      const p = v.play()
      if (p && p.catch) p.catch(() => {})
    }
    tryPlay()
    const onVis = () => {
      if (!document.hidden) tryPlay()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  function safeNext(): string {
    const n = new URLSearchParams(window.location.search).get('next')
    if (n && /^\/[\w\-./?=&]*$/.test(n) && !n.startsWith('//')) return n
    return '/dokumen'
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    if (!email || !password) {
      setMsg({ type: 'err', text: 'Mohon isi email dan password.' })
      return
    }
    setLoading(true)
    setMsg(null)
    const res = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setMsg({ type: 'err', text: 'Email atau kata sandi salah.' })
      return
    }
    setMsg({ type: 'ok', text: 'Berhasil masuk. Mengarahkan ke dashboard…' })
    setTimeout(() => {
      router.push(safeNext())
      router.refresh()
    }, 600)
  }

  return (
    <div className="lgn-root">
      {/* ====== VIDEO LATAR ====== */}
      <div className="lgn-bg">
        <video
          ref={videoRef}
          poster="/login-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src="/login-bg.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="lgn-scrim" aria-hidden="true" />

      {/* ====== NAV ====== */}
      <nav className="lgn-nav">
        <div className="lgn-brand">
          <span className="lgn-mark">
            <Image
              src="/logo-transparent.png"
              alt="Logo PT Tribuana Solusi Maritim"
              width={120}
              height={120}
              priority
            />
          </span>
          <span className="lgn-name">
            PT Tribuana Solusi Maritim
            <span>Maritime Suite</span>
          </span>
        </div>
        <div className="lgn-navright">
          <a
            href="https://wa.me/6282154950193?text=Halo%20PT%20Tribuana%20Solusi%20Maritim%2C%20saya%20ingin%20bertanya%20tentang%20Maritime%20Suite."
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Hubungi kami via WhatsApp 0821-5495-0193"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5z" />
              <path d="M8.5 8.8c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.2.4.6 1 1.1 1.4.6.5 1.1.7 1.4.8.2.1.4 0 .5-.1l.4-.5c.2-.2.3-.2.5-.1l1.3.7c.2.1.3.3.3.4 0 .4-.2 1-.5 1.2-.3.2-.9.5-1.4.5-1 0-2.5-.5-4-1.9s-2-3-2-4c0-.6.3-1.1.5-1.4z" />
            </svg>
            Hubungi Kami
          </a>
        </div>
      </nav>

      {/* ====== KONTEN UTAMA ====== */}
      <main className="lgn-wrap">
        {/* kiri: pitch + modul aplikasi */}
        <section className="lgn-pitch">
          <div className="lgn-eyebrow">
            <span className="lgn-pin" aria-hidden="true" /> Portal Operasi · Akses Terbatas
          </div>
          <h1>
            Satu portal untuk <b>dokumen &amp; keuangan</b> keagenan kapal Anda.
          </h1>
          <p className="lgn-lead">
            Masuk untuk mengelola port call, dokumen clearance, EPDA/FPDA, hingga invoice
            dalam satu dashboard terpusat.
          </p>

          <div className="lgn-services">
            {MODULES.map((m) => (
              <div className="lgn-svc" key={m.title}>
                <div className="lgn-ic" aria-hidden="true">
                  {m.icon}
                </div>
                <span>
                  {m.title}
                  <small>{m.desc}</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* kanan: KARTU LOGIN */}
        <section className="lgn-card">
          <h2>Masuk ke Dashboard</h2>
          <p className="lgn-subtitle">Gunakan akun yang diberikan perusahaan untuk melanjutkan.</p>

          <form onSubmit={onSubmit} noValidate>
            {msg && (
              <div className={`lgn-msg ${msg.type}`} role="alert" aria-live="polite">
                {msg.text}
              </div>
            )}

            <div className="lgn-field">
              <label htmlFor="email">Email</label>
              <div className="lgn-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="nama@tribuanagency.co.id"
                  required
                />
              </div>
            </div>

            <div className="lgn-field">
              <label htmlFor="password">Password</label>
              <div className="lgn-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="lgn-toggle"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPw}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c6.5 0 10 7 10 7a14 14 0 0 1-2.3 3M6.6 6.6A14 14 0 0 0 2 11s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1M3 3l18 18M9.5 9.5a3 3 0 0 0 4.2 4.2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="lgn-row">
              <label className="lgn-remember">
                <input type="checkbox" name="remember" /> Ingat saya
              </label>
              <Link href="/register">Belum punya akun?</Link>
            </div>

            <button type="submit" className="lgn-submit" disabled={loading}>
              {loading && <span className="lgn-spinner" aria-hidden="true" />}
              {loading ? 'Memverifikasi…' : 'Masuk'}
            </button>

            <div className="lgn-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Koneksi aman &amp; terenkripsi
            </div>
          </form>

          <hr />
          <p className="lgn-contact">
            Belum punya akun?{' '}
            <Link href="/register">Daftar di sini</Link>
          </p>
        </section>
      </main>

      {/* ====== FOOTER ====== */}
      <footer className="lgn-footer">
        <div>
          <div>© 2026 PT Tribuana Solusi Maritim · Maritime Suite</div>
          <div className="lgn-footer-contact">
            Jl. Abdul Azis Samad No. 59B, Samarinda · Telp{' '}
            <a href="tel:05412226588">0541-2226588</a> · HP{' '}
            <a href="tel:+6282154950193">0821-5495-0193</a> ·{' '}
            <a href="mailto:adm@tribuanagency.co.id">adm@tribuanagency.co.id</a>
          </div>
        </div>
        <div className="lgn-footer-links">
          <Link href="/register">Daftar</Link>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

// ===== Modul aplikasi (kolom kiri) =====
const MODULES = [
  {
    title: 'Finance Generator',
    desc: 'EPDA · FPDA · Invoice',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    title: 'Maritime Dokumen',
    desc: 'FAL · SOF · NOR · Clearance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    title: 'Port Call Manager',
    desc: 'Status · Timeline · Task',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v7M5 12l-2 1 1 5a8 8 0 0 0 16 0l1-5-2-1M12 9l7 3M12 9l-7 3" />
        <circle cx="12" cy="5" r="2" />
      </svg>
    ),
  },
  {
    title: 'DA & Invoice Tracker',
    desc: 'Outstanding · Aging',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18M7 14l4-4 3 3 5-6" />
      </svg>
    ),
  },
]

// ===== CSS (port dari website TSM, prefix .lgn- agar tidak bocor ke app) =====
const CSS = `
.lgn-root{
  --navy-900:#08182e; --navy-800:#0a2540;
  --blue-700:#1E40AF; --blue-600:#2563EB; --blue-500:#3B82F6; --blue-300:#93C5FD;
  --ink:#0F172A; --slate-600:#475569; --slate-400:#94A3B8; --slate-200:#E2E8F0;
  --white:#fff; --maxw:1180px;
  position:fixed; inset:0; overflow-y:auto; z-index:0;
  font-family:var(--font-opensans),system-ui,sans-serif; color:var(--white);
  background:var(--navy-900); -webkit-font-smoothing:antialiased;
}
.lgn-root *{box-sizing:border-box}
.lgn-root a{color:inherit; text-decoration:none}

.lgn-bg{position:fixed; inset:0; z-index:0; overflow:hidden; background:var(--navy-900)}
.lgn-bg video{position:absolute; inset:0; width:100%; height:100%; object-fit:cover}
.lgn-scrim{position:fixed; inset:0; z-index:1; pointer-events:none;
  background:
    linear-gradient(105deg, rgba(8,24,46,.94) 0%, rgba(8,24,46,.72) 38%, rgba(8,24,46,.32) 66%, rgba(8,24,46,.58) 100%),
    linear-gradient(180deg, rgba(8,24,46,.55) 0%, transparent 24%, transparent 68%, rgba(8,24,46,.82) 100%);
}

.lgn-nav{position:relative; z-index:20; max-width:var(--maxw); margin:0 auto;
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding:20px clamp(18px,4vw,36px)}
.lgn-brand{display:flex; align-items:center; gap:12px}
.lgn-mark{display:inline-flex; align-items:center}
.lgn-mark img{height:46px!important; width:auto!important; display:block; filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.lgn-name{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.02rem; line-height:1.1; letter-spacing:.01em}
.lgn-name span{display:block; font-family:var(--font-opensans),sans-serif; font-weight:500; font-size:.7rem;
  letter-spacing:.22em; text-transform:uppercase; color:var(--blue-300); margin-top:2px}
.lgn-navright{display:flex; align-items:center; gap:20px; font-size:.9rem; color:#cfe0f5}
.lgn-navright a{display:inline-flex; align-items:center; gap:8px; transition:color .2s}
.lgn-navright a:hover{color:#fff}

.lgn-wrap{position:relative; z-index:2; max-width:var(--maxw); margin:0 auto;
  padding:clamp(8px,2vh,28px) clamp(18px,4vw,36px) 90px;
  min-height:calc(100svh - 84px);
  display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(28px,5vw,72px); align-items:center}

.lgn-pitch{max-width:520px}
.lgn-eyebrow{display:inline-flex; align-items:center; gap:9px; font-size:.78rem; font-weight:600;
  letter-spacing:.16em; text-transform:uppercase; color:var(--blue-300); margin-bottom:18px}
.lgn-pin{width:8px; height:8px; border-radius:50%; background:var(--blue-500);
  box-shadow:0 0 0 0 rgba(59,130,246,.6); animation:lgnpulse 2.4s infinite}
@keyframes lgnpulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)} 70%{box-shadow:0 0 0 10px rgba(59,130,246,0)} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
.lgn-pitch h1{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:clamp(2rem,4.4vw,3.1rem);
  line-height:1.08; letter-spacing:-.01em; text-shadow:0 2px 24px rgba(4,16,32,.5); color:#fff}
.lgn-pitch h1 b{color:var(--blue-300); font-weight:700}
.lgn-lead{margin-top:16px; font-size:clamp(1rem,1.4vw,1.1rem); line-height:1.6; color:#dbe7f7; max-width:460px}

.lgn-services{margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:12px}
.lgn-svc{display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:12px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); backdrop-filter:blur(6px);
  transition:background .2s, border-color .2s, transform .2s}
.lgn-svc:hover{background:rgba(255,255,255,.14); border-color:rgba(147,197,253,.5); transform:translateY(-2px)}
.lgn-ic{width:34px; height:34px; flex:0 0 auto; border-radius:9px; display:grid; place-items:center;
  background:rgba(59,130,246,.22); color:var(--blue-300)}
.lgn-ic svg{width:19px; height:19px}
.lgn-svc span{font-size:.92rem; font-weight:600; line-height:1.2; color:#eaf2fd}
.lgn-svc small{display:block; font-weight:400; font-size:.74rem; color:var(--slate-400); margin-top:2px}

.lgn-card{background:rgba(255,255,255,.97); color:var(--ink); border-radius:20px;
  padding:clamp(26px,3vw,38px); width:100%; max-width:430px; justify-self:end;
  box-shadow:0 30px 70px -25px rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.6)}
.lgn-card h2{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1.6rem; color:var(--ink)}
.lgn-subtitle{margin-top:6px; color:var(--slate-600); font-size:.93rem}
.lgn-card form{margin-top:24px; display:flex; flex-direction:column; gap:18px}
.lgn-field{display:flex; flex-direction:column; gap:7px}
.lgn-field label{font-size:.84rem; font-weight:600; color:#334155}
.lgn-input{position:relative; display:flex; align-items:center}
.lgn-input > svg{position:absolute; left:13px; width:18px; height:18px; color:var(--slate-400); pointer-events:none}
.lgn-input input{width:100%; height:48px; padding:0 44px; border:1.5px solid var(--slate-200); border-radius:11px;
  font-size:.96rem; color:var(--ink); background:#fff; transition:border-color .2s, box-shadow .2s;
  font-family:var(--font-opensans),sans-serif}
.lgn-input input::placeholder{color:#aab4c2}
.lgn-input input:focus{outline:none; border-color:var(--blue-500); box-shadow:0 0 0 4px rgba(59,130,246,.16)}
.lgn-toggle{position:absolute; right:8px; width:34px; height:34px; border:none; background:transparent;
  border-radius:8px; display:grid; place-items:center; color:var(--slate-400); cursor:pointer}
.lgn-toggle:hover{color:var(--slate-600); background:#f1f5f9}
.lgn-row{display:flex; align-items:center; justify-content:space-between; font-size:.86rem; margin-top:-4px}
.lgn-remember{display:flex; align-items:center; gap:8px; color:#475569; cursor:pointer; user-select:none}
.lgn-remember input{width:17px; height:17px; accent-color:var(--blue-600); cursor:pointer}
.lgn-row a{color:var(--blue-700); font-weight:600}
.lgn-row a:hover{text-decoration:underline}
.lgn-submit{height:50px; border:none; border-radius:12px; color:#fff; font-weight:700; font-size:1rem;
  background:linear-gradient(135deg,var(--blue-600),var(--blue-700)); cursor:pointer;
  box-shadow:0 12px 26px -10px rgba(37,99,235,.7); transition:filter .2s, transform .08s;
  display:flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-opensans),sans-serif}
.lgn-submit:hover{filter:brightness(1.07)}
.lgn-submit:active{transform:translateY(1px)}
.lgn-submit:disabled{opacity:.7; cursor:not-allowed}
.lgn-spinner{width:18px; height:18px; border:2.5px solid rgba(255,255,255,.4); border-top-color:#fff;
  border-radius:50%; animation:lgnspin .7s linear infinite}
@keyframes lgnspin{to{transform:rotate(360deg)}}
.lgn-msg{font-size:.86rem; padding:10px 12px; border-radius:9px}
.lgn-msg.err{background:#fef2f2; color:#b91c1c; border:1px solid #fecaca}
.lgn-msg.ok{background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0}
.lgn-secure{display:flex; align-items:center; gap:7px; justify-content:center; margin-top:4px;
  font-size:.78rem; color:var(--slate-400)}
.lgn-secure svg{width:14px; height:14px}
.lgn-card hr{border:none; border-top:1px solid var(--slate-200); margin:22px 0 16px}
.lgn-contact{text-align:center; font-size:.88rem; color:var(--slate-600)}
.lgn-contact a{color:var(--blue-700); font-weight:600}
.lgn-contact a:hover{text-decoration:underline}

.lgn-footer{position:relative; z-index:2; max-width:var(--maxw); margin:0 auto;
  padding:18px clamp(18px,4vw,36px) 26px; display:flex; flex-wrap:wrap; gap:8px 22px;
  justify-content:space-between; align-items:center; font-size:.8rem; color:#9fb2cc}
.lgn-footer-contact{margin-top:5px; font-size:.76rem; color:#7e93b0}
.lgn-footer-contact a{color:#9fb2cc; font-weight:600}
.lgn-footer-contact a:hover{color:#fff}
.lgn-footer-links{display:flex; gap:18px}
.lgn-footer-links a:hover{color:#fff}

@media(max-width:900px){
  .lgn-wrap{grid-template-columns:1fr; gap:24px; padding-bottom:40px; align-content:start; padding-top:8px}
  .lgn-card{justify-self:stretch; max-width:none; margin:0 auto; width:100%}
  .lgn-pitch{max-width:none}
  .lgn-pitch h1{font-size:clamp(1.7rem,7vw,2.3rem)}
}
@media(max-width:520px){
  .lgn-services{grid-template-columns:1fr}
  .lgn-name{font-size:.92rem}
}
@media(max-height:720px) and (min-width:901px){ .lgn-wrap{align-items:start; padding-top:6px} }
@media(prefers-reduced-motion:reduce){
  .lgn-pin{animation:none}
  .lgn-spinner{animation:none}
}
`
