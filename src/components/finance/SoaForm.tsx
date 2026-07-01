'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_SOA, computeSoaTotals, type SoaData, type SoaRow } from '@/lib/pdf/soa-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Penagihan · Statement of Account', h1: 'Buat Statement of Account',
    desc: 'Rekap tagihan per principal. Pilih principal — invoice mereka terkumpul otomatis.',
    noInvoices: 'Belum ada invoice tersimpan. Buat & simpan Invoice dulu agar bisa direkap jadi SOA.',
    secPrincipal: 'Principal & Periode', selPrincipal: 'Principal (dari invoice tersimpan)', invWord: 'invoice',
    fDate: 'Tanggal', fPeriod: 'Periode', fOpening: 'Saldo awal', fAttn: 'Attn',
    secLines: 'Baris Tagihan', thDate: 'Tanggal', thNo: 'No. Invoice', thRef: 'Keterangan', thBilled: 'Tagihan', thPaid: 'Dibayar',
    fNotes: 'Catatan', sOpening: 'Saldo awal', sBilled: 'Total tagihan', sPaid: 'Total dibayar', outstanding: 'Saldo Terutang',
  },
  en: {
    back: 'Back to Finance', kicker: 'Billing · Statement of Account', h1: 'Create Statement of Account',
    desc: 'Charges recap per principal. Pick a principal — their invoices are gathered automatically.',
    noInvoices: 'No saved invoices yet. Create & save an Invoice first so it can be recapped into an SOA.',
    secPrincipal: 'Principal & Period', selPrincipal: 'Principal (from saved invoices)', invWord: 'invoices',
    fDate: 'Date', fPeriod: 'Period', fOpening: 'Opening balance', fAttn: 'Attn',
    secLines: 'Charge Lines', thDate: 'Date', thNo: 'Invoice No.', thRef: 'Description', thBilled: 'Billed', thPaid: 'Paid',
    fNotes: 'Notes', sOpening: 'Opening balance', sBilled: 'Total billed', sPaid: 'Total paid', outstanding: 'Outstanding Balance',
  },
}

export type SoaParty = {
  name: string
  address: string
  npwp: string
  attn: string
  rows: SoaRow[]
}

const fmt = (n: number) => (n || 0).toLocaleString('en-US')

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

type Head = Omit<SoaData, 'tenant' | 'rows'>

