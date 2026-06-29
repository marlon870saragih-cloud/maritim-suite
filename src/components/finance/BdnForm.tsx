'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_BDN, bdnAmount, type BdnData } from '@/lib/pdf/bdn-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

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
      alert('Gagal membuat PDF. Coba lagi.')
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
        Kembali ke Finance
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
              Pengadaan · Bunker
            </p>
            <h1 className="font-display text-2xl text-white">Buat Bunker Delivery Note</h1>
            <p className="text-text-secondary text-sm mt-1">
              Bukti serah bunker ke kapal (MARPOL Annex VI). Nilai dihitung dari jumlah × harga/MT.
            </p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data kapal terisi otomatis dari Port Call. Lengkapi spesifikasi bunker di bawah.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Kapal &amp; Penyerahan</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. BDN" value={form.docNumber} onChange={set('docNumber')} />
              <Field label="Tanggal & waktu serah" value={form.deliveryDate} onChange={set('deliveryDate')} />
              <Field label="Mata uang" value={form.currency} onChange={set('currency')} />
              <Field label="Nama kapal" value={form.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={form.imo} onChange={set('imo')} />
              <Field label="Bendera" value={form.flag ?? ''} onChange={set('flag')} />
              <Field label="Pelabuhan" value={form.port} onChange={set('port')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Pemasok &amp; Produk</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Pemasok" value={form.supplier} onChange={set('supplier')} />
              <Field label="Tongkang / truk" value={form.bargeName ?? ''} onChange={set('bargeName')} />
              <Field label="Grade produk" value={form.productGrade} onChange={set('productGrade')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Spesifikasi Bahan Bakar</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Jumlah (MT)" type="number" value={form.quantityMt} onChange={set('quantityMt')} />
              <Field label="Density @15°C (kg/m³)" value={form.density15} onChange={set('density15')} />
              <Field label="Sulphur (% m/m)" value={form.sulphurPct} onChange={set('sulphurPct')} />
              <Field label="Viscosity (cSt)" value={form.viscosity ?? ''} onChange={set('viscosity')} />
              <Field label="Flash point (°C)" value={form.flashPoint ?? ''} onChange={set('flashPoint')} />
              <Field label="Water (% v/v)" value={form.waterPct ?? ''} onChange={set('waterPct')} />
              <Field label="Harga / MT" type="number" value={form.pricePerMt} onChange={set('pricePerMt')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Catatan &amp; Penerima</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Catatan</label>
                <textarea value={form.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Penerima (kapal)" value={form.receiverName ?? ''} onChange={set('receiverName')} />
                <Field label="Jabatan pemasok (ttd)" value={form.signRole} onChange={set('signRole')} />
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Ringkasan</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Jumlah</span>
                <span className="font-mono text-text-primary">{fmt(form.quantityMt)} MT</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Harga / MT</span>
                <span className="font-mono text-text-primary">{fmt(form.pricePerMt)}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Nilai Bunker</p>
              <p className="font-display text-xl text-white">
                {form.currency} {fmt(amount)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#2E86DE] hover:bg-accent-blue
                       text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? 'Simpan Perubahan' : 'Simpan Draft'}
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
              Unduh
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
              Preview
            </button>
          </div>

          <p className="text-[11px] text-text-secondary/70 leading-relaxed">
            Kop perusahaan pada PDF otomatis dari profil perusahaan Anda. Draft tersimpan bisa dibuka &amp;
            diunduh ulang dari halaman Finance.
          </p>
        </aside>
      </div>
    </div>
  )
}
