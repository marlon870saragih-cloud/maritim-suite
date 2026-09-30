'use client'

// Vessel Call Intake — daftar + intake baru (PRD-004 Step 3).
// Input manual saja (D1): tempel teks atau unggah satu berkas. Dokumen asli TIDAK
// disimpan kecuali peninjau mencentangnya (D4). Hasil AI selalu masuk tinjauan.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileUp, Loader2, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { IntakeRingkas } from '@/services/intake/intake.service'
import { formatTanggal, MAKS_PINDAI_INTAKE } from '@/services/intake/intake-policy'
import { btnCls, fmtWaktu } from './shared'
import { DuplicateBadge, IntakeStatusBadge, LABEL_KLASIFIKASI, LABEL_STATUS_INTAKE, pesanGalatServer } from './intake-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    newTitle: 'Intake baru', tabText: 'Tempel teks', tabFile: 'Unggah berkas',
    textLabel: 'Isi nominasi / appointment', textPh: 'Tempel isi email atau pesan permintaan kunjungan kapal di sini…',
    fileLabel: 'Berkas (PDF, Excel .xlsx, CSV, JPG/PNG/WEBP — maks 10 MB)',
    saveOriginal: 'Simpan dokumen asli sebagai lampiran',
    saveOriginalHint: 'Dokumen asli bisa berisi data pribadi (nama, email, telepon). Bila tidak dicentang, dokumen asli tidak disimpan — hanya hasil bacaan AI yang disimpan untuk ditinjau.',
    submit: 'Baca dengan AI', submitting: 'Membaca…',
    aiNote: 'AI hanya mengusulkan isian. Tidak ada voyage atau master data yang dibuat sebelum Anda meninjau dan menyetujui.',
    reprocessTitle: 'Permintaan ini sudah pernah diproses.', reprocess: 'Proses ulang', open: 'Buka intake sebelumnya',
    listTitle: 'Daftar intake', all: 'Semua status', empty: 'Belum ada intake.', refresh: 'Muat ulang',
    cari: 'Cari kapal, pelabuhan, atau nomor voyage', cariLabel: 'Cari intake',
    urutLabel: 'Urutkan', urutBaru: 'Terbaru diterima', urutLama: 'Terlama diterima', urutEtaDekat: 'ETA terdekat', urutEtaJauh: 'ETA terjauh',
    emptyFiltered: 'Tidak ada intake yang cocok dengan filter ini.', clearFilters: 'Bersihkan filter',
    showing: 'Menampilkan {a}–{b} dari {n}', prev: 'Sebelumnya', next: 'Berikutnya',
    truncated: 'Pencarian dan pengurutan hanya mencakup {n} intake terbaru. Persempit dengan filter status agar hasilnya lengkap.',
    colCreated: 'Diterima', colVessel: 'Kapal', colPort: 'Pelabuhan', colEta: 'ETA', colClass: 'Klasifikasi',
    colDup: 'Duplikat', colStatus: 'Status', colVoyage: 'Voyage', review: 'Tinjau', pair: 'Tug + Tongkang',
    colRequest: 'Permintaan', noVessel: 'Kapal belum terbaca',
    errLoad: 'Gagal memuat daftar intake.', errSubmit: 'Intake gagal diproses.', pickFile: 'Pilih berkas lebih dulu.', needText: 'Tempel isi permintaan lebih dulu.',
    reused: 'Permintaan yang sama masih ditinjau — membuka intake yang ada.',
  },
  en: {
    newTitle: 'New intake', tabText: 'Paste text', tabFile: 'Upload file',
    textLabel: 'Nomination / appointment text', textPh: 'Paste the email or message requesting the vessel call here…',
    fileLabel: 'File (PDF, Excel .xlsx, CSV, JPG/PNG/WEBP — max 10 MB)',
    saveOriginal: 'Keep the original document as an attachment',
    saveOriginalHint: 'The original may contain personal data (names, emails, phone numbers). If unticked, the original is not kept — only what the AI read is stored for review.',
    submit: 'Read with AI', submitting: 'Reading…',
    aiNote: 'AI only proposes values. No voyage or master data is created until you review and approve.',
    reprocessTitle: 'This request was processed before.', reprocess: 'Process again', open: 'Open previous intake',
    listTitle: 'Intakes', all: 'All statuses', empty: 'No intakes yet.', refresh: 'Reload',
    cari: 'Search vessel, port or voyage number', cariLabel: 'Search intakes',
    urutLabel: 'Sort', urutBaru: 'Newest received', urutLama: 'Oldest received', urutEtaDekat: 'Earliest ETA', urutEtaJauh: 'Latest ETA',
    emptyFiltered: 'No intake matches these filters.', clearFilters: 'Clear filters',
    showing: 'Showing {a}–{b} of {n}', prev: 'Previous', next: 'Next',
    truncated: 'Search and sorting cover only the {n} most recent intakes. Narrow by status to get complete results.',
    colCreated: 'Received', colVessel: 'Vessel', colPort: 'Port', colEta: 'ETA', colClass: 'Classification',
    colDup: 'Duplicate', colStatus: 'Status', colVoyage: 'Voyage', review: 'Review', pair: 'Tug + Barge',
    colRequest: 'Request', noVessel: 'Vessel not read',
    errLoad: 'Failed to load intakes.', errSubmit: 'Intake could not be processed.', pickFile: 'Choose a file first.', needText: 'Paste the request text first.',
    reused: 'The same request is still under review — opening the existing intake.',
  },
}

