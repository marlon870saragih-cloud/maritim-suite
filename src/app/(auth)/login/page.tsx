'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useT, LangToggle } from '@/lib/i18n'

/**
 * Login gate — tema "Port Call Ledger" (kuningan + tinta + kertas). Sampul tinta gelap,
 * kartu login di atas kertas ivory, aksen kuningan. Statis (tanpa video) = ringan.
 * Bilingual ID/EN via i18n bersama. Autentikasi NextAuth (credentials).
 *
 * Form ber-method POST dan tombol Masuk nonaktif sampai komponen terhidrasi: submit native sebelum
 * hidrasi (klik/Enter) tidak boleh menaruh kredensial di URL (F-1). Sukses hanya bila signIn tidak
 * ditolak DAN sesi untuk akun yang sama terkonfirmasi (F-3): next-auth 4.24 mengembalikan penolakan
 * CSRF sebagai ok:true tanpa error (url …/api/auth/signin?csrf=true), jadi res.ok saja tidak cukup.
 *
 * Race login pertama: permintaan /api/auth/* yang dikirim TANPA cookie CSRF (mis. sesi awal SessionProvider, dua kali
 * di Strict Mode dev) menerbitkan cookie CSRF baru saat responsnya tiba. Bila tiba sesudah token diambil, token body ≠
 * cookie dan NextAuth menolak. Token baru diambil sesudah tidak ada permintaan /api/auth/* yang masih berjalan
 * (dilacak sejak efek halaman ini, yang berjalan sebelum efek SessionProvider induknya).
 *
 * Siklus percobaan: signIn() next-auth 4.24 tidak dapat dibatalkan (tanpa AbortSignal), jadi halaman ini menjalankan
 * langkah yang sama dengan signIn credentials 4.24 — GET /api/auth/providers, GET /api/auth/csrf, POST /api/auth/callback/credentials
 * (json=true), GET /api/auth/session — masing-masing dengan AbortSignal milik percobaan. Pembatalan (batas waktu,
 * meninggalkan halaman) diperiksa tepat sebelum callback dikirim, sehingga percobaan yang batal tidak pernah mengirim
 * callback. Bila callback SUDAH terkirim lalu dibatalkan, server mungkin tetap memprosesnya: status dilaporkan tidak
 * pasti, tanpa klaim berhasil/gagal. Sesudah sukses, halaman dimuat penuh (window.location) agar SessionProvider tab
 * ini membaca sesi baru — sinkronisasi tab yang sama hanya dilakukan oleh signIn().
 */
