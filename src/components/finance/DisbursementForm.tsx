'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import { PortCallPicker } from './PortCallPicker'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'
import {
  SAMPLE_EPDA,
  SAMPLE_FPDA,
  computeTotals,
  sectionSubtotal,
  lineAmount,
  type EpdaData,
  type EpdaSection,
} from '@/lib/pdf/epda-data'

type DocKind = 'epda' | 'fpda'
type Bi = { id: string; en: string }

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Generator Keuangan', create: 'Buat', totalAuto: 'Total dihitung otomatis.',
    fromPortCall: 'Partikular kapal & call terisi otomatis dari Port Call. Tinggal isi baris biaya di bawah.',
    fromSrcPre: 'Partikular & baris biaya disalin dari', fromSrcPost: '. Ubah jadi nilai aktual, isi nomor & dana muka, lalu simpan sebagai FPDA baru.',
    secPar: 'Partikular Kapal & Call', fVessel: 'Nama kapal', fPrincipal: 'Principal', fPort: 'Port', fPortCode: 'Port code', fCargo: 'Cargo',
    secDoc: 'Detail Dokumen', fNo: 'No. dokumen', fIssued: 'Diterbitkan', fCurrency: 'Mata uang',
    fAgency: 'Agency handling (%)', fUsd: 'Kurs USD (indikatif)', fAdvance: 'Dana muka diterima',
    lumpMode: 'Mode Lump Sum', lumpHint: '— satu angka total, tanpa rincian seksi A/B/C/D', fLumpDesc: 'Uraian', fLumpAmt: 'Jumlah lump sum',
    lumpNotePre: 'Agency handling', lumpNotePost: 'tetap dihitung di atas jumlah ini. Bila lump sum sudah termasuk agency, set Agency % = 0.',
    thDesc: 'Deskripsi', thQtyBasis: 'Qty / Basis', thRate: 'Rate', thAmount: 'Jumlah',
    amountAuto: 'Jumlah dihitung otomatis = Qty × Rate',
    phCost: 'Deskripsi biaya', phBasis: 'keterangan (mis. per GT per call)', phQty: 'Qty', phRate: 'Rate', phAmount: 'Jumlah',
    secSummary: 'Ringkasan Biaya', subAll: 'Subtotal (A+B+C+D)', lumpSumLabel: 'Lump Sum', sAgency: 'Agency handling',
    totalDisb: 'Total Disbursements', advanceReceived: 'Dana muka diterima',
    balanceBilled: 'Saldo Ditagih ke Principal', refund: 'Refund ke Principal', indicative: 'indikatif',
  },
  en: {
    back: 'Back to Finance', kicker: 'Finance Generator', create: 'Create', totalAuto: 'Total computed automatically.',
    fromPortCall: 'Vessel & call particulars auto-filled from Port Call. Just fill the cost lines below.',
    fromSrcPre: 'Particulars & cost lines copied from', fromSrcPost: '. Change to actual values, set the number & advance, then save as a new FPDA.',
    secPar: 'Vessel & Call Particulars', fVessel: 'Vessel name', fPrincipal: 'Principal', fPort: 'Port', fPortCode: 'Port code', fCargo: 'Cargo',
    secDoc: 'Document Details', fNo: 'Doc no.', fIssued: 'Issued', fCurrency: 'Currency',
    fAgency: 'Agency handling (%)', fUsd: 'USD rate (indicative)', fAdvance: 'Advance received',
    lumpMode: 'Lump Sum Mode', lumpHint: '— a single total, no A/B/C/D section breakdown', fLumpDesc: 'Description', fLumpAmt: 'Lump sum amount',
    lumpNotePre: 'Agency handling', lumpNotePost: 'is still computed on top of this amount. If the lump sum already includes agency, set Agency % = 0.',
    thDesc: 'Description', thQtyBasis: 'Qty / Basis', thRate: 'Rate', thAmount: 'Amount',
    amountAuto: 'Amount is auto-computed = Qty × Rate',
    phCost: 'Cost description', phBasis: 'note (e.g. per GT per call)', phQty: 'Qty', phRate: 'Rate', phAmount: 'Amount',
    secSummary: 'Cost Summary', subAll: 'Subtotal (A+B+C+D)', lumpSumLabel: 'Lump Sum', sAgency: 'Agency handling',
    totalDisb: 'Total Disbursements', advanceReceived: 'Advance received',
    balanceBilled: 'Balance Billed to Principal', refund: 'Refund to Principal', indicative: 'indicative',
  },
}

