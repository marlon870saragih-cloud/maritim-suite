'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_RECEIPT, terbilangRupiah, type ReceiptData } from '@/lib/pdf/receipt-data'
import { computeInvoiceTotals, type InvoiceData } from '@/lib/pdf/invoice-data'

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

type FormState = Omit<ReceiptData, 'tenant'>

export function ReceiptForm() {
  const { tenant: _t, ...sample } = SAMPLE_RECEIPT
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
            forPayment: `Pembayaran jasa keagenan kapal sesuai Invoice ${p.docNumber ?? ''}${ref ? ` — ${ref}` : ''}.`,
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
      const res = await fetch(`/api/documents/receipt?save=1${savedId ? `&id=${savedId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/receipt/baru?id=${j.id}`)
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
              Generator Keuangan · Kwitansi
            </p>
            <h1 className="font-display text-2xl text-white">Buat Kwitansi</h1>
            <p className="text-text-secondary text-sm mt-1">
              Tanda terima pembayaran (official receipt). Nominal otomatis jadi terbilang.
            </p>
          </div>

          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Data &amp; nominal disalin dari {fromSource}. Periksa, isi nomor kwitansi, lalu unduh.
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Detail Kwitansi</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. kwitansi" value={form.docNumber} onChange={set('docNumber')} />
              <Field label="Tanggal" value={form.receiptDate} onChange={set('receiptDate')} />
              <Field label="Tempat" value={form.place} onChange={set('place')} />
              <Field label="Mata uang" value={form.currency} onChange={set('currency')} />
              <Field label="Ref. dokumen" value={form.refDoc ?? ''} onChange={set('refDoc')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Penerimaan</h2>
            <div className="space-y-3">
              <Field label="Telah terima dari" value={form.receivedFrom} onChange={set('receivedFrom')} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jumlah (angka)" type="number" value={form.amount} onChange={set('amount')} />
                <div>
                  <label className={labelCls}>Terbilang (otomatis)</label>
                  <div className="w-full bg-surface/60 border border-border-muted rounded px-2.5 py-2 text-sm text-accent-teal italic min-h-[38px]">
                    {terbilangRupiah(form.amount)}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Untuk pembayaran</label>
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
            <h2 className="font-display text-base text-white mb-4">Penerima &amp; Tanda Tangan</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama penerima" value={form.signName} onChange={set('signName')} />
              <Field label="Jabatan" value={form.signRole} onChange={set('signRole')} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">Ringkasan</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Diterima dari</span>
                <span className="text-text-primary text-right max-w-[60%] truncate">{form.receivedFrom || '—'}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Referensi</span>
                <span className="font-mono text-text-primary">{form.refDoc || '—'}</span>
              </div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">Jumlah Diterima</p>
              <p className="font-display text-xl text-white">
                {form.currency} {fmt(form.amount)}
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
