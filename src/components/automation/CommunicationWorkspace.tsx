'use client'

// Ruang kerja satu kandidat Komunikasi (Simulasi) — WA-1 Step 2I.
// Revisi (penerima fixture + bahasa) → Pratinjau → Minta approval → Setujui/Tolak → FAKE Send / retry →
// Cancel → History. SEMUA aksi lewat /api/automation/communications (Step 2H); aturan bisnis (gerbang,
// approval, idempotensi, batas retry, Cancel, audit) tetap diputus server — UI hanya menampilkan.
// Tanpa input nomor bebas dan tanpa editor body (PRD P-02); penerima tersamarkan kecuali diminta eksplisit.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Eye, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import type { DetailPesan, RiwayatKomunikasi } from '@/services/communication/communication-read.service'
import { btnCls, fmtWaktu } from './shared'
import {
  LABEL_KELUARGA,
  LABEL_STATE_CANDIDATE,
  SimulasiBanner,
  StateBadge,
  jelaskanAlasan,
  kunciPermintaan,
  panggilApi,
} from './comm-shared'

export type FixtureOpsi = { id: string; nama: string; samaran: string }

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: '← Daftar komunikasi', refresh: 'Muat ulang', loading: 'Memuat…', voyage: 'Voyage', source: 'Sumber',
    signals: 'Sinyal asal', revision: 'Siapkan revisi pesan', recipient: 'Penerima uji (fixture)', language: 'Bahasa',
    createRevision: 'Buat revisi', latest: 'Pesan (revisi terbaru)', noMessage: 'Belum ada revisi pesan.',
    vessel: 'Kapal', port: 'Pelabuhan', event: 'Event', schedule: 'Perubahan jadwal', localTime: 'Waktu lokal',
    template: 'Template', showFull: 'Tampilkan penerima utuh', body: 'Isi pesan (persis seperti yang akan disetujui)',
    markPreviewed: 'Tandai sudah dipratinjau', requestApproval: 'Minta approval', approve: 'Setujui', reject: 'Tolak',
    fakeSend: 'FAKE Send', retry: 'Ulangi FAKE Send', cancelMsg: 'Batalkan pesan', approvalNote: 'Catatan keputusan',
    rejectNote: 'Alasan penolakan (wajib, min. 3)', cancelNote: 'Alasan pembatalan (wajib, min. 3)', confirm: 'Konfirmasi',
    close: 'Tutup', approval: 'Approval', attempts: 'Percobaan FAKE', history: 'Riwayat (audit)', result: 'Hasil',
    canceledBy: 'Dibatalkan oleh', reason: 'Alasan', none: '—', blocked: 'Kandidat diblokir', revisions: 'Revisi lain',
  },
  en: {
    back: '← Communications', refresh: 'Reload', loading: 'Loading…', voyage: 'Voyage', source: 'Source',
    signals: 'Source signals', revision: 'Prepare a message revision', recipient: 'Test recipient (fixture)', language: 'Language',
    createRevision: 'Create revision', latest: 'Message (latest revision)', noMessage: 'No message revision yet.',
    vessel: 'Vessel', port: 'Port', event: 'Event', schedule: 'Schedule change', localTime: 'Local time',
    template: 'Template', showFull: 'Show full recipient', body: 'Message body (exactly as it will be approved)',
    markPreviewed: 'Mark as previewed', requestApproval: 'Request approval', approve: 'Approve', reject: 'Reject',
    fakeSend: 'FAKE Send', retry: 'Retry FAKE Send', cancelMsg: 'Cancel message', approvalNote: 'Decision note',
    rejectNote: 'Rejection reason (required, min 3)', cancelNote: 'Cancel reason (required, min 3)', confirm: 'Confirm',
    close: 'Close', approval: 'Approval', attempts: 'FAKE attempts', history: 'History (audit)', result: 'Result',
    canceledBy: 'Canceled by', reason: 'Reason', none: '—', blocked: 'Candidate blocked', revisions: 'Other revisions',
  },
}

const inputCls =
  'bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'
const btnUtama = cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')
const btnKedua = cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')
const BOLEH_BATAL = ['DRAFT', 'PREVIEWED', 'APPROVED', 'FAKE_FAILED', 'NEEDS_REVIEW']

type Dialog = { jenis: 'approve' | 'reject' | 'cancel'; catatan: string } | null

