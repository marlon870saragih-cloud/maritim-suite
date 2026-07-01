'use client'

import { useEffect, useMemo, useState } from 'react'
import { createLinkQuery } from '@/lib/link-params'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Download, Eye, Loader2, Save, Check } from 'lucide-react'
import { SAMPLE_CREWLIST, type CrewListData, type CrewMember } from '@/lib/pdf/crewlist-data'
import { blankSample } from '@/lib/blank-sample'
import { useT, type Lang } from '@/lib/i18n'
import { FORM_COMMON } from '@/lib/i18n-forms'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    kicker: 'Maritime Dokumen · FAL Form 5', h1: 'Buat Crew List',
    desc: 'Daftar awak kapal (IMO FAL 5) untuk kedatangan/keberangkatan.',
    fromPortCall: 'Data kapal terisi otomatis dari Port Call. Lengkapi daftar awak di bawah.',
    secVessel: 'Kapal & Call', fVessel: 'Nama kapal', fFlag: 'Bendera', fPort: 'Pelabuhan', fMode: 'Arrival / Departure', fMaster: 'Master',
    secCrew: 'Daftar Awak', peopleWord: 'orang', thName: 'Nama', thRank: 'Jabatan', thNat: 'Kebangsaan', thPassport: 'No. Paspor', thDob: 'Tgl Lahir',
    phName: 'Nama', phRank: 'Jabatan', phNat: 'Kebangsaan', phPassport: 'Paspor', phDob: 'Tgl lahir', deleteCrew: 'Hapus awak', addCrew: 'Tambah awak',
    sVessel: 'Kapal', sMode: 'Mode', totalCrew: 'Total Awak',
  },
  en: {
    kicker: 'Maritime Documents · FAL Form 5', h1: 'Create Crew List',
    desc: 'Vessel crew list (IMO FAL 5) for arrival/departure.',
    fromPortCall: 'Vessel details auto-filled from Port Call. Complete the crew list below.',
    secVessel: 'Vessel & Call', fVessel: 'Vessel name', fFlag: 'Flag', fPort: 'Port', fMode: 'Arrival / Departure', fMaster: 'Master',
    secCrew: 'Crew List', peopleWord: 'people', thName: 'Name', thRank: 'Rank', thNat: 'Nationality', thPassport: 'Passport no.', thDob: 'Date of birth',
    phName: 'Name', phRank: 'Rank', phNat: 'Nationality', phPassport: 'Passport', phDob: 'Date of birth', deleteCrew: 'Delete crew', addCrew: 'Add crew',
    sVessel: 'Vessel', sMode: 'Mode', totalCrew: 'Total Crew',
  },
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none ' +
  'focus:ring-1 focus:ring-accent-blue/40 transition-colors'
const labelCls = 'block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1'

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

type Head = Omit<CrewListData, 'tenant' | 'crew'>
const emptyCrew = (): CrewMember => ({ name: '', rank: '', nationality: 'Indonesia', passport: '', dob: '', seamanBook: '' })

