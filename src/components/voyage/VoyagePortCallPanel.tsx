'use client'

import Link from 'next/link'
import { Anchor, ExternalLink, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, type Lang } from '@/lib/i18n'
import { STATUS_LABEL, type PortCallStatusStr } from '@/lib/portcalls'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    add: 'Tambah Port Call',
    emptyTitle: 'Belum ada port call',
    emptyDesc: 'Port call = catatan kunjungan di satu pelabuhan. Yang dibuat dari sini otomatis tertaut ke voyage ini.',
    hint: 'Port call dibuat/diubah di halaman Port Call — form & aturannya satu, hanya pintu masuknya dari sini.',
    manage: 'Kelola di halaman Port Call',
    eta: 'ETA', etd: 'ETD', cargo: 'Kargo', notes: 'Catatan',
    st_UPCOMING: 'Akan Datang', st_IN_PORT: 'Di Pelabuhan', st_DEPARTED: 'Berangkat', st_CANCELLED: 'Dibatalkan',
  },
  en: {
    add: 'Add Port Call',
    emptyTitle: 'No port calls yet',
    emptyDesc: 'A port call records the stay at one port. Ones created from here are linked to this voyage automatically.',
    hint: 'Port calls are created/edited on the Port Call page — same form and rules, only the entry point is here.',
    manage: 'Manage on Port Call page',
    eta: 'ETA', etd: 'ETD', cargo: 'Cargo', notes: 'Notes',
    st_UPCOMING: 'Upcoming', st_IN_PORT: 'In Port', st_DEPARTED: 'Departed', st_CANCELLED: 'Cancelled',
  },
}

export type VoyagePortCallRow = {
  id: string
  port: string
  portCode: string | null
  status: PortCallStatusStr
  eta: string | Date | null
  etd: string | Date | null
  cargo: string | null
  cargoQty: string | null
  cargoUnit: string | null
  notes: string | null
}

const STATUS_CLS: Record<PortCallStatusStr, string> = {
  UPCOMING: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  IN_PORT: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20',
  DEPARTED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/10 text-status-danger border-status-danger/30',
}
const DOT_CLS: Record<PortCallStatusStr, string> = {
  UPCOMING: 'bg-accent-blue',
  IN_PORT: 'bg-accent-teal',
  DEPARTED: 'bg-text-secondary',
  CANCELLED: 'bg-status-danger',
}

function fmtDate(d: string | Date | null) {
  if (!d) return '—'
  const v = new Date(d)
  if (Number.isNaN(v.getTime())) return '—'
  return v.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function VoyagePortCallPanel({
  voyageId,
  portCalls,
}: {
  voyageId: string
  portCalls: VoyagePortCallRow[]
}) {
  const t = useT(STR)
  const stLabel = (s: PortCallStatusStr) => t['st_' + s] ?? STATUS_LABEL[s]

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-text-secondary text-[11px] max-w-xl">{t.hint}</p>
        <Link
          href={`/portcall?voyage=${voyageId}`}
          className="inline-flex items-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t.add}
        </Link>
      </div>

      {portCalls.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="p-3 rounded-full bg-surface-tertiary text-text-secondary">
            <Anchor className="w-5 h-5" />
          </div>
          <div>
            <p className="text-text-primary text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-text-secondary text-xs mt-1 max-w-md">{t.emptyDesc}</p>
          </div>
        </div>
      ) : (
        <ol className="relative border-l border-card-border/70 ml-2 space-y-4">
          {portCalls.map((pc) => (
            <li key={pc.id} className="relative pl-5">
              <span
                className={cn(
                  'absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full ring-4 ring-card-bg',
                  DOT_CLS[pc.status],
                )}
              />
              <div className="rounded-md border border-card-border/60 bg-surface/30 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-text-primary text-sm">
                      {pc.port}
                      {pc.portCode ? <span className="text-text-secondary/60"> ({pc.portCode})</span> : null}
                    </p>
                    <p className="text-[11px] text-text-secondary font-mono mt-0.5">
                      {t.eta} {fmtDate(pc.eta)} · {t.etd} {fmtDate(pc.etd)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider',
                      STATUS_CLS[pc.status],
                    )}
                  >
                    {stLabel(pc.status)}
                  </span>
                </div>
                {(pc.cargo || pc.notes) && (
                  <div className="mt-2 grid gap-1 text-xs text-text-secondary">
                    {pc.cargo && (
                      <p>
                        <span className="font-mono uppercase tracking-wider text-[10px]">{t.cargo}:</span>{' '}
                        {pc.cargo} {pc.cargoQty ?? ''} {pc.cargoUnit ?? ''}
                      </p>
                    )}
                    {pc.notes && (
                      <p>
                        <span className="font-mono uppercase tracking-wider text-[10px]">{t.notes}:</span> {pc.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {portCalls.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Link
            href="/portcall"
            className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-accent-blue transition-colors"
          >
            {t.manage} <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </>
  )
}
