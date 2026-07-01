'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { createLinkQuery } from '@/lib/link-params'
import { useT, useLang, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'
import { getSimpleSchema, type SimpleData } from '@/lib/pdf/simple-docs'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

const HDR: Record<Lang, Record<string, string>> = {
  id: { kicker: 'Maritime Dokumen', create: 'Buat', particulars: 'Particulars', body: 'Isi', table: 'Rincian', sign: 'Tanda tangan', signName: 'Penandatangan', signRole: 'Jabatan', no: 'No. dokumen', date: 'Tanggal', remarks: 'Catatan', rowsWord: 'baris' },
  en: { kicker: 'Maritime Documents', create: 'Create', particulars: 'Particulars', body: 'Content', table: 'Line items', sign: 'Signature', signName: 'Signatory', signRole: 'Title', no: 'Document no.', date: 'Date', remarks: 'Remarks', rowsWord: 'rows' },
}

// kunci particulars yang bisa diisi otomatis dari Port Call
const PORTCALL_KEYS = ['vesselName', 'imo', 'flag', 'port'] as const

export function SimpleDocForm({ type }: { type: string }) {
  const schema = getSimpleSchema(type)
  const c = useT(FORM_COMMON)
  const h = useT(HDR)
  const { lang } = useLang()

  // Dokumen BARU dibuka kosong: particulars & tabel dikosongkan (tanpa data contoh),
  // tapi teks boilerplate (pernyataan/klausul) & penandatangan default dipertahankan.
  const [data, setData] = useState<SimpleData>(() =>
    schema
      ? {
          docNumber: '',
          date: '',
          fields: {},
          intro: schema.sample.intro,
          clauses: schema.sample.clauses,
          rows: [],
          remarks: '',
          signName: schema.sample.signName,
          signRole: schema.sample.signRole,
        }
      : ({ docNumber: '', date: '', fields: {}, signName: '', signRole: '' } as SimpleData),
  )
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const api = `/api/documents/simple/${type}`

  useEffect(() => {
    if (!schema) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: Record<string, string> } | null) => {
          const p = d?.particulars
          if (!p) return
          setData((prev) => {
            const next = { ...prev, fields: { ...prev.fields } }
            for (const k of PORTCALL_KEYS) if (p[k]) next.fields[k] = p[k]
            return next
          })
          setFromPortCall(true)
        })
      return
    }
    if (!id) return
    fetch(`${api}?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<SimpleData> | null) => {
        if (!p) return
        setData((prev) => ({
          ...prev,
          ...p,
          fields: { ...prev.fields, ...(p.fields ?? {}) },
          rows: Array.isArray(p.rows) ? p.rows : prev.rows,
          clauses: Array.isArray(p.clauses) ? p.clauses : prev.clauses,
        }))
        setSavedId(id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  const setField = (k: string) => (v: string) => setData((p) => ({ ...p, fields: { ...p.fields, [k]: v } }))
  const setTop = (k: keyof SimpleData) => (v: string) => setData((p) => ({ ...p, [k]: v }))

  const rows = data.rows ?? []
  const setRows = (next: Record<string, string>[]) => setData((p) => ({ ...p, rows: next }))
  const addRow = () => {
    const empty: Record<string, string> = {}
    schema?.table?.cols.forEach((col) => (empty[col.key] = ''))
    setRows([...rows, empty])
  }
  const updateCell = (i: number, key: string, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)))
  const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i))

  const filename = useMemo(() => (data.docNumber || schema?.prefix || 'DOC').replace(/[\\/]/g, '-') + '.pdf', [data.docNumber, schema])

  if (!schema) {
    return (
      <div className="p-margin-page max-w-[900px] mx-auto">
        <Link href="/dokumen" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm">
          <ArrowLeft className="w-4 h-4" /> {c.backDok}
        </Link>
        <p className="text-text-secondary mt-6">Unknown document type: {type}</p>
      </div>
    )
  }

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`${api}?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/${type}?id=${j.id}`)
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
      const res = await fetch(`${api}${download ? '?download=1' : ''}`, {
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
        a.download = filename
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
      <Link href={`/dokumen/kategori/${schema.category}`} className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        {c.backDok}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">{h.kicker}</p>
            <h1 className="font-display text-2xl text-white">{h.create} {schema.label[lang]}</h1>
            <p className="text-text-secondary text-sm mt-1">{schema.desc[lang]}</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {lang === 'id' ? 'Data kapal terisi otomatis dari Port Call.' : 'Vessel data auto-filled from Port Call.'}
            </div>
          )}

          {/* Particulars */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{h.particulars}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>{h.no}</label>
                <input value={data.docNumber} onChange={(e) => setTop('docNumber')(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{h.date}</label>
                <input value={data.date} onChange={(e) => setTop('date')(e.target.value)} className={inputCls} />
              </div>
              {schema.fields.map((f) => (
                <div key={f.key} className={f.full ? 'col-span-2 md:col-span-3' : ''}>
                  <label className={labelCls}>{f.label[lang]}</label>
                  <input value={data.fields[f.key] ?? ''} onChange={(e) => setField(f.key)(e.target.value)} className={inputCls} />
                </div>
              ))}
            </div>
          </section>

          {/* Intro / statement */}
          {schema.introLabel && (
            <section className="bg-card-bg border border-card-border rounded-lg p-5">
              <h2 className="font-display text-base text-white mb-4">{schema.introLabel[lang]}</h2>
              <textarea value={data.intro ?? ''} onChange={(e) => setTop('intro')(e.target.value)} rows={4} className={inputCls} />
            </section>
          )}

          {/* Table */}
          {schema.table && (
            <section className="bg-card-bg border border-card-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-base text-white">{schema.table.label[lang]}</h2>
                <span className="text-xs font-mono text-text-secondary">{rows.length} {h.rowsWord}</span>
              </div>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-accent-amber font-mono text-sm pt-2 w-5 flex-none">{i + 1}</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 flex-1">
                      {schema.table!.cols.map((col) => (
                        <div key={col.key}>
                          <label className="block text-[9px] font-mono uppercase tracking-wider text-text-secondary/70 mb-0.5">{col.label[lang]}</label>
                          <input value={r[col.key] ?? ''} onChange={(e) => updateCell(i, col.key, e.target.value)} className={inputCls} />
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => removeRow(i)} aria-label={c.deleteRow} className="flex items-center justify-center h-9 w-9 flex-none rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
                <Plus className="w-3.5 h-3.5" />
                {schema.table.addLabel[lang]}
              </button>
            </section>
          )}

          {/* Remarks + signature */}
          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{h.sign}</h2>
            <div className="mb-3">
              <label className={labelCls}>{h.remarks}</label>
              <textarea value={data.remarks ?? ''} onChange={(e) => setTop('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{h.signName}</label>
                <input value={data.signName} onChange={(e) => setTop('signName')(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{h.signRole}</label>
                <input value={data.signRole} onChange={(e) => setTop('signRole')(e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{h.no}</span><span className="font-mono text-text-primary text-right max-w-[60%] truncate">{data.docNumber || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>Kapal</span><span className="text-text-primary text-right max-w-[60%] truncate">{data.fields.vesselName || '—'}</span></div>
              {schema.table && <div className="flex justify-between text-text-secondary"><span>{schema.table.label[lang]}</span><span className="font-mono text-text-primary">{rows.length} {h.rowsWord}</span></div>}
            </div>
          </div>

          <button type="button" onClick={saveDraft} disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue hover:bg-primary text-[#231a06] rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : savedId ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedId ? c.saveChanges : c.saveDraft}
          </button>
          {savedMsg && <p className="text-center text-xs text-accent-teal -mt-1">{savedMsg}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={() => generate(true)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {c.download}
            </button>
            <button type="button" onClick={() => generate(false)} disabled={busy !== null}
              className="flex-1 inline-flex items-center justify-center gap-2 border border-border-muted text-text-secondary hover:text-white hover:border-accent-blue/60 hover:bg-surface-tertiary rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
              {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {c.preview}
            </button>
          </div>
          <p className="text-[11px] text-text-secondary/70 leading-relaxed px-1">{c.pdfNote}</p>
        </aside>
      </div>
    </div>
  )
}
