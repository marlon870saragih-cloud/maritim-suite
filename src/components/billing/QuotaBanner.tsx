'use client'

// Spanduk kuota di Dashboard (K156, §10) — HANYA muncul saat ada kuota yang
// `MENDEKATI` atau `HABIS`. Sama seperti QuotaMeter: tanpa batas terpasang ia
// me-render `null`, sehingga Dashboard hari ini tidak berubah sama sekali
// (§17/8c butir 1).
//
// Menampilkan SATU kuota — yang paling gawat. Spanduk yang menumpuk empat baris
// peringatan mengubah dirinya jadi dinding teks yang dilewati mata; yang perlu
// diketahui di Dashboard adalah "ada yang mentok, buka Langganan", dan
// rinciannya memang tempatnya di QuotaMeter.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { KuotaTerbaca } from './QuotaMeter'

type Lang = 'id' | 'en'

const T = {
  id: {
    habis: (l: string) => `Batas paket tercapai: ${l}`,
    mendekati: (l: string) => `Mendekati batas paket: ${l}`,
    habisSub: 'Pembuatan baru ditolak. Data yang sudah ada tetap bisa dibuka, disunting, dicetak, dan ditagih.',
    mendekatiSub: 'Naikkan paket sebelum batasnya tercapai supaya pekerjaan tidak tertahan.',
    cta: 'Buka Langganan',
  },
  en: {
    habis: (l: string) => `Plan limit reached: ${l}`,
    mendekati: (l: string) => `Approaching plan limit: ${l}`,
    habisSub: 'New records are refused. Existing data stays open, editable, printable, and billable.',
    mendekatiSub: 'Upgrade before the limit is reached so work is not held up.',
    cta: 'Open Subscription',
  },
} as const

const LABEL: Record<KuotaTerbaca['jenis'], Record<Lang, string>> = {
  VOYAGE: { id: 'voyage bulan ini', en: 'voyages this month' },
  PENGGUNA: { id: 'pengguna aktif', en: 'active users' },
  PENYIMPANAN: { id: 'penyimpanan lampiran', en: 'attachment storage' },
  PANGGILAN_AI: { id: 'panggilan AI bulan ini', en: 'AI calls this month' },
}

/** Sama dengan PERINGKAT_KEADAAN_KUOTA di quota.ts — hanya dua yang bisa sampai sini. */
const GAWAT = { HABIS: 0, MENDEKATI: 1 } as const

export function QuotaBanner({ lang }: { lang: Lang }) {
  const t = T[lang]
  const [rows, setRows] = useState<KuotaTerbaca[] | null>(null)

  useEffect(() => {
    let hidup = true
    fetch('/api/quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => hidup && setRows(d))
      .catch(() => {})
    return () => {
      hidup = false
    }
  }, [])

  const perlu = (rows ?? [])
    .filter((k): k is KuotaTerbaca & { keadaan: keyof typeof GAWAT } => k.keadaan === 'HABIS' || k.keadaan === 'MENDEKATI')
    .sort((a, b) => GAWAT[a.keadaan] - GAWAT[b.keadaan])

  const k = perlu[0]
  if (!k) return null

  const habis = k.keadaan === 'HABIS'
  const label = LABEL[k.jenis][lang]

  return (
    <Link
      href="/settings"
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
        habis
          ? 'border-status-danger/50 bg-status-danger/10 hover:border-status-danger'
          : 'border-status-warning/50 bg-status-warning/10 hover:border-status-warning'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle className={`h-4 w-4 shrink-0 ${habis ? 'text-status-danger' : 'text-status-warning'}`} />
        <div className="min-w-0">
          <p className="text-white text-sm font-display">
            {habis ? t.habis(label) : t.mendekati(label)}
            <span className="font-mono text-xs text-text-secondary ml-2">
              {Math.round(k.terpakai * 10) / 10}/{k.batas}
            </span>
          </p>
          <p className="text-text-secondary text-xs">{habis ? t.habisSub : t.mendekatiSub}</p>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${habis ? 'text-status-danger' : 'text-status-warning'}`}>
        {t.cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}
