'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import {
  SAMPLE_PCSUMMARY,
  type PortCallSummaryData,
  type SummaryDocRow,
  type SummaryFinance,
} from '@/lib/pdf/pcsummary-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Port Call Summary', desc: 'Rekap satu halaman: partikular, dokumen yang diterbitkan, & ringkasan biaya.',
    fromPortCall: 'Partikular, daftar dokumen & rekap finansial terisi otomatis dari Port Call (dokumen yang ter-link).',
    secVessel: 'Kapal & Call', fDate: 'Tanggal', fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan', fCargo: 'Kargo', fPrincipal: 'Principal', fPreparedBy: 'Disusun oleh',
    secDocs: 'Dokumen Diterbitkan', docWord: 'dok', emptyDocs: 'Belum ada dokumen terkait port call ini.', autoNote: 'Daftar otomatis dari dokumen yang ter-link ke port call ini.',
    secFinance: 'Rekap Finansial', finEpda: 'Estimasi (EPDA)', finFpda: 'Aktual (FPDA)', finInvoice: 'Tagihan (Invoice)', variancePre: 'Variance FPDA vs EPDA:', fNotes: 'Catatan',
    sVessel: 'Kapal', sDocs: 'Dokumen', sBilled: 'Tagihan',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Port Call Summary', desc: 'One-page recap: particulars, documents issued, & cost summary.',
    fromPortCall: 'Particulars, document list & financial recap auto-filled from Port Call (linked documents).',
    secVessel: 'Vessel & Call', fDate: 'Date', fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port', fCargo: 'Cargo', fPrincipal: 'Principal', fPreparedBy: 'Prepared by',
    secDocs: 'Documents Issued', docWord: 'docs', emptyDocs: 'No documents linked to this port call yet.', autoNote: 'Auto-listed from documents linked to this port call.',
    secFinance: 'Financial Recap', finEpda: 'Estimate (EPDA)', finFpda: 'Actual (FPDA)', finInvoice: 'Billed (Invoice)', variancePre: 'Variance FPDA vs EPDA:', fNotes: 'Notes',
    sVessel: 'Vessel', sDocs: 'Documents', sBilled: 'Billed',
  },
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

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

type Head = Omit<PortCallSummaryData, 'tenant' | 'documents' | 'finance'>

type SummaryResp = {
  particulars?: {
    vesselName?: string; imo?: string; flag?: string; port?: string; portCode?: string
    eta?: string; etd?: string; gt?: string; nrt?: string; loa?: string; draft?: string
    cargo?: string; principal?: string
  }
  documents?: SummaryDocRow[]
  finance?: SummaryFinance
}

export function PortCallSummaryForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, documents: _d, finance: _f, ...sampleHead } = blankSample(SAMPLE_PCSUMMARY)
  const [head, setHead] = useState<Head>(sampleHead)
  const [documents, setDocuments] = useState<SummaryDocRow[]>([])
  const [finance, setFinance] = useState<SummaryFinance>({ epda: 0, fpda: 0, invoice: 0 })
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_PCSUMMARY, ...head, documents, finance }), [head, documents, finance])
  const variance = finance.fpda - finance.epda

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}/summary`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: SummaryResp | null) => {
          if (!d) return
          const p = d.particulars
          if (p) {
            setHead((f) => ({
              ...f,
              vesselName: p.vesselName || f.vesselName,
              imo: p.imo || f.imo,
              flag: p.flag || f.flag,
              port: p.port || f.port,
              portCode: p.portCode || f.portCode,
              eta: p.eta || f.eta,
              etd: p.etd || f.etd,
              gt: p.gt || f.gt,
              nrt: p.nrt || f.nrt,
              loa: p.loa || f.loa,
              draft: p.draft || f.draft,
              cargo: p.cargo || f.cargo,
              principal: p.principal || f.principal,
            }))
          }
          if (Array.isArray(d.documents)) setDocuments(d.documents)
          if (d.finance) setFinance(d.finance)
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/port-call-summary?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<PortCallSummaryData> | null) => {
        if (!p) return
        const { documents: pd, finance: pf, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pd)) setDocuments(pd)
        if (pf) setFinance(pf)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/port-call-summary?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/PORT_CALL_SUMMARY?id=${j.id}`)
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
      const res = await fetch(`/api/documents/port-call-summary${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'PCS').replace(/[\\/]/g, '-') + '.pdf'
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
              <Field label={t.fDate} value={head.date} onChange={set('date')} />
              <Field label={t.fVessel} value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={head.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPort} value={head.port} onChange={set('port')} />
              <Field label="ETA" value={head.eta} onChange={set('eta')} />
              <Field label="ETD" value={head.etd} onChange={set('etd')} />
              <Field label={t.fCargo} value={head.cargo} onChange={set('cargo')} />
              <Field label={t.fPrincipal} value={head.principal} onChange={set('principal')} />
              <Field label={t.fPreparedBy} value={head.preparedBy} onChange={set('preparedBy')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secDocs}</h2>
              <span className="text-xs font-mono text-text-secondary">{documents.length} {t.docWord}</span>
            </div>
            {documents.length === 0 ? (
              <p className="text-text-secondary text-sm py-2">{t.emptyDocs}</p>
            ) : (
              <div className="rounded-md border border-card-border/60 divide-y divide-card-border/40">
                {documents.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent-blue w-32 shrink-0">{d.label}</span>
                    <span className="text-text-primary truncate flex-1">{d.docNumber}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">{d.status}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-text-secondary/60 mt-2">{t.autoNote}</p>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secFinance}</h2>
            <div className="grid grid-cols-3 gap-3">
              {([[t.finEpda, finance.epda], [t.finFpda, finance.fpda], [t.finInvoice, finance.invoice]] as const).map(([k, v]) => (
                <div key={k} className="rounded-md border border-card-border bg-surface px-3 py-2.5">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-text-secondary">{k}</p>
                  <p className="font-display text-lg text-white mt-1">{fmt(v)}</p>
                </div>
              ))}
            </div>
            <p className={`text-xs mt-2 ${variance > 0 ? 'text-status-danger' : 'text-status-success'}`}>
              {t.variancePre} {variance > 0 ? '+' : ''}{fmt(variance)} IDR
            </p>
            <div className="mt-4">
              <label className={labelCls}>{t.fNotes}</label>
              <textarea value={head.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sDocs}</span><span className="font-mono text-text-primary">{documents.length}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sBilled}</span><span className="font-mono text-text-primary">{fmt(finance.invoice)}</span></div>
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