export function CommunicationWorkspace({ candidateId, fixtures }: { candidateId: string; fixtures: FixtureOpsi[] }) {
  const t = useT(STR)
  const { lang } = useLang()
  const [data, setData] = useState<RiwayatKomunikasi | null>(null)
  const [utuh, setUtuh] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState('')
  const [busy, setBusy] = useState(false)
  const kunci = useRef(false) // pengaman klik ganda SINKRON (state React belum tentu ter-render di klik kedua)
  const [fixture, setFixture] = useState(fixtures[0]?.id ?? '')
  const [bahasa, setBahasa] = useState<'ID' | 'EN'>('ID')
  const [dialog, setDialog] = useState<Dialog>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const r = await panggilApi<{ data: RiwayatKomunikasi }>(`/candidates/${encodeURIComponent(candidateId)}/history`)
    if (r.ok) setData(r.data.data)
    else setError(r.pesan)
    setLoading(false)
  }, [candidateId])

  useEffect(() => {
    void load()
  }, [load])

  /** Satu aksi pada satu waktu; hasil bisnis (HTTP 200 + hasil) ditampilkan, lalu data dimuat ulang. */
  async function aksi(path: string, body?: Record<string, unknown>) {
    if (kunci.current) return
    kunci.current = true
    setBusy(true)
    setHasil('')
    setError('')
    try {
      const r = await panggilApi(path, 'POST', body)
      if (r.ok) {
        const d = r.data as Record<string, unknown>
        const kode = (d.alasan ?? d.kode ?? null) as string | null
        setHasil(`${String(d.hasil ?? '')}${kode ? ` — ${jelaskanAlasan(kode, lang)}` : ''}`)
        setDialog(null)
      }
      await load()
      // load() mengosongkan galat — galat aksi ditetapkan SESUDAHNYA agar tetap terlihat.
      if (!r.ok) setError(r.pesan)
    } finally {
      kunci.current = false
      setBusy(false)
    }
  }

  async function tampilkanUtuh(m: DetailPesan) {
    const r = await panggilApi<{ data: DetailPesan }>(`/messages/${encodeURIComponent(m.id)}?recipient=full`)
    if (r.ok) setUtuh((u) => ({ ...u, [m.id]: r.data.data.recipientIdentifier }))
    else setError(r.pesan)
  }

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    )
  }
  if (!data) {
    return (
      <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
        {error}
      </p>
    )
  }

  const c = data.candidate
  const pesan = [...data.pesan].sort((a, b) => a.revision - b.revision)
  const m = pesan.at(-1) ?? null
  const lain = pesan.slice(0, -1)
  const bisaRevisi = c.state === 'ACTIVE' && m?.state !== 'FAKE_SENT'

  return (
    <div className="space-y-5">
      <SimulasiBanner lang={lang} />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/automation/communications" className="text-xs text-accent-blue hover:underline">{t.back}</Link>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className={btnKedua}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">{LABEL_KELUARGA[lang][c.family] ?? c.family}</h2>
          <StateBadge state={c.state} lang={lang} kamus={LABEL_STATE_CANDIDATE} />
          <Link href={`/voyages/${c.voyageId}`} className="text-xs font-mono text-accent-blue hover:underline">{t.voyage} {c.voyageNumber ?? '—'}</Link>
        </div>
        <p className="text-[11px] font-mono text-text-secondary break-all">{t.source} {c.sourceType} · {c.sourceRef}</p>
        {c.state === 'BLOCKED' && <p className="text-sm text-status-danger">{t.blocked}: {jelaskanAlasan(c.blockReason, lang)}</p>}
        <details>
          <summary className="cursor-pointer text-xs text-text-secondary">{t.signals} ({c.sinyal.length})</summary>
          <ul className="mt-2 space-y-1">
            {c.sinyal.map((s) => (
              <li key={s.id} className="text-xs text-text-secondary break-words">{fmtWaktu(s.detectedAt, lang)} · {s.kind} · {s.reviewState} — {s.explanation}</li>
            ))}
          </ul>
        </details>
      </section>

      {(hasil || error) && (
        <p role={error ? 'alert' : 'status'} data-testid="hasil-aksi" className={cn('rounded border px-3 py-2 text-sm', error ? 'border-status-danger/30 bg-status-danger/10 text-status-danger' : 'border-accent-blue/30 bg-accent-blue/5 text-text-primary')}>
          {error || `${t.result}: ${hasil}`}
        </p>
      )}

      {bisaRevisi && (
        <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{t.revision}</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
              {t.recipient}
              <select data-testid="pilih-fixture" className={inputCls} value={fixture} onChange={(e) => setFixture(e.target.value)}>
                {fixtures.map((f) => (
                  <option key={f.id} value={f.id}>{f.nama} ({f.samaran})</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-mono uppercase tracking-wider text-text-secondary">
              {t.language}
              <select data-testid="pilih-bahasa" className={inputCls} value={bahasa} onChange={(e) => setBahasa(e.target.value as 'ID' | 'EN')}>
                <option value="ID">ID</option>
                <option value="EN">EN</option>
              </select>
            </label>
            <button type="button" className={btnUtama} disabled={busy || !fixture} onClick={() => void aksi(`/candidates/${encodeURIComponent(c.id)}/revisions`, { recipientFixtureId: fixture, language: bahasa })}>
              {t.createRevision}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-3" data-testid="panel-pesan">
        <h3 className="text-sm font-semibold text-text-primary">{t.latest}</h3>
        {!m ? (
          <p className="text-sm text-text-secondary">{t.noMessage}</p>
        ) : (
          <>
            <SimulasiBanner lang={lang} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-text-secondary">#{m.revision}</span>
              <StateBadge state={m.state} lang={lang} />
              {m.reasonCode && <span className="text-xs text-text-secondary">{jelaskanAlasan(m.reasonCode, lang)}</span>}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" data-testid="fakta-snapshot">
              <Baris label={t.vessel} nilai={m.fakta.vesselName} />
              <Baris label={t.voyage} nilai={m.fakta.voyageNumber} />
              <Baris label={t.port} nilai={m.fakta.portName} />
              <Baris label={t.event} nilai={m.fakta.keluarga ? (LABEL_KELUARGA[lang][m.fakta.keluarga] ?? m.fakta.keluarga) : null} />
              {m.fakta.perubahan && m.fakta.perubahan.length > 0 && (
                <Baris label={t.schedule} nilai={m.fakta.perubahan.map((p) => `${p.medan.toUpperCase()} ${p.lama} → ${p.baru}`).join('; ')} />
              )}
              {m.fakta.eventLocalTime && <Baris label={t.localTime} nilai={`${m.fakta.eventLocalTime}${m.fakta.timezone && !m.fakta.eventLocalTime.includes(m.fakta.timezone) ? ` (${m.fakta.timezone})` : ''}`} />}
              <Baris label={t.source} nilai={`${c.sourceType} · ${c.sourceRef}`} />
              <Baris label={t.language} nilai={m.language} />
              <Baris label={t.template} nilai={`${m.templateId} v${m.templateVersion}`} />
              <div className="flex flex-wrap items-center gap-2">
                <dt className="text-text-secondary">{t.recipient}:</dt>
                <dd className="font-mono text-text-primary" data-testid="penerima">{utuh[m.id] ?? m.recipientIdentifier}</dd>
                {!utuh[m.id] && (
                  <button type="button" className={cn(btnKedua, 'min-h-[28px] py-0.5')} onClick={() => void tampilkanUtuh(m)}>
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" /> {t.showFull}
                  </button>
                )}
              </div>
            </dl>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.body}</p>
              <pre data-testid="isi-pesan" className="mt-1 whitespace-pre-wrap break-words rounded border border-border-muted bg-surface px-3 py-2 text-sm text-text-primary font-mono">{m.body}</pre>
            </div>

            <div className="flex flex-wrap gap-2">
              {m.state === 'DRAFT' && (
                <button type="button" className={btnUtama} disabled={busy} onClick={() => void aksi(`/messages/${encodeURIComponent(m.id)}/preview`, { snapshotFingerprint: m.snapshotFingerprint })}>
                  {t.markPreviewed}
                </button>
              )}
              {m.state === 'PREVIEWED' && m.approval?.status !== 'PENDING' && (
                <button type="button" className={btnUtama} disabled={busy} onClick={() => void aksi(`/messages/${encodeURIComponent(m.id)}/approval-request`)}>
                  {t.requestApproval}
                </button>
              )}
              {m.state === 'PREVIEWED' && m.approval?.status === 'PENDING' && (
                <>
                  <button type="button" className={btnUtama} disabled={busy} onClick={() => setDialog({ jenis: 'approve', catatan: '' })}>{t.approve}</button>
                  <button type="button" className={btnKedua} disabled={busy} onClick={() => setDialog({ jenis: 'reject', catatan: '' })}>{t.reject}</button>
                </>
              )}
              {(m.state === 'APPROVED' || m.state === 'FAKE_FAILED') && (
                <button type="button" data-testid="tombol-fake-send" className={btnUtama} disabled={busy} onClick={() => void aksi(`/messages/${encodeURIComponent(m.id)}/send`, { requestKey: kunciPermintaan() })}>
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} {m.state === 'APPROVED' ? t.fakeSend : t.retry}
                </button>
              )}
              {BOLEH_BATAL.includes(m.state) && (
                <button type="button" className={btnKedua} disabled={busy} onClick={() => setDialog({ jenis: 'cancel', catatan: '' })}>{t.cancelMsg}</button>
              )}
            </div>

            {dialog && (
              <div className="space-y-2 rounded border border-accent-blue/30 bg-accent-blue/5 p-3" data-testid="dialog-aksi">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                  {dialog.jenis === 'approve' ? t.approvalNote : dialog.jenis === 'reject' ? t.rejectNote : t.cancelNote}
                  <textarea
                    value={dialog.catatan}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setDialog({ ...dialog, catatan: e.target.value })}
                    className="mt-1 w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary normal-case tracking-normal font-sans focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnUtama}
                    disabled={busy}
                    onClick={() => {
                      if (dialog.jenis === 'cancel') void aksi(`/messages/${encodeURIComponent(m.id)}/cancel`, { cancelNote: dialog.catatan })
                      else if (m.approval) {
                        const tujuan = `/approvals/${encodeURIComponent(m.approval.id)}/${dialog.jenis}`
                        void aksi(tujuan, dialog.catatan.trim() ? { decisionNote: dialog.catatan } : dialog.jenis === 'reject' ? { decisionNote: '' } : {})
                      }
                    }}
                  >
                    {t.confirm}
                  </button>
                  <button type="button" className={btnKedua} disabled={busy} onClick={() => setDialog(null)}>{t.close}</button>
                </div>
              </div>
            )}

            {m.approval && (
              <p className="text-xs text-text-secondary" data-testid="info-approval">
                {t.approval}: {m.approval.status} · {m.approval.executionStatus}
                {m.approval.decidedAt ? ` · ${fmtWaktu(m.approval.decidedAt, lang)}` : ''}
                {m.approval.decisionNote ? ` · ${m.approval.decisionNote}` : ''}
              </p>
            )}
            {m.pembatalan && (
              <p className="text-xs text-text-secondary" data-testid="info-pembatalan">
                {t.canceledBy} {m.pembatalan.olehUserId ?? t.none} · {fmtWaktu(m.pembatalan.pada, lang)} · {t.reason}: {m.pembatalan.catatan ?? t.none}
              </p>
            )}
            {m.attempts.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">{t.attempts}</p>
                <ul className="mt-1 space-y-1" data-testid="daftar-attempt">
                  {m.attempts.map((a) => (
                    <li key={a.id} className="text-xs font-mono text-text-secondary">
                      #{a.attemptNo} · {a.state} · {a.provider} · simulation={String(a.simulation)} · externalDelivery={String(a.externalDelivery)}
                      {a.receipt ? ` · ${a.receipt}` : ''} · {fmtWaktu(a.claimedAt, lang)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {lain.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-text-secondary">{t.revisions} ({lain.length})</summary>
            <ul className="mt-2 space-y-1">
              {lain.map((p) => (
                <li key={p.id} className="text-xs text-text-secondary">#{p.revision} · {p.language} · {p.state}{p.reasonCode ? ` · ${jelaskanAlasan(p.reasonCode, lang)}` : ''}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{t.history}</h3>
        <ol className="space-y-1" data-testid="riwayat">
          {data.jejakAudit.map((j) => {
            const nv = (j.newValue ?? {}) as Record<string, unknown>
            return (
              <li key={j.id} className="text-xs font-mono text-text-secondary break-words">
                {fmtWaktu(j.waktu, lang)} · {j.peristiwa ?? j.aksi} · {j.tabel} · {j.userId ?? t.none}
                {typeof nv.catatan === 'string' ? ` · ${t.reason}: ${nv.catatan}` : ''}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function Baris({ label, nilai }: { label: string; nilai: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-text-secondary">{label}:</dt>
      <dd className="text-text-primary break-words">{nilai ?? '—'}</dd>
    </div>
  )
}
