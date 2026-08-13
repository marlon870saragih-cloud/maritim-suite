'use client'

// Panel "Perlu diperiksa" (Fase 6e · K71–K74). Tipe respons JSON didefinisikan
// LOKAL di sini (bukan diimpor dari anomaly.service.ts/anomaly-rules.ts) —
// konvensi yang sama dipakai PredictionColumn.tsx: service.ts menyeret
// Prisma, anomaly-rules.ts sendiri sebenarnya murni (K51) tapi tipenya
// sengaja disalin juga supaya panel ini punya SATU sumber kontrak (bentuk
// respons API), bukan dua (tipe murni + bentuk JSON yang kebetulan sama).
//
// K72 — SENGAJA terpisah visual dari panel Warnings (Fase 3): warning
// memblokir Submit for Review, anomali TIDAK PERNAH. Tak ada satu baris kode
// pun di sini yang menyentuh `disb.warnings`/`adaWarningPemblokir`.
//
// "Sudah saya periksa" (K72) HANYA state komponen — tak ada penyimpanan di
// DB (Fase 6 sengaja belum menambah kolom/tabel untuk status "sudah
// diperiksa"). Reload halaman = anomali yang sama tampil lagi; itu perilaku
// yang benar, bukan bug, sampai ada tempat resmi menyimpannya.

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Perlu Diperiksa', dismiss: 'Sudah saya periksa',
    inactiveTitle: 'Pemeriksaan berbasis histori belum aktif',
  },
  en: {
    title: 'Needs a Look', dismiss: 'I have reviewed this',
    inactiveTitle: 'History-based checks not active yet',
  },
}

type TingkatAnomali = 'INFO' | 'PERHATIAN' | 'TINGGI'

type AnomaliUI = {
  kode: string
  tingkat: TingkatAnomali
  itemId: string | null
  pesan: string
  dasar: { nilai: number; pembanding: number | null; ambang: number; nNyata: number; nLatihan: number }
}

type AturanNonaktifUI = {
  kode: string
  alasan: { id: string; en: string }
  nNyata: number
  minimal: number
}

const IKON: Record<TingkatAnomali, typeof Info> = {
  INFO: Info,
  PERHATIAN: AlertTriangle,
  TINGGI: ShieldAlert,
}

const WARNA: Record<TingkatAnomali, string> = {
  INFO: 'text-text-secondary',
  PERHATIAN: 'text-accent-amber',
  TINGGI: 'text-status-danger',
}

/** Kunci identitas anomali untuk daftar "sudah diperiksa" — tak ada id dari server. */
const kunciAnomali = (a: AnomaliUI) => `${a.kode}|${a.itemId ?? ''}`

export function AnomalyPanel({
  disbursementId,
  itemsKey,
  onJump,
}: {
  disbursementId: string
  /** Kunci yang berubah tiap komposisi baris berubah — pemicu fetch ulang. */
  itemsKey: string
  onJump?: (itemId: string) => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const [anomali, setAnomali] = useState<AnomaliUI[] | null>(null)
  const [nonaktif, setNonaktif] = useState<AturanNonaktifUI[]>([])
  const [ringkasanNonaktif, setRingkasanNonaktif] = useState<string | null>(null)
  const [diperiksa, setDiperiksa] = useState<Set<string>>(new Set())

  useEffect(() => {
    let batal = false
    fetch(`/api/ai/anomalies?disbursementId=${encodeURIComponent(disbursementId)}&bahasa=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { anomali?: AnomaliUI[]; nonaktif?: AturanNonaktifUI[]; ringkasanNonaktif?: string | null } | null) => {
        if (batal) return
        setAnomali(body?.anomali ?? null)
        setNonaktif(body?.nonaktif ?? [])
        setRingkasanNonaktif(body?.ringkasanNonaktif ?? null)
      })
      .catch(() => !batal && setAnomali(null))
    return () => {
      batal = true
    }
    // Kunci fetch: dokumen + komposisi baris + bahasa (K73/K74 dua bahasa).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disbursementId, itemsKey, lang])

  const tampil = (anomali ?? []).filter((a) => !diperiksa.has(kunciAnomali(a)))

  // Fitur suplemen (K54) — gagal/trial habis/dokumen belum punya baris = diam,
  // sama seperti PredictionColumn.
  if (anomali === null || (tampil.length === 0 && nonaktif.length === 0)) return null

  return (
    <section className="bg-accent-blue/5 border border-accent-blue/20 rounded-lg p-4 space-y-2.5">
      <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue">
        {t.title} {tampil.length > 0 && `(${tampil.length})`}
      </p>

      {tampil.length > 0 && (
        <ul className="space-y-1.5">
          {tampil.map((a) => {
            const Ikon = IKON[a.tingkat]
            const kunci = kunciAnomali(a)
            return (
              <li key={kunci} className="flex items-start gap-2 text-xs">
                <Ikon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', WARNA[a.tingkat])} />
                <button
                  type="button"
                  onClick={() => a.itemId && onJump?.(a.itemId)}
                  disabled={!a.itemId}
                  className="flex-1 text-left text-text-primary hover:text-accent-blue transition-colors disabled:cursor-default disabled:hover:text-text-primary"
                >
                  {a.pesan}
                </button>
                <button
                  type="button"
                  onClick={() => setDiperiksa((prev) => new Set(prev).add(kunci))}
                  title={t.dismiss}
                  className="flex-shrink-0 text-text-secondary hover:text-status-success transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {ringkasanNonaktif && (
        <p className="text-[11px] text-text-secondary/70 italic pt-1 border-t border-accent-blue/10">
          {ringkasanNonaktif}
        </p>
      )}
    </section>
  )
}
