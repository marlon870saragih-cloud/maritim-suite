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
  const { tenant: _t, documents: _d, finance: _f, ...sampleHead } = SAMPLE_PCSUMMARY
  const [head, setHead] = useState<Head>(sampleHead)
  const [documents, setDocuments] = useState<SummaryDocRow[]>(SAMPLE_PCSUMMARY.documents)
  const [finance, setFinance] = useState<SummaryFinance>(SAMPLE_PCSUMMARY.finance)
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
      setSavedMsg('Tersimpan ✓')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch {
      alert('Gagal menyimpan. Pastikan Anda sudah login.')
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
      alert('Gagal membuat PDF. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-margin-page max-w-[1600px] mx-auto">
      <Link href="/dokumen" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Dokumen
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">Maritime Dokumen · Port Call Ops</p>
            <h1 className="font-display text-2xl text-white">Buat Port Call Summary</h1>
            <p className="text-text-secondary text-sm mt-1">Rekap satu halaman: partikular, dokumen yang diterbitkan, &amp; ringkasan biaya.</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Partikular, daftar dokumen &amp; rekap finansial terisi otomatis dari Port Call (dokumen yang ter-link).
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Call</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label="Tanggal" value={head.date} onChange={set('date')} />
              <Field label="Nama kapal" value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label="Bendera" value={head.flag ?? ''} onChange={set('flag')} />
              <Field label="Pelabuhan" value={head.port} onChange={set('port')} />
              <Field label="ETA" value={head.eta} onChange={set('eta')} />
              <Field label="ETD" value={head.etd} onChange={set('etd')} />
              <Field label="Kargo" value={head.cargo} onChange={set('cargo')} />
              <Field label="Principal" value={head.principal} onChange={set('principal')} />
              <Field label="Disusun oleh" value={head.preparedBy} onChange={set('preparedBy')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Dokumen Diterbitkan</h2>
              <span className="text-xs font-mono text-text-secondary">{documents.length} dok</span>
            </div>
            {documents.length === 0 ? (
              <p className="text-text-secondary text-sm py-2">Belum ada dokumen terkait port call ini.</p>
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
            <p className="text-[11px] text-text-secondary/60 mt-2">Daftar otomatis dari dokumen yang ter-link ke port call ini.</p>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Rekap Finansial</h2>
            <div className="grid grid-cols-3 gap-3">
              {([['Estimasi (EPDA)', finance.epda], ['Aktual (FPDA)', finance.fpda], ['Tagihan (Invoice)', finance.invoice]] as const).map(([k, v]) => (
                <div key={k} className="rounded-md border border-card-border bg-surface px-3 py-2.5">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-text-secondary">{k}</p>
                  <p className="font-display text-lg text-white mt-1">{fmt(v)}</p>
                </div>
              ))}
            </div>
            <p className={`text-xs mt-2 ${variance > 0 ? 'text-status-danger' : 'text-status-success'}`}>
              Variance FPDA vs EPDA: {variance > 0 ? '+' : ''}{fmt(variance)} IDR
            </p>
            <div className="mt-4">
              <label className={labelCls}>Catatan</label>
              <textarea value={head.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Ringkasan</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>Kapal</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Dokumen</span><span className="font-mono text-text-primary">{documents.length}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Tagihan</span><span className="font-mono text-text-primary">{fmt(finance.invoice)}</span></div>
            </div>
          </div>

          <button type="button" onClick={saveDraft} disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#2E86DE] hover:bg-accent-blue text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? 'Simpan Perubahan' : 'Simpan Draft'}
          </button>
          {savedMsg && <p className="text-center text-xs text-accent-teal -mt-1">{savedMsg}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => generate(true)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Unduh
            </button>
            <button type="button" onClick={() => generate(false)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Preview
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
