'use client'

// Timeline (K131/K132, Fase 7g) — gabungan 8 sumber, HANYA-BACA. Tak satu pun
// butir bisa diubah dari layar ini; setiap butir berklik ke entitasnya
// sendiri (K132) bila entitasnya punya halaman.

import { useEffect, useState } from 'react'
import {
  Banknote, Clock, FileText, MessageSquare, Paperclip, Receipt, Send, Timer,
} from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { SumberTimeline } from '@/services/ops/timeline'

const STR: Record<Lang, Record<string, string>> = {
  id: { empty: 'Belum ada peristiwa tercatat pada voyage ini.', errLoad: 'Gagal memuat timeline.', errConn: 'Gagal terhubung ke server.' },
  en: { empty: 'No events recorded on this voyage yet.', errLoad: 'Failed to load timeline.', errConn: 'Failed to connect to server.' },
}

type Butir = {
  waktu: string
  sumber: SumberTimeline
  judul: string
  detail: string | null
  href: string | null
  aktor: string | null
}

const IKON: Record<SumberTimeline, typeof Clock> = {
  EVENT: Timer,
  STATUS: Clock,
  TASK: FileText,
  DISBURSEMENT: Receipt,
  INVOICE: Banknote,
  COMMENT: MessageSquare,
  ATTACHMENT: Paperclip,
  EMAIL: Send,
}

const WARNA: Record<SumberTimeline, string> = {
  EVENT: 'text-accent-teal bg-accent-teal/10 border-accent-teal/30',
  STATUS: 'text-accent-blue bg-accent-blue/10 border-accent-blue/30',
  TASK: 'text-accent-purple bg-accent-purple/10 border-accent-purple/30',
  DISBURSEMENT: 'text-accent-amber bg-accent-amber/10 border-accent-amber/30',
  INVOICE: 'text-status-success bg-status-success/10 border-status-success/30',
  COMMENT: 'text-text-secondary bg-surface-tertiary border-border-muted',
  ATTACHMENT: 'text-text-secondary bg-surface-tertiary border-border-muted',
  EMAIL: 'text-text-secondary bg-surface-tertiary border-border-muted',
}

export function TimelinePanel({ voyageId, refreshKey }: { voyageId: string; refreshKey?: number }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [rows, setRows] = useState<Butir[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let dibatalkan = false
    setError('')
    fetch(`/api/voyages/${voyageId}/timeline?bahasa=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Butir[]) => {
        if (!dibatalkan) setRows(d)
      })
      .catch(() => {
        if (!dibatalkan) setError(t.errLoad)
      })
    return () => {
      dibatalkan = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voyageId, lang, refreshKey])

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  if (error) return <p className="text-status-danger text-sm">{error}</p>
  if (!rows) return null
  if (rows.length === 0) return <p className="text-text-secondary text-sm">{t.empty}</p>

  return (
    <ol className="space-y-2.5">
      {rows.map((b, i) => {
        const Icon = IKON[b.sumber]
        const isi = (
          <div className="flex items-start gap-3">
            <span className={`shrink-0 p-1.5 rounded-full border ${WARNA[b.sumber]}`}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-text-primary text-sm">{b.judul}</p>
              {b.detail && <p className="text-text-secondary text-xs mt-0.5">{b.detail}</p>}
              <p className="text-text-secondary text-[10px] font-mono mt-0.5">
                {fmt(b.waktu)}
                {b.aktor && ` · ${b.aktor}`}
              </p>
            </div>
          </div>
        )
        return (
          <li key={`${b.sumber}-${b.waktu}-${i}`} className="border-b border-card-border/40 pb-2.5 last:border-0 last:pb-0">
            {b.href ? (
              <a href={b.href} className="block hover:opacity-80 transition-opacity">
                {isi}
              </a>
            ) : (
              isi
            )}
          </li>
        )
      })}
    </ol>
  )
}
