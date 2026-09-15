'use client'

// Kartu kesehatan pengambilan posisi AIS (PRD-003 Step 4) di /automation.
// Menampilkan penyedia, konfigurasi, kuota bulanan (D5), sukses terakhir, dan
// kegagalan — TIDAK PERNAH kunci API, URL, atau badan respons penyedia.

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { KesehatanAis } from '@/services/ais/read.service'
import { fmtWaktu } from './shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Kesehatan posisi AIS', loading: 'Memuat…', errLoad: 'Gagal memuat kesehatan AIS.',
    off: 'Posisi AIS tidak aktif untuk tenant ini', provider: 'Penyedia', configured: 'Terkonfigurasi', yes: 'Ya', no: 'Tidak',
    interval: 'Interval', stale: 'Ambang basi', quota: 'Panggilan bulan ini / kuota', quotaUnset: 'kuota belum ditetapkan — tanpa panggilan',
    lastRun: 'Jalan terakhir', lastOk: 'Sukses terakhir', failures: 'Gagal beruntun', backoff: 'Jeda sampai', down: 'Penyedia bermasalah',
    accepted: 'Posisi diterima', unverified: 'Kapal dilewati (MMSI belum terverifikasi)', error: 'Kode galat', never: 'Belum pernah', minutes: 'menit', hours: 'jam',
  },
  en: {
    title: 'AIS position health', loading: 'Loading…', errLoad: 'Failed to load AIS health.',
    off: 'AIS positions are not enabled for this tenant', provider: 'Provider', configured: 'Configured', yes: 'Yes', no: 'No',
    interval: 'Interval', stale: 'Stale threshold', quota: 'Calls this month / cap', quotaUnset: 'cap not set — no calls',
    lastRun: 'Last run', lastOk: 'Last success', failures: 'Consecutive failures', backoff: 'Backoff until', down: 'Provider failing',
    accepted: 'Positions accepted', unverified: 'Vessels skipped (MMSI not verified)', error: 'Error code', never: 'Never', minutes: 'min', hours: 'h',
  },
}

export function AisHealthCard() {
  const t = useT(STR)
  const { lang } = useLang()
  const [h, setH] = useState<KesehatanAis | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let batal = false
    fetch('/api/automation/ais/health', { cache: 'no-store' })
      .then(async (r) => {
        const b = await r.json().catch(() => null)
        if (batal) return
        if (!r.ok || !b) setError(b?.error?.message ?? t.errLoad)
        else setH(b)
      })
      .catch(() => !batal && setError(t.errLoad))
      .finally(() => !batal && setLoading(false))
    return () => {
      batal = true
    }
  }, [t.errLoad])

  const item = (dt: string, dd: string, cls = 'text-text-primary') => (
    <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{dt}</dt><dd className={cls}>{dd}</dd></div>
  )

  return (
    <section className="bg-card-bg border border-card-border rounded-lg p-4 sm:p-5 min-w-0" aria-labelledby="ah-ais-health">
      <h2 id="ah-ais-health" className="font-display text-lg text-text-primary">{t.title}</h2>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
      ) : error ? (
        <p role="alert" className="mt-3 text-sm text-status-danger">{error}</p>
      ) : !h ? null : !h.aktif ? (
        <p className="mt-2 text-sm text-text-secondary">{t.off} ({h.alasan}).</p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {item(t.provider, h.penyedia)}
          {item(t.configured, h.terkonfigurasi ? t.yes : t.no)}
          {item(t.interval, `${h.intervalMenit} ${t.minutes}`)}
          {item(t.stale, `${h.ambangStaleJam} ${t.hours}`)}
          {item(t.quota, h.kuotaBulanan === null ? `${h.panggilanBulanIni} · ${t.quotaUnset}` : `${h.panggilanBulanIni} / ${h.kuotaBulanan}`, h.kuotaBulanan === null ? 'text-accent-amber' : 'text-text-primary')}
          {item(t.lastRun, h.runTerakhir ? `${fmtWaktu(h.runTerakhir.startedAt, lang)} · ${h.runTerakhir.status}` : t.never)}
          {item(t.lastOk, h.suksesTerakhirPada ? fmtWaktu(h.suksesTerakhirPada, lang) : t.never)}
          {item(t.failures, String(h.gagalBeruntun), h.providerDown ? 'text-status-danger' : 'text-text-primary')}
          {h.backoffSampai ? item(t.backoff, fmtWaktu(h.backoffSampai, lang)) : null}
          {h.providerDown ? item(t.down, t.yes, 'text-status-danger') : null}
          {h.runTerakhir ? item(t.accepted, String(h.runTerakhir.observationsAccepted)) : null}
          {h.runTerakhir ? item(t.unverified, String(h.runTerakhir.vesselsSkippedUnverified)) : null}
          {h.runTerakhir ? item(t.error, h.runTerakhir.errorCode ?? '—') : null}
        </dl>
      )}
    </section>
  )
}
