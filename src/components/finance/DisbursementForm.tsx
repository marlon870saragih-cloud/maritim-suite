'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import {
  SAMPLE_EPDA,
  SAMPLE_FPDA,
  computeTotals,
  sectionSubtotal,
  type EpdaData,
  type EpdaSection,
} from '@/lib/pdf/epda-data'

type DocKind = 'epda' | 'fpda'

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
  { label: string; sample: EpdaData; lead: string; validDocLabel: string; summaryTotalLabel: string }
> = {
  epda: {
    label: 'EPDA',
    sample: SAMPLE_EPDA,
    lead: 'Estimasi biaya port call (proforma) untuk meminta dana muka ke principal.',
    validDocLabel: 'Berlaku s/d',
    summaryTotalLabel: 'Estimated Total',
  },
  fpda: {
    label: 'FPDA',
    sample: SAMPLE_FPDA,
    lead: 'Laporan biaya aktual (final) — direkonsiliasi dengan dana muka yang sudah diterima.',
    validDocLabel: 'Jatuh tempo bayar',
    summaryTotalLabel: 'Total Disbursements',
  },
}

export function DisbursementForm({ type }: { type: DocKind }) {
  const cfg = CONFIG[type]
  const sample = cfg.sample
  const endpoint = `/api/documents/${type}`
  const formRoute = `/finance/${type}/baru`

  const [meta, setMeta] = useState<Meta>({
    docNumber: sample.docNumber,
    issuedAt: sample.issuedAt,
    validUntil: sample.validUntil,
    currency: sample.currency,
    agencyPct: sample.agencyPct,
    usdRate: sample.usdRate ?? 0,
    advanceReceived: sample.advanceReceived ?? 0,
  })
  const [par, setPar] = useState<Particulars>({
    vesselName: sample.vesselName,
    principal: sample.principal,
    imo: sample.imo,
    flag: sample.flag,
    port: sample.port,
    portCode: sample.portCode,
    gt: sample.gt,
    nrt: sample.nrt,
    eta: sample.eta,
    etd: sample.etd,
    loa: sample.loa,
    draft: sample.draft,
    cargo: sample.cargo,
  })
  const [sections, setSections] = useState<EpdaSection[]>(clone(sample.sections))
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)
  const [fromSource, setFromSource] = useState<string | null>(null)

  const numericMeta: (keyof Meta)[] = ['agencyPct', 'usdRate', 'advanceReceived']
  const setMetaF = (k: keyof Meta) => (v: string) =>
    setMeta((p) => ({ ...p, [k]: numericMeta.includes(k) ? Number(v) || 0 : v }))
  const setParF = (k: keyof Particulars) => (v: string) => setPar((p) => ({ ...p, [k]: v }))

  function updateItem(si: number, ii: number, field: string, value: string) {
    setSections((prev) => {
      const next = clone(prev)
      const num = field === 'rate' || field === 'amount'
      // @ts-expect-error index dinamis
      next[si].items[ii][field] = num ? Number(value) || 0 : value
      return next
    })
  }
  function addItem(si: number) {
    setSections((prev) => {
      const next = clone(prev)
      next[si].items.push({ description: '', basis: '', qty: '', rate: 0, amount: 0 })
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

  const data: EpdaData = useMemo(
    () => ({ ...sample, ...meta, ...par, sections }),
    [sample, meta, par, sections],
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
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: Partial<Particulars> } | null) => {
          if (!d?.particulars) return
          setPar((c) => ({ ...c, ...d.particulars }))
          // Kosongkan baris biaya — kerangka seksi A/B/C/D tetap, klien isi sendiri.
          setSections((prev) =>
            prev.map((s) => ({
              ...s,
              items: [{ description: '', basis: '', qty: '', rate: 0, amount: 0 }],
            })),
          )
          setFromPortCall(true)
        })
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
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`${endpoint}?save=1${savedId ? `&id=${savedId}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('save gagal')
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `${formRoute}?id=${j.id}`)
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
        {/* ===== FORM ===== */}
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">
              Generator Keuangan · {cfg.label}
            </p>
            <h1 className="font-display text-2xl text-white">Buat {cfg.label}</h1>
            <p className="text-text-secondary text-sm mt-1">{cfg.lead} Total dihitung otomatis.</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Partikular kapal &amp; call terisi otomatis dari Port Call. Tinggal isi baris biaya di bawah.
            </div>
          )}
          {fromSource && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              Partikular &amp; baris biaya disalin dari {fromSource}. Ubah jadi nilai aktual, isi nomor &amp; dana muka, lalu simpan sebagai FPDA baru.
            </div>
          )}

          {/* Partikular */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Partikular Kapal &amp; Call</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nama kapal" value={par.vesselName} onChange={setParF('vesselName')} />
              <Field label="Principal" value={par.principal} onChange={setParF('principal')} />
              <Field label="IMO" value={par.imo} onChange={setParF('imo')} />
              <Field label="Flag" value={par.flag} onChange={setParF('flag')} />
              <Field label="Port" value={par.port} onChange={setParF('port')} />
              <Field label="Port code" value={par.portCode} onChange={setParF('portCode')} />
              <Field label="GT" value={par.gt} onChange={setParF('gt')} />
              <Field label="NRT" value={par.nrt} onChange={setParF('nrt')} />
              <Field label="Cargo" value={par.cargo} onChange={setParF('cargo')} />
              <Field label="ETA" value={par.eta} onChange={setParF('eta')} />
              <Field label="ETD" value={par.etd} onChange={setParF('etd')} />
              <Field label="LOA" value={par.loa} onChange={setParF('loa')} />
              <Field label="Draft" value={par.draft} onChange={setParF('draft')} />
            </div>
          </section>

          {/* Detail dokumen */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">Detail Dokumen</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={meta.docNumber} onChange={setMetaF('docNumber')} />
              <Field label="Diterbitkan" value={meta.issuedAt} onChange={setMetaF('issuedAt')} />
              <Field label={cfg.validDocLabel} value={meta.validUntil} onChange={setMetaF('validUntil')} />
              <Field label="Mata uang" value={meta.currency} onChange={setMetaF('currency')} />
              <Field label="Agency handling (%)" type="number" value={meta.agencyPct} onChange={setMetaF('agencyPct')} />
              <Field label="Kurs USD (indikatif)" type="number" value={meta.usdRate ?? 0} onChange={setMetaF('usdRate')} />
              {type === 'fpda' && (
                <Field
                  label="Dana muka diterima"
                  type="number"
                  value={meta.advanceReceived ?? 0}
                  onChange={setMetaF('advanceReceived')}
                />
              )}
            </div>
          </section>

          {/* Rincian biaya per seksi */}
          {sections.map((sec, si) => (
            <section key={sec.letter} className="bg-card-bg border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base text-white">
                  <span className="text-accent-amber font-mono mr-2">{sec.letter}</span>
                  {sec.title}
                </h2>
                <span className="text-xs font-mono text-text-secondary">
                  Subtotal {sec.letter}: <span className="text-white">{fmt(sectionSubtotal(sec))}</span>
                </span>
              </div>

              <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
                <div className="col-span-5">Deskripsi</div>
                <div className="col-span-2">Qty / Basis</div>
                <div className="col-span-2 text-right">Rate</div>
                <div className="col-span-2 text-right">Jumlah</div>
                <div className="col-span-1" />
              </div>

              <div className="space-y-2">
                {sec.items.map((it, ii) => (
                  <div key={ii} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-12 md:col-span-5 space-y-1">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(si, ii, 'description', e.target.value)}
                        placeholder="Deskripsi biaya"
                        className={inputCls}
                      />
                      <input
                        value={it.basis ?? ''}
                        onChange={(e) => updateItem(si, ii, 'basis', e.target.value)}
                        placeholder="keterangan (mis. per GT per call)"
                        className={inputCls + ' text-xs py-1.5'}
                      />
                    </div>
                    <input
                      value={it.qty ?? ''}
                      onChange={(e) => updateItem(si, ii, 'qty', e.target.value)}
                      placeholder="Qty"
                      className={`${inputCls} col-span-5 md:col-span-2`}
                    />
                    <input
                      type="number"
                      value={it.rate ?? 0}
                      onChange={(e) => updateItem(si, ii, 'rate', e.target.value)}
                      placeholder="Rate"
                      className={`${inputCls} col-span-3 md:col-span-2 text-right`}
                    />
                    <input
                      type="number"
                      value={it.amount}
                      onChange={(e) => updateItem(si, ii, 'amount', e.target.value)}
                      placeholder="Jumlah"
                      className={`${inputCls} col-span-3 md:col-span-2 text-right`}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(si, ii)}
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
                onClick={() => addItem(si)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue
                           hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah baris
              </button>
            </section>
          ))}
        </div>

        {/* ===== RINGKASAN (sticky) ===== */}
        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">
              Ringkasan Biaya
            </p>
            <div className="space-y-2 text-sm">
              {sections.map((sec) => (
                <div key={sec.letter} className="flex justify-between text-text-secondary">
                  <span>Subtotal {sec.letter}</span>
                  <span className="font-mono text-text-primary">{fmt(sectionSubtotal(sec))}</span>
                </div>
              ))}
              <div className="border-t border-border-muted my-2" />
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal (A+B+C+D)</span>
                <span className="font-mono text-text-primary">{fmt(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Agency handling {meta.agencyPct}%</span>
                <span className="font-mono text-text-primary">{fmt(totals.agencyAmount)}</span>
              </div>
              {type === 'fpda' && (
                <>
                  <div className="flex justify-between text-text-primary font-medium">
                    <span>Total Disbursements</span>
                    <span className="font-mono">{fmt(totals.total)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Dana muka diterima</span>
                    <span className="font-mono">({fmt(advance)})</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-[#0D2A50] border-t border-[#1D4A8A] rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/70">
                {type === 'fpda'
                  ? balance >= 0
                    ? 'Saldo Ditagih ke Principal'
                    : 'Refund ke Principal'
                  : cfg.summaryTotalLabel}
              </p>
              <p className="font-display text-xl text-white">
                {meta.currency} {fmt(type === 'fpda' ? Math.abs(balance) : totals.total)}
              </p>
              {type === 'epda' && totals.usd ? (
                <p className="text-[11px] text-text-secondary mt-0.5">~ USD {fmt(totals.usd)} (indikatif)</p>
              ) : null}
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
            Kop perusahaan pada PDF otomatis dari profil perusahaan Anda (yang login). Draft
            tersimpan bisa dibuka &amp; diunduh ulang dari halaman Finance.
          </p>
        </aside>
      </div>
    </div>
  )
}
