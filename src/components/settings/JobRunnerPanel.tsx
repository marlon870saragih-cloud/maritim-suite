'use client'

// Panel "Jalankan pengingat sekarang" (§15 poin 7, K88, Fase 7e-UI).
//
// Persistensi — KEPUTUSAN SADAR, bukan kelalaian: hasil jalan disimpan hanya
// di state komponen ini (hilang saat reload). §15 poin 7 menyebut "hasil jalan
// terakhir" tapi TIDAK menyebut ia harus bertahan lintas reload/sesi, dan
// `prisma/schema.prisma` (Fase 7e) sengaja TIDAK menambah tabel riwayat job —
// satu-satunya tabel yang ditulis reminder-job.ts adalah Notification
// (lihat larangan K102 di reminder-job.ts). Menambah tabel job-run-history di
// sini berarti scope creep di luar backend 7e yang sudah diverifikasi 59/59.
// Kartu di bawah karena itu memulai kosong ("belum ada jalan pada sesi ini")
// dan hanya terisi sesudah tombol ditekan — jujur soal apa yang sungguh
// diketahui klien, bukan pura-pura tahu riwayat yang tak pernah disimpan.
//
// Token JOB_RUNNER_TOKEN TIDAK PERNAH ada di berkas ini. Tombol memanggil
// POST /api/jobs/run-reminders (route API sesi-ADMIN, lihat berkasnya) yang
// membaca token di server dan meneruskannya ke /api/jobs/run — klien hanya
// pernah melihat hasil JSON yang sudah jadi.

import { useState } from 'react'
import { Loader2, PlayCircle, AlertTriangle, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT, useLang, type Lang } from '@/lib/i18n'
import type { HasilJalanPengingat, JenisPengingat } from '@/services/ops/reminder-job'

type Strings = {
  run: string
  running: string
  empty: string
  errConn: string
  lastRun: string
  at: string
  took: string
  created: string
  skipped: string
  limited: string
  perTenant: string
  noTenant: string
  error: string
  types: Record<JenisPengingat, string>
}

const STR: Record<Lang, Strings> = {
  id: {
    run: 'Jalankan pengingat sekarang',
    running: 'Menjalankan…',
    empty: 'Belum ada jalan pada sesi ini. Tekan tombol di atas untuk menjalankan job pengingat sekarang.',
    errConn: 'Gagal terhubung ke server.',
    lastRun: 'Hasil jalan terakhir',
    at: 'pada',
    took: 'durasi',
    created: 'dibuat',
    skipped: 'dilewati',
    limited: 'dibatasi',
    perTenant: 'Rincian per tenant',
    noTenant: 'Tidak ada tenant terdaftar.',
    error: 'Galat',
    types: { TASK_DUE: 'Mendekati', TASK_OVERDUE: 'Terlambat', SLA_BREACH: 'Pelanggaran SLA', VENDOR_DOC_EXPIRING: 'Dokumen vendor kedaluwarsa' },
  },
  en: {
    run: 'Run reminders now',
    running: 'Running…',
    empty: 'No run yet this session. Click the button above to run the reminder job now.',
    errConn: 'Failed to connect to server.',
    lastRun: 'Last run result',
    at: 'at',
    took: 'duration',
    created: 'created',
    skipped: 'skipped',
    limited: 'limited',
    perTenant: 'Per-tenant breakdown',
    noTenant: 'No tenants registered.',
    error: 'Error',
    types: { TASK_DUE: 'Approaching', TASK_OVERDUE: 'Overdue', SLA_BREACH: 'SLA breach', VENDOR_DOC_EXPIRING: 'Vendor doc expiring' },
  },
}

const JENIS_URUT: JenisPengingat[] = ['SLA_BREACH', 'TASK_OVERDUE', 'TASK_DUE', 'VENDOR_DOC_EXPIRING']

type JobRunResponse = {
  job: string
  dijalankanPada: string
  durasiMs: number
  total: { dibuat: number; dilewati: number; dibatasi: number }
  hasil: HasilJalanPengingat[]
}

const fmtTime = (iso: string, lang: Lang) => new Date(iso).toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB')

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' }) {
  const TONE = {
    success: 'bg-status-success/12 text-status-success border-status-success/30',
    warning: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
    danger: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  } as const
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-mono', TONE[tone])}>
      <strong className="text-sm">{value}</strong> {label}
    </span>
  )
}

export function JobRunnerPanel() {
  const t = useT(STR)
  const { lang } = useLang()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<JobRunResponse | null>(null)

  async function run() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/jobs/run-reminders', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) {
        setError(body?.error?.message ?? t.errConn)
        return
      }
      setResult(body as JobRunResponse)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-card-bg border border-card-border rounded-lg p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display text-white text-base">{t.run}</h3>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
          {busy ? t.running : t.run}
        </button>
      </div>

      {error && (
        <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {!result ? (
        <div className="bg-card-bg border border-card-border rounded-lg p-8 text-center">
          <Clock3 className="w-6 h-6 text-text-secondary mx-auto mb-2" />
          <p className="text-text-secondary text-sm">{t.empty}</p>
        </div>
      ) : (
        <div className="bg-card-bg border border-card-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-display text-white text-sm">{t.lastRun}</h4>
            <p className="text-text-secondary text-[11px] font-mono">
              {t.at} {fmtTime(result.dijalankanPada, lang)} · {t.took} {result.durasiMs}ms
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatChip label={t.created} value={result.total.dibuat} tone="success" />
            <StatChip label={t.skipped} value={result.total.dilewati} tone="warning" />
            <StatChip label={t.limited} value={result.total.dibatasi} tone="danger" />
          </div>

          <div className="space-y-2">
            <p className="text-[9px] font-mono uppercase tracking-wider text-text-secondary">{t.perTenant}</p>
            {result.hasil.length === 0 ? (
              <p className="text-text-secondary text-xs">{t.noTenant}</p>
            ) : (
              <div className="overflow-x-auto border border-card-border/60 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <tbody>
                    {result.hasil.map((h) => (
                      <tr key={h.tenant} className="border-b border-card-border/50 last:border-0">
                        <td className="px-3 py-2.5 text-text-primary font-medium whitespace-nowrap align-top">
                          {h.namaTenant ?? h.tenant}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          {h.galat ? (
                            <span className="text-status-danger">
                              {t.error}: {h.galat}
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
                              <span>
                                {t.created} <strong className="text-text-primary">{h.dibuat}</strong>
                              </span>
                              <span>
                                {t.skipped} <strong className="text-text-primary">{h.dilewati}</strong>
                              </span>
                              <span>
                                {t.limited} <strong className="text-text-primary">{h.dibatasi}</strong>
                              </span>
                              {JENIS_URUT.filter((j) => h.perJenis[j] > 0).map((j) => (
                                <span key={j} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary">
                                  {t.types[j]}: {h.perJenis[j]}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
