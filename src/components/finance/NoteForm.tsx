'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import {
  SAMPLE_DEBIT,
  SAMPLE_CREDIT,
  computeNoteTotals,
  noteLineAmount,
  NOTE_META,
  type NoteData,
  type NoteKind,
  type NoteLine,
} from '@/lib/pdf/note-data'
import { blankSample } from '@/lib/blank-sample'
import type { InvoiceData } from '@/lib/pdf/invoice-data'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Generator Keuangan', create: 'Buat', totalAuto: 'Total dihitung otomatis.',
    titleDebit: 'Nota Debit', titleCredit: 'Nota Kredit',
    leadDebit: 'Menambah tagihan ke principal (biaya di luar FDA / koreksi naik).',
    leadCredit: 'Mengurangi / mengembalikan kelebihan tagihan ke principal.',
    fromSrcPre: 'Pihak & referensi disalin dari', fromSrcPost: '. Tinggal isi baris penyesuaian di bawah.',
    secDetail: 'Detail Nota', fNo: 'No. nota', fDate: 'Tanggal', fCurrency: 'Mata uang', fRef: 'Ref. dokumen', fVat: 'PPN (%)',
    toDebit: 'Didebit Kepada', toCredit: 'Dikredit Kepada', fName: 'Nama', fNpwp: 'NPWP', fAddr: 'Alamat', fReason: 'Alasan penyesuaian',
    secLines: 'Baris Penyesuaian', thDesc: 'Deskripsi', thQty: 'Qty', thUnit: 'Unit', thAmount: 'Jumlah',
    phDesc: 'Deskripsi penyesuaian', phDetail: 'keterangan (opsional)', sVat: 'PPN',
    totalDebit: 'Total Tambahan', totalCredit: 'Total Pengurangan',
  },
  en: {
    back: 'Back to Finance', kicker: 'Finance Generator', create: 'Create', totalAuto: 'Total computed automatically.',
    titleDebit: 'Debit Note', titleCredit: 'Credit Note',
    leadDebit: 'Adds a charge to the principal (costs beyond FDA / upward correction).',
    leadCredit: 'Reduces / refunds an overcharge to the principal.',
    fromSrcPre: 'Party & reference copied from', fromSrcPost: '. Just fill the adjustment lines below.',
    secDetail: 'Note Details', fNo: 'Note no.', fDate: 'Date', fCurrency: 'Currency', fRef: 'Ref. document', fVat: 'VAT (%)',
    toDebit: 'Debited To', toCredit: 'Credited To', fName: 'Name', fNpwp: 'NPWP', fAddr: 'Address', fReason: 'Adjustment reason',
    secLines: 'Adjustment Lines', thDesc: 'Description', thQty: 'Qty', thUnit: 'Unit', thAmount: 'Amount',
    phDesc: 'Adjustment description', phDetail: 'note (optional)', sVat: 'VAT',
    totalDebit: 'Total Addition', totalCredit: 'Total Reduction',
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

type Head = Omit<NoteData, 'tenant' | 'lines' | 'kind'>

export function NoteForm({ kind }: { kind: NoteKind }) {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  useLang()
  const title = kind === 'debit' ? t.titleDebit : t.titleCredit
  const sample = kind === 'debit' ? SAMPLE_DEBIT : SAMPLE_CREDIT
  const meta = NOTE_META[kind]
  const endpoint = `/api/documents/${kind}-note`
  const formRoute = `/finance/${kind}-note/baru`
  const { tenant: _t, lines: _l, kind: _k, ...sampleHead } = blankSample(sample)

  const [head, setHead] = useState<Head>(sampleHead)
  const [lines, setLines] = useState<NoteLine[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromSource, setFromSource] = useState<string | null>(null)

  const setF = (k: keyof Head) => (v: string) =>
    setHead((p) => ({ ...p, [k]: k === 'vatPct' ? Number(v) || 0 : v }))

  function updateLine(i: number, field: keyof NoteLine, value: string) {
    setLines((prev) => {
      const next = clone(prev)
      const num = field === 'qty' || field === 'unitPrice'
      // @ts-expect-error index dinamis
      next[i][field] = num ? Number(value) || 0 : value
      return next
    })
  }
  const addLine = () => setLines((p) => [...p, { description: '', detail: '', qty: 1, unitPrice: 0 }])
  const removeLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i))

  const data: NoteData = useMemo(() => ({ ...sample, ...head, kind, lines }), [sample, head, kind, lines])
  const totals = useMemo(() => computeNoteTotals(data), [data])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const fromId = params.get('from')

    // Nota dari Invoice tersimpan (?from=invoiceId) — prefill pihak & referensi.
    if (!id && fromId) {
      fetch(`/api/documents/invoice?id=${fromId}&json=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Partial<InvoiceData> | null) => {
          if (!p) return
          setHead((h) => ({
            ...h,
            docNumber: '',
            currency: p.currency ?? h.currency,
            toName: p.billToName ?? h.toName,
            toAddress: p.billToAddress ?? '',
            toNpwp: p.billToNpwp ?? '',
            vesselVoyage: p.vesselVoyage ?? h.vesselVoyage,
            refDoc: p.docNumber ?? h.refDoc,
          }))
          setLines([{ description: '', detail: '', qty: 1, unitPrice: 0 }])
          setFromSource(`Invoice ${p.docNumber ?? ''}`.trim())
        })
      return
    }

    if (!id) return
    fetch(`${endpoint}?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<NoteData> | null) => {
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

  const totalLabel = kind === 'debit' ? t.totalDebit : t.totalCredit

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
              {t.kicker} · {title}
            </p>
            <h1 className="font-display text-2xl text-white">{t.create} {title}</h1>
            <p className="text-text-secondary text-sm mt-1">
              {kind === 'debit' ? t.leadDebit : t.leadCredit}{' '}
              {t.totalAuto}
            </p>
          </div>

          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromSrcPre} {fromSource}{t.fromSrcPost}
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDetail}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fNo} value={head.docNumber} onChange={setF('docNumber')} />
              <Field label={t.fDate} value={head.noteDate} onChange={setF('noteDate')} />
              <Field label={t.fCurrency} value={head.currency} onChange={setF('currency')} />
              <Field label={t.fRef} value={head.refDoc ?? ''} onChange={setF('refDoc')} />
              <Field label="Vessel / Voyage" value={head.vesselVoyage ?? ''} onChange={setF('vesselVoyage')} />
              <Field label={t.fVat} type="number" value={head.vatPct} onChange={setF('vatPct')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">
              {kind === 'debit' ? t.toDebit : t.toCredit}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={t.fName} value={head.toName} onChange={setF('toName')} />
              <Field label={t.fNpwp} value={head.toNpwp ?? ''} onChange={setF('toNpwp')} />
              <Field label={t.fAddr} value={head.toAddress ?? ''} onChange={setF('toAddress')} />
            </div>
            <div className="mt-3">
              <label className={labelCls}>{t.fReason}</label>
              <textarea
                value={head.reason}
                onChange={(e) => setF('reason')(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>
          </section>

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
                    {fmt(noteLineAmount(l))}
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
              <div className="flex justify-between text-text-secondary">
                <span>{t.sVat} {head.vatPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.vat)}</span>
              </div>
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