export default function LoginPage() {
  const t = useT(STR)

  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'err' | 'ok'; text: string } | null>(null)
  const [siap, setSiap] = useState(false)
  const aktif = useRef<AbortController | null>(null)
  const pindah = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const lepasPelacak = pasangPelacakAuth()
    setSiap(true)
    return () => {
      lepasPelacak()
      aktif.current?.abort()
      aktif.current = null
      if (pindah.current) clearTimeout(pindah.current)
    }
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
      setMsg({ type: 'err', text: t.errEmpty })
      return
    }
    if (aktif.current) return
    const ctrl = new AbortController()
    aktif.current = ctrl
    setLoading(true)
    setMsg(null)
    const jejak = { callbackTerkirim: false }
    const waktu = setTimeout(() => ctrl.abort(), BATAS_PERCOBAAN_MS)
    let hasil: HasilMasuk
    try {
      hasil = await masuk(email, password, ctrl.signal, jejak)
    } catch {
      // Sesudah callback terkirim, galat apa pun (batal, jaringan, verifikasi sesi) tidak memastikan hasil di server.
      hasil = jejak.callbackTerkirim ? 'tidakPasti' : 'jaringan'
    } finally {
      clearTimeout(waktu)
    }
    if (aktif.current !== ctrl) return // ditinggalkan (halaman dilepas): jangan tampilkan hasil atau pindah halaman
    if (hasil !== 'ok') {
      aktif.current = null
      setLoading(false)
      const teks = { cred: t.errCred, sesi: t.errSession, jaringan: t.errNetwork, tidakPasti: t.errUncertain }[hasil]
      setMsg({ type: 'err', text: teks })
      return
    }
    // Sukses: penjaga (aktif) dan tombol nonaktif DIPERTAHANKAN sampai halaman berganti, sehingga tidak ada percobaan
    // kedua selama jeda pengalihan. Cleanup unmount tetap membatalkan timer dan melepas penjaga.
    setMsg({ type: 'ok', text: t.okMsg })
    pindah.current = setTimeout(() => window.location.assign(safeNext()), 600)
  }

  return (
    <div className="lgn-root">
      <div className="lgn-depth" aria-hidden="true" />

      <nav className="lgn-nav">
        <div className="lgn-brand">
          <span className="lgn-mark">
            <Image src="/logo-transparent.png" alt="Logo PT Tribuana Solusi Maritim" width={120} height={120} priority />
          </span>
          <span className="lgn-name">
            PT Tribuana Solusi Maritim<span>Maritime Suite</span>
          </span>
        </div>
        <div className="lgn-navright">
          <a
            href="https://wa.me/6282154950193?text=Halo%20PT%20Tribuana%20Solusi%20Maritim%2C%20saya%20ingin%20bertanya%20tentang%20Maritime%20Suite."
            target="_blank"
            rel="noopener noreferrer"
            className="lgn-wa"
            aria-label={t.waAria}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.2-5.6A8.4 8.4 0 1 1 21 11.5z" />
              <path d="M8.5 8.8c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.2.4.6 1 1.1 1.4.6.5 1.1.7 1.4.8.2.1.4 0 .5-.1l.4-.5c.2-.2.3-.2.5-.1l1.3.7c.2.1.3.3.3.4 0 .4-.2 1-.5 1.2-.3.2-.9.5-1.4.5-1 0-2.5-.5-4-1.9s-2-3-2-4c0-.6.3-1.1.5-1.4z" />
            </svg>
            {t.waLabel}
          </a>
          <LangToggle tone="ink" />
        </div>
      </nav>

      <main className="lgn-wrap">
        {/* kiri: pitch + modul */}
        <section className="lgn-pitch">
          <p className="lgn-eyebrow">
            <span className="lgn-anchor" aria-hidden="true" /> {t.eyebrow}
          </p>
          <h1 className="lgn-h1">
            {t.h1pre}
            <span className="lgn-ital">{t.h1em}</span>
            {t.h1post}
          </h1>
          <p className="lgn-lead">{t.lead}</p>

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

        {/* kanan: KARTU LOGIN (kertas) */}
        <section className="lgn-card">
          <h2 className="lgn-card-title">{t.cardTitle}</h2>
          <p className="lgn-subtitle">{t.cardSub}</p>

          <form method="post" onSubmit={onSubmit} noValidate>
            {msg && (
              <div className={`lgn-msg ${msg.type}`} role="alert" aria-live="polite">
                {msg.text}
              </div>
            )}

            <div className="lgn-field">
              <label htmlFor="email">{t.emailLabel}</label>
              <div className="lgn-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                <input id="email" name="email" type="email" autoComplete="username" placeholder="nama@tribuanagency.co.id" required />
              </div>
            </div>

            <div className="lgn-field">
              <label htmlFor="password">{t.pwLabel}</label>
              <div className="lgn-input">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input id="password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" required />
                <button
                  type="button"
                  className="lgn-toggle"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? t.hidePw : t.showPw}
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
                <input type="checkbox" name="remember" /> {t.remember}
              </label>
              <Link href="/register">{t.noAccount}</Link>
            </div>

            <button type="submit" className="lgn-submit" disabled={!siap || loading}>
              {loading && <span className="lgn-spinner" aria-hidden="true" />}
              {loading ? t.submitting : t.submit}
            </button>

            <div className="lgn-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t.secure}
            </div>
          </form>

          <hr />
          <p className="lgn-contact">
            {t.noAccount} <Link href="/register">{t.registerCta}</Link>
          </p>
        </section>
      </main>

      <footer className="lgn-footer">
        <div>
          <div>© 2026 PT Tribuana Solusi Maritim · Maritime Suite</div>
          <div className="lgn-footer-contact">
            Jl. Abdul Azis Samad No. 59B, Samarinda · {t.phone}{' '}
            <a href="tel:05412226588">0541-2226588</a> · {t.mobile}{' '}
            <a href="tel:+6282154950193">0821-5495-0193</a> ·{' '}
            <a href="mailto:adm@tribuanagency.co.id">adm@tribuanagency.co.id</a>
          </div>
        </div>
        <div className="lgn-footer-links">
          <Link href="/register">{t.register}</Link>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  )
}

