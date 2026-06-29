'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_DAMAGE, damageTotal, type DamageData, type DamageItem } from '@/lib/pdf/damage-data'

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

type Head = Omit<DamageData, 'tenant' | 'items'>
const emptyItem = (): DamageItem => ({ location: '', description: '', cause: '', severity: 'Ringan', estimate: 0 })

export function DamageForm() {
  const { tenant: _t, items: _i, ...sampleHead } = SAMPLE_DAMAGE
  const [head, setHead] = useState<Head>(sampleHead)
  const [items, setItems] = useState<DamageItem[]>(clone(SAMPLE_DAMAGE.items))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_DAMAGE, ...head, items }), [head, items])
  const total = useMemo(() => damageTotal(data), [data])

  function updateItem(i: number, key: keyof DamageItem, v: string) {
    setItems((prev) => {
      const next = clone(prev)
      // @ts-expect-error estimate numerik, lainnya string
      next[i][key] = key === 'estimate' ? Number(v.replace(/[^\d.]/g, '')) || 0 : v
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
            place: p.port || f.place,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/damage?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<DamageData> | null) => {
        if (!p) return
        const { items: pi, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pi)) setItems(pi)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/damage?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/DAMAGE_REPORT?id=${j.id}`)
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
      const res = await fetch(`/api/documents/damage${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'DMG').replace(/[\\/]/g, '-') + '.pdf'
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
            <h1 className="font-display text-2xl text-white">Buat Damage / Survey Report</h1>
            <p className="text-text-secondary text-sm mt-1">Laporan temuan kerusakan kapal/kargo/fasilitas + estimasi.</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data kapal &amp; pelabuhan terisi otomatis dari Port Call. Lengkapi survei &amp; temuan.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Survei</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label="Tanggal" value={head.date} onChange={set('date')} />
              <Field label="Tempat" value={head.place} onChange={set('place')} />
              <Field label="Nama kapal" value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label="Bendera" value={head.flag ?? ''} onChange={set('flag')} />
              <Field label="Pelabuhan" value={head.port} onChange={set('port')} />
              <Field label="No. Voyage" value={head.voyageNo ?? ''} onChange={set('voyageNo')} />
              <Field label="Mata uang" value={head.currency} onChange={set('currency')} />
              <Field label="Occasion (saat survei)" value={head.occasion} onChange={set('occasion')} />
              <Field label="Surveyor" value={head.surveyor} onChange={set('surveyor')} />
              <Field label="Dihadiri oleh" value={head.attendedBy} onChange={set('attendedBy')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Temuan Kerusakan</h2>
              <span className="text-xs font-mono text-text-secondary">{items.length} item</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-3">Lokasi / Objek</div>
              <div className="col-span-3">Uraian</div>
              <div className="col-span-2">Penyebab</div>
              <div className="col-span-1">Tingkat</div>
              <div className="col-span-2">Estimasi</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={it.location} onChange={(e) => updateItem(i, 'location', e.target.value)} placeholder="Hatch No.2" className={`${inputCls} col-span-6 md:col-span-3`} />
                  <input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Uraian kerusakan" className={`${inputCls} col-span-6 md:col-span-3`} />
                  <input value={it.cause} onChange={(e) => updateItem(i, 'cause', e.target.value)} placeholder="Penyebab" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={it.severity} onChange={(e) => updateItem(i, 'severity', e.target.value)} placeholder="Sedang" className={`${inputCls} col-span-3 md:col-span-1`} />
                  <input value={String(it.estimate)} onChange={(e) => updateItem(i, 'estimate', e.target.value)} placeholder="0" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <button type="button" onClick={() => removeItem(i)} aria-label="Hapus item" className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Tambah item
            </button>
            <div className="mt-4">
              <label className={labelCls}>Kesimpulan</label>
              <textarea value={head.conclusion} onChange={(e) => set('conclusion')(e.target.value)} rows={3} className={inputCls} />
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
              <div className="flex justify-between text-text-secondary"><span>Item temuan</span><span className="font-mono text-text-primary">{items.length}</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Total Estimasi</p>
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
