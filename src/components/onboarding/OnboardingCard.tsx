'use client'

// Kartu kemajuan onboarding di Dashboard (K152) — terlihat untuk SEMUA peran,
// hilang otomatis begitu tuntas atau ditutup ("dilewati"). Mengambil datanya
// sendiri (bukan lewat dashboard.service.ts) supaya penambahan ini tetap
// aditif — tidak mengubah bentuk data dashboard yang sudah ada.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'

type Lang = 'id' | 'en'
type Status = { dilewati: boolean; semuaSelesai: boolean; langkah: { selesai: boolean }[] }

const T = {
  id: { title: 'Lanjutkan onboarding', cta: 'Buka wizard', of: (n: number, total: number) => `${n} dari ${total} langkah selesai` },
  en: { title: 'Continue onboarding', cta: 'Open wizard', of: (n: number, total: number) => `${n} of ${total} steps done` },
} as const

export function OnboardingCard({ lang }: { lang: Lang }) {
  const t = T[lang]
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/onboarding')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setStatus(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!status || status.dilewati || status.semuaSelesai) return null

  const total = status.langkah.length
  const done = status.langkah.filter((l) => l.selesai).length

  return (
    <Link
      href="/onboarding"
      className="flex items-center justify-between gap-4 rounded-lg border border-accent-blue/40 bg-accent-blue/5 px-4 py-3
                 hover:border-accent-blue/70 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-blue/20 text-accent-blue">
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-white text-sm font-display">{t.title}</p>
          <p className="text-text-secondary text-xs">{t.of(done, total)}</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-accent-blue shrink-0">
        {t.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}
