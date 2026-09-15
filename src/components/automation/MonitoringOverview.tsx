'use client'

// Active Monitoring — Automation Hub (PRD-002 Step 5B).
// Tidak menampilkan posisi kapal atau peta. Posisi AIS terakhir (PRD-003 Step 4)
// tampil di halaman voyage; kesehatan AIS di AisHealthCard.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, PlayCircle, RefreshCw, StopCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type {
  BarisPemantauan,
  KesehatanAutomation,
  VoyageBisaDipantau,
} from '@/services/automation/monitoring.service'
import { HealthBadge, LABEL_JENIS, SeverityBadge, btnCls, fmtWaktu } from './shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    healthTitle: 'Kesehatan pemantauan', lastRun: 'Jalan terakhir', lastOk: 'Sukses terakhir', monitored: 'Voyage dipantau',
    openSignals: 'Sinyal terbuka', never: 'Belum pernah', source: 'Sumber posisi kapal',
    startTitle: 'Mulai pantau voyage', selectVoyage: 'Pilih voyage', start: 'Mulai pantau', noEligible: 'Tidak ada voyage aktif yang bisa dipantau.',
    listTitle: 'Voyage yang dipantau', empty: 'Belum ada voyage yang sedang dipantau.',
    status: 'Status voyage', primary: 'Kapal utama', related: 'Kapal terkait', state: 'Pemantauan', active: 'Aktif', stopped: 'Berhenti',
    lastCheck: 'Cek terakhir berhasil', latest: 'Sinyal terakhir', none: '—', stop: 'Hentikan', confirmStop: 'Hentikan pemantauan voyage ini?',
    yes: 'Ya, hentikan', cancel: 'Batal', refresh: 'Muat ulang', loading: 'Memuat…', errLoad: 'Gagal memuat data pemantauan.',
    errAction: 'Tindakan gagal.', alerts: 'Lihat Alerts', since: 'sejak', reason: 'alasan',
    sourceOff: 'Sumber posisi kapal eksternal belum dikonfigurasi. Pemantauan internal tetap berjalan.',
    sourceOn: 'Sumber posisi:',
  },
  en: {
    healthTitle: 'Monitoring health', lastRun: 'Last run', lastOk: 'Last success', monitored: 'Monitored voyages',
    openSignals: 'Open signals', never: 'Never', source: 'Vessel position source',
    startTitle: 'Start monitoring a voyage', selectVoyage: 'Select voyage', start: 'Start monitoring', noEligible: 'No active voyage available to monitor.',
    listTitle: 'Monitored voyages', empty: 'No voyage is currently being monitored.',
    status: 'Voyage status', primary: 'Primary vessel', related: 'Related vessels', state: 'Monitoring', active: 'Active', stopped: 'Stopped',
    lastCheck: 'Last successful check', latest: 'Latest signal', none: '—', stop: 'Stop', confirmStop: 'Stop monitoring this voyage?',
    yes: 'Yes, stop', cancel: 'Cancel', refresh: 'Reload', loading: 'Loading…', errLoad: 'Failed to load monitoring data.',
    errAction: 'Action failed.', alerts: 'View Alerts', since: 'since', reason: 'reason',
    sourceOff: 'No external vessel position source is configured yet. Internal monitoring keeps running.',
    sourceOn: 'Position source:',
  },
}

