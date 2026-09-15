'use client'

// Posisi AIS terakhir kapal voyage (PRD-003 Step 4) — HANYA BACA. Tanpa peta.
// Menampilkan DUA waktu (posisi & pengambilan, K176/2) dan umur posisi. Data AIS
// tidak pernah mengubah data voyage (K178).

import { useEffect, useState } from 'react'
import { Loader2, Navigation } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { PosisiAisVoyage } from '@/services/ais/read.service'
import { fmtWaktu } from './shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Posisi AIS terakhir', loading: 'Memuat…', errLoad: 'Gagal memuat posisi AIS.',
    off: 'Posisi AIS tidak aktif untuk tenant ini.', noProvider: 'Belum ada penyedia posisi AIS.',
    source: 'Sumber', positionAt: 'Waktu posisi', fetchedAt: 'Diambil', age: 'Umur', coords: 'Koordinat', speed: 'Kecepatan/haluan',
    unverified: 'MMSI belum terverifikasi — posisi AIS tidak diambil.', notSource: 'Bukan sumber posisi (hanya tug yang diambil).',
    none: 'Belum ada posisi tersimpan.', hours: 'jam', minutes: 'menit', stale: 'basi',
    note: 'Data pihak ketiga — tidak mengubah ETA/ATA atau data voyage.',
  },
  en: {
    title: 'Latest AIS position', loading: 'Loading…', errLoad: 'Failed to load AIS position.',
    off: 'AIS positions are not enabled for this tenant.', noProvider: 'No AIS position provider yet.',
    source: 'Source', positionAt: 'Position time', fetchedAt: 'Fetched', age: 'Age', coords: 'Coordinates', speed: 'Speed/course',
    unverified: 'MMSI not verified — no AIS position is fetched.', notSource: 'Not a position source (tugs only).',
    none: 'No stored position yet.', hours: 'h', minutes: 'min', stale: 'stale',
    note: 'Third-party data — never changes ETA/ATA or voyage data.',
  },
}

function umur(iso: string, t: Record<string, string>): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const menit = Math.floor(ms / 60_000)
  return menit < 60 ? `${menit} ${t.minutes}` : `${Math.floor(menit / 60)} ${t.hours}`
}

export function VoyageAisPosition({ voyageId }: { voyageId: string }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [data, setData] = useState<PosisiAisVoyage | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let batal = false
    fetch(`/api/automation/ais/voyages/${encodeURIComponent(voyageId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json().catch(() => null)
        if (batal) return
        if (!r.ok || !b) setError(b?.error?.message ?? t.errLoad)
        else setData(b)
      })
      .catch(() => !batal && setError(t.errLoad))
      .finally(() => !batal && setLoading(false))
    return () => {
      batal = true
    }
  }, [voyageId, t.errLoad])

  const label = 'text-[10px] font-mono uppercase tracking-wider text-text-secondary'
  return (
    <div className="rounded border border-card-border/60 bg-surface/30 p-3 space-y-2" aria-labelledby={`ais-pos-${voyageId}`}>
      <p id={`ais-pos-${voyageId}`} className="flex items-center gap-2 text-sm text-text-primary">
        <Navigation className="w-3.5 h-3.5 text-accent-blue" aria-hidden="true" /> {t.title}
      </p>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-text-secondary"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t.loading}</p>
      ) : error ? (
        <p role="alert" className="text-xs text-status-danger">{error}</p>
      ) : !data || data.status === 'NONAKTIF' ? (
        <p className="text-xs text-text-secondary">{t.off}</p>
      ) : data.status === 'TANPA_PENYEDIA' ? (
        <p className="text-xs text-text-secondary">{t.noProvider}</p>
      ) : (
        <ul className="space-y-2">
          {data.kapal.map((k) => {
            const o = k.terakhir
            const basi = o ? Date.now() - new Date(o.positionAt).getTime() >= data.ambangStaleJam * 3_600_000 : false
            return (
              <li key={k.vesselId} className="min-w-0">
                <p className="text-xs text-text-primary break-words">
                  {k.nama}{k.role ? ` (${k.role})` : ''}
                </p>
                {!k.sumberPosisi ? (
                  <p className="text-xs text-text-secondary">{t.notSource}</p>
                ) : !k.mmsiTerverifikasi ? (
                  <p className="text-xs text-accent-amber">{t.unverified}</p>
                ) : !o ? (
                  <p className="text-xs text-text-secondary">{t.none}</p>
                ) : (
                  <dl className="mt-1 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                    <div><dt className={label}>{t.positionAt}</dt><dd className="text-text-primary">{fmtWaktu(o.positionAt, lang)}</dd></div>
                    <div><dt className={label}>{t.age}</dt><dd className={basi ? 'text-accent-amber' : 'text-text-primary'}>{umur(o.positionAt, t)}{basi ? ` · ${t.stale}` : ''}</dd></div>
                    <div><dt className={label}>{t.fetchedAt}</dt><dd className="text-text-primary">{fmtWaktu(o.fetchedAt, lang)}</dd></div>
                    <div><dt className={label}>{t.coords}</dt><dd className="font-mono text-text-primary">{o.lat.toFixed(4)}, {o.lon.toFixed(4)}</dd></div>
                    <div><dt className={label}>{t.speed}</dt><dd className="text-text-primary">{o.sogKnots ?? '—'} kn · {o.cogDeg ?? '—'}°</dd></div>
                    <div><dt className={label}>{t.source}</dt><dd className="text-text-primary">{data.penyedia} · {o.sourceType}</dd></div>
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-text-secondary">{t.note}</p>
    </div>
  )
}
