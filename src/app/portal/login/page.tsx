'use client'

// Login Customer Portal (K144/K149). ⚠️ TIDAK memakai `signIn()` dari
// 'next-auth/react' — itu menargetkan `/api/auth/*` INTERNAL secara bawaan.
// Portal punya provider (`portal-credentials`) & endpoint (`/api/portal/auth/*`)
// SENDIRI, jadi login-nya lewat fetch CSRF+callback manual, pola yang sama
// dipakai `prisma/check-portal-guard.mjs` untuk menguji jalur ini.

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Mail } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Portal Pelanggan', subtitle: 'Maritime Suite', desc: 'Masuk untuk melihat tagihan, kunjungan kapal, dan dokumen Anda.',
    email: 'Email', password: 'Kata sandi', submit: 'Masuk', submitting: 'Memeriksa…',
    err: 'Email atau kata sandi salah, atau akses portal Anda belum/tidak aktif.',
  },
  en: {
    title: 'Customer Portal', subtitle: 'Maritime Suite', desc: 'Sign in to view your invoices, vessel visits, and documents.',
    email: 'Email', password: 'Password', submit: 'Sign in', submitting: 'Checking…',
    err: 'Wrong email or password, or your portal access is not active.',
  },
}

export default function PortalLoginPage() {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card-bg border border-card-border rounded-lg p-6 space-y-5">
        <div>
          <p className="font-mono text-[10px] text-accent-blue uppercase tracking-widest">{t.subtitle}</p>
          <h1 className="font-display text-xl text-white mt-0.5">{t.title}</h1>
          <p className="text-text-secondary text-sm mt-1">{t.desc}</p>
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
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                       transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? t.submitting : t.submit}
          </button>
        </form>
      </div>
    </div>
  )
}