// ===== Modul aplikasi (kolom kiri) — nama/teknis tetap dwibahasa-netral =====
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

const BATAS_TENANG_MS = 20_000
const BATAS_PERCOBAAN_MS = 30_000
const API_AUTH = '/api/auth'

/** Jumlah permintaan /api/auth/* yang sedang berjalan di halaman login, dan pendengar saat jumlahnya berubah. */
let authBerjalan = 0
const pendengarAuth = new Set<() => void>()

/** Bungkus window.fetch selama halaman login terpasang untuk menghitung permintaan /api/auth/* yang berjalan. */
function pasangPelacakAuth(): () => void {
  const asli = window.fetch
  const dilacak: typeof window.fetch = (input, init) => {
    let jalur = ''
    try {
      jalur = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href).pathname
    } catch {}
    if (!jalur.startsWith(`${API_AUTH}/`)) return asli.call(window, input, init)
    authBerjalan++
    const selesai = () => {
      authBerjalan--
      pendengarAuth.forEach((f) => f())
    }
    try {
      return asli.call(window, input, init).finally(selesai)
    } catch (e) {
      selesai()
      throw e
    }
  }
  window.fetch = dilacak
  return () => {
    if (window.fetch === dilacak) window.fetch = asli
  }
}

/** true bila tidak ada permintaan /api/auth/* yang berjalan, false bila batas waktu lewat; ditolak bila dibatalkan. */
function tungguAuthTenang(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.reject(new DOMException('dibatalkan', 'AbortError'))
  if (authBerjalan === 0) return Promise.resolve(true)
  return new Promise((selesai, batal) => {
    const lepas = () => {
      clearTimeout(waktu)
      pendengarAuth.delete(cek)
      signal.removeEventListener('abort', dibatalkan)
    }
    const cek = () => {
      if (authBerjalan !== 0) return
      lepas()
      selesai(true)
    }
    const dibatalkan = () => {
      lepas()
      batal(new DOMException('dibatalkan', 'AbortError'))
    }
    const waktu = setTimeout(() => {
      lepas()
      selesai(false)
    }, ms)
    pendengarAuth.add(cek)
    signal.addEventListener('abort', dibatalkan)
  })
}

type HasilMasuk = 'ok' | 'cred' | 'sesi' | 'jaringan' | 'tidakPasti'

