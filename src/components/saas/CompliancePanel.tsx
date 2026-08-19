'use client'

// Settings › Kepatuhan (K186/K187, Fase 8k) — tiga bagian dalam satu layar:
// status backup, ekspor mandiri, dan permintaan hak subjek data.
//
// Digabung SATU layar karena ketiganya menjawab tiga pertanyaan yang selalu
// datang bersamaan dari calon pelanggan berbentuk PT: "data kami di-backup?",
// "kalau kami berhenti, data kami bisa diambil?", "bagaimana kepatuhan data
// pribadi?". Memisahnya jadi tiga menu membuat dua di antaranya tak pernah
// ditemukan.

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Database, Download, FileArchive,
  Loader2, RefreshCw, ShieldCheck, UserSearch,
} from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'

type StatusBackup = {
  terakhirPada: string | null
  berhasil: boolean | null
  ukuranBytes: number | null
  pesan: string | null
  usiaJam: number | null
  perluPerhatian: boolean
  ambangJam: number
}

type ExportJob = {
  id: string
  status: string
  galat: string | null
  jumlahTabel: number | null
  ukuranBytes: number | null
  createdAt: string
  selesaiPada: string | null
  bisaDiunduh: boolean
}

type JejakSubjek = {
  tabel: string
  jumlah: number
  contoh: string[]
  terikatDokumen: boolean
  catatan: string
}

type DataRequest = {
  id: string
  jenis: string
  subjek: string
  konteks: string | null
  uraian: string
  status: string
  createdAt: string
}

const T: Record<Lang, Record<string, string>> = {
  id: {
    backupTitle: 'Status Backup', backupNever: 'Belum pernah ada backup tercatat.',
    backupOk: 'Backup terakhir berhasil.', backupFail: 'Backup terakhir GAGAL.',
    backupStale: 'Backup terakhir sudah lebih dari ambang waktu.',
    backupNote: 'Backup yang tak pernah dilihat siapa pun adalah backup yang tak pernah ketahuan rusak. Uji pemulihan dilakukan terpisah oleh operator — status di sini tidak membuktikannya.',
    exportTitle: 'Ekspor Data', exportDesc: 'Tarik seluruh data operasional perusahaan Anda: XLSX per tabel, JSON untuk kesetiaan penuh, dan seluruh berkas lampiran. Hanya ADMIN.',
    exportBtn: 'Minta Ekspor', exportRunning: 'Sedang diproses…',
    exportNote: 'Proses berjalan di latar. Anda akan mendapat notifikasi saat berkasnya siap — tak perlu menunggu di halaman ini.',
    download: 'Unduh', expired: 'Kedaluwarsa', noExports: 'Belum pernah ada permintaan ekspor.',
    drTitle: 'Permintaan Hak Subjek Data', drDesc: 'Catat permintaan akses, koreksi, atau penghapusan data pribadi (UU PDP). Sistem menunjukkan di mana saja data itu muncul — penghapusan tidak pernah otomatis.',
    drSubject: 'Nama / surel pemohon', drKind: 'Jenis', drContext: 'Konteks', drDetail: 'Uraian permintaan',
    drSubmit: 'Catat Permintaan', drNone: 'Belum ada permintaan tercatat.',
    traceTitle: 'Di mana data ini muncul', traceNone: 'Tidak ditemukan data atas nama itu.',
    traceBound: 'Terikat dokumen — penghapusan butuh keputusan manusia',
    saving: 'Menyimpan…', errGeneric: 'Gagal.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    backupTitle: 'Backup Status', backupNever: 'No backup has ever been recorded.',
    backupOk: 'Last backup succeeded.', backupFail: 'Last backup FAILED.',
    backupStale: 'Last backup is older than the threshold.',
    backupNote: 'A backup nobody ever looks at is a backup nobody ever notices is broken. Restore testing is done separately by the operator — this status does not prove it.',
    exportTitle: 'Data Export', exportDesc: 'Pull all of your company operational data: XLSX per table, JSON for full fidelity, and every attachment file. ADMIN only.',
    exportBtn: 'Request Export', exportRunning: 'Processing…',
    exportNote: 'Runs in the background. You will be notified when the file is ready — no need to wait on this page.',
    download: 'Download', expired: 'Expired', noExports: 'No export has been requested yet.',
    drTitle: 'Data Subject Requests', drDesc: 'Record access, correction, or deletion requests for personal data. The system shows where that data appears — deletion is never automatic.',
    drSubject: 'Requester name / email', drKind: 'Type', drContext: 'Context', drDetail: 'Request details',
    drSubmit: 'Record Request', drNone: 'No requests recorded yet.',
    traceTitle: 'Where this data appears', traceNone: 'No data found under that name.',
    traceBound: 'Bound to documents — deletion needs a human decision',
    saving: 'Saving…', errGeneric: 'Failed.', errConn: 'Failed to connect to server.',
  },
}

