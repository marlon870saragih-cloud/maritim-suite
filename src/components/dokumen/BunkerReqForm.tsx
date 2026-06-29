'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_BUNKERREQ, bunkerLineAmount, bunkerTotal, bunkerTotalMt, type BunkerReqData, type BunkerLine } from '@/lib/pdf/bunkerreq-data'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
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

type Head = Omit<BunkerReqData, 'tenant' | 'lines'>
const emptyLine = (): BunkerLine => ({ grade: '', quantityMt: 0, sulphurPct: '', unitPrice: 0 })

export function BunkerReqForm() {
  const { tenant: _t, lines: _l, ...sampleHead } = SAMPLE_BUNKERREQ
  const [head, setHead] = useState<Head>(sampleHead)
  const [lines, setLines] = useState<BunkerLine[]>(clone(SAMPLE_BUNKERREQ.lines))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_BUNKERREQ, ...head, lines }), [head, lines])
  const total = useMemo(() => bunkerTotal(data), [data])
  const totalMt = useMemo(() => bunkerTotalMt(data), [data])

  function updateLine(i: number, key: keyof BunkerLine, v: string) {
    setLines((prev) => {
      const next = clone(prev)
      // @ts-expect-error qty/unitPrice numerik, lainnya string
      next[i][key] = key === 'quantityMt' || key === 'unitPrice' ? Number(v.replace(/[^\d.]/g, '')) || 0 : v
      return next
    })
  }
  const addLine = () => setLines((p) => [...p, emptyLine()])
  const removeLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/bunker-req?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<BunkerReqData> | null) => {
        if (!p) return
        const { lines: pl, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pl)) setLines(pl)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/bunker-req?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/BUNKER_REQUISITION?id=${j.id}`)
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
      const res = await fetch(`/api/documents/bunker-req${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'BRQ').replace(/[\\/]/g, '-') + '.pdf'
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
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">Maritime Dokumen · Pengadaan Bunker</p>
            <h1 className="font-display text-2xl text-white">Buat Bunker Requisition</h1>
            <p className="text-text-secondary text-sm mt-1">Permintaan bunker (BBM) ke supplier sebelum BDN.</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data kapal &amp; pelabuhan terisi otomatis dari Port Call. Lengkapi supplier &amp; daftar bunker.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Supplier</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label="Tanggal" value={head.date} onChange={set('date')} />
              <Field label="Nama kapal" value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label="Pelabuhan" value={head.port} onChange={set('port')} />
              <Field label="Mata uang" value={head.currency} onChange={set('currency')} />
              <Field label="Supplier" value={head.supplierName} onChange={set('supplierName')} />
              <Field label="Attn supplier" value={head.supplierAttn ?? ''} onChange={set('supplierAttn')} />
              <Field label="Pengiriman (ETA)" value={head.deliveryDate} onChange={set('deliveryDate')} />
              <Field label="Sarana antar" value={head.deliveryMode} onChange={set('deliveryMode')} />
              <Field label="Titik antar" value={head.deliveryPoint} onChange={set('deliveryPoint')} />
              <Field label="Diminta oleh" value={head.requestedBy} onChange={set('requestedBy')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Daftar Bunker</h2>
              <span className="text-xs font-mono text-text-secondary">{lines.length} grade</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-4">Grade / Spec</div>
              <div className="col-span-2">Qty (MT)</div>
              <div className="col-span-2">Sulphur %</div>
              <div className="col-span-3">Harga/MT</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={l.grade} onChange={(e) => updateLine(i, 'grade', e.target.value)} placeholder="VLSFO (max 0.50% S)" className={`${inputCls} col-span-12 md:col-span-4`} />
                  <input value={String(l.quantityMt)} onChange={(e) => updateLine(i, 'quantityMt', e.target.value)} placeholder="300" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={l.sulphurPct} onChange={(e) => updateLine(i, 'sulphurPct', e.target.value)} placeholder="0.50" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={String(l.unitPrice)} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} placeholder="8500000" className={`${inputCls} col-span-3 md:col-span-3`} />
                  <button type="button" onClick={() => removeLine(i)} aria-label="Hapus baris" className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <p className="col-span-12 -mt-1 text-right text-[11px] font-mono text-text-secondary">= {head.currency} {fmt(bunkerLineAmount(l))}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Tambah grade
            </button>
            <div className="mt-4">
              <label className={labelCls}>Syarat &amp; permintaan</label>
              <textarea value={head.terms} onChange={(e) => set('terms')(e.target.value)} rows={2} className={inputCls} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>Remarks</label>
              <textarea value={head.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Ringkasan</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>Kapal</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Total kuantitas</span><span className="font-mono text-text-primary">{fmt(totalMt)} MT</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Estimasi Nilai</p>
              <p className="font-display text-xl text-white">{head.currency} {fmt(total)}</p>
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
