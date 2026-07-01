'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'
import { SAMPLE_RECEIPT, terbilangRupiah, type ReceiptData } from '@/lib/pdf/receipt-data'
import { blankSample } from '@/lib/blank-sample'
import { computeInvoiceTotals, type InvoiceData } from '@/lib/pdf/invoice-data'

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Generator Keuangan · Kwitansi', h1: 'Buat Kwitansi',
    desc: 'Tanda terima pembayaran (official receipt). Nominal otomatis jadi terbilang.',
    fromSrcPre: 'Data & nominal disalin dari', fromSrcPost: '. Periksa, isi nomor kwitansi, lalu unduh.',
    forPaymentPre: 'Pembayaran jasa keagenan kapal sesuai Invoice',
    secDetail: 'Detail Kwitansi', fNo: 'No. kwitansi', fDate: 'Tanggal', fPlace: 'Tempat', fCurrency: 'Mata uang', fRef: 'Ref. dokumen',
    secReceived: 'Penerimaan', fFrom: 'Telah terima dari', fAmount: 'Jumlah (angka)', fWords: 'Terbilang (otomatis)', fForPayment: 'Untuk pembayaran',
    secSign: 'Penerima & Tanda Tangan', fSignName: 'Nama penerima', fSignRole: 'Jabatan',
    sFrom: 'Diterima dari', sRef: 'Referensi', amountReceived: 'Jumlah Diterima',
  },
  en: {
    back: 'Back to Finance', kicker: 'Finance Generator · Receipt', h1: 'Create Receipt',
    desc: 'Payment receipt (official receipt). The amount auto-converts to words.',
    fromSrcPre: 'Data & amount copied from', fromSrcPost: '. Review, set the receipt number, then download.',
    forPaymentPre: 'Payment for ship agency services per Invoice',
    secDetail: 'Receipt Details', fNo: 'Receipt no.', fDate: 'Date', fPlace: 'Place', fCurrency: 'Currency', fRef: 'Ref. document',
    secReceived: 'Receipt of Payment', fFrom: 'Received from', fAmount: 'Amount (figures)', fWords: 'In words (auto)', fForPayment: 'For payment',
    secSign: 'Recipient & Signature', fSignName: 'Recipient name', fSignRole: 'Position',
    sFrom: 'Received from', sRef: 'Reference', amountReceived: 'Amount Received',
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

type FormState = Omit<ReceiptData, 'tenant'>

export function ReceiptForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { lang } = useLang()
  const { tenant: _t, ...sample } = blankSample(SAMPLE_RECEIPT)
  const [form, setForm] = useState<FormState>(sample)
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromSource, setFromSource] = useState<string | null>(null)

  const set = (k: keyof FormState) => (v: string) =>
    setForm((p) => ({ ...p, [k]: k === 'amount' ? Number(v) || 0 : v }))

  const data = useMemo(() => ({ ...SAMPLE_RECEIPT, ...form }), [form])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const fromId = params.get('from')

    // Kwitansi dari Invoice tersimpan (?from=invoiceId).
    if (!id && fromId) {
      fetch(`/api/documents/invoice?id=${fromId}&json=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Partial<InvoiceData> | null) => {
          if (!p) return
          const totals = computeInvoiceTotals({ ...p, lines: p.lines ?? [], agencyPct: p.agencyPct ?? 0, vatPct: p.vatPct ?? 0 } as InvoiceData)
          const ref = [p.vesselVoyage, p.portCall ? `port call ${p.portCall}` : '']
            .filter(Boolean)
            .join(', ')
          setForm((f) => ({
            ...f,
            docNumber: '',
            currency: p.currency ?? f.currency,
            receivedFrom: p.billToName ?? f.receivedFrom,
            amount: totals.totalDue,
            forPayment: `${STR[lang].forPaymentPre} ${p.docNumber ?? ''}${ref ? ` — ${ref}` : ''}.`,
            refDoc: p.docNumber ?? f.refDoc,
          }))
          setFromSource(`Invoice ${p.docNumber ?? ''}`.trim())
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/receipt?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<ReceiptData> | null) => {
        if (!p) return
        setForm((f) => ({ ...f, ...p }))
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/receipt?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/receipt/baru?id=${j.id}`)
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
      const res = await fetch(`/api/documents/receipt${download ? '?download=1' : ''}`, {
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
        a.download = (form.docNumber || 'KWITANSI').replace(/[\\/]/g, '-') + '.pdf'
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

          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromSrcPre} {fromSource}{t.fromSrcPost}
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDetail}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fNo} value={form.docNumber} onChange={set('docNumber')} />
              <Field label={t.fDate} value={form.receiptDate} onChange={set('receiptDate')} />
              <Field label={t.fPlace} value={form.place} onChange={set('place')} />
              <Field label={t.fCurrency} value={form.currency} onChange={set('currency')} />
              <Field label={t.fRef} value={form.refDoc ?? ''} onChange={set('refDoc')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secReceived}</h2>
            <div className="space-y-3">
              <Field label={t.fFrom} value={form.receivedFrom} onChange={set('receivedFrom')} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.fAmount} type="number" value={form.amount} onChange={set('amount')} />
                <div>
                  <label className={labelCls}>{t.fWords}</label>
                  <div className="w-full bg-surface/60 border border-border-muted rounded px-2.5 py-2 text-sm text-accent-teal italic min-h-[38px]">
                    {terbilangRupiah(form.amount)}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t.fForPayment}</label>
                <textarea
                  value={form.forPayment}
                  onChange={(e) => set('forPayment')(e.target.value)}
                  rows={3}
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secSign}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.fSignName} value={form.signName} onChange={set('signName')} />
              <Field label={t.fSignRole} value={form.signRole} onChange={set('signRole')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>{t.sFrom}</span>
                <span className="text-text-primary text-right max-w-[60%] truncate">{form.receivedFrom || '—'}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{t.sRef}</span>
                <span className="font-mono text-text-primary">{form.refDoc || '—'}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{t.amountReceived}</p>
              <p className="font-display text-xl text-white">
                {form.currency} {fmt(form.amount)}
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
