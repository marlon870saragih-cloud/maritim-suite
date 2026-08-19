'use client'

// Terima undangan portal (K168). Halaman PUBLIK — penerima belum jadi
// siapa-siapa sampai form ini terkirim (tak ada sesi apa pun untuk diperiksa,
// pola sama /api/portal/accept-invitation di server).

import { useState, type FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, Lock, User } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Aktifkan Akun Portal', desc: 'Anda diundang untuk mengakses Portal Mitra Maritime Suite. Buat kata sandi untuk melanjutkan.',
    name: 'Nama (opsional)', password: 'Kata sandi baru', passwordHint: 'Minimal 8 karakter.',
    submit: 'Aktifkan & Masuk', submitting: 'Memproses…',
    err: 'Undangan tidak valid, sudah kedaluwarsa, atau sudah pernah dipakai. Minta undangan baru dari keagenan Anda.',
    errShort: 'Kata sandi minimal 8 karakter.',
  },
  en: {
    title: 'Activate Portal Account', desc: 'You have been invited to Maritime Suite\'s Partner Portal. Set a password to continue.',
    name: 'Name (optional)', password: 'New password', passwordHint: 'At least 8 characters.',
    submit: 'Activate & Sign in', submitting: 'Processing…',
    err: 'Invitation invalid, expired, or already used. Ask your agency for a new invitation.',
    errShort: 'Password must be at least 8 characters.',
  },
}

export default function AcceptInvitationPage() {
  const t = useT(T)
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') || '').trim()
    const password = String(form.get('password') || '')
    if (password.length < 8) {
      setErr(t.errShort)
      return
    }

    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/portal/accept-invitation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: params.token, password, name: name || undefined }),
      })
      if (!res.ok) {
        setErr(t.err)
        setLoading(false)
        return
      }
      const { email } = (await res.json().catch(() => ({}))) as { email?: string }

      // Langsung masuk sesudah aktivasi — konsisten dgn /register (K154).
      const { csrfToken } = await (await fetch('/api/portal/auth/csrf')).json()
      await fetch('/api/portal/auth/callback/portal-credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, email: email ?? '', password, json: 'true' }).toString(),
      })
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
          <p className="font-mono text-[10px] text-accent-blue uppercase tracking-widest">Maritime Suite</p>
          <h1 className="font-display text-xl text-white mt-0.5">{t.title}</h1>
          <p className="text-text-secondary text-sm mt-1">{t.desc}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {err && <p className="text-sm rounded-md px-3 py-2 bg-status-danger/10 text-status-danger">{err}</p>}

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.name}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
              <input
                id="name" name="name" type="text"
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
                id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
                className="w-full h-10 pl-9 pr-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm
                           focus:outline-none focus:border-accent-blue"
              />
            </div>
            <p className="text-[11px] text-text-secondary">{t.passwordHint}</p>
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