export function MonitoringOverview() {
  const t = useT(STR)
  const { lang } = useLang()
  const [rows, setRows] = useState<BarisPemantauan[]>([])
  const [eligible, setEligible] = useState<VoyageBisaDipantau[]>([])
  const [health, setHealth] = useState<KesehatanAutomation | null>(null)
  const [pilih, setPilih] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmStop, setConfirmStop] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [a, b] = await Promise.all([
        fetch('/api/automation/monitored-voyages', { cache: 'no-store' }),
        fetch('/api/automation/health', { cache: 'no-store' }),
      ])
      const da = await a.json().catch(() => null)
      const db = await b.json().catch(() => null)
      if (!a.ok || !b.ok || !da || !db) {
        setError(da?.error?.message ?? db?.error?.message ?? t.errLoad)
        return
      }
      setRows(da.pemantauan)
      setEligible(da.bisaDipantau)
      setHealth(db)
      setPilih((p) => (da.bisaDipantau.some((v: VoyageBisaDipantau) => v.id === p) ? p : ''))
    } catch {
      setError(t.errLoad)
    } finally {
      setLoading(false)
    }
  }, [t.errLoad])

  useEffect(() => {
    void load()
  }, [load])

  async function aksi(url: string, init: RequestInit) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errAction)
        return
      }
      setConfirmStop(null)
      await load()
    } catch {
      setError(t.errAction)
    } finally {
      setBusy(false)
    }
  }

  const cardCls = 'bg-card-bg border border-card-border rounded-lg p-4 sm:p-5 min-w-0'

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      <section className={cardCls} aria-labelledby="ah-health">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ah-health" className="font-display text-lg text-text-primary">{t.healthTitle}</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/automation/alerts" className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
              {t.alerts}
            </Link>
            <button type="button" onClick={() => void load()} disabled={loading} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
            </button>
          </div>
        </div>
        {loading && !health ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
        ) : health ? (
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.lastRun}</dt>
              <dd className="text-text-primary">{health.runTerakhir ? `${fmtWaktu(health.runTerakhir.startedAt, lang)} · ${health.runTerakhir.status}` : t.never}</dd></div>
            <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.lastOk}</dt>
              <dd className="text-text-primary">{health.suksesTerakhirPada ? fmtWaktu(health.suksesTerakhirPada, lang) : t.never}</dd></div>
            <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.monitored}</dt>
              <dd className="text-text-primary">{health.voyageDipantau}</dd></div>
            <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.openSignals}</dt>
              <dd className="text-text-primary">{health.sinyalTerbuka}</dd></div>
            <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.source}</dt>
              <dd className="text-text-secondary">
                {/* Gate browser Step 5B: pesan server hanya berbahasa Indonesia → dirender dari kamus klien. */}
                {health.penyedia.terkonfigurasi ? `${t.sourceOn} ${health.penyedia.nama ?? ''}`.trim() : t.sourceOff}
              </dd></div>
          </dl>
        ) : null}
      </section>

      <section className={cardCls} aria-labelledby="ah-start">
        <h2 id="ah-start" className="font-display text-lg text-text-primary">{t.startTitle}</h2>
        {eligible.length === 0 && !loading ? (
          <p className="mt-2 text-sm text-text-secondary">{t.noEligible}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
              {t.selectVoyage}
              <select
                value={pilih}
                onChange={(e) => setPilih(e.target.value)}
                className="w-full min-w-0 bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary normal-case tracking-normal focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
              >
                <option value="">—</option>
                {eligible.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.voyageNumber} · {v.status}{v.kapal ? ` · ${v.kapal}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!pilih || busy}
              onClick={() => void aksi('/api/automation/monitored-voyages', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ voyageId: pilih }),
              })}
              className={cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />} {t.start}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="ah-list">
        <h2 id="ah-list" className="font-display text-lg text-text-primary">{t.listTitle}</h2>
        {!loading && rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-muted px-4 py-10 text-center text-sm text-text-secondary">{t.empty}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((r) => (
              <li key={r.id} className={cardCls}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/voyages/${r.voyageId}`} className="font-mono text-sm text-accent-blue hover:underline break-all">
                      {r.voyageNumber}
                    </Link>
                    <p className="text-xs text-text-secondary">
                      {t.status}: <span className="text-text-primary">{r.voyageStatus}</span>
                    </p>
                  </div>
                  <HealthBadge kesehatan={r.kesehatan} lang={lang} />
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.primary}</dt>
                    <dd className="text-text-primary break-words">{r.kapalUtama ?? t.none}</dd></div>
                  <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.related}</dt>
                    <dd className="text-text-primary break-words">{r.kapalTerkait.length ? r.kapalTerkait.map((k) => `${k.name}${k.role ? ` (${k.role})` : ''}`).join(', ') : t.none}</dd></div>
                  <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.state}</dt>
                    <dd className="text-text-primary">
                      {r.enabled ? `${t.active} · ${t.since} ${fmtWaktu(r.startedAt, lang)}` : `${t.stopped}${r.stopReason ? ` · ${t.reason} ${r.stopReason}` : ''}`}
                    </dd></div>
                  <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.lastCheck}</dt>
                    <dd className="text-text-primary">{r.lastCheckedAt ? fmtWaktu(r.lastCheckedAt, lang) : t.never}</dd></div>
                  <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.openSignals}</dt>
                    <dd className="text-text-primary">{r.sinyalTerbuka}</dd></div>
                </dl>

                {r.sinyalTerakhir && (
                  <div className="mt-3 rounded border border-card-border/60 bg-surface/30 p-3">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.latest}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={r.sinyalTerakhir.severity} lang={lang} />
                      <span className="text-xs text-text-primary">{LABEL_JENIS[lang][r.sinyalTerakhir.kind] ?? r.sinyalTerakhir.kind}</span>
                      <span className="text-[11px] text-text-secondary">{fmtWaktu(r.sinyalTerakhir.detectedAt, lang)}</span>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary break-words">{r.sinyalTerakhir.explanation}</p>
                  </div>
                )}

                {r.enabled && (
                  <div className="mt-3">
                    {confirmStop === r.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-text-primary">{t.confirmStop}</span>
                        <button type="button" disabled={busy} onClick={() => void aksi(`/api/automation/monitored-voyages/${r.id}`, { method: 'DELETE' })} className={cn(btnCls, 'bg-status-danger/80 hover:bg-status-danger text-white')}>
                          {t.yes}
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmStop(null)} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
                          {t.cancel}
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmStop(r.id)} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
                        <StopCircle className="w-3.5 h-3.5" aria-hidden="true" /> {t.stop}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