const AI_ERR: Record<Lang, Record<string, string>> = {
  id: {
    AI_TIMEOUT: 'AI tidak menjawab tepat waktu. Tidak ada data yang dibuat — coba lagi.',
    AI_UNAVAILABLE: 'Layanan AI sedang tidak tersedia. Tidak ada data yang dibuat — coba lagi nanti.',
    AI_BAD_RESPONSE: 'Jawaban AI tidak bisa dibaca. Tidak ada data yang dibuat — coba lagi.',
  },
  en: {
    AI_TIMEOUT: 'The AI did not respond in time. Nothing was created — try again.',
    AI_UNAVAILABLE: 'The AI service is unavailable. Nothing was created — try again later.',
    AI_BAD_RESPONSE: 'The AI response could not be read. Nothing was created — try again.',
  },
}

const STATUS_FILTER = ['NEEDS_REVIEW', 'FAILED', 'CREATING', 'COMPLETED', 'LINKED_EXISTING', 'REJECTED'] as const

export function IntakeList() {
  const t = useT(STR)
  const aiErr = useT(AI_ERR)
  const { lang } = useLang()
  const router = useRouter()
  const [tab, setTab] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saveOriginal, setSaveOriginal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [sudahDiproses, setSudahDiproses] = useState<{ intakeId: string; status: string } | null>(null)
  const [rows, setRows] = useState<IntakeRingkas[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  /** Kotak cari diketik bebas; `cariAktif` yang dikirim ke server (ditunda 350 ms). */
  const [cariKetik, setCariKetik] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [urut, setUrut] = useState('createdAt:desc')
  const [page, setPage] = useState(1)
  const [daftar, setDaftar] = useState({ total: 0, page: 1, perPage: 25, terpotong: false })
  const adaFilter = !!status || !!cariAktif
  const bersihkanFilter = () => {
    setStatus('')
    setCariKetik('')
    setCariAktif('')
  }
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sort, dir] = urut.split(':')
      const qs = new URLSearchParams({ sort, dir, page: String(page) })
      if (status) qs.set('status', status)
      if (cariAktif) qs.set('q', cariAktif)
      const res = await fetch(`/api/automation/intakes?${qs.toString()}`, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setError(pesanGalatServer(body?.error?.details, lang) ?? body?.error?.message ?? t.errLoad)
        return
      }
      setRows(body.intakes)
      setDaftar({ total: body.total ?? body.intakes.length, page: body.page ?? 1, perPage: body.perPage ?? 25, terpotong: !!body.terpotong })
    } catch {
      setError(t.errLoad)
    } finally {
      setLoading(false)
    }
  }, [status, cariAktif, urut, page, t.errLoad, lang])

  useEffect(() => {
    void load()
  }, [load])

  // Ketikan ditunda supaya tiap huruf tidak memicu satu permintaan ke server.
  useEffect(() => {
    const jeda = setTimeout(() => setCariAktif(cariKetik.trim()), 350)
    return () => clearTimeout(jeda)
  }, [cariKetik])

  // Mengganti filter, pencarian, atau urutan selalu kembali ke halaman pertama.
  useEffect(() => {
    setPage(1)
  }, [status, cariAktif, urut])

  async function kirim(prosesUlang = false) {
    setError('')
    setInfo('')
    if (tab === 'text' && !text.trim()) return setError(t.needText)
    if (tab === 'file' && !file) return setError(t.pickFile)
    setBusy(true)
    try {
      const form = new FormData()
      if (tab === 'text') form.set('text', text)
      else if (file) form.set('file', file)
      form.set('saveOriginal', saveOriginal ? 'true' : 'false')
      form.set('confirmReprocess', prosesUlang ? 'true' : 'false')
      const res = await fetch('/api/automation/intakes', { method: 'POST', body: form })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const d = body?.error?.details
        if (d?.code === 'ALREADY_PROCESSED') {
          setSudahDiproses({ intakeId: d.intakeId, status: d.status })
          return
        }
        setError((d?.code && aiErr[d.code]) || pesanGalatServer(d, lang) || body?.error?.message || t.errSubmit)
        return
      }
      setSudahDiproses(null)
      if (body.reused) setInfo(t.reused)
      router.push(`/automation/intake/${body.intake.id}`)
    } catch {
      setError(t.errSubmit)
    } finally {
      setBusy(false)
    }
  }

  const cardCls = 'bg-card-bg border border-card-border rounded-lg p-4 sm:p-5 min-w-0'
  const tabCls = (aktif: boolean) =>
    cn(btnCls, 'border', aktif ? 'border-accent-blue/50 bg-accent-blue/10 text-text-primary' : 'border-border-muted text-text-secondary hover:text-text-primary')

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{error}</p>
      )}
      {info && <p role="status" className="rounded border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-sm text-text-primary">{info}</p>}

      <section className={cardCls} aria-labelledby="intake-new">
        <h2 id="intake-new" className="font-display text-lg text-text-primary">{t.newTitle}</h2>
        <p className="mt-1 text-xs text-text-secondary">{t.aiNote}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'text'} className={tabCls(tab === 'text')} onClick={() => setTab('text')}>{t.tabText}</button>
          <button type="button" role="tab" aria-selected={tab === 'file'} className={tabCls(tab === 'file')} onClick={() => setTab('file')}>
            <FileUp className="w-3.5 h-3.5" aria-hidden="true" /> {t.tabFile}
          </button>
        </div>
        <div className="mt-3">
          {tab === 'text' ? (
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.textLabel}</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                maxLength={50_000}
                placeholder={t.textPh}
                className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              />
            </label>
          ) : (
            <label className="block">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">{t.fileLabel}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.xlsx,.xlsm,.csv,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-secondary file:mr-3 file:rounded file:border file:border-border-muted file:bg-surface file:px-3 file:py-1.5 file:text-text-primary"
              />
            </label>
          )}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={saveOriginal} onChange={(e) => setSaveOriginal(e.target.checked)} className="mt-1" />
          <span>
            {t.saveOriginal}
            <span className="block text-xs text-text-secondary">{t.saveOriginalHint}</span>
          </span>
        </label>
        {sudahDiproses && (
          <div role="alert" className="mt-3 rounded border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-sm text-text-primary">
            <p>{t.reprocessTitle} ({LABEL_STATUS_INTAKE[lang][sudahDiproses.status] ?? sudahDiproses.status})</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/automation/intake/${sudahDiproses.intakeId}`} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>{t.open}</Link>
              <button type="button" disabled={busy} onClick={() => void kirim(true)} className={cn(btnCls, 'border border-accent-amber/50 text-text-primary')}>{t.reprocess}</button>
            </div>
          </div>
        )}
        <div className="mt-4">
          <button type="button" disabled={busy} onClick={() => void kirim(false)} className={cn(btnCls, 'bg-accent-blue text-white hover:bg-accent-blue/90')}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
            {busy ? t.submitting : t.submit}
          </button>
        </div>
      </section>

      <section className={cardCls} aria-labelledby="intake-list">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="intake-list" className="font-display text-lg text-text-primary">{t.listTitle}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label={t.cariLabel}
              placeholder={t.cari}
              value={cariKetik}
              onChange={(e) => setCariKetik(e.target.value)}
              className="min-w-0 w-full sm:w-64 bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary"
            />
            <select
              aria-label={t.urutLabel}
              value={urut}
              onChange={(e) => setUrut(e.target.value)}
              className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary"
            >
              <option value="createdAt:desc">{t.urutBaru}</option>
              <option value="createdAt:asc">{t.urutLama}</option>
              <option value="eta:asc">{t.urutEtaDekat}</option>
              <option value="eta:desc">{t.urutEtaJauh}</option>
            </select>
            <select
              aria-label={t.colStatus}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-surface border border-border-muted rounded px-2 py-1.5 text-xs text-text-primary"
            >
              <option value="">{t.all}</option>
              {STATUS_FILTER.map((s) => <option key={s} value={s}>{LABEL_STATUS_INTAKE[lang][s]}</option>)}
            </select>
            <button type="button" onClick={() => void load()} disabled={loading} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
            </button>
          </div>
        </div>
        {daftar.terpotong && (
          <p className="mt-3 rounded border border-accent-amber/40 bg-accent-amber/10 px-3 py-2 text-xs text-text-primary">
            {t.truncated.replace('{n}', String(MAKS_PINDAI_INTAKE))}
          </p>
        )}
        {rows.length === 0 && !loading ? (
          // Empty-state membedakan "memang belum ada" dari "tak ada yang cocok".
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-text-secondary">{adaFilter ? t.emptyFiltered : t.empty}</p>
            {adaFilter && (
              <button type="button" onClick={bersihkanFilter} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>
                {t.clearFilters}
              </button>
            )}
          </div>
        ) : (
          // Step 4F — tanpa lebar minimum tetap: muat di 1024px tanpa gulir ke samping.
          <div className="mt-3 min-w-0">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                  <th className="py-2 pr-3 font-normal w-[34%]">{t.colRequest}</th>
                  <th className="py-2 pr-3 font-normal w-[22%]">{t.colPort} · {t.colEta}</th>
                  <th className="py-2 pr-3 font-normal w-[26%]">{t.colStatus}</th>
                  <th className="py-2 font-normal text-right">{t.colVoyage}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border-muted/60 align-top">
                    <td className="py-2 pr-3 min-w-0">
                      <p className="font-medium text-text-primary break-words">{r.vesselName ?? t.noVessel}</p>
                      {r.vesselCount > 1 && <p className="text-[11px] text-text-secondary">{t.pair}</p>}
                      <p className="text-[11px] text-text-secondary break-words">
                        {LABEL_KLASIFIKASI[lang][r.classification] ?? r.classification} · {fmtWaktu(String(r.createdAt), lang)}
                      </p>
                    </td>
                    <td className="py-2 pr-3 min-w-0 text-text-primary">
                      <p className="break-words">{r.portName ?? '—'}</p>
                      <p className="text-[11px] text-text-secondary">{r.eta ? formatTanggal(r.eta, lang) : '—'}</p>
                    </td>
                    <td className="py-2 pr-3 min-w-0">
                      <div className="flex flex-wrap gap-1">
                        <IntakeStatusBadge status={r.status} lang={lang} />
                        {r.duplicateLevel !== 'NO_DUPLICATE' && <DuplicateBadge level={r.duplicateLevel} lang={lang} />}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {r.voyageId && (
                          <Link href={`/voyages/${r.voyageId}`} className="text-accent-blue hover:underline break-all">{r.voyageNumber ?? '→'}</Link>
                        )}
                        <Link href={`/automation/intake/${r.id}`} className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')}>{t.review}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {daftar.total > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-muted pt-3">
                <p className="text-xs text-text-secondary">
                  {t.showing
                    .replace('{a}', String((daftar.page - 1) * daftar.perPage + 1))
                    .replace('{b}', String(Math.min(daftar.page * daftar.perPage, daftar.total)))
                    .replace('{n}', String(daftar.total))}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || daftar.page <= 1}
                    onClick={() => setPage(daftar.page - 1)}
                    className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary disabled:opacity-40')}
                  >
                    {t.prev}
                  </button>
                  <button
                    type="button"
                    disabled={loading || daftar.page * daftar.perPage >= daftar.total}
                    onClick={() => setPage(daftar.page + 1)}
                    className={cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary disabled:opacity-40')}
                  >
                    {t.next}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
