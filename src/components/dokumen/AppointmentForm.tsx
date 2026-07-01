'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_APPOINTMENT, type AppointmentData } from '@/lib/pdf/appointment-data'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Clearance & SIB', h1: 'Buat Agency Appointment',
    desc: 'Surat penunjukan/konfirmasi keagenan untuk port call.',
    fromPortCall: 'Data kapal & principal terisi otomatis dari Port Call. Sesuaikan lingkup layanan.',
    secTo: 'Kepada & Kapal', fTo: 'Kepada (principal)', fAddr: 'Alamat', fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan', fDate: 'Tanggal',
    secBody: 'Isi Surat', fIntro: 'Paragraf pembuka', fScope: 'Lingkup layanan', pointsWord: 'poin', phService: 'Layanan…', deletePoint: 'Hapus', addPoint: 'Tambah poin',
    fValidity: 'Masa berlaku', fSignName: 'Penandatangan', fSignRole: 'Jabatan',
    sPrincipal: 'Principal', sVessel: 'Kapal', sScope: 'Lingkup',
  },
  en: {
    kicker: 'Maritime Documents · Clearance & SIB', h1: 'Create Agency Appointment',
    desc: 'Agency appointment/confirmation letter for the port call.',
    fromPortCall: 'Vessel & principal auto-filled from Port Call. Adjust the service scope.',
    secTo: 'Recipient & Vessel', fTo: 'To (principal)', fAddr: 'Address', fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port', fDate: 'Date',
    secBody: 'Letter Content', fIntro: 'Opening paragraph', fScope: 'Service scope', pointsWord: 'points', phService: 'Service…', deletePoint: 'Delete', addPoint: 'Add point',
    fValidity: 'Validity', fSignName: 'Signatory', fSignRole: 'Title',
    sPrincipal: 'Principal', sVessel: 'Vessel', sScope: 'Scope',
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

type Head = Omit<AppointmentData, 'tenant' | 'scope'>

export function AppointmentForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, scope: _s, ...sampleHead } = SAMPLE_APPOINTMENT
  const [head, setHead] = useState<Head>(sampleHead)
  const [scope, setScope] = useState<string[]>(clone(SAMPLE_APPOINTMENT.scope))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_APPOINTMENT, ...head, scope }), [head, scope])

  const updateScope = (i: number, v: string) => setScope((p) => p.map((s, j) => (j === i ? v : s)))
  const addScope = () => setScope((p) => [...p, ''])
  const removeScope = (i: number) => setScope((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string; eta?: string; principal?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            eta: p.eta || f.eta,
            toName: p.principal || f.toName,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/appointment?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<AppointmentData> | null) => {
        if (!p) return
        const { scope: ps, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(ps)) setScope(ps)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/appointment?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/AGENCY_APPOINTMENT?id=${j.id}`)
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
      const res = await fetch(`/api/documents/appointment${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'AGENCY-APPOINTMENT').replace(/[\\/]/g, '-') + '.pdf'
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
            <h2 className="font-display text-base text-white mb-4">{t.secTo}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label={t.fDate} value={head.date} onChange={set('date')} />
              <Field label={t.fTo} value={head.toName} onChange={set('toName')} />
              <Field label="Attn" value={head.toAttn ?? ''} onChange={set('toAttn')} />
              <div className="col-span-2 md:col-span-1">
                <Field label={t.fAddr} value={head.toAddress ?? ''} onChange={set('toAddress')} />
              </div>
              <Field label={t.fVessel} value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={head.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPort} value={head.port} onChange={set('port')} />
              <Field label="ETA" value={head.eta ?? ''} onChange={set('eta')} />
              <Field label="Voyage" value={head.voyage ?? ''} onChange={set('voyage')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secBody}</h2>
            <div>
              <label className={labelCls}>{t.fIntro}</label>
              <textarea value={head.intro} onChange={(e) => set('intro')(e.target.value)} rows={3} className={inputCls} />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>{t.fScope}</label>
                <span className="text-xs font-mono text-text-secondary">{scope.length} {t.pointsWord}</span>
              </div>
              <div className="space-y-2">
                {scope.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-accent-amber font-mono text-sm pt-2 w-5">{i + 1}.</span>
                    <input value={s} onChange={(e) => updateScope(i, e.target.value)} placeholder={t.phService} className={inputCls} />
                    <button type="button" onClick={() => removeScope(i)} aria-label={t.deletePoint} className="flex items-center justify-center h-9 w-9 flex-none rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addScope} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
                <Plus className="w-3.5 h-3.5" />
                {t.addPoint}
              </button>
            </div>
            <div className="mt-4">
              <label className={labelCls}>{t.fValidity}</label>
              <input value={head.validity} onChange={(e) => set('validity')(e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label={t.fSignName} value={head.signName} onChange={set('signName')} />
              <Field label={t.fSignRole} value={head.signRole} onChange={set('signRole')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sPrincipal}</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.toName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sScope}</span><span className="font-mono text-text-primary">{scope.length} {t.pointsWord}</span></div>
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
