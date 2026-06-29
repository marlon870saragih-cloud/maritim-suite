'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_TIMESHEET, computeLaytime, type TimeSheetData, type TimeSheetRow } from '@/lib/pdf/timesheet-data'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const fmt = (n: number) => (n || 0).toLocaleString('en-US')
const hrs = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en-US')} h`

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

type Head = Omit<TimeSheetData, 'tenant' | 'rows'>
const emptyRow = (): TimeSheetRow => ({ date: '', fromTime: '', toTime: '', description: '', percent: 100 })

export function TimeSheetForm() {
  const { tenant: _t, rows: _r, ...sampleHead } = SAMPLE_TIMESHEET
  const [head, setHead] = useState<Head>(sampleHead)
  const [rows, setRows] = useState<TimeSheetRow[]>(clone(SAMPLE_TIMESHEET.rows))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const setS = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const setN = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: Number(v.replace(/[^\d.-]/g, '')) || 0 }))
  const data = useMemo(() => ({ ...SAMPLE_TIMESHEET, ...head, rows }), [head, rows])
  const result = useMemo(() => computeLaytime(data), [data])

  function updateRow(i: number, key: keyof TimeSheetRow, v: string) {
    setRows((prev) => {
      const next = clone(prev)
      // @ts-expect-error percent numerik, lainnya string
      next[i][key] = key === 'percent' ? Number(v.replace(/[^\d.]/g, '')) || 0 : v
      return next
    })
  }
  const addRow = () => setRows((p) => [...p, { ...emptyRow(), date: p[p.length - 1]?.date ?? '' }])
  const removeRow = (i: number) => setRows((p) => p.filter((_, j) => j !== i))

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
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            cargo: p.cargo || f.cargo,
            charterer: p.principal || f.charterer,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/timesheet?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<TimeSheetData> | null) => {
        if (!p) return
        const { rows: pr, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pr)) setRows(pr)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/timesheet?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/TIME_SHEET?id=${j.id}`)
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
      const res = await fetch(`/api/documents/timesheet${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'TS').replace(/[\\/]/g, '-') + '.pdf'
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

  const isDemur = result.kind === 'DEMURRAGE'
  const resColor = result.kind === 'EVEN' ? 'text-text-primary' : isDemur ? 'text-status-danger' : 'text-status-success'

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
            <h1 className="font-display text-2xl text-white">Buat Time Sheet</h1>
            <p className="text-text-secondary text-sm mt-1">Laytime statement — hitung waktu terpakai vs diizinkan, demurrage / despatch.</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data kapal &amp; call terisi otomatis dari Port Call. Lengkapi syarat laytime &amp; perincian waktu.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Call</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. Time Sheet" value={head.docNumber} onChange={setS('docNumber')} />
              <Field label="Tanggal" value={head.date} onChange={setS('date')} />
              <Field label="Nama kapal" value={head.vesselName} onChange={setS('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={setS('imo')} />
              <Field label="Pelabuhan" value={head.port} onChange={setS('port')} />
              <Field label="No. Voyage" value={head.voyageNo ?? ''} onChange={setS('voyageNo')} />
              <Field label="Operasi" value={head.operation} onChange={setS('operation')} />
              <Field label="Kargo" value={head.cargo} onChange={setS('cargo')} />
              <Field label="Charterer" value={head.charterer} onChange={setS('charterer')} />
              <Field label="NOR tendered" value={head.norTendered} onChange={setS('norTendered')} />
              <Field label="Laytime commenced" value={head.laytimeCommenced} onChange={setS('laytimeCommenced')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Syarat Laytime</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Laytime diizinkan (jam)" value={String(head.laytimeAllowedHours)} onChange={setN('laytimeAllowedHours')} />
              <Field label="Mata uang" value={head.currency} onChange={setS('currency')} />
              <Field label="Demurrage /hari" value={String(head.demurrageRate)} onChange={setN('demurrageRate')} />
              <Field label="Despatch /hari" value={String(head.despatchRate)} onChange={setN('despatchRate')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Perincian Waktu</h2>
              <span className="text-xs font-mono text-text-secondary">{rows.length} baris</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-3">Tanggal</div>
              <div className="col-span-2">Dari–Sampai</div>
              <div className="col-span-4">Keterangan</div>
              <div className="col-span-2">% dihitung</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={r.date} onChange={(e) => updateRow(i, 'date', e.target.value)} placeholder="30 Jun 2026" className={`${inputCls} col-span-6 md:col-span-3`} />
                  <div className="col-span-6 md:col-span-2 flex gap-1">
                    <input value={r.fromTime} onChange={(e) => updateRow(i, 'fromTime', e.target.value)} placeholder="08:00" className={inputCls} />
                    <input value={r.toTime} onChange={(e) => updateRow(i, 'toTime', e.target.value)} placeholder="12:00" className={inputCls} />
                  </div>
                  <input value={r.description} onChange={(e) => updateRow(i, 'description', e.target.value)} placeholder="Keterangan" className={`${inputCls} col-span-8 md:col-span-4`} />
                  <input value={String(r.percent)} onChange={(e) => updateRow(i, 'percent', e.target.value)} placeholder="100" className={`${inputCls} col-span-3 md:col-span-2`} />
                  <button type="button" onClick={() => removeRow(i)} aria-label="Hapus baris" className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Tambah baris
            </button>
            <div className="mt-4">
              <label className={labelCls}>Remarks</label>
              <textarea value={head.remarks} onChange={(e) => setS('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Hasil Laytime</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>Diizinkan</span><span className="font-mono text-text-primary">{hrs(result.allowedHours)}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Terpakai</span><span className="font-mono text-text-primary">{hrs(result.usedHours)}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Selisih</span><span className={`font-mono ${resColor}`}>{result.balanceHours >= 0 ? '+' : '−'}{hrs(Math.abs(result.balanceHours))}</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">{result.kind === 'EVEN' ? 'Laytime Even' : isDemur ? 'Demurrage' : 'Despatch'}</p>
              <p className={`font-display text-xl ${result.kind === 'EVEN' ? 'text-white' : isDemur ? 'text-status-danger' : 'text-status-success'}`}>{head.currency} {fmt(result.amount)}</p>
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
