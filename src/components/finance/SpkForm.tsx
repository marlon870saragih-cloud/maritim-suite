'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check, Sparkles } from 'lucide-react'
import { SAMPLE_SPK, type SpkData, type SpkScopeItem } from '@/lib/pdf/spk-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: 'Kembali ke Finance', kicker: 'Generator Dokumen · Surat Penunjukan Kerja', h1: 'Buat SPK',
    desc: 'Surat penunjukan sub-agen. Kop & penanda tangan otomatis dari profil perusahaan Anda.',
    fromPortCall: 'Partikular kapal & principal disalin dari Port Call. Lengkapi pihak sub-agen, No. SPK, dan port bongkar di bawah.',
    aiTitle: 'Isi dengan AI', aiDesc: 'Ketik instruksi biasa, AI mengisi field di bawah untuk Anda review. AI tidak mengarang angka yang tak Anda sebut.',
    aiPlaceholder: 'mis. "Buatkan SPK penunjukan Karana Line (Pak Hardi, Balikpapan) untuk MT Soechi Asia, muat di KGTE Balikpapan bongkar Morowali, cargo Biodiesel B40 6000 MT, loading 30 Jun 2026"',
    aiOk: 'Form terisi — silakan review ✓', aiFailGeneric: 'Gagal', aiFailProc: 'Gagal memproses dengan AI',
    secDetail: 'Detail SPK', fValidity: 'Berlaku', fApptType: 'Sifat penunjukan',
    secTo: 'Penunjukan Kepada', fContact: 'Kontak (Kepada)', fCompany: 'Perusahaan (sub-agen)', fRole: 'Peran', fCity: 'Kota', fPrincipal: 'Principal',
    mainAgentNote: 'Pihak penunjuk (Main Agent) otomatis = perusahaan Anda.',
    secVessel: 'Partikular Kapal', fDate: 'Tanggal',
    secScope: 'Lingkup Pekerjaan Sub-Agen', rowsWord: 'baris', phScope: 'Uraian pekerjaan', phDetail: 'keterangan (opsional)',
    secTerms: 'Ketentuan', pointsWord: 'poin', phTerm: 'Isi ketentuan', deletePoint: 'Hapus poin', addPoint: 'Tambah poin',
    secSigner: 'Penanda Tangan (Disetujui Oleh)', fName: 'Nama', fTitle: 'Jabatan', signerNote: 'Kosongkan untuk memakai default dari profil perusahaan.',
    sSubAgent: 'Sub-agen', sScopeTerms: 'Lingkup · Ketentuan',
    spkNote: 'Kop & penanda tangan pada PDF otomatis dari profil perusahaan Anda. Draft tersimpan bisa dibuka & diunduh ulang dari halaman Finance.',
  },
  en: {
    back: 'Back to Finance', kicker: 'Document Generator · Work Appointment Letter', h1: 'Create SPK',
    desc: 'Sub-agent appointment letter. Letterhead & signatory auto-filled from your company profile.',
    fromPortCall: 'Vessel & principal particulars copied from Port Call. Complete the sub-agent party, SPK no., and discharge port below.',
    aiTitle: 'Fill with AI', aiDesc: 'Type a plain instruction; the AI fills the fields below for you to review. The AI never invents numbers you did not state.',
    aiPlaceholder: 'e.g. "Create an SPK appointing Karana Line (Mr. Hardi, Balikpapan) for MT Soechi Asia, loading at KGTE Balikpapan discharging Morowali, cargo Biodiesel B40 6000 MT, loading 30 Jun 2026"',
    aiOk: 'Fields filled — please review ✓', aiFailGeneric: 'Failed', aiFailProc: 'Failed to process with AI',
    secDetail: 'SPK Details', fValidity: 'Validity', fApptType: 'Appointment type',
    secTo: 'Appointed To', fContact: 'Contact (To)', fCompany: 'Company (sub-agent)', fRole: 'Role', fCity: 'City', fPrincipal: 'Principal',
    mainAgentNote: 'The appointing party (Main Agent) is automatically your company.',
    secVessel: 'Vessel Particulars', fDate: 'Date',
    secScope: 'Sub-Agent Scope of Work', rowsWord: 'rows', phScope: 'Work description', phDetail: 'note (optional)',
    secTerms: 'Terms', pointsWord: 'points', phTerm: 'Term content', deletePoint: 'Delete point', addPoint: 'Add point',
    secSigner: 'Signatory (Approved By)', fName: 'Name', fTitle: 'Title', signerNote: 'Leave blank to use the default from your company profile.',
    sSubAgent: 'Sub-agent', sScopeTerms: 'Scope · Terms',
    spkNote: 'Letterhead & signatory on the PDF are auto-filled from your company profile. Saved drafts can be reopened & re-downloaded from the Finance page.',
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

type Head = Omit<SpkData, 'tenant' | 'scopeItems' | 'terms'>

export function SpkForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, scopeItems: _s, terms: _tm, ...sampleHead } = blankSample(SAMPLE_SPK)

  const [head, setHead] = useState<Head>(sampleHead)
  const [scope, setScope] = useState<SpkScopeItem[]>([])
  const [terms, setTerms] = useState<string[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const [aiOk, setAiOk] = useState(false)

  const setF = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))

  // Lingkup pekerjaan
  const updateScope = (i: number, field: keyof SpkScopeItem, value: string) =>
    setScope((prev) => {
      const next = clone(prev)
      next[i][field] = value
      return next
    })
  const addScope = () => setScope((p) => [...p, { text: '', detail: '' }])
  const removeScope = (i: number) => setScope((p) => p.filter((_, j) => j !== i))

  // Ketentuan
  const updateTerm = (i: number, value: string) =>
    setTerms((prev) => {
      const next = [...prev]
      next[i] = value
      return next
    })
  const addTerm = () => setTerms((p) => [...p, ''])
  const removeTerm = (i: number) => setTerms((p) => p.filter((_, j) => j !== i))

  // Pintu ngobrol: AI mengisi field dari instruksi bahasa. Hasilnya prefill form
  // untuk di-review — kop, penanda tangan, & PDF tetap lewat inti deterministik.
  async function runAi() {
    if (!aiText.trim()) return
    setAiBusy(true)
    setAiErr('')
    setAiOk(false)
    try {
      const res = await fetch('/api/ai/spk/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: aiText }),
      })
      if (!res.ok) throw new Error((await res.text()) || t.aiFailGeneric)
      const { draft } = (await res.json()) as { draft: Partial<SpkData> }
      const { scopeItems, terms: dTerms, ...headFields } = draft
      // Kosongkan partikular per-dokumen yang TAK disebut AI agar tak tertinggal
      // nilai contoh (mis. GT/NRT). Boilerplate (validity, appointmentType, peran,
      // penanda tangan) + lingkup/ketentuan tetap pakai default kecuali AI mengisi.
      setHead((h) => {
        const base = { ...h }
        const particulars: (keyof Head)[] = [
          'docNumber', 'issuedAt', 'toContact', 'toCompany', 'toCity',
          'principal', 'vesselName', 'gtNrt', 'cargo', 'loadingDate', 'loadPort', 'dischPort',
        ]
        for (const k of particulars) (base as Record<string, unknown>)[k] = ''
        return { ...base, ...(headFields as Partial<Head>) }
      })
      if (Array.isArray(scopeItems) && scopeItems.length) setScope(scopeItems as SpkScopeItem[])
      if (Array.isArray(dTerms) && dTerms.length) setTerms(dTerms as string[])
      setAiOk(true)
      setTimeout(() => setAiOk(false), 4000)
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : t.aiFailProc)
    } finally {
      setAiBusy(false)
    }
  }

  const data: SpkData = useMemo(
    () => ({ ...SAMPLE_SPK, ...head, scopeItems: scope, terms }),
    [head, scope, terms],
  )

  // Buka draft tersimpan (?id=) atau prefill partikular dari Port Call (?portcall=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    // Prefill dari Port Call: isi vessel/cargo/port/principal; pihak sub-agen & lingkup tetap manual.
    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { spk?: Partial<Head> } | null) => {
          if (!d?.spk) return
          setHead((h) => ({ ...h, ...d.spk, docNumber: '' }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/spk?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<SpkData> | null) => {
        if (!p) return
        const { tenant: _t2, scopeItems: ps, terms: pt, ...rest } = p
        setHead((h) => ({ ...h, ...(rest as Partial<Head>) }))
        if (Array.isArray(ps)) setScope(ps)
        if (Array.isArray(pt)) setTerms(pt)
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/spk?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/finance/spk/baru?id=${j.id}`)
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
      const res = await fetch(`/api/documents/spk${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'SPK').replace(/[\\/]/g, '-') + '.pdf'
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

          {/* Pintu ngobrol (AI) — isi form dari instruksi bahasa */}
          <section className="bg-card-bg border border-accent-purple/30 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-accent-purple" />
              <h2 className="font-display text-base text-white">{t.aiTitle}</h2>
              <span className="text-[10px] font-mono uppercase tracking-wider text-accent-purple/70 ml-auto">
                Haiku · OpenRouter
              </span>
            </div>
            <p className="text-text-secondary text-xs mb-3">{t.aiDesc}</p>
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              rows={2}
              placeholder={t.aiPlaceholder}
              className={inputCls + ' resize-none'}
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={runAi}
                disabled={aiBusy || !aiText.trim()}
                className="inline-flex items-center gap-2 bg-accent-purple/90 hover:bg-accent-purple text-white
                           rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t.aiTitle}
              </button>
              {aiOk && <span className="text-xs text-accent-teal">{t.aiOk}</span>}
              {aiErr && <span className="text-xs text-status-danger">{aiErr}</span>}
            </div>
          </section>

          {/* Detail SPK */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secDetail}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="No. SPK" value={head.docNumber} onChange={setF('docNumber')} />
              <Field label={t.fDate} value={head.issuedAt} onChange={setF('issuedAt')} />
              <Field label={t.fValidity} value={head.validity} onChange={setF('validity')} />
              <Field label={t.fApptType} value={head.appointmentType} onChange={setF('appointmentType')} />
            </div>
          </section>

          {/* Para pihak */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secTo}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={t.fContact} value={head.toContact} onChange={setF('toContact')} />
              <Field label={t.fCompany} value={head.toCompany} onChange={setF('toCompany')} />
              <Field label={t.fRole} value={head.toRole} onChange={setF('toRole')} />
              <Field label={t.fCity} value={head.toCity} onChange={setF('toCity')} />
              <Field label={t.fPrincipal} value={head.principal} onChange={setF('principal')} />
            </div>
            <p className="text-[11px] text-text-secondary/70 mt-3">{t.mainAgentNote}</p>
          </section>

          {/* Partikular kapal */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secVessel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Vessel" value={head.vesselName} onChange={setF('vesselName')} />
              <Field label="GT / NRT" value={head.gtNrt} onChange={setF('gtNrt')} />
              <Field label="Cargo" value={head.cargo} onChange={setF('cargo')} />
              <Field label="Loading" value={head.loadingDate} onChange={setF('loadingDate')} />
              <Field label="Load port" value={head.loadPort} onChange={setF('loadPort')} />
              <Field label="Disch port" value={head.dischPort} onChange={setF('dischPort')} />
            </div>
          </section>

          {/* Lingkup pekerjaan */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secScope}</h2>
              <span className="text-xs font-mono text-text-secondary">{scope.length} {t.rowsWord}</span>
            </div>
            <div className="space-y-2">
              {scope.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <span className="col-span-1 flex items-center h-9 font-mono text-sm text-accent-amber">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="col-span-10 space-y-1">
                    <input
                      value={it.text}
                      onChange={(e) => updateScope(i, 'text', e.target.value)}
                      placeholder={t.phScope}
                      className={inputCls}
                    />
                    <input
                      value={it.detail ?? ''}
                      onChange={(e) => updateScope(i, 'detail', e.target.value)}
                      placeholder={t.phDetail}
                      className={inputCls + ' text-xs py-1.5'}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeScope(i)}
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
              onClick={addScope}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {c.addRow}
            </button>
          </section>

          {/* Ketentuan */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secTerms}</h2>
              <span className="text-xs font-mono text-text-secondary">{terms.length} {t.pointsWord}</span>
            </div>
            <div className="space-y-2">
              {terms.map((term, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <span className="col-span-1 flex items-center h-9 font-mono text-sm text-text-secondary">
                    {i + 1}.
                  </span>
                  <textarea
                    value={term}
                    onChange={(e) => updateTerm(i, e.target.value)}
                    rows={2}
                    placeholder={t.phTerm}
                    className={`${inputCls} col-span-10 resize-none`}
                  />
                  <button
                    type="button"
                    onClick={() => removeTerm(i)}
                    aria-label={t.deletePoint}
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
              onClick={addTerm}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t.addPoint}
            </button>
          </section>

          {/* Penanda tangan */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secSigner}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={t.fName} value={head.approvedByName} onChange={setF('approvedByName')} />
              <Field label={t.fTitle} value={head.approvedByTitle} onChange={setF('approvedByTitle')} />
            </div>
            <p className="text-[11px] text-text-secondary/70 mt-3">{t.signerNote}</p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>No. SPK</span>
                <span className="font-mono text-text-primary">{head.docNumber || '—'}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{t.sSubAgent}</span>
                <span className="text-text-primary text-right max-w-[180px] truncate">{head.toCompany || '—'}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Vessel</span>
                <span className="text-text-primary text-right">{head.vesselName || '—'}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>{t.sScopeTerms}</span>
                <span className="font-mono text-text-primary">{scope.length} · {terms.length}</span>
              </div>
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

          <p className="text-[11px] text-text-secondary/70 leading-relaxed">{t.spkNote}</p>
        </aside>
      </div>
    </div>
  )
}