type Meta = Pick<
  EpdaData,
  'docNumber' | 'issuedAt' | 'validUntil' | 'currency' | 'agencyPct' | 'usdRate' | 'advanceReceived'
>
type Particulars = Pick<
  EpdaData,
  'vesselName' | 'principal' | 'imo' | 'flag' | 'port' | 'portCode' | 'gt' | 'nrt' | 'eta' | 'etd' | 'loa' | 'draft' | 'cargo'
>

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
  placeholder,
  type = 'text',
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}

const CONFIG: Record<
  DocKind,
  { label: string; sample: EpdaData; lead: Bi; validDocLabel: Bi; summaryTotalLabel: string }
> = {
  epda: {
    label: 'EPDA',
    sample: SAMPLE_EPDA,
    lead: {
      id: 'Estimasi biaya port call (proforma) untuk meminta dana muka ke principal.',
      en: 'Estimated port call costs (proforma) to request an advance from the principal.',
    },
    validDocLabel: { id: 'Berlaku s/d', en: 'Valid until' },
    summaryTotalLabel: 'Estimated Total',
  },
  fpda: {
    label: 'FPDA',
    sample: SAMPLE_FPDA,
    lead: {
      id: 'Laporan biaya aktual (final) — direkonsiliasi dengan dana muka yang sudah diterima.',
      en: 'Actual (final) cost report — reconciled against the advance already received.',
    },
    validDocLabel: { id: 'Jatuh tempo bayar', en: 'Payment due' },
    summaryTotalLabel: 'Total Disbursements',
  },
}

