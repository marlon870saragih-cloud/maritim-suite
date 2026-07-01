'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_LOI, type LoiData } from '@/lib/pdf/loi-data'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Clearance & SIB', h1: 'Buat Letter of Indemnity',
    desc: 'Surat jaminan ganti rugi (mis. serah-terima kargo tanpa B/L asli).',
    fromPortCall: 'Data kapal, pelabuhan & kargo terisi otomatis dari Port Call. Lengkapi pihak & isi jaminan.',
    secIssue: 'Penerbitan & Pihak', fPlace: 'Tempat', fDate: 'Tanggal', fFrom: 'Dari (pemberi jaminan)', fTo: 'Kepada (penerima)', fSubject: 'Perihal (Re:)',
    secVessel: 'Kapal & Kargo', fVessel: 'Nama kapal', fFlag: 'Bendera', fVoyage: 'No. Voyage', fPort: 'Pelabuhan', fBl: 'No. B/L', fCargo: 'Kargo', fCargoQty: 'Jumlah kargo',
    secUndertaking: 'Isi Jaminan', fUndertaking: 'Pernyataan jaminan (undertaking)', fAmount: 'Nilai / batas jaminan', fValidity: 'Masa berlaku', fSignName: 'Nama penanda tangan', fSignTitle: 'Jabatan penanda tangan',
    sVessel: 'Kapal', sFrom: 'Dari', sDate: 'Tanggal',
  },
  en: {
    kicker: 'Maritime Documents · Clearance & SIB', h1: 'Create Letter of Indemnity',
    desc: 'Letter of indemnity (e.g. cargo delivery without the original B/L).',
    fromPortCall: 'Vessel, port & cargo auto-filled from Port Call. Complete the parties & undertaking.',
    secIssue: 'Issuance & Parties', fPlace: 'Place', fDate: 'Date', fFrom: 'From (indemnifier)', fTo: 'To (recipient)', fSubject: 'Subject (Re:)',
    secVessel: 'Vessel & Cargo', fVessel: 'Vessel name', fFlag: 'Flag', fVoyage: 'Voyage no.', fPort: 'Port', fBl: 'B/L no.', fCargo: 'Cargo', fCargoQty: 'Cargo qty',
    secUndertaking: 'Undertaking', fUndertaking: 'Undertaking statement', fAmount: 'Value / indemnity limit', fValidity: 'Validity', fSignName: 'Signatory name', fSignTitle: 'Signatory title',
    sVessel: 'Vessel', sFrom: 'From', sDate: 'Date',
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

type FormState = Omit<LoiData, 'tenant'>

export function LoiForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, ...sample } = SAMPLE_LOI
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_LOI, ...form }), [form])

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
            place: p.port || f.place,
            cargo: p.cargo || f.cargo,
            fromName: p.principal || f.fromName,
            toName: p.vesselName ? `Owners of ${p.vesselName}` : f.toName,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/loi?id=${id}&json=1`)
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
      const res = await fetch(`/api/documents/loi?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/LETTER_OF_INDEMNITY?id=${j.id}`)
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
      const res = await fetch(`/api/documents/loi${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'LOI').replace(/[\\/]/g, '-') + '.pdf'
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
            <h2 className="font-display text-base text-white mb-4">{t.secIssue}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. LOI" value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fPlace} value={form.place} onChange={set('place')} />
              <Field label={t.fDate} value={form.date} onChange={set('date')} />
              <Field label={t.fFrom} value={form.fromName} onChange={set('fromName')} />
              <Field label={t.fTo} value={form.toName} onChange={set('toName')} />
              <Field label="Attn" value={form.toAttn ?? ''} onChange={set('toAttn')} />
            </div>
            <div className="mt-3">
              <Field label={t.fSubject} value={form.subject} onChange={set('subject')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secVessel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fVessel} value={form.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={form.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={form.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fVoyage} value={form.voyageNo ?? ''} onChange={set('voyageNo')} />
              <Field label={t.fPort} value={form.port} onChange={set('port')} />
              <Field label={t.fBl} value={form.blNumber ?? ''} onChange={set('blNumber')} />
              <Field label={t.fCargo} value={form.cargo} onChange={set('cargo')} />
              <Field label={t.fCargoQty} value={form.cargoQty ?? ''} onChange={set('cargoQty')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secUndertaking}</h2>
            <div>
              <label className={labelCls}>{t.fUndertaking}</label>
              <textarea value={form.undertaking} onChange={(e) => set('undertaking')(e.target.value)} rows={7} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label={t.fAmount} value={form.amount ?? ''} onChange={set('amount')} />
              <Field label={t.fValidity} value={form.validity ?? ''} onChange={set('validity')} />
              <Field label={t.fSignName} value={form.signatoryName} onChange={set('signatoryName')} />
              <Field label={t.fSignTitle} value={form.signatoryTitle} onChange={set('signatoryTitle')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sFrom}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.fromName || '—'}</span></div>
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
