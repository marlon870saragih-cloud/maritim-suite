'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_CARGO, type CargoDeclData, type CargoItem } from '@/lib/pdf/cargo-data'

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

type Head = Omit<CargoDeclData, 'tenant' | 'items'>
const emptyItem = (): CargoItem => ({ blNo: '', marks: 'N/M', packages: '', description: '', weight: '' })

export function CargoDeclForm() {
  const { tenant: _t, items: _i, ...sampleHead } = SAMPLE_CARGO
  const [head, setHead] = useState<Head>(sampleHead)
  const [items, setItems] = useState<CargoItem[]>(clone(SAMPLE_CARGO.items))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_CARGO, ...head, items }), [head, items])

  function updateItem(i: number, key: keyof CargoItem, v: string) {
    setItems((prev) => {
      const next = clone(prev)
      next[i][key] = v
      return next
    })
  }
  const addItem = () => setItems((p) => [...p, emptyItem()])
  const removeItem = (i: number) => setItems((p) => p.filter((_, j) => j !== i))

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
            portOfLoading: p.port || f.portOfLoading,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/cargo-decl?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<CargoDeclData> | null) => {
        if (!p) return
        const { items: pi, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pi)) setItems(pi)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/cargo-decl?save=1${savedId ? `&id=${savedId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/FAL_2?id=${j.id}`)
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
      const res = await fetch(`/api/documents/cargo-decl${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'CARGO-DECLARATION').replace(/[\\/]/g, '-') + '.pdf'
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
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">Maritime Dokumen · FAL Form 2</p>
            <h1 className="font-display text-2xl text-white">Buat Cargo Declaration</h1>
            <p className="text-text-secondary text-sm mt-1">Manifes muatan kapal (IMO FAL 2).</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data kapal terisi otomatis dari Port Call. Lengkapi daftar muatan di bawah.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Rute</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label="Nama kapal" value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label="Bendera" value={head.flag ?? ''} onChange={set('flag')} />
              <Field label="Operasi (Loading/Discharging)" value={head.mode} onChange={set('mode')} />
              <Field label="Voyage" value={head.voyage ?? ''} onChange={set('voyage')} />
              <Field label="Port of Loading" value={head.portOfLoading} onChange={set('portOfLoading')} />
              <Field label="Port of Discharge" value={head.portOfDischarge} onChange={set('portOfDischarge')} />
              <Field label="Master" value={head.master} onChange={set('master')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Daftar Muatan</h2>
              <span className="text-xs font-mono text-text-secondary">{items.length} item</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-2">B/L No.</div>
              <div className="col-span-2">Kemasan</div>
              <div className="col-span-5">Uraian barang</div>
              <div className="col-span-2 text-right">Berat</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {items.map((c, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={c.blNo} onChange={(e) => updateItem(i, 'blNo', e.target.value)} placeholder="B/L No." className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={c.packages} onChange={(e) => updateItem(i, 'packages', e.target.value)} placeholder="Kemasan" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={c.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Uraian barang" className={`${inputCls} col-span-11 md:col-span-5`} />
                  <input value={c.weight} onChange={(e) => updateItem(i, 'weight', e.target.value)} placeholder="Berat" className={`${inputCls} col-span-7 md:col-span-2 text-right`} />
                  <button type="button" onClick={() => removeItem(i)} aria-label="Hapus item" className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Tambah muatan
            </button>
            <div className="mt-4">
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
              <div className="flex justify-between text-text-secondary"><span>Rute</span><span className="text-text-primary text-right text-xs">{head.portOfLoading} → {head.portOfDischarge}</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Total Item</p>
              <p className="font-display text-xl text-white">{items.length} item</p>
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
