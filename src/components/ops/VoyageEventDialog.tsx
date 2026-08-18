'use client'

// Catat Peristiwa (K130, Fase 7g) — form kronologi + tawaran ubah status/isi
// jangkar (sekali klik, TIDAK PERNAH otomatis, K96/K122).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { useLang, useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { KODE_PERISTIWA, LABEL_PERISTIWA, USUL_JANGKAR, USUL_STATUS, type KodePeristiwa } from '@/services/ops/event-codes'
import { particularsForm, type WorkspaceVoyage } from '@/components/voyage/voyage-status'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Catat Peristiwa', desc: 'Fakta bertanda waktu selama kunjungan ini — kronologi, bukan status.',
    fCode: 'Kode Peristiwa', fTime: 'Waktu Kejadian', fDesc: 'Keterangan (wajib untuk "Lainnya")', fRemarks: 'Catatan tambahan',
    cancel: 'Batal', save: 'Catat',
    errCode: 'Kode peristiwa wajib dipilih.', errTime: 'Waktu kejadian wajib diisi.', errDescOther: 'Keterangan wajib diisi untuk kode "Lainnya".',
    errSave: 'Gagal mencatat peristiwa.', errConn: 'Gagal terhubung ke server.',
    offerStatus: 'Ubah status voyage ke', offerAnchor: 'Isi', offerAnchorSuffix: 'voyage dengan waktu peristiwa ini?',
    yes: 'Ya', no: 'Tidak', done: 'Selesai', applied: 'diterapkan', skipped: 'dilewati',
    aATA: 'ATA', aATB: 'ATB', aATD: 'ATD',
  },
  en: {
    title: 'Record Event', desc: 'Timestamped facts during this call — chronology, not status.',
    fCode: 'Event Code', fTime: 'Time Occurred', fDesc: 'Description (required for "Other")', fRemarks: 'Extra remarks',
    cancel: 'Cancel', save: 'Record',
    errCode: 'Event code is required.', errTime: 'Time occurred is required.', errDescOther: 'Description is required for "Other".',
    errSave: 'Failed to record event.', errConn: 'Failed to connect to server.',
    offerStatus: 'Change voyage status to', offerAnchor: 'Fill', offerAnchorSuffix: "voyage with this event's time?",
    yes: 'Yes', no: 'No', done: 'Done', applied: 'applied', skipped: 'skipped',
    aATA: 'ATA', aATB: 'ATB', aATD: 'ATD',
  },
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

type Tahap = 'form' | 'offers'
type OfferState = 'pending' | 'applied' | 'skipped'

export function VoyageEventDialog({
  open,
  onOpenChange,
  voyage,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  voyage: WorkspaceVoyage
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const [tahap, setTahap] = useState<Tahap>('form')
  const [eventCode, setEventCode] = useState<KodePeristiwa | ''>('')
  const [occurredAt, setOccurredAt] = useState(() => toLocalInput(new Date()))
  const [description, setDescription] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [usulStatus, setUsulStatus] = useState<string | null>(null)
  const [usulJangkar, setUsulJangkar] = useState<'ata' | 'atb' | 'atd' | null>(null)
  const [statusState, setStatusState] = useState<OfferState>('pending')
  const [anchorState, setAnchorState] = useState<OfferState>('pending')

  function reset(o: boolean) {
    if (!o) {
      setTahap('form')
      setEventCode('')
      setOccurredAt(toLocalInput(new Date()))
      setDescription('')
      setRemarks('')
      setError('')
      setStatusState('pending')
      setAnchorState('pending')
    }
    onOpenChange(o)
  }

  async function submit() {
    if (!eventCode) {
      setError(t.errCode)
      return
    }
    if (!occurredAt) {
      setError(t.errTime)
      return
    }
    if (eventCode === 'OTHER' && !description.trim()) {
      setError(t.errDescOther)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/voyages/${voyage.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventCode,
          occurredAt: new Date(occurredAt).toISOString(),
          description: description.trim() || null,
          remarks: remarks.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }

      const status = USUL_STATUS[eventCode]
      const jangkar = USUL_JANGKAR[eventCode]
      if ((status && status !== voyage.status) || jangkar) {
        setUsulStatus(status && status !== voyage.status ? status : null)
        setUsulJangkar(jangkar ?? null)
        setTahap('offers')
      } else {
        router.refresh()
        reset(false)
      }
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  async function terapkanStatus() {
    if (!usulStatus) return
    setBusy(true)
    try {
      await fetch(`/api/voyages/${voyage.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: usulStatus }),
      })
      setStatusState('applied')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function terapkanJangkar() {
    if (!usulJangkar) return
    setBusy(true)
    try {
      // GOTCHA (lihat particularsForm/submit() di VoyageWorkspace.tsx): PATCH
      // /api/voyages/:id membaca SELURUH field — mengirim satu field saja
      // akan meng-null-kan sisanya. Form lengkap dikirim, satu field ditimpa.
      const form = particularsForm(voyage)
      const tanggalPeristiwa = occurredAt.slice(0, 10)
      await fetch(`/api/voyages/${voyage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, [usulJangkar]: tanggalPeristiwa, status: voyage.status }),
      })
      setAnchorState('applied')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const labelAnchor = usulJangkar === 'ata' ? t.aATA : usulJangkar === 'atb' ? t.aATB : t.aATD

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && reset(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {tahap === 'form' ? (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>
                {t.fCode} <span className="text-status-danger">*</span>
              </label>
              <select value={eventCode} onChange={(e) => setEventCode(e.target.value as KodePeristiwa)} className={inputCls}>
                <option value="">—</option>
                {KODE_PERISTIWA.map((k) => (
                  <option key={k} value={k}>{LABEL_PERISTIWA[lang][k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                {t.fTime} <span className="text-status-danger">*</span>
              </label>
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fDesc}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t.fRemarks}</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls} />
            </div>

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => reset(false)}
                disabled={busy}
                className="px-4 py-2 rounded text-sm font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.save}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {usulStatus && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-accent-amber/30 bg-accent-amber/5 px-3 py-2.5">
                <span className="text-sm text-text-primary">
                  {t.offerStatus} <span className="font-mono text-accent-amber">{usulStatus}</span>?
                </span>
                {statusState === 'pending' ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" onClick={terapkanStatus} disabled={busy} className="p-1.5 rounded text-status-success hover:bg-status-success/10 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setStatusState('skipped')} disabled={busy} className="p-1.5 rounded text-text-secondary hover:bg-surface-tertiary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary shrink-0">{statusState === 'applied' ? t.applied : t.skipped}</span>
                )}
              </div>
            )}
            {usulJangkar && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-accent-amber/30 bg-accent-amber/5 px-3 py-2.5">
                <span className="text-sm text-text-primary">
                  {t.offerAnchor} <span className="font-mono text-accent-amber">{labelAnchor}</span> {t.offerAnchorSuffix}
                </span>
                {anchorState === 'pending' ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" onClick={terapkanJangkar} disabled={busy} className="p-1.5 rounded text-status-success hover:bg-status-success/10 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setAnchorState('skipped')} disabled={busy} className="p-1.5 rounded text-text-secondary hover:bg-surface-tertiary transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary shrink-0">{anchorState === 'applied' ? t.applied : t.skipped}</span>
                )}
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => reset(false)}
                className="px-4 py-2 rounded text-sm font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors"
              >
                {t.done}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
