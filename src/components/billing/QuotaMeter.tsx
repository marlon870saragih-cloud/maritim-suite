'use client'

// Pengukur kuota paket (K156, Fase 8c).
//
// ⚠️ SIFAT YANG PALING PENTING DI BERKAS INI: ia me-render `null` bila tak ada
// satu pun kuota yang dibatasi — dan itulah keadaan hari ini (semua batas `null`
// di commercial-policy.ts, P49 belum dijawab). §17/8c butir 1 menuntut buktinya:
// "tak ada YANG BERUBAH di layar mana pun". Komponen yang menampilkan "Tak
// dibatasi ✓" akan melanggarnya — ia menambah kotak baru ke layar yang tadinya
// tidak punya, untuk memberi tahu bahwa tidak ada yang perlu diberitahukan.

import { useEffect, useState } from 'react'

type KeadaanKuota = 'TIDAK_DIBATASI' | 'AMAN' | 'MENDEKATI' | 'HABIS'
type JenisKuota = 'VOYAGE' | 'PENGGUNA' | 'PENYIMPANAN' | 'PANGGILAN_AI'

export type KuotaTerbaca = {
  jenis: JenisKuota
  keadaan: KeadaanKuota
  sisa: number | null
  persen: number | null
  batas: number | null
  terpakai: number
}

type Lang = 'id' | 'en'

const T = {
  id: {
    heading: 'Pemakaian paket',
    sub: 'Dihitung saat halaman dibuka — bukan angka simpanan.',
    of: 'dari',
    left: 'sisa',
    habis: 'Batas tercapai — pembuatan baru ditolak. Data yang sudah ada tetap bisa dibuka, disunting, dicetak, dan ditagih.',
    mendekati: 'Mendekati batas paket.',
  },
  en: {
    heading: 'Plan usage',
    sub: 'Computed when this page loads — not a stored number.',
    of: 'of',
    left: 'left',
    habis: 'Limit reached — new records are refused. Existing data stays open, editable, printable, and billable.',
    mendekati: 'Approaching the plan limit.',
  },
} as const

const LABEL: Record<JenisKuota, Record<Lang, string>> = {
  VOYAGE: { id: 'Voyage bulan ini', en: 'Voyages this month' },
  PENGGUNA: { id: 'Pengguna aktif', en: 'Active users' },
  PENYIMPANAN: { id: 'Penyimpanan lampiran (MB)', en: 'Attachment storage (MB)' },
  PANGGILAN_AI: { id: 'Panggilan AI bulan ini', en: 'AI calls this month' },
}

const bulat = (n: number) => Math.round(n * 10) / 10

export function QuotaMeter({ lang }: { lang: Lang }) {
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

  const dibatasi = (rows ?? []).filter((k) => k.keadaan !== 'TIDAK_DIBATASI')
  // Inilah butir 1: tanpa batas terpasang, komponen ini tidak ada di layar.
  if (dibatasi.length === 0) return null

  return (
    <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg text-white">{t.heading}</h3>
        <p className="text-text-secondary text-xs">{t.sub}</p>
      </div>

      <div className="space-y-3">
        {dibatasi.map((k) => {
          const persen = Math.min(100, Math.round(k.persen ?? 0))
          const warna =
            k.keadaan === 'HABIS'
              ? 'bg-status-danger'
              : k.keadaan === 'MENDEKATI'
                ? 'bg-status-warning'
                : 'bg-accent-teal'
          return (
            <div key={k.jenis} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-white">{LABEL[k.jenis][lang]}</span>
                <span className="font-mono text-xs text-text-secondary">
                  {bulat(k.terpakai)} {t.of} {k.batas}
                  {k.sisa !== null && k.keadaan !== 'HABIS' && ` · ${bulat(k.sisa)} ${t.left}`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary/60">
                <div className={`h-full ${warna} transition-all`} style={{ width: `${persen}%` }} />
              </div>
              {k.keadaan !== 'AMAN' && (
                <p
                  className={`text-[11px] ${k.keadaan === 'HABIS' ? 'text-status-danger' : 'text-status-warning'}`}
                >
                  {k.keadaan === 'HABIS' ? t.habis : t.mendekati}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
