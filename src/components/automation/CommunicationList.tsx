'use client'

// Daftar Komunikasi (Simulasi) — WA-1 Step 2I. Sumber: GET /api/automation/communications/candidates
// (Step 2H). Penerima selalu tersamarkan di daftar; tanpa body maupun pengenal utuh.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { HasilDaftarCandidate, RingkasCandidate } from '@/services/communication/communication-read.service'
import { btnCls, fmtWaktu } from './shared'
import { LABEL_KELUARGA, LABEL_STATE_CANDIDATE, SimulasiBanner, StateBadge, jelaskanAlasan, panggilApi } from './comm-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    state: 'Status kandidat', all: 'Semua', active: 'Aktif', blocked: 'Diblokir', refresh: 'Muat ulang', more: 'Muat lebih banyak',
    loading: 'Memuat komunikasi…', empty: 'Belum ada kandidat komunikasi. Siapkan dari sinyal di Alerts.', voyage: 'Voyage',
    recipient: 'Penerima', revisions: 'revisi', noMessage: 'Belum ada pesan', open: 'Buka', updated: 'Diperbarui',
  },
  en: {
    state: 'Candidate state', all: 'All', active: 'Active', blocked: 'Blocked', refresh: 'Reload', more: 'Load more',
    loading: 'Loading communications…', empty: 'No communication candidates yet. Prepare one from a signal in Alerts.', voyage: 'Voyage',
    recipient: 'Recipient', revisions: 'revisions', noMessage: 'No message yet', open: 'Open', updated: 'Updated',
  },
}

const selectCls =
  'bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'

export function CommunicationList() {
  const t = useT(STR)
  const { lang } = useLang()
  const [rows, setRows] = useState<RingkasCandidate[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [state, setState] = useState<'' | 'ACTIVE' | 'BLOCKED'>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (lanjut: string | null) => {
      setLoading(true)
      setError('')
      const q = new URLSearchParams({ take: '20' })
      if (state) q.set('state', state)
      if (lanjut) q.set('cursor', lanjut)
      const r = await panggilApi<{ data: HasilDaftarCandidate }>(`/candidates?${q.toString()}`)
      if (r.ok) {
        setRows((lama) => (lanjut ? [...lama, ...r.data.data.items] : r.data.data.items))
        setCursor(r.data.data.nextCursor)
      } else {
        setError(r.pesan)
      }
      setLoading(false)
    },
    [state],
  )

  useEffect(() => {
    void load(null)
  }, [load])

  return (
    <div className="space-y-4">
      <SimulasiBanner lang={lang} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
          {t.state}
          <select className={selectCls} value={state} onChange={(e) => setState(e.target.value as '' | 'ACTIVE' | 'BLOCKED')}>
            <option value="">{t.all}</option>
            <option value="ACTIVE">{t.active}</option>
            <option value="BLOCKED">{t.blocked}</option>
          </select>
        </label>
        <button type="button" onClick={() => void load(null)} disabled={loading} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}
        </p>
      ) : rows.length === 0 && !error ? (
        <p className="rounded border border-dashed border-border-muted px-4 py-8 text-center text-sm text-text-secondary">{t.empty}</p>
      ) : (
        <ul className="space-y-3" data-testid="daftar-komunikasi">
          {rows.map((c) => (
            <li key={c.id} className="rounded-lg border border-card-border bg-surface/30 p-4 min-w-0" data-testid="baris-komunikasi">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{LABEL_KELUARGA[lang][c.family] ?? c.family}</span>
                <StateBadge state={c.state} lang={lang} kamus={LABEL_STATE_CANDIDATE} />
                {c.pesanTerakhir && <StateBadge state={c.pesanTerakhir.state} lang={lang} />}
                <Link href={`/voyages/${c.voyageId}`} className="text-xs font-mono text-accent-blue hover:underline break-all">
                  {t.voyage} {c.voyageNumber ?? '—'}
                </Link>
              </div>
              <p className="mt-2 text-[11px] font-mono text-text-secondary break-words">
                {c.pesanTerakhir
                  ? `${t.recipient} ${c.pesanTerakhir.penerima} · ${c.pesanTerakhir.language} · ${c.jumlahRevisi} ${t.revisions}`
                  : t.noMessage}
                {` · ${t.updated} ${fmtWaktu(c.updatedAt, lang)}`}
              </p>
              {(c.blockReason || c.pesanTerakhir?.reasonCode) && (
                <p className="mt-1 text-xs text-text-secondary">{jelaskanAlasan(c.blockReason ?? c.pesanTerakhir?.reasonCode, lang)}</p>
              )}
              <Link href={`/automation/communications/${c.id}`} className={cn(btnCls, 'mt-3 bg-accent-blue hover:bg-primary text-[#231a06]')}>
                {t.open}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <button type="button" onClick={() => void load(cursor)} disabled={loading} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {t.more}
        </button>
      )}
    </div>
  )
}
