'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_BL, type BlData } from '@/lib/pdf/bl-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Bill of Lading',
    desc: 'BL curah berbasis BIMCO CONGENBILL 2022. Set 4 copy: original (negotiable) + copy (non-negotiable).',
    fromPortCall: 'Data kapal, pelabuhan & kargo terisi otomatis dari Port Call. Lengkapi pihak & freight.',
    secVessel: 'Kapal, Pelayaran & Pelabuhan', secParties: 'Para Pihak', secCargo: 'Kargo', secFreight: 'Freight, Set Copy & Penerbitan',
    fRef: 'Referensi', fCarrier: 'Carrier / Pengangkut', fVessel: 'Nama kapal', fVoyage: 'No. Voyage', fFlag: 'Bendera',
    fPOL: 'Port of Loading', fPOD: 'Port of Discharge', fPOR: 'Place of Receipt', fPODel: 'Place of Delivery',
    fShipper: 'Shipper (pengirim + alamat)', fConsignee: 'Consignee (atau "TO ORDER")', fNotify: 'Notify Party',
    fMarks: 'Marks & Numbers', fPkg: 'Jumlah & jenis kemasan', fDesc: 'Uraian barang', fWeight: 'Berat kotor', fMeas: 'Measurement (m³)',
    fFreight: 'Ketentuan freight', fCP: 'Charter-Party tanggal', fOnBoard: 'Shipped on board (tgl)',
    fOrig: 'Jml original (negotiable)', fCopy: 'Jml copy (non-negotiable)', fPlaceIssue: 'Tempat terbit', fDateIssue: 'Tanggal terbit',
    fSignedFor: 'Ditandatangani sebagai', fSigner: 'Nama penanda tangan',
    sVessel: 'Kapal', sCargo: 'Kargo', sBL: 'B/L No.',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Bill of Lading',
    desc: 'Bulk BL based on BIMCO CONGENBILL 2022. 4-copy set: originals (negotiable) + copies (non-negotiable).',
    fromPortCall: 'Vessel, ports & cargo auto-filled from Port Call. Complete parties & freight.',
    secVessel: 'Vessel, Voyage & Ports', secParties: 'Parties', secCargo: 'Cargo', secFreight: 'Freight, Copy Set & Issue',
    fRef: 'Reference', fCarrier: 'Carrier', fVessel: 'Vessel name', fVoyage: 'Voyage no.', fFlag: 'Flag',
    fPOL: 'Port of Loading', fPOD: 'Port of Discharge', fPOR: 'Place of Receipt', fPODel: 'Place of Delivery',
    fShipper: 'Shipper (name + address)', fConsignee: 'Consignee (or "TO ORDER")', fNotify: 'Notify Party',
    fMarks: 'Marks & Numbers', fPkg: 'No. & kind of packages', fDesc: 'Description of goods', fWeight: 'Gross weight', fMeas: 'Measurement (m³)',
    fFreight: 'Freight terms', fCP: 'Charter-Party dated', fOnBoard: 'Shipped on board (date)',
    fOrig: 'No. of originals (negotiable)', fCopy: 'No. of copies (non-negotiable)', fPlaceIssue: 'Place of issue', fDateIssue: 'Date of issue',
    fSignedFor: 'Signed as', fSigner: 'Signatory name',
    sVessel: 'Vessel', sCargo: 'Cargo', sBL: 'B/L No.',
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
function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={inputCls} />
    </div>
  )
}

type FormState = Omit<BlData, 'tenant'>

export function BlForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, ...blanked } = blankSample(SAMPLE_BL)
  // Default masuk akal untuk dokumen baru (blankSample mengosongkan semua string).
  const sample: FormState = {
    ...blanked,
    consignee: 'TO ORDER',
    originalCount: '3',
    copyCount: '1',
    freightTerms: SAMPLE_BL.freightTerms,
    signedFor: SAMPLE_BL.signedFor,
  }
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_BL, ...form }), [form])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; flag?: string; port?: string; cargo?: string; cargoQty?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setForm((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            flag: p.flag || f.flag,
            portOfLoading: p.port || f.portOfLoading,
            description: p.cargo || f.description,
            grossWeight: p.cargoQty || f.grossWeight,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/bl?id=${id}&json=1`)
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
      const res = await fetch(`/api/documents/bl?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/BILL_OF_LADING?id=${j.id}`)
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
      const res = await fetch(`/api/documents/bl${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'BL').replace(/[\\/]/g, '-') + '.pdf'
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
              <Field label="B/L No." value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fRef} value={form.reference ?? ''} onChange={set('reference')} />
              <Field label={t.fCarrier} value={form.carrier} onChange={set('carrier')} />
              <Field label={t.fVessel} value={form.vesselName} onChange={set('vesselName')} />
              <Field label={t.fVoyage} value={form.voyageNo} onChange={set('voyageNo')} />
              <Field label={t.fFlag} value={form.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPOL} value={form.portOfLoading} onChange={set('portOfLoading')} />
              <Field label={t.fPOD} value={form.portOfDischarge} onChange={set('portOfDischarge')} />
              <Field label={t.fPOR} value={form.placeOfReceipt ?? ''} onChange={set('placeOfReceipt')} />
              <Field label={t.fPODel} value={form.placeOfDelivery ?? ''} onChange={set('placeOfDelivery')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secParties}</h2>
            <div className="space-y-3">
              <Area label={t.fShipper} value={form.shipper} onChange={set('shipper')} />
              <Area label={t.fConsignee} value={form.consignee} onChange={set('consignee')} rows={2} />
              <Area label={t.fNotify} value={form.notifyParty} onChange={set('notifyParty')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secCargo}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Area label={t.fMarks} value={form.marksNumbers} onChange={set('marksNumbers')} rows={2} />
              <Area label={t.fDesc} value={form.description} onChange={set('description')} rows={2} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <Field label={t.fPkg} value={form.packages} onChange={set('packages')} />
              <Field label={t.fWeight} value={form.grossWeight} onChange={set('grossWeight')} />
              <Field label={t.fMeas} value={form.measurement ?? ''} onChange={set('measurement')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secFreight}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fFreight} value={form.freightTerms} onChange={set('freightTerms')} />
              <Field label={t.fCP} value={form.charterPartyDate} onChange={set('charterPartyDate')} />
              <Field label={t.fOnBoard} value={form.shippedOnBoardDate} onChange={set('shippedOnBoardDate')} />
              <Field label={t.fOrig} value={form.originalCount} onChange={set('originalCount')} />
              <Field label={t.fCopy} value={form.copyCount} onChange={set('copyCount')} />
              <Field label={t.fPlaceIssue} value={form.placeOfIssue} onChange={set('placeOfIssue')} />
              <Field label={t.fDateIssue} value={form.dateOfIssue} onChange={set('dateOfIssue')} />
              <Field label={t.fSignedFor} value={form.signedFor} onChange={set('signedFor')} />
              <Field label={t.fSigner} value={form.signatoryName} onChange={set('signatoryName')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sBL}</span><span className="font-mono text-text-primary">{form.docNumber || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{form.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sCargo}</span><span className="text-text-primary text-right max-w-[60%] truncate">{(form.description || '—').split('\n')[0]}</span></div>
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
