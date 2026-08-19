'use client'

// Profil sendiri (K169) — nama & kata sandi. Satu-satunya data yang boleh disunting pihak luar.

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type Profil = { name: string; email: string; phone: string | null }

const T: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Profil', desc: 'Ubah nama dan kata sandi Anda sendiri.',
    name: 'Nama', email: 'Email', phone: 'Telepon (opsional)',
    newPassword: 'Kata sandi baru (opsional)', passwordHint: 'Kosongkan bila tidak ingin mengganti.',
    save: 'Simpan', saving: 'Menyimpan…', saved: 'Tersimpan.', err: 'Gagal menyimpan.',
  },
  en: {
    title: 'Profile', desc: 'Update your own name and password.',
    name: 'Name', email: 'Email', phone: 'Phone (optional)',
    newPassword: 'New password (optional)', passwordHint: 'Leave blank to keep your current password.',
    save: 'Save', saving: 'Saving…', saved: 'Saved.', err: 'Failed to save.',
  },
}

export default function PortalProfilePage() {
  const t = useT(T)
  const [profil, setProfil] = useState<Profil | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/portal/profile').then((r) => (r.ok ? r.json() : null)).then((d) => hidup && setProfil(d))
    return () => {
      hidup = false
    }
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') || '').trim()
    const phone = String(form.get('phone') || '').trim()
    const password = String(form.get('password') || '')

    setSaving(true)
    setNotice(null)
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, phone, ...(password ? { password } : {}) }),
      })
      if (!res.ok) {
        setNotice({ ok: false, text: t.err })
        return
      }
      const d = await res.json()
      setProfil(d)
      setNotice({ ok: true, text: t.saved })
    } catch {
      setNotice({ ok: false, text: t.err })
    } finally {
      setSaving(false)
    }
  }

  if (!profil) return <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="font-display text-2xl text-white">{t.title}</h1>
        <p className="text-text-secondary text-sm">{t.desc}</p>
      </div>

      <form onSubmit={onSubmit} className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
        {notice && (
          <p className={`text-sm rounded-md px-3 py-2 ${notice.ok ? 'bg-status-success/10 text-status-success' : 'bg-status-danger/10 text-status-danger'}`}>
            {notice.text}
          </p>
        )}

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.email}</label>
          <input
            value={profil.email} disabled
            className="w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/20 text-text-secondary text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.name}</label>
          <input
            name="name" defaultValue={profil.name} required
            className="w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.phone}</label>
          <input
            name="phone" defaultValue={profil.phone ?? ''}
            className="w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-secondary">{t.newPassword}</label>
          <input
            name="password" type="password" minLength={8} autoComplete="new-password"
            className="w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue"
          />
          <p className="text-[11px] text-text-secondary">{t.passwordHint}</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white
                     transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? t.saving : t.save}
        </button>
      </form>
    </div>
  )
}
