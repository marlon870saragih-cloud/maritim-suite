'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_NOR, type NorData } from '@/lib/pdf/nor-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Notice of Readiness',
    desc: 'Pemberitahuan kapal siap muat/bongkar ke charterer/principal.',
    fromPortCall: 'Data kapal & call terisi otomatis dari Port Call. Lengkapi waktu & pihak penerima.',
    secVessel: 'Kapal & Operasi', fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan',
    fOperation: 'Operasi (Loading/Discharging)', fCargo: 'Kargo',
    secTo: 'Kepada & Waktu', fTo: 'Kepada (charterer/principal)', fArrDate: 'Tgl tiba', fArrTime: 'Jam tiba',
    fNorDate: 'Tgl NOR', fNorTime: 'Jam NOR',
    sVessel: 'Kapal', sOperation: 'Operasi',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Notice of Readiness',
    desc: 'Notice that the vessel is ready to load/discharge, to the charterer/principal.',
    fromPortCall: 'Vessel & call details auto-filled from Port Call. Complete the times & recipient.',
    secVessel: 'Vessel & Operation', fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port',
    fOperation: 'Operation (Loading/Discharging)', fCargo: 'Cargo',
    secTo: 'Recipient & Time', fTo: 'To (charterer/principal)', fArrDate: 'Arrival date', fArrTime: 'Arrival time',
    fNorDate: 'NOR date', fNorTime: 'NOR time',
    sVessel: 'Vessel', sOperation: 'Operation',
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

type FormState = Omit<NorData, 'tenant'>

export function NorForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, ...sample } = blankSample(SAMPLE_NOR)
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_NOR, ...form }), [form])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string; cargo?: string; principal?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setForm((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            cargo: p.cargo || f.cargo,
            toName: p.principal || f.toName,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/nor?id=${id}&json=1`)
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
      const res = await fetch(`/api/documents/nor?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/NOR?id=${j.id}`)
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
      const res = await fetch(`/api/documents/nor${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'NOR').replace(/[\\/]/g, '-') + '.pdf'
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
              <Field label="No. NOR" value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fVessel} value={form.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={form.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={form.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPort} value={form.port} onChange={set('port')} />
              <Field label="Berth / area" value={form.berth ?? ''} onChange={set('berth')} />
              <Field label={t.fOperation} value={form.operation} onChange={set('operation')} />
              <Field label={t.fCargo} value={form.cargo} onChange={set('cargo')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secTo}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fTo} value={form.toName} onChange={set('toName')} />
              <Field label="Attn" value={form.toAttn ?? ''} onChange={set('toAttn')} />
              <Field label="Master" value={form.masterName} onChange={set('masterName')} />
              <Field label={t.fArrDate} value={form.arrivedDate} onChange={set('arrivedDate')} />
              <Field label={t.fArrTime} value={form.arrivedTime} onChange={set('arrivedTime')} />
              <Field label={t.fNorDate} value={form.noticeDate} onChange={set('noticeDate')} />
              <Field label={t.fNorTime} value={form.noticeTime} onChange={set('noticeTime')} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>Remarks</label>
              <textarea value={form.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={3} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sOperation}</span><span className="text-text-primary">{form.operation || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>NOR</span><span className="font-mono text-text-primary">{form.noticeDate} {form.noticeTime}</span></div>
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
