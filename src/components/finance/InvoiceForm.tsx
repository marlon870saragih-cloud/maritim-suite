'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import {
  SAMPLE_INVOICE,
  computeInvoiceTotals,
  lineAmount,
  type InvoiceData,
  type InvoiceLine,
} from '@/lib/pdf/invoice-data'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
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

type Head = Pick<
  InvoiceData,
  | 'docNumber'
  | 'invoiceDate'
  | 'dueDate'
  | 'currency'
  | 'agencyPct'
  | 'vatPct'
  | 'billToName'
  | 'billToAddress'
  | 'billToAttn'
  | 'billToNpwp'
  | 'vesselVoyage'
  | 'portCall'
  | 'refFda'
  | 'paymentTerms'
  | 'signRole'
>

export function InvoiceForm() {
  const [head, setHead] = useState<Head>({
    docNumber: SAMPLE_INVOICE.docNumber,
    invoiceDate: SAMPLE_INVOICE.invoiceDate,
    dueDate: SAMPLE_INVOICE.dueDate,
    currency: SAMPLE_INVOICE.currency,
    agencyPct: SAMPLE_INVOICE.agencyPct,
    vatPct: SAMPLE_INVOICE.vatPct,
    billToName: SAMPLE_INVOICE.billToName,
    billToAddress: SAMPLE_INVOICE.billToAddress ?? '',
    billToAttn: SAMPLE_INVOICE.billToAttn ?? '',
    billToNpwp: SAMPLE_INVOICE.billToNpwp ?? '',
    vesselVoyage: SAMPLE_INVOICE.vesselVoyage,
    portCall: SAMPLE_INVOICE.portCall,
    refFda: SAMPLE_INVOICE.refFda ?? '',
    paymentTerms: SAMPLE_INVOICE.paymentTerms,
    signRole: SAMPLE_INVOICE.signRole,
  })
  const [lines, setLines] = useState<InvoiceLine[]>(clone(SAMPLE_INVOICE.lines))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')

  const numeric: (keyof Head)[] = ['agencyPct', 'vatPct']
  const setF = (k: keyof Head) => (v: string) =>
    setHead((p) => ({ ...p, [k]: numeric.includes(k) ? Number(v) || 0 : v }))

  function updateLine(i: number, field: keyof InvoiceLine, value: string) {
    setLines((prev) => {
      const next = clone(prev)
      const num = field === 'qty' || field === 'unitPrice'
      // @ts-expect-error index dinamis
      next[i][field] = num ? Number(value) || 0 : value
      return next
    })
  }
  const addLine = () =>
    setLines((p) => [...p, { description: '', detail: '', qty: 1, unitPrice: 0 }])
  const removeLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i))

  const data: InvoiceData = useMemo(
    () => ({ ...SAMPLE_INVOICE, ...head, lines }),
    [head, lines],
  )
  const totals = useMemo(() => computeInvoiceTotals(data), [data])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    fetch(`/api/documents/invoice?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<InvoiceData> | null) => {
        if (!p) return
        setHead((h) => ({
          docNumber: p.docNumber ?? h.docNumber,
          invoiceDate: p.invoiceDate ?? h.invoiceDate,
          dueDate: p.dueDate ?? h.dueDate,
          currency: p.currency ?? h.currency,
          agencyPct: p.agencyPct ?? h.agencyPct,
          vatPct: p.vatPct ?? h.vatPct,
          billToName: p.billToName ?? h.billToName,
          billToAddress: p.billToAddress ?? h.billToAddress,
          billToAttn: p.billToAttn ?? h.billToAttn,
          billToNpwp: p.billToNpwp ?? h.billToNpwp,
          vesselVoyage: p.vesselVoyage ?? h.vesselVoyage,
          portCall: p.portCall ?? h.portCall,
          refFda: p.refFda ?? h.refFda,
          paymentTerms: p.paymentTerms ?? h.paymentTerms,
          signRole: p.signRole ?? h.signRole,
        }))
        if (Array.isArray(p.lines)) setLines(p.lines)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/invoice?save=1${savedId ? `&id=${savedId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/invoice/baru?id=${j.id}`)
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
      const res = await fetch(`/api/documents/invoice${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'INVOICE').replace(/[\\/]/g, '-') + '.pdf'
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
              Generator Keuangan · Invoice
            </p>
            <h1 className="font-display text-2xl text-white">Buat Invoice</h1>
            <p className="text-text-secondary text-sm mt-1">
              Tagihan jasa keagenan dengan PPN 11%. Form terisi data contoh — ubah lalu unduh.
            </p>
          </div>

          {/* Detail invoice */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Detail Invoice</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. invoice" value={head.docNumber} onChange={setF('docNumber')} />
              <Field label="Tgl invoice" value={head.invoiceDate} onChange={setF('invoiceDate')} />
              <Field label="Jatuh tempo" value={head.dueDate} onChange={setF('dueDate')} />
              <Field label="Mata uang" value={head.currency} onChange={setF('currency')} />
              <Field label="Agency handling (%)" type="number" value={head.agencyPct} onChange={setF('agencyPct')} />
              <Field label="PPN (%)" type="number" value={head.vatPct} onChange={setF('vatPct')} />
            </div>
          </section>

          {/* Billed to */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Ditagihkan Kepada</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nama" value={head.billToName} onChange={setF('billToName')} />
              <Field label="NPWP" value={head.billToNpwp ?? ''} onChange={setF('billToNpwp')} />
              <Field label="Alamat" value={head.billToAddress ?? ''} onChange={setF('billToAddress')} />
              <Field label="Attn / kontak" value={head.billToAttn ?? ''} onChange={setF('billToAttn')} />
              <Field label="Vessel / Voyage" value={head.vesselVoyage} onChange={setF('vesselVoyage')} />
              <Field label="Port call" value={head.portCall} onChange={setF('portCall')} />
              <Field label="Ref. FDA" value={head.refFda ?? ''} onChange={setF('refFda')} />
            </div>
          </section>

          {/* Baris tagihan */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">Baris Tagihan</h2>
              <span className="text-xs font-mono text-text-secondary">
                Subtotal: <span className="text-white">{fmt(totals.subtotal)}</span>
              </span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-6">Deskripsi</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit</div>
              <div className="col-span-2 text-right">Jumlah</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-6 space-y-1">
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      placeholder="Deskripsi jasa"
                      className={inputCls}
                    />
                    <input
                      value={l.detail ?? ''}
                      onChange={(e) => updateLine(i, 'detail', e.target.value)}
                      placeholder="keterangan (mis. as per FDA Sec. A)"
                      className={inputCls + ' text-xs py-1.5'}
                    />
                  </div>
                  <input
                    type="number"
                    value={l.qty}
                    onChange={(e) => updateLine(i, 'qty', e.target.value)}
                    className={`${inputCls} col-span-3 md:col-span-1 text-right`}
                  />
                  <input
                    type="number"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                    className={`${inputCls} col-span-4 md:col-span-2 text-right`}
                  />
                  <div className="col-span-4 md:col-span-2 flex items-center justify-end h-9 px-1 font-mono text-sm text-text-secondary">
                    {fmt(lineAmount(l))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    aria-label="Hapus baris"
                    className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary
                               hover:text-status-danger hover:bg-status-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah baris
            </button>
          </section>

          {/* Terms */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Syarat &amp; Tanda Tangan</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Syarat pembayaran</label>
                <textarea
                  value={head.paymentTerms}
                  onChange={(e) => setF('paymentTerms')(e.target.value)}
                  rows={3}
                  className={inputCls}
                />
              </div>
              <div className="md:w-1/2">
                <Field label="Penandatangan" value={head.signRole} onChange={setF('signRole')} />
              </div>
            </div>
          </section>
        </div>

        {/* Ringkasan */}
        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Ringkasan</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span className="font-mono text-text-primary">{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Agency handling {head.agencyPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.agency)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>PPN {head.vatPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.vat)}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Total Due</p>
              <p className="font-display text-xl text-white">
                {head.currency} {fmt(totals.totalDue)}
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
            {busy === 'save' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : savedId ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
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
            Kop &amp; rekening pada PDF otomatis dari profil perusahaan Anda. Draft tersimpan bisa
            dibuka &amp; diunduh ulang dari halaman Finance.
          </p>
        </aside>
      </div>
    </div>
  )
}
