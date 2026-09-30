'use client'

// Kartu kesehatan pemantauan voyage di Settings › Pekerjaan Terjadwal (PRD-002 Step 5B).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { KesehatanAutomation } from '@/services/automation/monitoring.service'
import { fmtWaktu } from './shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Pemantauan voyage (Automation Hub)', enabled: 'Aktif untuk tenant ini', lastRun: 'Jalan terakhir',
    status: 'Status', checked: 'Voyage dicek', created: 'Sinyal dibuat', failed: 'Voyage gagal', error: 'Kode galat',
    never: 'Belum pernah dijalankan.', loading: 'Memuat…', errLoad: 'Gagal memuat kesehatan pemantauan.',
    open: 'Buka Automation Hub', schedule: 'Dijalankan oleh penjadwal server lewat job voyage-monitoring.',
  },
  en: {
    title: 'Voyage monitoring (Automation Hub)', enabled: 'Enabled for this tenant', lastRun: 'Last run',
    status: 'Status', checked: 'Voyages checked', created: 'Signals created', failed: 'Voyages failed', error: 'Error code',
    never: 'Never run.', loading: 'Loading…', errLoad: 'Failed to load monitoring health.',
    open: 'Open Automation Hub', schedule: 'Run by the server scheduler via the voyage-monitoring job.',
  },
}

export function MonitoringHealthCard() {
  const t = useT(STR)
  const { lang } = useLang()
  const [h, setH] = useState<KesehatanAutomation | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let batal = false
    fetch('/api/automation/health', { cache: 'no-store' })
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

  const run = h?.runTerakhir
  return (
    <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3" aria-labelledby="ah-job-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ah-job-health" className="font-display text-lg text-white">{t.title}</h3>
        <Link href="/automation" className="text-xs text-accent-blue hover:underline">{t.open}</Link>
      </div>
      <p className="text-xs text-text-secondary">{t.enabled} · {t.schedule}</p>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-status-danger">{error}</p>
      ) : !run ? (
        <p className="text-sm text-text-secondary">{t.never}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.lastRun}</dt><dd className="text-text-primary">{fmtWaktu(run.startedAt, lang)}</dd></div>
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.status}</dt><dd className="text-text-primary">{run.status}</dd></div>
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.checked}</dt><dd className="text-text-primary">{run.voyagesChecked}</dd></div>
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.created}</dt><dd className="text-text-primary">{run.signalsCreated}</dd></div>
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.failed}</dt><dd className="text-text-primary">{run.voyagesFailed}</dd></div>
          <div><dt className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.error}</dt><dd className="text-text-primary">{run.errorCode ?? '—'}</dd></div>
        </dl>
      )}
    </section>
  )
}
