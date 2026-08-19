'use client'

// Wizard onboarding (K152) — enam langkah, SEMUA boleh dilewati. Setiap
// langkah hanya menautkan ke layar Settings yang sudah ada (tidak menduplikasi
// form) + tombol "tandai selesai" untuk mencatat kemajuan. Peran selain ADMIN
// tetap bisa MELIHAT halaman ini (kartu ringkasan), tapi tombol aksi
// disembunyikan — mencoba lewat API tetap kena 403 di server (K152 tabel peran).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Anchor, Building2, Check, Coins, ListChecks, Loader2, RefreshCw, Ship, SkipForward, UserPlus,
} from 'lucide-react'

type Lang = 'id' | 'en'

type LangkahOnboarding = 'PROFIL' | 'MATA_UANG' | 'PELABUHAN' | 'KATALOG_JASA' | 'UNDANG_REKAN' | 'KAPAL_PERTAMA'
export type OnboardingStatus = {
  dilewati: boolean
  semuaSelesai: boolean
  sudahDiseed: boolean
  langkah: { langkah: LangkahOnboarding; selesai: boolean }[]
}

const T = {
  id: {
    kicker: 'Mulai Cepat', title: 'Onboarding', desc: 'Enam langkah untuk memakai Maritime Suite sepenuhnya — semua boleh dilewati.',
    skipAll: 'Lewati semua', skipConfirm: 'Lewati semua langkah onboarding? Aplikasi tetap bisa dipakai penuh.',
    skipped: 'Onboarding dilewati. Anda tetap bisa menyelesaikan langkah di bawah kapan saja.',
    allDone: 'Semua langkah selesai. 🎉',
    open: 'Buka', markDone: 'Tandai selesai', done: 'Selesai',
    reseed: 'Salin ulang template contoh', reseedDone: (n: number) => `Disalin: ${n} baris baru.`,
    readOnlyNote: 'Hanya ADMIN yang bisa mengubah langkah ini.',
  },
  en: {
    kicker: 'Quick Start', title: 'Onboarding', desc: 'Six steps to get Maritime Suite fully working — all optional.',
    skipAll: 'Skip all', skipConfirm: 'Skip all onboarding steps? The app stays fully usable.',
    skipped: 'Onboarding skipped. You can still complete steps below anytime.',
    allDone: 'All steps complete. 🎉',
    open: 'Open', markDone: 'Mark done', done: 'Done',
    reseed: 'Re-copy example template', reseedDone: (n: number) => `Copied: ${n} new rows.`,
    readOnlyNote: 'Only ADMIN can change this step.',
  },
} as const

const STEPS: Record<LangkahOnboarding, { icon: typeof Building2; href: string; title: Record<Lang, string>; desc: Record<Lang, string> }> = {
  PROFIL: {
    icon: Building2, href: '/settings/company',
    title: { id: 'Profil perusahaan & logo', en: 'Company profile & logo' },
    desc: { id: 'Kop dokumen (nama, alamat, logo) yang tampil di EPDA & invoice.', en: 'Document letterhead (name, address, logo) shown on EPDA & invoices.' },
  },
  MATA_UANG: {
    icon: Coins, href: '/settings/currencies',
    title: { id: 'Mata uang & kurs', en: 'Currency & exchange rate' },
    desc: { id: 'Aktifkan IDR + USD dan isi satu kurs awal.', en: 'Enable IDR + USD and set one starting rate.' },
  },
  PELABUHAN: {
    icon: Anchor, href: '/settings/ports',
    title: { id: 'Pelabuhan yang dilayani', en: 'Ports served' },
    desc: { id: 'Pilih dari daftar pelabuhan Indonesia bawaan.', en: 'Pick from the built-in Indonesian port list.' },
  },
  KATALOG_JASA: {
    icon: ListChecks, href: '/settings/services',
    title: { id: 'Katalog jasa & tarif', en: 'Service catalog & rates' },
    desc: { id: 'Template contoh berlabel sudah tersalin — ganti tarif resmi sebelum EPDA dikirim ke principal.', en: 'Labeled example template already copied — replace with official rates before sending EPDA to principals.' },
  },
  UNDANG_REKAN: {
    icon: UserPlus, href: '/settings/team',
    title: { id: 'Undang rekan kerja', en: 'Invite teammates' },
    desc: { id: 'Tambah pengguna lain sesuai kuota paket Anda.', en: 'Add more users within your plan quota.' },
  },
  KAPAL_PERTAMA: {
    icon: Ship, href: '/settings/vessels',
    title: { id: 'Kapal pertama', en: 'First vessel' },
    desc: { id: 'Isi manual, atau impor partikular dari PDF/Excel.', en: 'Add manually, or import particulars from PDF/Excel.' },
  },
}
const ORDER: LangkahOnboarding[] = ['PROFIL', 'MATA_UANG', 'PELABUHAN', 'KATALOG_JASA', 'UNDANG_REKAN', 'KAPAL_PERTAMA']