export function SoaForm({ parties }: { parties: SoaParty[] }) {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, rows: _r, ...sampleHead } = blankSample(SAMPLE_SOA)
  const [partyIdx, setPartyIdx] = useState(parties.length ? 0 : -1)
  const [head, setHead] = useState<Head>(sampleHead)
  const [rows, setRows] = useState<SoaRow[]>(parties[0]?.rows ?? [])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')

  const setF = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: k === 'openingBalance' ? Number(v) || 0 : v }))

  // Muat data pihak terpilih (nama/alamat + baris tagihan dari invoice mereka).
  function loadParty(idx: number) {
    setPartyIdx(idx)
    const p = parties[idx]
    if (!p) return
    setHead((h) => ({ ...h, toName: p.name, toAddress: p.address, toNpwp: p.npwp, toAttn: p.attn }))
    setRows(p.rows.map((r) => ({ ...r })))
  }
  useEffect(() => {
    if (parties.length) loadParty(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setRowPaid(i: number, v: string) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }))
      next[i].paid = Number(v) || 0
      return next
    })
  }

  const data: SoaData = useMemo(() => ({ ...SAMPLE_SOA, ...head, rows }), [head, rows])
  const totals = useMemo(() => computeSoaTotals(data), [data])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/soa?save=1${savedId ? `&id=${savedId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/soa/baru?id=${j.id}`)
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
      const res = await fetch(`/api/documents/soa${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'SOA').replace(/[\\/]/g, '-') + '.pdf'
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
      <Link href="/finance" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">{t.kicker}</p>
            <h1 className="font-display text-2xl text-white">{t.h1}</h1>
            <p className="text-text-secondary text-sm mt-1">{t.desc}</p>
          </div>

          {parties.length === 0 ? (
            <div className="rounded-md border border-accent-amber/30 bg-accent-amber/5 px-4 py-3 text-xs text-accent-amber">
              {t.noInvoices}
            </div>
          ) : (
            <section className="bg-card-bg border border-card-border rounded-lg p-5">
              <h2 className="font-display text-base text-white mb-4">{t.secPrincipal}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="col-span-2 md:col-span-3">
                  <label className={labelCls}>{t.selPrincipal}</label>
                  <select className={inputCls} value={partyIdx} onChange={(e) => loadParty(Number(e.target.value))}>
                    {parties.map((p, i) => (
                      <option key={p.name} value={i} className="bg-surface">
                        {p.name} · {p.rows.length} {t.invWord}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="No. SOA" value={head.docNumber} onChange={setF('docNumber')} />
                <Field label={t.fDate} value={head.statementDate} onChange={setF('statementDate')} />
                <Field label={t.fPeriod} value={head.period} onChange={setF('period')} />
                <Field label={t.fOpening} type="number" value={head.openingBalance} onChange={setF('openingBalance')} />
                <Field label="NPWP" value={head.toNpwp ?? ''} onChange={setF('toNpwp')} />
                <Field label={t.fAttn} value={head.toAttn ?? ''} onChange={setF('toAttn')} />
              </div>
            </section>
          )}

          {parties.length > 0 && (
            <section className="bg-card-bg border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base text-white">{t.secLines}</h2>
                <span className="text-xs font-mono text-text-secondary">{rows.length} {t.invWord}</span>
              </div>
              <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
                <div className="col-span-2">{t.thDate}</div>
                <div className="col-span-3">{t.thNo}</div>
                <div className="col-span-3">{t.thRef}</div>
                <div className="col-span-2 text-right">{t.thBilled}</div>
                <div className="col-span-2 text-right">{t.thPaid}</div>
              </div>
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center text-sm">
                    <div className="col-span-3 md:col-span-2 text-text-secondary text-xs">{r.date || '—'}</div>
                    <div className="col-span-5 md:col-span-3 font-mono text-text-primary text-xs truncate">{r.docNumber}</div>
                    <div className="hidden md:block md:col-span-3 text-text-secondary text-xs truncate">{r.ref}</div>
                    <div className="col-span-4 md:col-span-2 text-right font-mono text-text-primary">{fmt(r.amount)}</div>
                    <input
                      type="number"
                      value={r.paid}
                      onChange={(e) => setRowPaid(i, e.target.value)}
                      className={`${inputCls} col-span-12 md:col-span-2 text-right py-1.5`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className={labelCls}>{t.fNotes}</label>
                <textarea value={head.notes} onChange={(e) => setF('notes')(e.target.value)} rows={2} className={inputCls} />
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              {head.openingBalance ? (
                <div className="flex justify-between text-text-secondary"><span>{t.sOpening}</span><span className="font-mono text-text-primary">{fmt(head.openingBalance)}</span></div>
              ) : null}
              <div className="flex justify-between text-text-secondary"><span>{t.sBilled}</span><span className="font-mono text-text-primary">{fmt(totals.billed)}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sPaid}</span><span className="font-mono text-status-success">({fmt(totals.paid)})</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{t.outstanding}</p>
              <p className="font-display text-xl text-white">{head.currency} {fmt(totals.outstanding)}</p>
            </div>
          </div>

          <button type="button" onClick={saveDraft} disabled={busy !== null || parties.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? c.saveChanges : c.saveDraft}
          </button>
          {savedMsg && <p className="text-center text-xs text-accent-teal -mt-1">{savedMsg}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => generate(true)} disabled={busy !== null || parties.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {c.download}
            </button>
            <button type="button" onClick={() => generate(false)} disabled={busy !== null || parties.length === 0}
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
