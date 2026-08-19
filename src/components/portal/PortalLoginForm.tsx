'use client'

// Form masuk portal bersama — dipakai APA ADANYA oleh /portal/login (generik,
// K144/K149) dan /portal/[slug]/login (ber-merek tenant, K182). Logika login
// SAMA PERSIS di kedua tempat; yang beda hanya kop (logo/warna/nama), lewat
// props. Redirect sesudah masuk SELALU ke `/portal` polos — begitu sesi ada,
// nav/beranda portal membaca merek tenant SUNGGUHAN dari sesi (lihat
// PortalNav.tsx), bukan dari slug yang dipakai untuk masuk.

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Mail } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const T: Record<Lang, Record<string, string>> = {
  id: {
    titleGeneric: 'Portal Mitra', subtitleGeneric: 'Maritime Suite', descGeneric: 'Masuk untuk melihat tagihan, kunjungan kapal, pesanan, atau perintah kerja Anda.',
    email: 'Email', password: 'Kata sandi', submit: 'Masuk', submitting: 'Memeriksa…',
    err: 'Email atau kata sandi salah, atau akses portal Anda belum/tidak aktif.',
    poweredBy: 'Ditenagai Maritime Suite',
  },
  en: {
    titleGeneric: 'Partner Portal', subtitleGeneric: 'Maritime Suite', descGeneric: 'Sign in to view your invoices, vessel visits, purchase orders, or work orders.',
    email: 'Email', password: 'Password', submit: 'Sign in', submitting: 'Checking…',
    err: 'Wrong email or password, or your portal access is not active.',
    poweredBy: 'Powered by Maritime Suite',
  },
}

export type MerekPortal = {
  companyName: string
  logoSrc: string | null
  accentColor: string | null
  accentTextColor: '#FFFFFF' | '#000000' | null
}

export function PortalLoginForm({ merek }: { merek?: MerekPortal }) {
  const t = useT(T)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    if (!email || !password) return

    setLoading(true)
    setErr(null)
    try {
      const { csrfToken } = await (await fetch('/api/portal/auth/csrf')).json()
      await fetch('/api/portal/auth/callback/portal-credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, email, password, json: 'true' }).toString(),
      })
      const session = await (await fetch('/api/portal/auth/session')).json()
      if (!session?.user?.portalUserId) {
        setErr(t.err)
        setLoading(false)
        return
      }
      router.push('/portal')
      router.refresh()
    } catch {
      setErr(t.err)
      setLoading(false)
    }
  }

  const aksen = merek?.accentColor ?? undefined
  const tombolStyle = aksen ? { backgroundColor: aksen, color: merek?.accentTextColor ?? '#fff' } : undefined

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card-bg border border-card-border rounded-lg p-6 space-y-5">
        <div>
          {merek?.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={merek.logoSrc} alt={merek.companyName} className="h-10 w-auto object-contain mb-2" />
          ) : (
            <p className="font-mono text-[10px] text-accent-blue uppercase tracking-widest">{t.subtitleGeneric}</p>
          )}
          <h1 className="font-display text-xl text-white mt-0.5">{merek?.companyName ?? t.titleGeneric}</h1>
          <p className="text-text-secondary text-sm mt-1">{t.descGeneric}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {err && <p className="text-sm rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{err}</p>}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.email}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                id="email" name="email" type="email" required autoComplete="username"
                className="w-full h-10 pl-9 pr-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm
                           focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.password}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                id="password" name="password" type="password" required autoComplete="current-password"
                className="w-full h-10 pl-9 pr-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm
                           focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={tombolStyle}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                       transition-colors hover:brightness-105 disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t.submitting : t.submit}
          </button>
        </form>

        {/* K179 lapis 1 — Maritime Suite tetap terlihat sebagai produk, bahkan di halaman ber-merek tenant. */}
        {merek && <p className="text-center text-[10px] text-text-secondary/60">{t.poweredBy}</p>}
      </div>
    </div>
  )
}
