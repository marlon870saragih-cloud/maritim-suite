'use client'

// Daftar sinyal Automation Hub + review (ACKNOWLEDGE / DISMISS) — PRD-002 Step 5B.
// Dipakai halaman Alerts (lintas voyage) dan section pemantauan di halaman voyage.
// Peninjauan hanya mengubah status sinyal; tak pernah menyentuh data voyage.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { SinyalDto } from '@/services/automation/monitoring.service'
import { LABEL_JENIS, LABEL_REVIEW, SeverityBadge, btnCls, fmtWaktu } from './shared'

type Filter = 'OPEN' | 'ALL'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    filterState: 'Status', open: 'Terbuka', all: 'Semua', filterSeverity: 'Severity', anySeverity: 'Semua severity',
    refresh: 'Muat ulang', loading: 'Memuat sinyal…', empty: 'Tidak ada sinyal untuk filter ini.',
    errLoad: 'Gagal memuat sinyal.', disabled: 'Automation Hub tidak aktif untuk akun ini.',
    recommendation: 'Rekomendasi', source: 'Sumber', detected: 'Terdeteksi', sourceAt: 'waktu sumber',
    reviewedBy: 'Ditinjau oleh', note: 'Catatan', acknowledge: 'Akui', dismiss: 'Abaikan',
    confirmAck: 'Akui sinyal ini?', confirmDismiss: 'Abaikan sinyal ini?', noteLabel: 'Catatan (opsional, maks. 500)',
    confirm: 'Konfirmasi', cancel: 'Batal', errReview: 'Gagal meninjau sinyal.', voyage: 'Voyage',
  },
  en: {
    filterState: 'State', open: 'Open', all: 'All', filterSeverity: 'Severity', anySeverity: 'Any severity',
    refresh: 'Reload', loading: 'Loading signals…', empty: 'No signals for this filter.',
    errLoad: 'Failed to load signals.', disabled: 'Automation Hub is not enabled for this account.',
    recommendation: 'Recommendation', source: 'Source', detected: 'Detected', sourceAt: 'source time',
    reviewedBy: 'Reviewed by', note: 'Note', acknowledge: 'Acknowledge', dismiss: 'Dismiss',
    confirmAck: 'Acknowledge this signal?', confirmDismiss: 'Dismiss this signal?', noteLabel: 'Note (optional, max 500)',
    confirm: 'Confirm', cancel: 'Cancel', errReview: 'Failed to review signal.', voyage: 'Voyage',
  },
}

const selectCls =
  'bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'

export function SignalList({ voyageId, showVoyage = true }: { voyageId?: string; showVoyage?: boolean }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [rows, setRows] = useState<SinyalDto[]>([])
  const [state, setState] = useState<Filter>('OPEN')
  const [severity, setSeverity] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ id: string; decision: 'ACKNOWLEDGE' | 'DISMISS' } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams()
      if (voyageId) q.set('voyageId', voyageId)
      if (state === 'OPEN') q.set('state', 'OPEN')
      if (severity) q.set('severity', severity)
      const res = await fetch(`/api/automation/signals?${q.toString()}`, { cache: 'no-store' })
      if (res.status === 404) {
        setError(t.disabled)
        setRows([])
        return
      }
      const body = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(body)) {
        setError(body?.error?.message ?? t.errLoad)
        setRows([])
        return
      }
      setRows(body)
    } catch {
      setError(t.errLoad)
    } finally {
      setLoading(false)
    }
  }, [voyageId, state, severity, t.disabled, t.errLoad])

  useEffect(() => {
    void load()
  }, [load])

  async function submitReview() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/automation/signals/${pending.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: pending.decision, note: note.trim() || undefined }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? t.errReview)
        return
      }
      setPending(null)
      setNote('')
      await load()
    } catch {
      setError(t.errReview)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
          {t.filterState}
          <select className={selectCls} value={state} onChange={(e) => setState(e.target.value as Filter)}>
            <option value="OPEN">{t.open}</option>
            <option value="ALL">{t.all}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
          {t.filterSeverity}
          <select className={selectCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">{t.anySeverity}</option>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} disabled={loading} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {loading ? t.loading : ''}
      </div>

      {error && (
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}
        </p>
      ) : rows.length === 0 && !error ? (
        <p className="rounded border border-dashed border-border-muted px-4 py-8 text-center text-sm text-text-secondary">{t.empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const sedangTinjau = pending?.id === s.id
            return (
              <li key={s.id} className="rounded-lg border border-card-border bg-surface/30 p-4 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={s.severity} lang={lang} />
                  <span className="text-sm font-medium text-text-primary">{LABEL_JENIS[lang][s.kind] ?? s.kind}</span>
                  <span className="rounded-full border border-border-muted px-2 py-0.5 text-[10px] text-text-secondary">
                    {LABEL_REVIEW[lang][s.reviewState] ?? s.reviewState}
                  </span>
                  {showVoyage && (
                    <Link href={`/voyages/${s.voyageId}`} className="text-xs font-mono text-accent-blue hover:underline break-all">
                      {t.voyage} {s.voyageNumber}
                    </Link>
                  )}
                </div>

                <p className="mt-2 text-sm text-text-primary break-words">{s.explanation}</p>
                <p className="mt-1 text-sm text-text-secondary break-words">
                  <span className="font-medium text-text-primary">{t.recommendation}:</span> {s.recommendation}
                </p>
                <p className="mt-2 text-[11px] font-mono text-text-secondary break-words">
                  {t.detected} {fmtWaktu(s.detectedAt, lang)} · {t.source} {s.sourceType}
                  {s.sourceAt ? ` · ${t.sourceAt} ${fmtWaktu(s.sourceAt, lang)}` : ''}
                </p>
                {s.reviewedAt && (
                  <p className="mt-1 text-[11px] text-text-secondary break-words">
                    {t.reviewedBy} {s.reviewedByName ?? '—'} · {fmtWaktu(s.reviewedAt, lang)}
                    {s.reviewNote ? ` · ${t.note}: ${s.reviewNote}` : ''}
                  </p>
                )}

                {s.reviewState === 'OPEN' && !sedangTinjau && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => { setPending({ id: s.id, decision: 'ACKNOWLEDGE' }); setNote('') }}
                      className={cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')}
                    >
                      {t.acknowledge}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPending({ id: s.id, decision: 'DISMISS' }); setNote('') }}
                      className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}
                    >
                      {t.dismiss}
                    </button>
                  </div>
                )}

                {sedangTinjau && pending && (
                  <div className="mt-3 space-y-2 rounded border border-accent-blue/30 bg-accent-blue/5 p-3">
                    <p className="text-sm text-text-primary">{pending.decision === 'ACKNOWLEDGE' ? t.confirmAck : t.confirmDismiss}</p>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                      {t.noteLabel}
                      <textarea
                        value={note}
                        maxLength={500}
                        rows={2}
                        onChange={(e) => setNote(e.target.value)}
                        className="mt-1 w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary normal-case tracking-normal font-sans focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void submitReview()} disabled={busy} className={cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')}>
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {t.confirm}
                      </button>
                      <button type="button" onClick={() => { setPending(null); setNote('') }} disabled={busy} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