export function CrewListForm() {
  const t = useT(STR)
  const c = useT(FORM_COMMON)
  const { tenant: _t, crew: _c, ...sampleHead } = blankSample(SAMPLE_CREWLIST)
  const [head, setHead] = useState<Head>(sampleHead)
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [busy, setBusy] = useState<null | 'preview' | 'download' | 'save'>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [fromPortCall, setFromPortCall] = useState(false)

  const set = (k: keyof Head) => (v: string) => setHead((p) => ({ ...p, [k]: v }))
  const data = useMemo(() => ({ ...SAMPLE_CREWLIST, ...head, crew }), [head, crew])

  function updateCrew(i: number, key: keyof CrewMember, v: string) {
    setCrew((prev) => {
      const next = clone(prev)
      next[i][key] = v
      return next
    })
  }
  const addCrew = () => setCrew((p) => [...p, emptyCrew()])
  const removeCrew = (i: number) => setCrew((p) => p.filter((_, j) => j !== i))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    const portCallId = params.get('portcall')

    if (!id && portCallId) {
      fetch(`/api/portcalls/${portCallId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { particulars?: { vesselName?: string; imo?: string; flag?: string; port?: string } } | null) => {
          const p = d?.particulars
          if (!p) return
          setHead((f) => ({
            ...f,
            vesselName: p.vesselName || f.vesselName,
            imo: p.imo || f.imo,
            flag: p.flag || f.flag,
            port: p.port || f.port,
          }))
          setFromPortCall(true)
        })
      return
    }

    if (!id) return
    fetch(`/api/documents/crew-list?id=${id}&json=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Partial<CrewListData> | null) => {
        if (!p) return
        const { crew: pc, ...rest } = p
        setHead((f) => ({ ...f, ...(rest as Partial<Head>) }))
        if (Array.isArray(pc)) setCrew(pc)
        setSavedId(id)
      })
  }, [])

  async function saveDraft() {
    setBusy('save')
    try {
      const res = await fetch(`/api/documents/crew-list?save=1${savedId ? `&id=${savedId}` : createLinkQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      const j = (await res.json()) as { id: string }
      setSavedId(j.id)
      window.history.replaceState(null, '', `/dokumen/new/FAL_5?id=${j.id}`)
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
      const res = await fetch(`/api/documents/crew-list${download ? '?download=1' : ''}`, {
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
        a.download = (head.docNumber || 'CREW-LIST').replace(/[\\/]/g, '-') + '.pdf'
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
      <Link href="/dokumen" className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-blue text-sm transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" />
        {c.backDok}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <div>
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-1">{t.kicker}</p>
            <h1 className="font-display text-2xl text-white">{t.h1}</h1>
            <p className="text-text-secondary text-sm mt-1">{t.desc}</p>
          </div>

          {fromPortCall && (
            <div className="rounded-md border border-accent-teal/30 bg-accent-teal/5 px-4 py-2.5 text-xs text-accent-teal">
              {t.fromPortCall}
            </div>
          )}

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <h2 className="font-display text-base text-white mb-4">{t.secVessel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="No. dokumen" value={head.docNumber} onChange={set('docNumber')} />
              <Field label={t.fVessel} value={head.vesselName} onChange={set('vesselName')} />
              <Field label="IMO" value={head.imo} onChange={set('imo')} />
              <Field label={t.fFlag} value={head.flag ?? ''} onChange={set('flag')} />
              <Field label="Call sign" value={head.callSign ?? ''} onChange={set('callSign')} />
              <Field label={t.fPort} value={head.port} onChange={set('port')} />
              <Field label="Voyage" value={head.voyage ?? ''} onChange={set('voyage')} />
              <Field label={t.fMode} value={head.mode} onChange={set('mode')} />
              <Field label={t.fMaster} value={head.masterName} onChange={set('masterName')} />
            </div>
          </section>

          <section className="bg-card-bg border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-white">{t.secCrew}</h2>
              <span className="text-xs font-mono text-text-secondary">{crew.length} {t.peopleWord}</span>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1.5 text-[9px] font-mono uppercase tracking-wider text-text-secondary/60">
              <div className="col-span-3">{t.thName}</div>
              <div className="col-span-2">{t.thRank}</div>
              <div className="col-span-2">{t.thNat}</div>
              <div className="col-span-2">{t.thPassport}</div>
              <div className="col-span-2">{t.thDob}</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {crew.map((m, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input value={m.name} onChange={(e) => updateCrew(i, 'name', e.target.value)} placeholder={t.phName} className={`${inputCls} col-span-6 md:col-span-3`} />
                  <input value={m.rank} onChange={(e) => updateCrew(i, 'rank', e.target.value)} placeholder={t.phRank} className={`${inputCls} col-span-6 md:col-span-2`} />
                  <input value={m.nationality} onChange={(e) => updateCrew(i, 'nationality', e.target.value)} placeholder={t.phNat} className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={m.passport} onChange={(e) => updateCrew(i, 'passport', e.target.value)} placeholder={t.phPassport} className={`${inputCls} col-span-4 md:col-span-2`} />
                  <input value={m.dob} onChange={(e) => updateCrew(i, 'dob', e.target.value)} placeholder={t.phDob} className={`${inputCls} col-span-3 md:col-span-2`} />
                  <button type="button" onClick={() => removeCrew(i)} aria-label={t.deleteCrew} className="col-span-1 flex items-center justify-center h-9 rounded text-text-secondary hover:text-status-danger hover:bg-status-danger/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addCrew} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:text-white transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t.addCrew}
            </button>
            <div className="mt-4">
              <label className={labelCls}>Remarks</label>
              <textarea value={head.remarks} onChange={(e) => set('remarks')(e.target.value)} rows={2} className={inputCls} />
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 space-y-3">
          <div className="bg-card-bg border border-card-border rounded-lg p-5">
            <p className="font-mono text-[10px] text-text-secondary uppercase tracking-widest mb-3">{c.summary}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary"><span>{t.sVessel}</span><span className="text-text-primary text-right max-w-[60%] truncate">{head.vesselName || '—'}</span></div>
              <div className="flex justify-between text-text-secondary"><span>{t.sMode}</span><span className="text-text-primary">{head.mode}</span></div>
            </div>
            <div className="mt-3 -mx-5 -mb-5 px-5 py-3 bg-accent-blue/10 border-t border-accent-blue/30 rounded-b-lg">
              <p className="text-[10px] font-mono uppercase tracking-wider text-accent-blue/80">{t.totalCrew}</p>
              <p className="font-display text-xl text-white">{crew.length} {t.peopleWord}</p>
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
        </aside>
      </div>
    </div>
  )
}