export function DisbursementForm({ type }: { type: DocKind }) {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { lang } = useLang()
  const cfg = CONFIG[type]
  const sample = cfg.sample
  const endpoint = `/api/documents/${type}`
  const formRoute = `/finance/${type}/baru`

  // Dokumen BARU dibuka kosong (tanpa "sisa angka"/data contoh). Hanya default
  // konfigurasi (mata uang, agency %, kurs) yang dipertahankan. Data contoh tetap
  // dipakai untuk tombol "Lihat contoh" (endpoint sample), bukan untuk form baru.
  const [meta, setMeta] = useState<Meta>({
    docNumber: '',
    issuedAt: '',
    validUntil: '',
    currency: sample.currency,
    agencyPct: sample.agencyPct,
    usdRate: sample.usdRate ?? 0,
    advanceReceived: 0,
  })
  const [par, setPar] = useState<Particulars>({
    vesselName: '', principal: '', imo: '', flag: '', port: '', portCode: '',
    gt: '', nrt: '', eta: '', etd: '', loa: '', draft: '', cargo: '',
  })
  // Kerangka seksi A/B/C/D (judul) dipertahankan sebagai panduan, item dikosongkan.
  const [sections, setSections] = useState<EpdaSection[]>(
    sample.sections.map((s) => ({ letter: s.letter, title: s.title, items: [] })),
  )
  const [lump, setLump] = useState({ on: false, desc: 'Lump Sum Disbursement (estimated)', amount: 0 })
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)
  const [fromSource, setFromSource] = useState<string | null>(null)
  const [selectedPortCall, setSelectedPortCall] = useState('')

  const numericMeta: (keyof Meta)[] = ['agencyPct', 'usdRate', 'advanceReceived']
  const setMetaF = (k: keyof Meta) => (v: string) =>
    setMeta((p) => ({ ...p, [k]: numericMeta.includes(k) ? Number(v) || 0 : v }))
  const setParF = (k: keyof Particulars) => (v: string) => setPar((p) => ({ ...p, [k]: v }))

  function updateItem(si: number, ii: number, field: string, value: string) {
    setSections((prev) => {
      const next = clone(prev)
      const it = next[si].items[ii]
      const num = field === 'rate' || field === 'amount'
      // @ts-expect-error index dinamis
      it[field] = num ? Number(value) || 0 : value
      // Jumlah = Qty × Rate, dihitung otomatis setiap qty/rate berubah.
      if (field === 'qty' || field === 'rate') it.amount = lineAmount(it)
      return next
    })
  }
  function addItem(si: number) {
    setSections((prev) => {
      const next = clone(prev)
      next[si].items.push({ description: '', basis: '', qty: '1', rate: 0, amount: 0 })
      return next
    })
  }
  function removeItem(si: number, ii: number) {
    setSections((prev) => {
      const next = clone(prev)
      next[si].items.splice(ii, 1)
      return next
    })
  }

  // Prefill partikular kapal & principal dari sebuah Port Call. Dipakai bersama
  // oleh selector "Pilih Port Call" (jalur menu Finance) & param URL ?portcall=.
  async function applyPortCall(id: string) {
    setSelectedPortCall(id)
    if (!id) return
    try {
      const r = await fetch(`/api/portcalls/${id}`)
      if (!r.ok) return
      const d = (await r.json()) as { particulars?: Partial<Particulars> } | null
      if (!d?.particulars) return
      setPar((c) => ({ ...c, ...d.particulars }))
      // Sediakan satu baris biaya kosong bila seksi belum berisi (klien isi sendiri).
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          items: s.items.length ? s.items : [{ description: '', basis: '', qty: '1', rate: 0, amount: 0 }],
        })),
      )
      setFromPortCall(true)
    } catch {
      /* abaikan — form tetap bisa diisi manual */
    }
  }

  const data: EpdaData = useMemo(
    () => ({ ...sample, ...meta, ...par, sections, lumpSum: lump.on, lumpSumDesc: lump.desc, lumpSumAmount: lump.amount }),
    [sample, meta, par, sections, lump],
  )
  const totals = useMemo(() => computeTotals(data), [data])
  const advance = type === 'fpda' ? meta.advanceReceived ?? 0 : 0
  const balance = totals.total - advance

  // Buka dokumen tersimpan: ?id=XXX · prefill dari port call: ?portcall=YYY
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')
    const fromId = params.get('from')

    // Rantai dokumen: FPDA disalin dari EPDA tersimpan (?from=epdaId).
    if (!id && fromId && type === 'fpda') {
      fetch(`/api/documents/epda?id=${fromId}&json=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: Partial<EpdaData> | null) => {
          if (!p) return
          setMeta((m) => ({
            ...m,
            docNumber: '', // nomor FPDA baru — diisi user
            currency: p.currency ?? m.currency,
            agencyPct: p.agencyPct ?? m.agencyPct,
            usdRate: p.usdRate ?? m.usdRate,
            advanceReceived: 0, // dana muka aktual diisi user
          }))
          setPar((c) => ({
            vesselName: p.vesselName ?? c.vesselName,
            principal: p.principal ?? c.principal,
            imo: p.imo ?? c.imo,
            flag: p.flag ?? c.flag,
            port: p.port ?? c.port,
            portCode: p.portCode ?? c.portCode,
            gt: p.gt ?? c.gt,
            nrt: p.nrt ?? c.nrt,
            eta: p.eta ?? c.eta,
            etd: p.etd ?? c.etd,
            loa: p.loa ?? c.loa,
            draft: p.draft ?? c.draft,
            cargo: p.cargo ?? c.cargo,
          }))
          if (Array.isArray(p.sections)) setSections(p.sections)
          setFromSource(`EPDA ${p.docNumber ?? ''}`.trim())
        })
      return
    }

    // Prefill partikular dari Port Call (dokumen baru, hanya isi baris biaya).
    if (!id && portCallId) {
      applyPortCall(portCallId)
      return
    }

    if (!id) return
    fetch(`${endpoint}?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<EpdaData> | null) => {
        if (!p) return
        setMeta((m) => ({
          docNumber: p.docNumber ?? m.docNumber,
          issuedAt: p.issuedAt ?? m.issuedAt,
          validUntil: p.validUntil ?? m.validUntil,
          currency: p.currency ?? m.currency,
          agencyPct: p.agencyPct ?? m.agencyPct,
          usdRate: p.usdRate ?? m.usdRate,
          advanceReceived: p.advanceReceived ?? m.advanceReceived,
        }))
        setPar((c) => ({
          vesselName: p.vesselName ?? c.vesselName,
          principal: p.principal ?? c.principal,
          imo: p.imo ?? c.imo,
          flag: p.flag ?? c.flag,
          port: p.port ?? c.port,
          portCode: p.portCode ?? c.portCode,
          gt: p.gt ?? c.gt,
          nrt: p.nrt ?? c.nrt,
          eta: p.eta ?? c.eta,
          etd: p.etd ?? c.etd,
          loa: p.loa ?? c.loa,
          draft: p.draft ?? c.draft,
          cargo: p.cargo ?? c.cargo,
        }))
        if (Array.isArray(p.sections)) setSections(p.sections)
        if (p.lumpSum != null || p.lumpSumAmount != null)
          setLump({ on: !!p.lumpSum, desc: p.lumpSumDesc ?? 'Lump Sum Disbursement (estimated)', amount: p.lumpSumAmount ?? 0 })
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
      if (!res.ok) throw new Error('save gagal')
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
      if (!res.ok) throw new Error('render gagal')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.download = (meta.docNumber || cfg.label).replace(/[\\/]/g, '-') + '.pdf'
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
        {/* ===== FORM ===== */}
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
              {t.kicker} · {cfg.label}
            </p>
            <h1 className="font-display text-2xl text-white">{t.create} {cfg.label}</h1>
            <p className="text-text-secondary text-sm mt-1">{cfg.lead[lang]} {t.totalAuto}</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromPortCall}
            </div>
          )}
          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromSrcPre} {fromSource}{t.fromSrcPost}
            </div>
          )}

          {/* Selector Port Call (jalur menu Finance — auto-fill tanpa lewat Port Call Manager) */}
          {!savedId && !fromSource && (
            <PortCallPicker value={selectedPortCall} onSelect={applyPortCall} />
          )}

          {/* Partikular */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secPar}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fVessel} value={par.vesselName} onChange={setParF('vesselName')} />
              <Field label={t.fPrincipal} value={par.principal} onChange={setParF('principal')} />
              <Field label="IMO" value={par.imo} onChange={setParF('imo')} />
              <Field label="Flag" value={par.flag} onChange={setParF('flag')} />
              <Field label={t.fPort} value={par.port} onChange={setParF('port')} />
              <Field label={t.fPortCode} value={par.portCode} onChange={setParF('portCode')} />
              <Field label="GT" value={par.gt} onChange={setParF('gt')} />
              <Field label="NRT" value={par.nrt} onChange={setParF('nrt')} />
              <Field label={t.fCargo} value={par.cargo} onChange={setParF('cargo')} />
              <Field label="ETA" value={par.eta} onChange={setParF('eta')} />
              <Field label="ETD" value={par.etd} onChange={setParF('etd')} />
              <Field label="LOA" value={par.loa} onChange={setParF('loa')} />
              <Field label="Draft" value={par.draft} onChange={setParF('draft')} />
            </div>
          </section>

          {/* Detail dokumen */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDoc}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label={t.fNo} value={meta.docNumber} onChange={setMetaF('docNumber')} />
              <Field label={t.fIssued} value={meta.issuedAt} onChange={setMetaF('issuedAt')} />
              <Field label={cfg.validDocLabel[lang]} value={meta.validUntil} onChange={setMetaF('validUntil')} />
              <Field label={t.fCurrency} value={meta.currency} onChange={setMetaF('currency')} />
              <Field label={t.fAgency} type="number" value={meta.agencyPct} onChange={setMetaF('agencyPct')} />
              <Field label={t.fUsd} type="number" value={meta.usdRate ?? 0} onChange={setMetaF('usdRate')} />
              {type === 'fpda' && (
                <Field
                  label={t.fAdvance}
                  type="number"
                  value={meta.advanceReceived ?? 0}
                  onChange={setMetaF('advanceReceived')}
                />
              )}
            </div>
          </section>

          {/* Mode lump sum */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={lump.on}
                onChange={(e) => setLump((p) => ({ ...p, on: e.target.checked }))}
                className="w-4 h-4 accent-accent-blue"
              />
              <span className="text-sm text-text-primary font-medium">{t.lumpMode}</span>
              <span className="text-xs text-text-secondary">{t.lumpHint}</span>
            </label>
            {lump.on && (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3 mt-4">
                <Field label={t.fLumpDesc} value={lump.desc} onChange={(v) => setLump((p) => ({ ...p, desc: v }))} />
                <Field label={t.fLumpAmt} type="number" value={lump.amount} onChange={(v) => setLump((p) => ({ ...p, amount: Number(v) || 0 }))} />
                <p className="md:col-span-2 text-xs text-text-secondary/80">
                  {t.lumpNotePre} {meta.agencyPct}% {t.lumpNotePost}
                </p>
              </div>
            )}
          </section>

          {/* Rincian biaya per seksi */}
          {!lump.on && sections.map((sec, si) => (
            <section key={sec.letter} className="bg-card-bg border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base text-white">
                  <span className="text-accent-amber font-mono mr-2">{sec.letter}</span>
                  {sec.title}
                </h2>
                <span className="text-xs font-mono text-text-secondary">
                  {c.subtotal} {sec.letter}: <span className="text-white">{fmt(sectionSubtotal(sec))}</span>
                </span>
              </div>

              <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
                <div className="col-span-5">{t.thDesc}</div>
                <div className="col-span-2">{t.thQtyBasis}</div>
                <div className="col-span-2 text-right">{t.thRate}</div>
                <div className="col-span-2 text-right">{t.thAmount}</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-2">
                {sec.items.map((it, ii) => (
                  <div key={ii} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 md:col-span-5 space-y-1">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(si, ii, 'description', e.target.value)}
                        placeholder={t.phCost}
                        className={inputCls}
                      />
                      <input
                        value={it.basis ?? ''}
                        onChange={(e) => updateItem(si, ii, 'basis', e.target.value)}
                        placeholder={t.phBasis}
                        className={inputCls + ' text-xs py-1.5'}
                      />
                    </div>
                    <input
                      value={it.qty ?? ''}
                      onChange={(e) => updateItem(si, ii, 'qty', e.target.value)}
                      placeholder={t.phQty}
                      className={`${inputCls} col-span-5 md:col-span-2`}
                    />
                    <input
                      type="number"
                      value={it.rate ?? 0}
                      onChange={(e) => updateItem(si, ii, 'rate', e.target.value)}
                      placeholder={t.phRate}
                      className={`${inputCls} col-span-3 md:col-span-2 text-right`}
                    />
                    <div
                      title={t.amountAuto}
                      className="col-span-3 md:col-span-2 flex items-center justify-end h-9 px-2 rounded bg-surface/40 border border-border-muted/40 font-mono text-sm text-text-primary"
                    >
                      {fmt(lineAmount(it))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(si, ii)}
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
                onClick={() => addItem(si)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue
                           hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {c.addRow}
              </button>
            </section>
          ))}
        </div>

        {/* ===== RINGKASAN (sticky) ===== */}
        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">
              {t.secSummary}
            </p>
            <div className="space-y-2 text-sm">
              {!lump.on &&
                sections.map((sec) => (
                  <div key={sec.letter} className="flex justify-between text-text-secondary">
                    <span>{c.subtotal} {sec.letter}</span>
                    <span className="font-mono text-text-primary">{fmt(sectionSubtotal(sec))}</span>
                  </div>
                ))}
              {!lump.on && <div className="border-t border-border-muted my-2" />}
              <div className="flex justify-between text-text-secondary">
                <span>{lump.on ? t.lumpSumLabel : t.subAll}</span>
                <span className="font-mono text-text-primary">{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{t.sAgency} {meta.agencyPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.agencyAmount)}</span>
              </div>
              {type === 'fpda' && (
                <>
                  <div className="flex justify-between text-text-primary font-medium">
                    <span>{t.totalDisb}</span>
                    <span className="font-mono">{fmt(totals.total)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>{t.advanceReceived}</span>
                    <span className="font-mono">({fmt(advance)})</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">
                {type === 'fpda'
                  ? balance >= 0
                    ? t.balanceBilled
                    : t.refund
                  : cfg.summaryTotalLabel}
              </p>
              <p className="font-display text-xl text-white">
                {meta.currency} {fmt(type === 'fpda' ? Math.abs(balance) : totals.total)}
              </p>
              {type === 'epda' && totals.usd ? (
                <p className="text-[11px] text-text-secondary mt-0.5">~ USD {fmt(totals.usd)} ({t.indicative})</p>
              ) : null}
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
