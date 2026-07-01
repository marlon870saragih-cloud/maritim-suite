'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import {
  SAMPLE_PR,
  SAMPLE_PO,
  computeProcTotals,
  procLineAmount,
  PROC_META,
  type ProcData,
  type ProcKind,
  type ProcLine,
} from '@/lib/pdf/procurement-data'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Pengadaan', create: 'Buat',
    leadPr: 'Permintaan pengadaan barang/jasa untuk kapal. Estimasi total otomatis.',
    leadPo: 'Order pembelian ke supplier. Total + PPN dihitung otomatis.',
    fromSrcPre: 'Item & data disalin dari', fromSrcPost: '. Isi supplier & harga lalu unduh.',
    secDetail: 'Detail', fDate: 'Tanggal', fCurrency: 'Mata uang', fDeliveryTo: 'Kirim ke',
    fNeededPr: 'Dibutuhkan tgl', fNeededPo: 'Tgl kirim', fVat: 'PPN (%)',
    partyPr: 'Diminta oleh', partyPo: 'Kepada (Supplier)', fName: 'Nama', fAttn: 'Attn / kontak', fAddr: 'Alamat',
    reasonPr: 'Justifikasi kebutuhan', reasonPo: 'Catatan / instruksi', fTerms: 'Syarat pembayaran',
    secItems: 'Daftar Barang / Jasa', thItem: 'Item', thQty: 'Qty', thUnit: 'Unit', thPrice: 'Harga', thAmount: 'Jumlah',
    phItem: 'Nama barang/jasa', phDetail: 'keterangan (opsional)', sVat: 'PPN',
    totalPr: 'Estimasi Total', totalPo: 'Total Order',
  },
  en: {
    back: 'Back to Finance', kicker: 'Procurement', create: 'Create',
    leadPr: 'Request to procure vessel goods/services. Total estimated automatically.',
    leadPo: 'Purchase order to supplier. Total + VAT computed automatically.',
    fromSrcPre: 'Items & data copied from', fromSrcPost: '. Fill supplier & prices then download.',
    secDetail: 'Details', fDate: 'Date', fCurrency: 'Currency', fDeliveryTo: 'Deliver to',
    fNeededPr: 'Needed by', fNeededPo: 'Delivery date', fVat: 'VAT (%)',
    partyPr: 'Requested by', partyPo: 'To (Supplier)', fName: 'Name', fAttn: 'Attn / contact', fAddr: 'Address',
    reasonPr: 'Need justification', reasonPo: 'Notes / instructions', fTerms: 'Payment terms',
    secItems: 'Goods / Services List', thItem: 'Item', thQty: 'Qty', thUnit: 'Unit', thPrice: 'Price', thAmount: 'Amount',
    phItem: 'Item name', phDetail: 'note (optional)', sVat: 'VAT',
    totalPr: 'Estimated Total', totalPo: 'Order Total',
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

type Head = Omit<ProcData, 'tenant' | 'lines' | 'kind'>

export function ProcurementForm({ kind }: { kind: ProcKind }) {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  useLang()
  const sample = kind === 'pr' ? SAMPLE_PR : SAMPLE_PO
  const meta = PROC_META[kind]
  const partyLabel = kind === 'pr' ? t.partyPr : t.partyPo
  const reasonLabel = kind === 'pr' ? t.reasonPr : t.reasonPo
  const totalLabel = kind === 'pr' ? t.totalPr : t.totalPo
  const endpoint = `/api/documents/${kind}`
  const formRoute = `/finance/${kind}/baru`
  const { tenant: _t, lines: _l, kind: _k, ...sampleHead } = sample

  const [head, setHead] = useState<Head>(sampleHead)
  const [lines, setLines] = useState<ProcLine[]>(clone(sample.lines))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromSource, setFromSource] = useState<string | null>(null)

  const setF = (k: keyof Head) => (v: string) =>
    setHead((p) => ({ ...p, [k]: k === 'taxPct' ? Number(v) || 0 : v }))

  function updateLine(i: number, field: keyof ProcLine, value: string) {
    setLines((prev) => {
      const next = clone(prev)
      const num = field === 'qty' || field === 'unitPrice'
      // @ts-expect-error index dinamis
      next[i][field] = num ? Number(value) || 0 : value
      return next
    })
  }
  const addLine = () => setLines((p) => [...p, { description: '', detail: '', qty: 1, unit: 'pcs', unitPrice: 0 }])
  const removeLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i))

  const data: ProcData = useMemo(() => ({ ...sample, ...head, kind, lines }), [sample, head, kind, lines])
  const totals = useMemo(() => computeProcTotals(data), [data])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const fromId = params.get('from')

    // PO disalin dari PR tersimpan (?from=prId): item & kapal ikut, supplier dikosongkan.
    if (!id && fromId && kind === 'po') {
      fetch(`/api/documents/pr?id=${fromId}&json=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Partial<ProcData> | null) => {
          if (!p) return
          setHead((h) => ({
            ...h,
            docNumber: '',
            currency: p.currency ?? h.currency,
            vesselVoyage: p.vesselVoyage ?? h.vesselVoyage,
            deliveryTo: p.deliveryTo ?? h.deliveryTo,
            party: '', // supplier diisi user
            partyAddress: '',
            partyAttn: '',
            reason: `Mengacu PR ${p.docNumber ?? ''}.`,
          }))
          if (Array.isArray(p.lines) && p.lines.length) setLines(p.lines)
          setFromSource(`PR ${p.docNumber ?? ''}`.trim())
        })
      return
    }

    if (!id) return
    fetch(`${endpoint}?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<ProcData> | null) => {
        if (!p) return
        const { tenant: _t2, lines: pl, kind: _k2, ...rest } = p
        setHead((h) => ({ ...h, ...(rest as Partial<Head>) }))
        if (Array.isArray(pl)) setLines(pl)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`${endpoint}?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `${formRoute}?id=${j.id}`)
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
      const res = await fetch(`${endpoint}${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || meta.title).replace(/[\\/]/g, '-') + '.pdf'
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
              {t.kicker} · {meta.titleId}
            </p>
            <h1 className="font-display text-2xl text-white">{t.create} {meta.titleId}</h1>
            <p className="text-text-secondary text-sm mt-1">
              {kind === 'pr' ? t.leadPr : t.leadPo}
            </p>
          </div>

          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromSrcPre} {fromSource}{t.fromSrcPost}
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDetail} {meta.titleId}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={`No. ${kind.toUpperCase()}`} value={head.docNumber} onChange={setF('docNumber')} />
              <Field label={t.fDate} value={head.docDate} onChange={setF('docDate')} />
              <Field label={t.fCurrency} value={head.currency} onChange={setF('currency')} />
              <Field label="Vessel / Voyage" value={head.vesselVoyage ?? ''} onChange={setF('vesselVoyage')} />
              <Field label={t.fDeliveryTo} value={head.deliveryTo ?? ''} onChange={setF('deliveryTo')} />
              <Field label={kind === 'pr' ? t.fNeededPr : t.fNeededPo} value={head.neededBy ?? ''} onChange={setF('neededBy')} />
              {meta.showTerms && <Field label={t.fVat} type="number" value={head.taxPct} onChange={setF('taxPct')} />}
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{partyLabel}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={t.fName} value={head.party} onChange={setF('party')} />
              <Field label={t.fAttn} value={head.partyAttn ?? ''} onChange={setF('partyAttn')} />
              <Field label={t.fAddr} value={head.partyAddress ?? ''} onChange={setF('partyAddress')} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>{reasonLabel}</label>
              <textarea value={head.reason} onChange={(e) => setF('reason')(e.target.value)} rows={2} className={inputCls} />
            </div>
            {meta.showTerms && (
              <div className="mt-3">
                <label className={labelCls}>{t.fTerms}</label>
                <textarea
                  value={head.paymentTerms ?? ''}
                  onChange={(e) => setF('paymentTerms')(e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>
            )}
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secItems}</h2>
              <span className="text-xs font-mono text-text-secondary">
                {c.subtotal}: <span className="text-white">{fmt(totals.subtotal)}</span>
              </span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-5">{t.thItem}</div>
              <div className="col-span-1 text-right">{t.thQty}</div>
              <div className="col-span-1">{t.thUnit}</div>
              <div className="col-span-2 text-right">{t.thPrice}</div>
              <div className="col-span-2 text-right">{t.thAmount}</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 md:col-span-5 space-y-1">
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(i, 'description', e.target.value)}
                      placeholder={t.phItem}
                      className={inputCls}
                    />
                    <input
                      value={l.detail ?? ''}
                      onChange={(e) => updateLine(i, 'detail', e.target.value)}
                      placeholder={t.phDetail}
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
                    value={l.unit}
                    onChange={(e) => updateLine(i, 'unit', e.target.value)}
                    placeholder="pcs"
                    className={`${inputCls} col-span-3 md:col-span-1`}
                  />
                  <input
                    type="number"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                    className={`${inputCls} col-span-3 md:col-span-2 text-right`}
                  />
                  <div className="col-span-2 md:col-span-2 flex items-center justify-end h-9 px-1 font-mono text-sm text-text-secondary">
                    {fmt(procLineAmount(l))}
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
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>{c.subtotal}</span>
                <span className="font-mono text-text-primary">{fmt(totals.subtotal)}</span>
              </div>
              {meta.showTerms && (
                <div className="flex justify-between text-text-secondary">
                  <span>{t.sVat} {head.taxPct}%</span>
                  <span className="font-mono text-text-primary">{fmt(totals.tax)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{totalLabel}</p>
              <p className="font-display text-xl text-white">
                {head.currency} {fmt(totals.total)}
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
