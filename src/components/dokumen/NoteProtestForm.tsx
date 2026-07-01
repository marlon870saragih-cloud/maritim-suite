'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_NOTEPROTEST, type NoteProtestData } from '@/lib/pdf/noteprotest-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Note of Protest',
    desc: 'Protes laut Nakhoda atas cuaca/laut buruk, dicatat di hadapan otoritas.',
    fromPortCall: 'Data kapal & pelabuhan terisi otomatis dari Port Call. Lengkapi pelayaran & isi protes.',
    secVoyage: 'Kapal & Pelayaran', fPlace: 'Tempat dicatat', fDate: 'Tanggal', fMaster: 'Nakhoda', fVessel: 'Nama kapal', fFlag: 'Bendera',
    fVoyage: 'No. Voyage', fFromPort: 'Dari pelabuhan', fToPort: 'Ke pelabuhan', fCargo: 'Kargo', fDepDate: 'Tgl berangkat', fArrDate: 'Tgl tiba',
    secProtest: 'Isi Protes', fStatement: 'Uraian kondisi (cuaca/laut yang dihadapi)', fReservation: 'Klausul reservasi hak', fNotedBefore: 'Dicatat di hadapan (Notaris/Syahbandar)',
    sVessel: 'Kapal', sMaster: 'Nakhoda', sDate: 'Tanggal',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Note of Protest',
    desc: "Master's sea protest over bad weather/sea, recorded before an authority.",
    fromPortCall: 'Vessel & port auto-filled from Port Call. Complete the voyage & protest content.',
    secVoyage: 'Vessel & Voyage', fPlace: 'Place recorded', fDate: 'Date', fMaster: 'Master', fVessel: 'Vessel name', fFlag: 'Flag',
    fVoyage: 'Voyage no.', fFromPort: 'From port', fToPort: 'To port', fCargo: 'Cargo', fDepDate: 'Departure date', fArrDate: 'Arrival date',
    secProtest: 'Protest Content', fStatement: 'Conditions description (weather/sea encountered)', fReservation: 'Reservation of rights clause', fNotedBefore: 'Recorded before (Notary/Harbour Master)',
    sVessel: 'Vessel', sMaster: 'Master', sDate: 'Date',
  },
}

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

type FormState = Omit<NoteProtestData, 'tenant'>

export function NoteProtestForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, ...sample } = blankSample(SAMPLE_NOTEPROTEST)
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_NOTEPROTEST, ...form }), [form])

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
          setForm((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            place: p.port || f.place,
            toPort: p.port || f.toPort,
            cargo: p.cargo || f.cargo,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/note-protest?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<FormState> | null) => {
        if (!p) return
        setForm((f) => ({ ...f, ...p }))
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/note-protest?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/NOTE_OF_PROTEST?id=${j.id}`)
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
      const res = await fetch(`/api/documents/note-protest${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'NOP').replace(/[\\/]/g, '-') + '.pdf'
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
            <h2 className="font-display text-base text-white mb-4">{t.secVoyage}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. NOP" value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fPlace} value={form.place} onChange={set('place')} />
              <Field label={t.fDate} value={form.date} onChange={set('date')} />
              <Field label={t.fMaster} value={form.masterName} onChange={set('masterName')} />
              <Field label={t.fVessel} value={form.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={form.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={form.flag ?? ''} onChange={set('flag')} />
              <Field label="GRT" value={form.grt ?? ''} onChange={set('grt')} />
              <Field label={t.fVoyage} value={form.voyageNo ?? ''} onChange={set('voyageNo')} />
              <Field label={t.fFromPort} value={form.fromPort} onChange={set('fromPort')} />
              <Field label={t.fToPort} value={form.toPort} onChange={set('toPort')} />
              <Field label={t.fCargo} value={form.cargo} onChange={set('cargo')} />
              <Field label={t.fDepDate} value={form.departureDate} onChange={set('departureDate')} />
              <Field label={t.fArrDate} value={form.arrivalDate} onChange={set('arrivalDate')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secProtest}</h2>
            <div>
              <label className={labelCls}>{t.fStatement}</label>
              <textarea value={form.statement} onChange={(e) => set('statement')(e.target.value)} rows={5} className={inputCls} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>{t.fReservation}</label>
              <textarea value={form.reservation} onChange={(e) => set('reservation')(e.target.value)} rows={4} className={inputCls} />
            </div>
            <div className="mt-3">
              <Field label={t.fNotedBefore} value={form.notedBefore} onChange={set('notedBefore')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sMaster}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.masterName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sDate}</span><span className="font-mono text-text-primary">{form.date || '—'}</span></div>
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