async function ambilJson(jalur: string, signal: AbortSignal, init: RequestInit = {}): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${API_AUTH}${jalur}`, { ...init, signal })
  return { ok: res.ok, data: await res.json() }
}

/**
 * Login credentials dengan langkah yang sama seperti signIn() next-auth 4.24, tetapi dapat dibatalkan, lalu verifikasi
 * sesi akun yang sama (F-3). Melempar AbortError bila dibatalkan; jejak.callbackTerkirim menandai bahwa POST callback
 * sudah dikirim sehingga hasil server tidak dapat dipastikan dari sisi klien.
 */
async function masuk(email: string, password: string, signal: AbortSignal, jejak: { callbackTerkirim: boolean }): Promise<HasilMasuk> {
  if (!(await tungguAuthTenang(BATAS_TENANG_MS, signal))) return 'sesi'
  const penyedia = await ambilJson('/providers', signal)
  if (!penyedia.ok || !(penyedia.data as Record<string, unknown> | null)?.credentials) return 'sesi'
  const csrf = await ambilJson('/csrf', signal)
  const csrfToken = (csrf.data as { csrfToken?: unknown } | null)?.csrfToken
  if (!csrf.ok || typeof csrfToken !== 'string' || !csrfToken) return 'sesi'
  if (signal.aborted) throw new DOMException('dibatalkan', 'AbortError') // percobaan yang sudah batal TIDAK mengirim callback
  jejak.callbackTerkirim = true
  const cb = await ambilJson('/callback/credentials', signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: window.location.href, json: 'true' }),
  })
  // Sesudah callback terkirim, hanya penolakan EKSPLISIT yang memberi hasil pasti: URL error (sandi salah) atau URL
  // penolakan NextAuth (CSRF/signin/error). Respons yang gagal atau tidak dapat diverifikasi (HTTP galat, tanpa url)
  // tidak membuktikan server menolak — sesi mungkin sudah dibuat — jadi statusnya tidak pasti.
  const url = (cb.data as { url?: unknown } | null)?.url
  const urlSah = typeof url === 'string' && url !== '' && urlTerurai(url)
  if (urlSah && urlPunyaError(url)) return 'cred'
  if (urlSah && !urlBukanPenolakan(url)) return 'sesi'
  if (!cb.ok || !urlSah) return 'tidakPasti'
  const sesi = await ambilJson('/session', signal)
  if (!sesi.ok) return 'tidakPasti'
  const sesiEmail = (sesi.data as { user?: { email?: unknown } } | null)?.user?.email
  // Respons sesi yang sah tetapi tanpa akun ini (kosong atau akun lain) = sesi akun ini memang tidak ada (F-3).
  return typeof sesiEmail === 'string' && sesiMilik(sesiEmail, email) ? 'ok' : 'sesi'
}

/** URL dapat diurai relatif terhadap origin halaman. */
function urlTerurai(url: string): boolean {
  try {
    new URL(url, window.location.origin)
    return true
  } catch {
    return false
  }
}

/** URL respons callback memuat parameter error (mis. CredentialsSignin) — padanan res.error pada signIn(). */
function urlPunyaError(url: string): boolean {
  try {
    return new URL(url, window.location.origin).searchParams.has('error')
  } catch {
    return false
  }
}

/** URL hasil signIn bukan penolakan: ada, terurai, bukan halaman signin/error NextAuth, tanpa penanda error/csrf. */
function urlBukanPenolakan(url: string | null | undefined): boolean {
  if (!url) return false
  let u: URL
  try {
    u = new URL(url, window.location.origin)
  } catch {
    return false
  }
  if (u.searchParams.has('error') || u.searchParams.has('csrf')) return false
  return !u.pathname.startsWith('/api/auth/signin') && !u.pathname.startsWith('/api/auth/error')
}

/** Sesi terkonfirmasi untuk akun yang baru masuk (bukan sesi lama milik akun lain). */
function sesiMilik(sesiEmail: string | null | undefined, email: string): boolean {
  return !!sesiEmail && sesiEmail.trim().toLowerCase() === email.trim().toLowerCase()
}

// ===== Konten bilingual =====
const STR = {
  id: {
    waLabel: 'Hubungi Kami', waAria: 'Hubungi kami via WhatsApp 0821-5495-0193',
    eyebrow: 'Portal operasi · Akses terbatas',
    h1pre: 'Satu portal untuk ', h1em: 'dokumen & keuangan', h1post: ' keagenan kapal Anda.',
    lead: 'Masuk untuk mengelola port call, dokumen clearance, EPDA/FPDA, hingga invoice dalam satu dashboard terpusat.',
    cardTitle: 'Masuk ke dashboard', cardSub: 'Gunakan akun yang diberikan perusahaan untuk melanjutkan.',
    emailLabel: 'Email', pwLabel: 'Kata sandi',
    showPw: 'Tampilkan kata sandi', hidePw: 'Sembunyikan kata sandi',
    remember: 'Ingat saya', noAccount: 'Belum punya akun?',
    submit: 'Masuk', submitting: 'Memverifikasi…',
    secure: 'Koneksi aman & terenkripsi', registerCta: 'Daftar di sini', register: 'Daftar',
    errEmpty: 'Mohon isi email dan kata sandi.', errCred: 'Email atau kata sandi salah.',
    okMsg: 'Berhasil masuk. Mengarahkan ke dashboard…',
    errSession: 'Gagal masuk: sesi tidak dapat dibuat. Muat ulang halaman lalu coba lagi.',
    errNetwork: 'Gagal menghubungi server. Periksa koneksi lalu coba lagi.',
    errUncertain: 'Status masuk tidak dapat dipastikan karena koneksi terputus. Muat ulang halaman untuk memeriksa sebelum mencoba lagi.',
    phone: 'Telp', mobile: 'HP',
  },
  en: {
    waLabel: 'Contact us', waAria: 'Contact us via WhatsApp 0821-5495-0193',
    eyebrow: 'Operations portal · Restricted access',
    h1pre: 'One portal for your agency’s ', h1em: 'documents & finance', h1post: '.',
    lead: 'Sign in to manage port calls, clearance documents, EPDA/FPDA, through to invoices in one central dashboard.',
    cardTitle: 'Sign in to dashboard', cardSub: 'Use the account your company provided to continue.',
    emailLabel: 'Email', pwLabel: 'Password',
    showPw: 'Show password', hidePw: 'Hide password',
    remember: 'Remember me', noAccount: 'No account yet?',
    submit: 'Sign in', submitting: 'Verifying…',
    secure: 'Secure, encrypted connection', registerCta: 'Register here', register: 'Register',
    errEmpty: 'Please enter your email and password.', errCred: 'Incorrect email or password.',
    okMsg: 'Signed in. Redirecting to dashboard…',
    errSession: 'Sign-in failed: the session could not be established. Reload the page and try again.',
    errNetwork: 'Could not reach the server. Check your connection and try again.',
    errUncertain: 'Sign-in status could not be confirmed because the connection was interrupted. Reload the page to check before trying again.',
    phone: 'Tel', mobile: 'Mobile',
  },
}

// ===== CSS (prefix .lgn-, tema kuningan via token --ms-*) =====
const CSS = `
.lgn-root{
  --ink:var(--ms-ink); --chart:var(--ms-chart); --chart-line:var(--ms-chart-line); --chart-ink:var(--ms-chart-ink); --chart-mut:var(--ms-chart-mut);
  --brass:var(--ms-brass); --brass-2:var(--ms-brass-2); --brass-deep:var(--ms-brass-deep); --signal:var(--ms-signal);
  --maxw:1180px;
  position:fixed; inset:0; overflow-y:auto; z-index:0;
  font-family:var(--font-body),system-ui,sans-serif; color:#DCE6E6; background:var(--ink); -webkit-font-smoothing:antialiased;
}
.lgn-root *{box-sizing:border-box}
.lgn-root a{color:inherit; text-decoration:none}
.lgn-root a:focus-visible, .lgn-root button:focus-visible{outline:2px solid var(--brass); outline-offset:3px; border-radius:4px}

