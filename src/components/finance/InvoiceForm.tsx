'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'
import {
  SAMPLE_INVOICE,
  computeInvoiceTotals,
  lineAmount,
  isTaxable,
  type InvoiceData,
  type InvoiceLine,
} from '@/lib/pdf/invoice-data'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Generator Keuangan · Invoice', h1: 'Buat Invoice',
    desc: 'Tagihan jasa keagenan dengan PPN 11%. Form terisi data contoh — ubah lalu unduh.',
    fromPortCall: 'Data principal & kapal terisi otomatis dari Port Call. Tinggal isi baris tagihan di bawah.',
    fromSrcPre: 'Baris tagihan & bill-to disalin dari', fromSrcPost: '(subtotal per seksi). Periksa, isi nomor invoice, lalu unduh.',
    secDetail: 'Detail Invoice', fNo: 'No. invoice', fDate: 'Tgl invoice', fDue: 'Jatuh tempo', fCurrency: 'Mata uang',
    fAgency: 'Agency handling (%)', fVat: 'PPN (%)',
    secBillTo: 'Ditagihkan Kepada', fName: 'Nama', fNpwp: 'NPWP', fAddr: 'Alamat', fAttn: 'Attn / kontak',
    fVessel: 'Vessel / Voyage', fPortCall: 'Port call', fRefFda: 'Ref. FDA',
    secLines: 'Baris Tagihan', thDesc: 'Deskripsi', thQty: 'Qty', thUnit: 'Unit', thAmount: 'Jumlah',
    phDesc: 'Deskripsi jasa', phDetail: 'keterangan (mis. as per FDA Sec. A)',
    secTerms: 'Syarat & Tanda Tangan', fTerms: 'Syarat pembayaran', fSigner: 'Penandatangan',
    sAgency: 'Agency handling', sVat: 'PPN', totalDue: 'Total Due',
    taxable: 'Kena PPN', sDpp: 'Dasar PPN (DPP)', sExempt: 'Bebas PPN',
  },
  en: {
    back: 'Back to Finance', kicker: 'Finance Generator · Invoice', h1: 'Create Invoice',
    desc: 'Agency service invoice with 11% VAT. Form is pre-filled with sample data — edit then download.',
    fromPortCall: 'Principal & vessel details auto-filled from Port Call. Just fill the charge lines below.',
    fromSrcPre: 'Charge lines & bill-to copied from', fromSrcPost: '(subtotal per section). Review, set the invoice number, then download.',
    secDetail: 'Invoice Details', fNo: 'Invoice no.', fDate: 'Invoice date', fDue: 'Due date', fCurrency: 'Currency',
    fAgency: 'Agency handling (%)', fVat: 'VAT (%)',
    secBillTo: 'Billed To', fName: 'Name', fNpwp: 'NPWP', fAddr: 'Address', fAttn: 'Attn / contact',
    fVessel: 'Vessel / Voyage', fPortCall: 'Port call', fRefFda: 'Ref. FDA',
    secLines: 'Charge Lines', thDesc: 'Description', thQty: 'Qty', thUnit: 'Unit', thAmount: 'Amount',
    phDesc: 'Service description', phDetail: 'note (e.g. as per FDA Sec. A)',
    secTerms: 'Terms & Signature', fTerms: 'Payment terms', fSigner: 'Signatory',
    sAgency: 'Agency handling', sVat: 'VAT', totalDue: 'Total Due',
    taxable: 'Taxable (VAT)', sDpp: 'VAT base (DPP)', sExempt: 'VAT-exempt',
  },
}

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
  const t = useT(STR)
  const c = useT(FORM_COMMON)
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
  const [fromPortCall, setFromPortCall] = useState(false)
  const [fromSource, setFromSource] = useState<string | null>(null)

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
  const toggleTaxable = (i: number) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, taxable: l.taxable === false } : l)))

  const data: InvoiceData = useMemo(
    () => ({ ...SAMPLE_INVOICE, ...head, lines }),
    [head, lines],
  )
  const totals = useMemo(() => computeInvoiceTotals(data), [data])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')
    const fromId = params.get('from')

    // Rantai dokumen: Invoice disalin dari FPDA tersimpan (?from=fpdaId).
    if (!id && fromId) {
      type SourceFpda = {
        docNumber?: string
        currency?: string
        agencyPct?: number
        principal?: string
        vesselName?: string
        port?: string
        portCode?: string
        eta?: string
        sections?: { letter: string; title: string; items: { amount?: number }[] }[]
      }
      fetch(`/api/documents/fpda?id=${fromId}&json=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: SourceFpda | null) => {
          if (!p) return
          const callRef = [
            [p.port, p.portCode ? `(${p.portCode})` : ''].filter(Boolean).join(' '),
            p.eta ? `ETA ${p.eta}` : '',
          ]
            .filter(Boolean)
            .join(' — ')
          setHead((h) => ({
            ...h,
            docNumber: '', // nomor invoice baru
            currency: p.currency ?? h.currency,
            agencyPct: p.agencyPct ?? h.agencyPct,
            billToName: p.principal ?? h.billToName,
            // FPDA tak menyimpan alamat/NPWP principal — kosongkan agar tak salah pakai contoh.
            billToAddress: '',
            billToNpwp: '',
            billToAttn: '',
            vesselVoyage: p.vesselName ?? h.vesselVoyage,
            portCall: callRef || h.portCall,
            refFda: p.docNumber ?? h.refFda,
          }))
          const fdaNo = p.docNumber ?? ''
          const fromSections = (p.sections ?? [])
            .map((s) => ({
              description: s.title,
              detail: `as per FDA ${fdaNo} Sec. ${s.letter}`,
              qty: 1,
              unitPrice: s.items.reduce((a, it) => a + (it.amount || 0), 0),
            }))
            .filter((l) => l.unitPrice > 0)
          setLines(fromSections.length ? fromSections : [{ description: '', detail: '', qty: 1, unitPrice: 0 }])
          setFromSource(`FPDA ${fdaNo}`.trim())
        })
      return
    }

    // Prefill bill-to & vessel dari Port Call (invoice baru, hanya isi baris tagihan).
    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { invoice?: Partial<Head> } | null) => {
          if (!d?.invoice) return
          setHead((h) => ({ ...h, ...d.invoice }))
          setLines([{ description: '', detail: '', qty: 1, unitPrice: 0 }])
          setFromPortCall(true)
        })
      return
    }

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
      const res = await fetch(`/api/documents/invoice?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/invoice/baru?id=${j.id}`)
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
          {fromSource && (
            <div className="rounded-md border border-accent-purple/30 bg-accent-purple/5 px-4 py-2.5 text-xs text-accent-purple">
              {t.fromSrcPre} {fromSource} {t.fromSrcPost}
            </div>
          )}

          {/* Detail invoice */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDetail}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fNo} value={head.docNumber} onChange={setF('docNumber')} />
              <Field label={t.fDate} value={head.invoiceDate} onChange={setF('invoiceDate')} />
              <Field label={t.fDue} value={head.dueDate} onChange={setF('dueDate')} />
              <Field label={t.fCurrency} value={head.currency} onChange={setF('currency')} />
              <Field label={t.fAgency} type="number" value={head.agencyPct} onChange={setF('agencyPct')} />
              <Field label={t.fVat} type="number" value={head.vatPct} onChange={setF('vatPct')} />
            </div>
          </section>

          {/* Billed to */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secBillTo}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={t.fName} value={head.billToName} onChange={setF('billToName')} />
              <Field label={t.fNpwp} value={head.billToNpwp ?? ''} onChange={setF('billToNpwp')} />
              <Field label={t.fAddr} value={head.billToAddress ?? ''} onChange={setF('billToAddress')} />
              <Field label={t.fAttn} value={head.billToAttn ?? ''} onChange={setF('billToAttn')} />
              <Field label={t.fVessel} value={head.vesselVoyage} onChange={setF('vesselVoyage')} />
              <Field label={t.fPortCall} value={head.portCall} onChange={setF('portCall')} />
              <Field label={t.fRefFda} value={head.refFda ?? ''} onChange={setF('refFda')} />
            </div>
          </section>

          {/* Baris tagihan */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secLines}</h2>
              <span className="text-xs font-mono text-text-secondary">
                {c.subtotal}: <span className="text-white">{fmt(totals.subtotal)}</span>
              </span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-6">{t.thDesc}</div>
              <div className="col-span-1 text-right">{t.thQty}</div>
              <div className="col-span-2 text-right">{t.thUnit}</div>
              <div className="col-span-2 text-right">{t.thAmount}</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-6 space-y-1">
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      placeholder={t.phDesc}
                      className={inputCls}
                    />
                    <input
                      value={l.detail ?? ''}
                      onChange={(e) => updateLine(i, 'detail', e.target.value)}
                      placeholder={t.phDetail}
                      className={inputCls + ' text-xs py-1.5'}
                    />
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer select-none pt-0.5">
                      <input
                        type="checkbox"
                        checked={isTaxable(l)}
                        onChange={() => toggleTaxable(i)}
                        className="accent-accent-blue w-3.5 h-3.5"
                      />
                      {t.taxable}
                    </label>
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
                    aria-label={c.deleteRow}
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
              {c.addRow}
            </button>
          </section>

          {/* Terms */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secTerms}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t.fTerms}</label>
                <textarea
                  value={head.paymentTerms}
                  onChange={(e) => setF('paymentTerms')(e.target.value)}
                  rows={3}
                  className={inputCls}
                />
              </div>
              <div className="md:w-1/2">
                <Field label={t.fSigner} value={head.signRole} onChange={setF('signRole')} />
              </div>
            </div>
          </section>
        </div>

        {/* Ringkasan */}
        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>{c.subtotal}</span>
                <span className="font-mono text-text-primary">{fmt(totals.subtotal)}</span>
              </div>
              {totals.hasExempt && (
                <div className="flex justify-between text-text-secondary/70">
                  <span>· {t.sExempt}</span>
                  <span className="font-mono">({fmt(totals.exemptTotal)})</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>{t.sAgency} {head.agencyPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.agency)}</span>
              </div>
              {totals.hasExempt && (
                <div className="flex justify-between text-text-secondary/70">
                  <span>{t.sDpp}</span>
                  <span className="font-mono">{fmt(totals.dpp)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-secondary">
                <span>{t.sVat} {head.vatPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.vat)}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{t.totalDue}</p>
              <p className="font-display text-xl text-white">
                {head.currency} {fmt(totals.totalDue)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {busy === 'save' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : savedId ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
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