export function OnboardingWizard({ initial, lang, isAdmin }: { initial: OnboardingStatus; lang: Lang; isAdmin: boolean }) {
  const t = T[lang]
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selesaiSet = new Set(status.langkah.filter((l) => l.selesai).map((l) => l.langkah))

  async function markDone(langkah: LangkahOnboarding) {
    setBusy(langkah)
    try {
      const res = await fetch('/api/onboarding/step', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ langkah }),
      })
      if (res.ok) setStatus(await res.json())
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function skipAll() {
    if (!confirm(t.skipConfirm)) return
    setBusy('__skip__')
    try {
      const res = await fetch('/api/onboarding/skip', { method: 'POST' })
      if (res.ok) setStatus(await res.json())
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function reseed() {
    setBusy('__seed__')
    setNotice(null)
    try {
      const res = await fetch('/api/onboarding/seed', { method: 'POST' })
      if (res.ok) {
        const hasil = (await res.json()) as { currency: number; port: number; service: number; rate: number }
        const n = hasil.currency + hasil.port + hasil.service + hasil.rate
        setNotice(t.reseedDone(n))
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-text-secondary text-sm">{t.desc}</p>
        {isAdmin && !status.dilewati && !status.semuaSelesai && (
          <button
            type="button"
            onClick={skipAll}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-card-border px-3 py-1.5 text-xs text-text-secondary
                       hover:text-white hover:border-accent-teal/50 transition-colors disabled:opacity-40"
          >
            <SkipForward className="h-3.5 w-3.5" />
            {t.skipAll}
          </button>
        )}
      </div>

      {status.semuaSelesai && (
        <p className="rounded-md bg-status-success/10 text-status-success text-sm px-3 py-2">{t.allDone}</p>
      )}
      {!status.semuaSelesai && status.dilewati && (
        <p className="rounded-md bg-surface-tertiary/40 border border-card-border text-text-secondary text-sm px-3 py-2">{t.skipped}</p>
      )}
      {notice && <p className="rounded-md bg-status-success/10 text-status-success text-sm px-3 py-2">{notice}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ORDER.map((langkah) => {
          const s = STEPS[langkah]
          const Icon = s.icon
          const done = selesaiSet.has(langkah)
          return (
            <div key={langkah} className={`rounded-lg border p-4 space-y-2.5 ${done ? 'border-accent-teal/40 bg-accent-teal/5' : 'border-card-border bg-card-bg'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${done ? 'bg-accent-teal/20 text-accent-teal' : 'bg-surface-tertiary/60 text-text-secondary'}`}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-white font-display text-sm">{s.title[lang]}</p>
                  <p className="text-text-secondary text-xs mt-0.5">{s.desc[lang]}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap pl-11">
                <Link
                  href={s.href}
                  className="inline-flex items-center gap-1 rounded-md border border-card-border px-2.5 py-1 text-xs text-text-secondary
                             hover:text-white hover:border-accent-blue/50 transition-colors"
                >
                  {t.open}
                </Link>
                {langkah === 'KATALOG_JASA' && isAdmin && (
                  <button
                    type="button"
                    onClick={reseed}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-card-border px-2.5 py-1 text-xs text-text-secondary
                               hover:text-white hover:border-accent-teal/50 transition-colors disabled:opacity-40"
                  >
                    {busy === '__seed__' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {t.reseed}
                  </button>
                )}
                {isAdmin ? (
                  !done && (
                    <button
                      type="button"
                      onClick={() => markDone(langkah)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-blue/90 px-2.5 py-1 text-xs text-white
                                 hover:bg-accent-blue transition-colors disabled:opacity-40"
                    >
                      {busy === langkah ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      {t.markDone}
                    </button>
                  )
                ) : (
                  !done && <span className="text-[11px] text-text-secondary/60">{t.readOnlyNote}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