.lgn-depth{position:fixed; inset:0; z-index:0; pointer-events:none; opacity:.5;
  background:
    repeating-radial-gradient(circle at 92% 8%, rgba(60,107,122,.16) 0 1px, transparent 1px 52px),
    radial-gradient(120% 90% at 88% -10%, rgba(60,107,122,.14), transparent 55%);
}

.lgn-nav{position:relative; z-index:2; max-width:var(--maxw); margin:0 auto;
  display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px clamp(18px,4vw,40px)}
.lgn-brand{display:flex; align-items:center; gap:12px}
.lgn-mark img{height:44px!important; width:auto!important; display:block}
.lgn-name{font-family:var(--font-poppins),sans-serif; font-weight:700; font-size:1rem; line-height:1.1; color:#F4F0E6}
.lgn-name span{display:block; font-family:var(--font-mono),monospace; font-weight:400; font-size:.62rem;
  letter-spacing:.26em; text-transform:uppercase; color:var(--brass); margin-top:3px}
.lgn-navright{display:flex; align-items:center; gap:16px; font-size:.9rem; color:#b9cccf}
.lgn-wa{display:inline-flex; align-items:center; gap:8px; transition:color .2s}
.lgn-wa:hover{color:#fff}

.lgn-wrap{position:relative; z-index:2; max-width:var(--maxw); margin:0 auto;
  padding:clamp(8px,2vh,28px) clamp(18px,4vw,40px) 90px;
  min-height:calc(100svh - 84px);
  display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(28px,5vw,72px); align-items:center}

.lgn-pitch{max-width:520px}
.lgn-eyebrow{display:inline-flex; align-items:center; gap:10px; font-family:var(--font-mono),monospace;
  font-size:.72rem; letter-spacing:.2em; text-transform:uppercase; color:var(--brass); margin:0 0 20px}
.lgn-anchor{width:9px; height:9px; flex:0 0 auto; transform:rotate(45deg); background:var(--brass)}
.lgn-h1{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:clamp(2rem,4.4vw,3.2rem);
  line-height:1.06; letter-spacing:-.005em; color:#F4F0E6; margin:0}
.lgn-ital{font-style:italic; color:var(--brass)}
.lgn-lead{margin:18px 0 0; font-size:clamp(1rem,1.3vw,1.1rem); line-height:1.6; color:#bcd0d2; max-width:460px}

.lgn-services{margin-top:30px; display:grid; grid-template-columns:1fr 1fr; gap:12px}
.lgn-svc{display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:11px;
  background:rgba(199,154,62,.07); border:1px solid rgba(143,166,171,.2); transition:border-color .2s, transform .2s}
.lgn-svc:hover{border-color:rgba(199,154,62,.5); transform:translateY(-2px)}
.lgn-ic{width:34px; height:34px; flex:0 0 auto; border-radius:9px; display:grid; place-items:center;
  background:rgba(199,154,62,.16); color:var(--brass)}
.lgn-ic svg{width:19px; height:19px}
.lgn-svc span{font-size:.92rem; font-weight:600; line-height:1.2; color:#e7eeef}
.lgn-svc small{display:block; font-weight:400; font-family:var(--font-mono),monospace; font-size:.68rem; color:#8fa6ab; margin-top:3px}

/* ----- KARTU LOGIN (kertas ivory) ----- */
.lgn-card{position:relative; background:var(--chart); color:var(--chart-ink); border-radius:8px;
  padding:clamp(26px,3vw,38px); width:100%; max-width:430px; justify-self:end;
  box-shadow:0 40px 80px -30px rgba(0,0,0,.7); border:1px solid #cdbf98;
  background-image:linear-gradient(var(--chart-line) 1px, transparent 1px); background-size:100% 32px}
.lgn-card::before{content:""; position:absolute; left:0; top:0; bottom:0; width:5px; border-radius:8px 0 0 8px; background:var(--brass)}
.lgn-card-title{font-family:var(--font-display),Georgia,serif; font-weight:400; font-size:1.7rem; color:#16201f; margin:0}
.lgn-subtitle{margin-top:5px; color:#4b554f; font-size:.92rem}
.lgn-card form{margin-top:22px; display:flex; flex-direction:column; gap:17px}
.lgn-field{display:flex; flex-direction:column; gap:7px}
.lgn-field label{font-size:.78rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--chart-mut); font-family:var(--font-mono),monospace}
.lgn-input{position:relative; display:flex; align-items:center}
.lgn-input > svg{position:absolute; left:13px; width:18px; height:18px; color:#a59a78; pointer-events:none}
.lgn-input input{width:100%; height:48px; padding:0 44px; border:1.5px solid #d8cca6; border-radius:9px;
  font-size:.96rem; color:#16201f; background:#fffdf6; transition:border-color .2s, box-shadow .2s; font-family:var(--font-body),sans-serif}
.lgn-input input::placeholder{color:#a59a78}
.lgn-input input:focus{outline:none; border-color:var(--brass); box-shadow:0 0 0 4px rgba(199,154,62,.18)}
.lgn-toggle{position:absolute; right:8px; width:34px; height:34px; border:none; background:transparent;
  border-radius:8px; display:grid; place-items:center; color:#a59a78; cursor:pointer}
.lgn-toggle:hover{color:var(--brass-deep); background:rgba(199,154,62,.12)}
.lgn-row{display:flex; align-items:center; justify-content:space-between; font-size:.86rem; margin-top:-3px}
.lgn-remember{display:flex; align-items:center; gap:8px; color:#4b554f; cursor:pointer; user-select:none}
.lgn-remember input{width:16px; height:16px; accent-color:var(--brass-2); cursor:pointer}
.lgn-row a{color:var(--brass-deep); font-weight:600}
.lgn-row a:hover{text-decoration:underline}
.lgn-submit{height:50px; border:none; border-radius:11px; color:#231a06; font-weight:700; font-size:1rem;
  background:var(--brass); cursor:pointer; box-shadow:0 14px 30px -14px rgba(199,154,62,.6);
  transition:background .2s, transform .08s; display:flex; align-items:center; justify-content:center; gap:9px; font-family:var(--font-body),sans-serif}
.lgn-submit:hover{background:#d6a945}
.lgn-submit:active{transform:translateY(1px)}
.lgn-submit:disabled{opacity:.7; cursor:not-allowed}
.lgn-spinner{width:18px; height:18px; border:2.5px solid rgba(35,26,6,.3); border-top-color:#231a06;
  border-radius:50%; animation:lgnspin .7s linear infinite}
@keyframes lgnspin{to{transform:rotate(360deg)}}
.lgn-msg{font-size:.86rem; padding:10px 12px; border-radius:8px}
.lgn-msg.err{background:rgba(192,67,46,.1); color:#9a2f1e; border:1px solid rgba(192,67,46,.35)}
.lgn-msg.ok{background:rgba(29,79,74,.1); color:#1d4f4a; border:1px solid rgba(29,79,74,.32)}
.lgn-secure{display:flex; align-items:center; gap:7px; justify-content:center; margin-top:2px;
  font-size:.76rem; color:var(--chart-mut)}
.lgn-secure svg{width:14px; height:14px}
.lgn-card hr{border:none; border-top:1px solid #d8cca6; margin:22px 0 14px}
.lgn-contact{text-align:center; font-size:.88rem; color:#4b554f}
.lgn-contact a{color:var(--brass-deep); font-weight:600}
.lgn-contact a:hover{text-decoration:underline}

.lgn-footer{position:relative; z-index:2; max-width:var(--maxw); margin:0 auto;
  padding:18px clamp(18px,4vw,40px) 26px; display:flex; flex-wrap:wrap; gap:8px 22px;
  justify-content:space-between; align-items:center; font-size:.8rem; color:#8fa6ab}
.lgn-footer-contact{margin-top:5px; font-size:.74rem; color:#7d9498}
.lgn-footer-contact a{color:#b9cccf; font-weight:600}
.lgn-footer-contact a:hover{color:#fff}
.lgn-footer-links{display:flex; gap:18px}
.lgn-footer-links a{color:var(--brass)}
.lgn-footer-links a:hover{color:#d6a945}

@media(max-width:900px){
  .lgn-wrap{grid-template-columns:1fr; gap:24px; padding-bottom:40px; align-content:start; padding-top:8px}
  .lgn-card{justify-self:stretch; max-width:none; margin:0 auto; width:100%}
  .lgn-pitch{max-width:none}
}
@media(max-width:520px){
  .lgn-services{grid-template-columns:1fr}
  .lgn-name{font-size:.92rem}
}
@media(prefers-reduced-motion:reduce){
  .lgn-root *,.lgn-root *::before,.lgn-root *::after{transition:none!important; animation:none!important}
}
`
