'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_ULLAGE, ullageTotalVolume, ullageTotalMt, type UllageData, type UllageTank } from '@/lib/pdf/ullage-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · Port Call Ops', h1: 'Buat Ullage Report', desc: 'Pengukuran tangki kargo cair → total volume & konversi MT.',
    fromPortCall: 'Data kapal, pelabuhan & produk terisi otomatis dari Port Call. Lengkapi densitas & pengukuran tangki.',
    secVessel: 'Kapal & Survei Kargo', fDate: 'Tanggal', fVessel: 'Nama kapal', fPort: 'Pelabuhan', fProduct: 'Produk (kargo)', fDensity: 'Densitas @15°C (kg/L)',
    secTanks: 'Pengukuran Tangki', tankWord: 'tangki', thTank: 'Tangki', deleteTank: 'Hapus tangki', addTank: 'Tambah tangki',
    resTitle: 'Hasil Pengukuran', resVol: 'Total volume', resDensity: 'Densitas',
  },
  en: {
    kicker: 'Maritime Documents · Port Call Ops', h1: 'Create Ullage Report', desc: 'Liquid cargo tank gauging → total volume & MT conversion.',
    fromPortCall: 'Vessel, port & product auto-filled from Port Call. Complete density & tank measurements.',
    secVessel: 'Vessel & Cargo Survey', fDate: 'Date', fVessel: 'Vessel name', fPort: 'Port', fProduct: 'Product (cargo)', fDensity: 'Density @15°C (kg/L)',
    secTanks: 'Tank Measurements', tankWord: 'tanks', thTank: 'Tank', deleteTank: 'Delete tank', addTank: 'Add tank',
    resTitle: 'Measurement Result', resVol: 'Total volume', resDensity: 'Density',
  },
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const num = (n: number, d = 1) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

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

type Head = Omit<UllageData, 'tenant' | 'tanks'>
const emptyTank = (): UllageTank => ({ tank: '', ullage: '', tempC: '', volumeM3: 0 })

export function UllageForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, tanks: _k, ...sampleHead } = blankSample(SAMPLE_ULLAGE)
  const [head, setHead] = useState<Head>(sampleHead)
  const [tanks, setTanks] = useState<UllageTank[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const setS = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const setDensity = (v: string) => setHead((p) => ({ ...p, densityKgL: Number(v.replace(/[^\d.]/g, '')) || 0 }))
  const data = useMemo(() => ({ ...SAMPLE_ULLAGE, ...head, tanks }), [head, tanks])
  const totalVol = useMemo(() => ullageTotalVolume(data), [data])
  const totalMt = useMemo(() => ullageTotalMt(data), [data])

  function updateTank(i: number, key: keyof UllageTank, v: string) {
    setTanks((prev) => {
      const next = clone(prev)
      // @ts-expect-error volumeM3 numerik, lainnya string
      next[i][key] = key === 'volumeM3' ? Number(v.replace(/[^\d.]/g, '')) || 0 : v
      return next
    })
  }
  const addTank = () => setTanks((p) => [...p, emptyTank()])
  const removeTank = (i: number) => setTanks((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string; cargo?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
            product: p.cargo || f.product,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/ullage?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<UllageData> | null) => {
        if (!p) return
        const { tanks: pt, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pt)) setTanks(pt)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/ullage?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/ULLAGE_REPORT?id=${j.id}`)
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
      const res = await fetch(`/api/documents/ullage${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'ULL').replace(/[\\/]/g, '-') + '.pdf'
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
              <Field label="No. dokumen" value={head.docNumber} onChange={setS('docNumber')} />
              <Field label={t.fDate} value={head.date} onChange={setS('date')} />
              <Field label={t.fVessel} value={head.vesselName} onChange={setS('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={setS('imo')} />
              <Field label={t.fPort} value={head.port} onChange={setS('port')} />
              <Field label="No. Voyage" value={head.voyageNo ?? ''} onChange={setS('voyageNo')} />
              <Field label={t.fProduct} value={head.product} onChange={setS('product')} />
              <Field label="Condition" value={head.condition} onChange={setS('condition')} />
              <Field label={t.fDensity} value={String(head.densityKgL)} onChange={setDensity} />
              <Field label="Surveyor" value={head.surveyor} onChange={setS('surveyor')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secTanks}</h2>
              <span className="text-xs font-mono text-text-secondary">{tanks.length} {t.tankWord}</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-4">{t.thTank}</div>
              <div className="col-span-3">Ullage</div>
              <div className="col-span-2">Temp °C</div>
              <div className="col-span-2">Volume m³</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {tanks.map((tk, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={tk.tank} onChange={(e) => updateTank(i, 'tank', e.target.value)} placeholder="No.1 Port" className={`${inputCls} col-span-6 md:col-span-4`} />
                  <input value={tk.ullage} onChange={(e) => updateTank(i, 'ullage', e.target.value)} placeholder="1.85 m" className={`${inputCls} col-span-6 md:col-span-3`} />
                  <input value={tk.tempC} onChange={(e) => updateTank(i, 'tempC', e.target.value)} placeholder="31.5" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={String(tk.volumeM3)} onChange={(e) => updateTank(i, 'volumeM3', e.target.value)} placeholder="1450.5" className={`${inputCls} col-span-4 md:col-span-2`} />
                  <button type="button" onClick={() => removeTank(i)} aria-label={t.deleteTank} className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addTank} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t.addTank}
            </button>
            <div className="mt-4">
              <label className={labelCls}>Remarks</label>
              <textarea value={head.remarks} onChange={(e) => setS('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{t.resTitle}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.resVol}</span><span className="font-mono text-text-primary">{num(totalVol, 1)} m³</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.resDensity}</span><span className="font-mono text-text-primary">{head.densityKgL} kg/L</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">Total Quantity</p>
              <p className="font-display text-xl text-white">{num(totalMt, 3)} MT</p>
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
