'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_GENDEC, type GenDecData, type GenDecAttachment } from '@/lib/pdf/gendec-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · FAL Form 1', h1: 'Buat General Declaration', desc: 'Deklarasi umum kedatangan/keberangkatan kapal (IMO FAL 1).',
    fromPortCall: 'Data kapal terisi otomatis dari Port Call. Lengkapi voyage & lampiran.',
    secVessel: 'Kapal', fVessel: 'Nama kapal', fFlag: 'Bendera', fType: 'Tipe kapal', fMaster: 'Master',
    secVoyage: 'Pelabuhan & Voyage', fMode: 'Arrival / Departure', fPort: 'Pelabuhan', fDateTime: 'Tgl & jam', fLastPort: 'Pelabuhan asal', fNextPort: 'Pelabuhan tujuan', fCrew: 'Jumlah awak', fPax: 'Jumlah pax', fCargoBrief: 'Ringkasan kargo',
    secAtt: 'Dokumen Lampiran', docWord: 'dok', phLabel: 'Nama dokumen', deleteAtt: 'Hapus', addAtt: 'Tambah lampiran',
    sVessel: 'Kapal', sMode: 'Mode', sRoute: 'Rute',
  },
  en: {
    kicker: 'Maritime Documents · FAL Form 1', h1: 'Create General Declaration', desc: 'General declaration of vessel arrival/departure (IMO FAL 1).',
    fromPortCall: 'Vessel details auto-filled from Port Call. Complete the voyage & attachments.',
    secVessel: 'Vessel', fVessel: 'Vessel name', fFlag: 'Flag', fType: 'Vessel type', fMaster: 'Master',
    secVoyage: 'Port & Voyage', fMode: 'Arrival / Departure', fPort: 'Port', fDateTime: 'Date & time', fLastPort: 'Last port', fNextPort: 'Next port', fCrew: 'Crew count', fPax: 'Pax count', fCargoBrief: 'Cargo brief',
    secAtt: 'Attached Documents', docWord: 'docs', phLabel: 'Document name', deleteAtt: 'Delete', addAtt: 'Add attachment',
    sVessel: 'Vessel', sMode: 'Mode', sRoute: 'Route',
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

type Head = Omit<GenDecData, 'tenant' | 'attachments'>

export function GenDecForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, attachments: _a, ...sampleHead } = blankSample(SAMPLE_GENDEC)
  const [head, setHead] = useState<Head>(sampleHead)
  const [attachments, setAttachments] = useState<GenDecAttachment[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_GENDEC, ...head, attachments }), [head, attachments])

  function updateAtt(i: number, key: keyof GenDecAttachment, v: string) {
    setAttachments((prev) => {
      const next = clone(prev)
      next[i][key] = v
      return next
    })
  }
  const addAtt = () => setAttachments((p) => [...p, { label: '', copies: '1' }])
  const removeAtt = (i: number) => setAttachments((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string; cargo?: string; gt?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            grt: p.gt || f.grt,
            cargoBrief: p.cargo || f.cargoBrief,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/gendec?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<GenDecData> | null) => {
        if (!p) return
        const { attachments: pa, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pa)) setAttachments(pa)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/gendec?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/FAL_1?id=${j.id}`)
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
      const res = await fetch(`/api/documents/gendec${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'GENERAL-DECLARATION').replace(/[\\/]/g, '-') + '.pdf'
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
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label={t.fVessel} value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label="Call sign" value={head.callSign ?? ''} onChange={set('callSign')} />
              <Field label={t.fFlag} value={head.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fType} value={head.vesselType ?? ''} onChange={set('vesselType')} />
              <Field label="GRT" value={head.grt ?? ''} onChange={set('grt')} />
              <Field label={t.fMaster} value={head.master} onChange={set('master')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secVoyage}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fMode} value={head.mode} onChange={set('mode')} />
              <Field label={t.fPort} value={head.port} onChange={set('port')} />
              <Field label={t.fDateTime} value={head.dateTime} onChange={set('dateTime')} />
              <Field label="Berth" value={head.berth ?? ''} onChange={set('berth')} />
              <Field label={t.fLastPort} value={head.lastPort} onChange={set('lastPort')} />
              <Field label={t.fNextPort} value={head.nextPort} onChange={set('nextPort')} />
              <Field label="Voyage" value={head.voyage ?? ''} onChange={set('voyage')} />
              <Field label={t.fCrew} value={head.crewCount} onChange={set('crewCount')} />
              <Field label={t.fPax} value={head.passengerCount} onChange={set('passengerCount')} />
              <div className="col-span-2 md:col-span-3">
                <Field label={t.fCargoBrief} value={head.cargoBrief} onChange={set('cargoBrief')} />
              </div>
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secAtt}</h2>
              <span className="text-xs font-mono text-text-secondary">{attachments.length} {t.docWord}</span>
            </div>
            <div className="space-y-2">
              {attachments.map((a, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={a.label} onChange={(e) => updateAtt(i, 'label', e.target.value)} placeholder={t.phLabel} className={`${inputCls} col-span-8 md:col-span-9`} />
                  <input value={a.copies} onChange={(e) => updateAtt(i, 'copies', e.target.value)} placeholder="Copies" className={`${inputCls} col-span-3 md:col-span-2 text-center`} />
                  <button type="button" onClick={() => removeAtt(i)} aria-label={t.deleteAtt} className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addAtt} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t.addAtt}
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
              <div className="flex justify-between text-text-secondary"><span>{t.sMode}</span><span className="text-text-primary">{head.mode}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sRoute}</span><span className="text-text-primary text-right text-xs">{head.lastPort} → {head.nextPort}</span></div>
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