const inputCls =
  'w-full h-10 px-3 rounded-md border border-card-border bg-surface-tertiary/40 text-white text-sm focus:outline-none focus:border-accent-blue'
const labelCls = 'text-[11px] font-mono uppercase tracking-wider text-text-secondary'
const card = 'bg-card-bg border border-card-border rounded-lg p-5 space-y-3'

function fmtBytes(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024).toFixed(1)} KB`
}

export function CompliancePanel({ bolehEkspor }: { bolehEkspor: boolean }) {
  const t = useT(T)
  const [backup, setBackup] = useState<StatusBackup | null>(null)
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [requests, setRequests] = useState<DataRequest[]>([])
  const [jejak, setJejak] = useState<JejakSubjek[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const [jenis, setJenis] = useState('AKSES')
  const [subjek, setSubjek] = useState('')
  const [konteks, setKonteks] = useState('')
  const [uraian, setUraian] = useState('')

  const muat = useCallback(async () => {
    const [b, j, r] = await Promise.all([
      fetch('/api/settings/backup-status').then((x) => (x.ok ? x.json() : null)),
      bolehEkspor ? fetch('/api/settings/export').then((x) => (x.ok ? x.json() : [])) : Promise.resolve([]),
      fetch('/api/settings/data-requests').then((x) => (x.ok ? x.json() : [])),
    ])
    if (b) setBackup(b)
    setJobs(Array.isArray(j) ? j : [])
    setRequests(Array.isArray(r) ? r : [])
  }, [bolehEkspor])

  useEffect(() => {
    void muat()
  }, [muat])

  const adaBerjalan = jobs.some((j) => j.status === 'BERJALAN')

  // Selagi ada ekspor berjalan, muat ulang berkala — pekerjaannya di latar,
  // jadi halaman tak akan tahu ia selesai tanpa bertanya lagi.
  useEffect(() => {
    if (!adaBerjalan) return
    const id = setInterval(() => void muat(), 3000)
    return () => clearInterval(id)
  }, [adaBerjalan, muat])

  async function mintaEkspor() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/settings/export', { method: 'POST' })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setNotice({ ok: false, text: b?.error?.message ?? t.errGeneric })
        return
      }
      await muat()
    } catch {
      setNotice({ ok: false, text: t.errConn })
    } finally {
      setBusy(false)
    }
  }

  async function catatPermintaan() {
    setBusy(true)
    setNotice(null)
    setJejak(null)
    try {
      const res = await fetch('/api/settings/data-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jenis, subjek, uraian, konteks: konteks || null }),
      })
      const b = await res.json().catch(() => null)
      if (!res.ok) {
        setNotice({ ok: false, text: b?.error?.message ?? t.errGeneric })
        return
      }
      setJejak(b.jejakSubjek ?? [])
      setSubjek('')
      setUraian('')
      await muat()
    } catch {
      setNotice({ ok: false, text: t.errConn })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p className={`text-sm rounded-md px-3 py-2 ${notice.ok ? 'bg-status-success/10 text-status-success' : 'bg-status-danger/10 text-status-danger'}`}>
          {notice.text}
        </p>
      )}

      {/* ---------------------------------------------------- BACKUP */}
      <div className={backup?.perluPerhatian ? `${card} border-status-danger/50` : card}>
        <div className="flex items-center gap-2">
          <Database className={`h-4 w-4 ${backup?.perluPerhatian ? 'text-status-danger' : 'text-accent-blue'}`} />
          <h2 className="font-display text-white text-base">{t.backupTitle}</h2>
        </div>
        {backup === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
        ) : (
          <>
            <div className="flex items-start gap-2">
              {backup.perluPerhatian ? (
                <AlertTriangle className="h-4 w-4 text-status-danger mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 shrink-0" />
              )}
              <div className="text-sm">
                <p className={backup.perluPerhatian ? 'text-status-danger' : 'text-status-success'}>
                  {!backup.terakhirPada
                    ? t.backupNever
                    : backup.berhasil === false
                      ? t.backupFail
                      : backup.perluPerhatian
                        ? t.backupStale
                        : t.backupOk}
                </p>
                {backup.terakhirPada && (
                  <p className="text-text-secondary text-xs mt-1">
                    {new Date(backup.terakhirPada).toLocaleString()} · {backup.usiaJam}h ·{' '}
                    {fmtBytes(backup.ukuranBytes)} · {`ambang ${backup.ambangJam}h`}
                  </p>
                )}
                {backup.pesan && <p className="text-text-secondary text-xs mt-1">{backup.pesan}</p>}
              </div>
            </div>
            <p className="text-text-secondary/70 text-[11px] border-t border-card-border pt-2">{t.backupNote}</p>
          </>
        )}
      </div>

      {/* ---------------------------------------------------- EKSPOR */}
      {bolehEkspor && (
        <div className={card}>
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-accent-blue" />
            <h2 className="font-display text-white text-base">{t.exportTitle}</h2>
          </div>
          <p className="text-text-secondary text-xs">{t.exportDesc}</p>

          <button
            type="button"
            onClick={mintaEkspor}
            disabled={busy || adaBerjalan}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white
                       transition-colors hover:bg-accent-blue/90 disabled:opacity-40"
          >
            {adaBerjalan || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {adaBerjalan ? t.exportRunning : t.exportBtn}
          </button>
          <p className="text-text-secondary/70 text-[11px]">{t.exportNote}</p>

          {jobs.length === 0 ? (
            <p className="text-text-secondary text-xs">{t.noExports}</p>
          ) : (
            <div className="space-y-1.5 pt-1">
              {jobs.slice(0, 6).map((j) => (
                <div key={j.id} className="flex items-center gap-3 text-xs border-t border-card-border pt-1.5">
                  <span className="text-text-secondary w-36 shrink-0">
                    {new Date(j.createdAt).toLocaleString()}
                  </span>
                  <span
                    className={
                      j.status === 'SELESAI' ? 'text-status-success' : j.status === 'GAGAL' ? 'text-status-danger' : 'text-text-secondary'
                    }
                  >
                    {j.status}
                  </span>
                  <span className="text-text-secondary flex-1 truncate">
                    {j.galat ?? (j.jumlahTabel ? `${j.jumlahTabel} tabel · ${fmtBytes(j.ukuranBytes)}` : '')}
                  </span>
                  {j.status === 'SELESAI' &&
                    (j.bisaDiunduh ? (
                      <a
                        href={`/api/settings/export/${j.id}/download`}
                        className="inline-flex items-center gap-1 text-accent-blue hover:underline shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" /> {t.download}
                      </a>
                    ) : (
                      <span className="text-text-secondary/60 shrink-0">{t.expired}</span>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------- DATA REQUESTS */}
      <div className={card}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent-blue" />
          <h2 className="font-display text-white text-base">{t.drTitle}</h2>
        </div>
        <p className="text-text-secondary text-xs">{t.drDesc}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>{t.drKind}</label>
            <select value={jenis} onChange={(e) => setJenis(e.target.value)} className={inputCls}>
              <option value="AKSES">AKSES</option>
              <option value="KOREKSI">KOREKSI</option>
              <option value="PENGHAPUSAN">PENGHAPUSAN</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.drContext}</label>
            <select value={konteks} onChange={(e) => setKonteks(e.target.value)} className={inputCls}>
              <option value="">—</option>
              <option value="CREW">CREW</option>
              <option value="PORTAL_USER">PORTAL_USER</option>
              <option value="USER">USER</option>
              <option value="LAINNYA">LAINNYA</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.drSubject}</label>
            <input value={subjek} onChange={(e) => setSubjek(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t.drDetail}</label>
          <textarea
            value={uraian}
            onChange={(e) => setUraian(e.target.value)}
            rows={2}
            className={`${inputCls} h-auto py-2`}
          />
        </div>
        <button
          type="button"
          onClick={catatPermintaan}
          disabled={busy || !subjek || !uraian}
          className="inline-flex items-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm
                     text-text-secondary hover:text-white hover:border-accent-blue/50 transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />}
          {busy ? t.saving : t.drSubmit}
        </button>

        {jejak && (
          <div className="border border-card-border rounded-md p-3 space-y-2 bg-surface-tertiary/20">
            <p className="text-xs font-mono uppercase tracking-wider text-text-secondary">{t.traceTitle}</p>
            {jejak.length === 0 ? (
              <p className="text-text-secondary text-xs">{t.traceNone}</p>
            ) : (
              jejak.map((j) => (
                <div key={j.tabel} className="text-xs">
                  <p className="text-white">
                    {j.tabel} — <span className="font-mono">{j.jumlah}</span>
                    {j.terikatDokumen && (
                      <span className="ml-2 text-status-warning">⚠ {t.traceBound}</span>
                    )}
                  </p>
                  {j.contoh.length > 0 && (
                    <p className="text-text-secondary/70">{j.contoh.join(' · ')}</p>
                  )}
                  <p className="text-text-secondary/60">{j.catatan}</p>
                </div>
              ))
            )}
          </div>
        )}

        {requests.length === 0 ? (
          <p className="text-text-secondary text-xs">{t.drNone}</p>
        ) : (
          <div className="space-y-1.5 pt-1">
            {requests.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs border-t border-card-border pt-1.5">
                <span className="text-text-secondary w-32 shrink-0">{new Date(r.createdAt).toLocaleDateString()}</span>
                <span className="text-white w-24 shrink-0">{r.jenis}</span>
                <span className="text-text-secondary flex-1 truncate">{r.subjek}</span>
                <span className="text-text-secondary shrink-0">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
