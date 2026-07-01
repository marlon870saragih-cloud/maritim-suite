'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_SOF, type SofData, type SofEvent } from '@/lib/pdf/sof-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Statement of Facts',
    desc: 'Catatan kronologis kejadian selama port call (timeline).',
    fromPortCall: 'Data kapal & call terisi otomatis dari Port Call. Lengkapi/ubah daftar event di bawah.',
    secVessel: 'Kapal & Call', fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan', fOperation: 'Operasi',
    fCargo: 'Kargo', fCargoQty: 'Jumlah kargo', fSignRole: 'Penandatangan agen',
    secTimeline: 'Timeline Event', eventWord: 'event', thDate: 'Tanggal', thTime: 'Jam', thDesc: 'Keterangan',
    phDesc: 'Keterangan event', deleteEvent: 'Hapus event', addEvent: 'Tambah event',
    sVessel: 'Kapal', sEvents: 'Jumlah event',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Statement of Facts',
    desc: 'Chronological record of events during the port call (timeline).',
    fromPortCall: 'Vessel & call details auto-filled from Port Call. Complete/edit the event list below.',
    secVessel: 'Vessel & Call', fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port', fOperation: 'Operation',
    fCargo: 'Cargo', fCargoQty: 'Cargo qty', fSignRole: 'Agent signatory',
    secTimeline: 'Event Timeline', eventWord: 'events', thDate: 'Date', thTime: 'Time', thDesc: 'Description',
    phDesc: 'Event description', deleteEvent: 'Delete event', addEvent: 'Add event',
    sVessel: 'Vessel', sEvents: 'Event count',
  },
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

type Head = Omit<SofData, 'tenant' | 'events'>

export function SofForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, events: _e, ...sampleHead } = blankSample(SAMPLE_SOF)
  const [head, setHead] = useState<Head>(sampleHead)
  const [events, setEvents] = useState<SofEvent[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_SOF, ...head, events }), [head, events])

  function updateEvent(i: number, key: keyof SofEvent, v: string) {
    setEvents((prev) => {
      const next = clone(prev)
      next[i][key] = v
      return next
    })
  }
  const addEvent = () => setEvents((p) => [...p, { date: p[p.length - 1]?.date ?? '', time: '', desc: '' }])
  const removeEvent = (i: number) => setEvents((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string; cargo?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            cargo: p.cargo || f.cargo,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/sof?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<SofData> | null) => {
        if (!p) return
        const { events: pe, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pe)) setEvents(pe)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/sof?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/SOF?id=${j.id}`)
      setSavedMsg(c.saved)
      setTimeout(() => setSavedMsg(''), 3000)
    } catch {
      alert(c.saveFail)
    } finally {
      setBusy(null)
    }
  }

  async function generate(download: boolean) {
    setBusy(download ? 'download' : 'preview')
    try {
      const res = await fetch(`/api/documents/sof${download ? '?download=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = (head.docNumber || 'SOF').replace(/[\\/]/g, '-') + '.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(url, '_blank')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      alert(c.pdfFail)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto">
      <Link href="/dokumen" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        {c.backDok}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">{t.kicker}</p>
            <h1 className="font-display text-2xl text-white">{t.h1}</h1>
            <p className="text-text-secondary text-sm mt-1">{t.desc}</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromPortCall}
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secVessel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. SOF" value={head.docNumber} onChange={set('docNumber')} />
              <Field label={t.fVessel} value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={head.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPort} value={head.port} onChange={set('port')} />
              <Field label="Berth" value={head.berth ?? ''} onChange={set('berth')} />
              <Field label={t.fOperation} value={head.operation} onChange={set('operation')} />
              <Field label={t.fCargo} value={head.cargo} onChange={set('cargo')} />
              <Field label={t.fCargoQty} value={head.cargoQty ?? ''} onChange={set('cargoQty')} />
              <Field label="Master" value={head.master ?? ''} onChange={set('master')} />
              <Field label={t.fSignRole} value={head.signRole} onChange={set('signRole')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secTimeline}</h2>
              <span className="text-xs font-mono text-text-secondary">{events.length} {t.eventWord}</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-3">{t.thDate}</div>
              <div className="col-span-2">{t.thTime}</div>
              <div className="col-span-6">{t.thDesc}</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={e.date} onChange={(ev) => updateEvent(i, 'date', ev.target.value)} placeholder="30 Jun 2026" className={`${inputCls} col-span-4 md:col-span-3`} />
                  <input value={e.time} onChange={(ev) => updateEvent(i, 'time', ev.target.value)} placeholder="08:30" className={`${inputCls} col-span-3 md:col-span-2`} />
                  <input value={e.desc} onChange={(ev) => updateEvent(i, 'desc', ev.target.value)} placeholder={t.phDesc} className={`${inputCls} col-span-4 md:col-span-6`} />
                  <button type="button" onClick={() => removeEvent(i)} aria-label={t.deleteEvent} className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addEvent} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t.addEvent}
            </button>
            <div className="mt-4">
              <label className={labelCls}>Remarks</label>
              <textarea value={head.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Port</span><span className="text-text-primary">{head.port || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sEvents}</span><span className="font-mono text-text-primary">{events.length}</span></div>
            </div>
          </div>

          <button type="button" onClick={saveDraft} disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? c.saveChanges : c.saveDraft}
          </button>
          {savedMsg && <p className="text-center text-xs text-accent-teal -mt-1">{savedMsg}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => generate(true)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {c.download}
            </button>
            <button type="button" onClick={() => generate(false)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {c.preview}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
