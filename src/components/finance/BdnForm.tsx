'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_BDN, bdnAmount, type BdnData } from '@/lib/pdf/bdn-data'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Pengadaan · Bunker', h1: 'Buat Bunker Delivery Note',
    desc: 'Bukti serah bunker ke kapal (MARPOL Annex VI). Nilai dihitung dari jumlah × harga/MT.',
    fromPortCall: 'Data kapal terisi otomatis dari Port Call. Lengkapi spesifikasi bunker di bawah.',
    secVessel: 'Kapal & Penyerahan', fDelivery: 'Tanggal & waktu serah', fCurrency: 'Mata uang',
    fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan',
    secSupplier: 'Pemasok & Produk', fSupplier: 'Pemasok', fBarge: 'Tongkang / truk', fGrade: 'Grade produk',
    secFuel: 'Spesifikasi Bahan Bakar', fQty: 'Jumlah (MT)', fPrice: 'Harga / MT',
    secNotes: 'Catatan & Penerima', fRemarks: 'Catatan', fReceiver: 'Penerima (kapal)', fSignRole: 'Jabatan pemasok (ttd)',
    sQty: 'Jumlah', sPrice: 'Harga / MT', bunkerValue: 'Nilai Bunker',
  },
  en: {
    back: 'Back to Finance', kicker: 'Procurement · Bunker', h1: 'Create Bunker Delivery Note',
    desc: 'Proof of bunker delivery to the vessel (MARPOL Annex VI). Value computed as quantity × price/MT.',
    fromPortCall: 'Vessel details auto-filled from Port Call. Complete the bunker specification below.',
    secVessel: 'Vessel & Delivery', fDelivery: 'Delivery date & time', fCurrency: 'Currency',
    fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port',
    secSupplier: 'Supplier & Product', fSupplier: 'Supplier', fBarge: 'Barge / truck', fGrade: 'Product grade',
    secFuel: 'Fuel Specification', fQty: 'Quantity (MT)', fPrice: 'Price / MT',
    secNotes: 'Remarks & Receiver', fRemarks: 'Remarks', fReceiver: 'Receiver (vessel)', fSignRole: 'Supplier title (sign)',
    sQty: 'Quantity', sPrice: 'Price / MT', bunkerValue: 'Bunker Value',
  },
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

type FormState = Omit<BdnData, 'tenant'>
const NUM_KEYS: (keyof FormState)[] = ['quantityMt', 'pricePerMt']

export function BdnForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, ...sample } = SAMPLE_BDN
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof FormState) => (v: string) =>
    setForm((p) => ({ ...p, [k]: NUM_KEYS.includes(k) ? Number(v) || 0 : v }))

  const data = useMemo(() => ({ ...SAMPLE_BDN, ...form }), [form])
  const amount = bdnAmount(data)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    // Prefill kapal/IMO/port dari Port Call.
    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setForm((f) => ({
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
    fetch(`/api/documents/bdn?id=${id}&json=1`)
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
      const res = await fetch(`/api/documents/bdn?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/bdn/baru?id=${j.id}`)
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
      const res = await fetch(`/api/documents/bdn${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'BDN').replace(/[\\/]/g, '-') + '.pdf'
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
      <Link
        href="/finance"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
              {t.kicker}
            </p>
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
              <Field label="No. BDN" value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fDelivery} value={form.deliveryDate} onChange={set('deliveryDate')} />
              <Field label={t.fCurrency} value={form.currency} onChange={set('currency')} />
              <Field label={t.fVessel} value={form.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={form.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={form.flag ?? ''} onChange={set('flag')} />
              <Field label={t.fPort} value={form.port} onChange={set('port')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secSupplier}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fSupplier} value={form.supplier} onChange={set('supplier')} />
              <Field label={t.fBarge} value={form.bargeName ?? ''} onChange={set('bargeName')} />
              <Field label={t.fGrade} value={form.productGrade} onChange={set('productGrade')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secFuel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fQty} type="number" value={form.quantityMt} onChange={set('quantityMt')} />
              <Field label="Density @15°C (kg/m³)" value={form.density15} onChange={set('density15')} />
              <Field label="Sulphur (% m/m)" value={form.sulphurPct} onChange={set('sulphurPct')} />
              <Field label="Viscosity (cSt)" value={form.viscosity ?? ''} onChange={set('viscosity')} />
              <Field label="Flash point (°C)" value={form.flashPoint ?? ''} onChange={set('flashPoint')} />
              <Field label="Water (% v/v)" value={form.waterPct ?? ''} onChange={set('waterPct')} />
              <Field label={t.fPrice} type="number" value={form.pricePerMt} onChange={set('pricePerMt')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secNotes}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t.fRemarks}</label>
                <textarea value={form.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.fReceiver} value={form.receiverName ?? ''} onChange={set('receiverName')} />
                <Field label={t.fSignRole} value={form.signRole} onChange={set('signRole')} />
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>{t.sQty}</span>
                <span className="font-mono text-text-primary">{fmt(form.quantityMt)} MT</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{t.sPrice}</span>
                <span className="font-mono text-text-primary">{fmt(form.pricePerMt)}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{t.bunkerValue}</p>
              <p className="font-display text-xl text-white">
                {form.currency} {fmt(amount)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? c.saveChanges : c.saveDraft}
          </button>
          {savedMsg && <p className="text-center text-xs text-accent-teal -mt-1">{savedMsg}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => generate(true)}
              disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted
                         text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary
                         rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {c.download}
            </button>
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted
                         text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary
                         rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {c.preview}
            </button>
          </div>

          <p className="text-[11px] text-text-secondary/70 leading-relaxed">{c.pdfNote}</p>
        </aside>
      </div>
    </div>
  )
}
