'use client'

// Ruang kerja satu Pesan Klien WhatsApp — WA-2a 2a-G (T3).
// Detail → Pratinjau → Minta approval → Setujui/Tolak (checker) → Batalkan; Buat revisi (kontak sama, opsi B).
// Tombol hanya dari `aksiTersedia` server (petunjuk); server tetap menegakkan maker-checker, status, freshness.
// Setiap aksi: satu permintaan, hasil ditampilkan, data dimuat ulang. Setelah status tidak pasti (timeout),
// aksi dikunci sampai muat ulang berhasil — TANPA pengulangan mutasi otomatis. Tidak ada pengiriman (Send).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'
import { btnCls, fmtWaktu } from './shared'
import {
  BelumDikirimBanner,
  HASIL_DIKENAL,
  LABEL_KELUARGA,
  RUTE_PESAN_KLIEN,
  StateBadge,
  jelaskan,
  labelHasil,
  panggilApi,
  pesanGalat,
  type AksiPesan,
  type DetailPesan,
  type Halaman,
  type PeristiwaPesan,
} from './client-message-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    back: '← Daftar pesan klien', refresh: 'Muat ulang', loading: 'Memuat…', revision: 'Revisi', recipient: 'Penerima', party: 'Pihak',
    language: 'Bahasa', template: 'Template', voyage: 'Voyage', body: 'Isi pesan (persis seperti yang disetujui; tidak dapat diedit)', facts: 'Data pesan',
    freshness: 'Kesegaran data', approval: 'Approval', status: 'Status', expires: 'Berlaku s.d.', decided: 'Diputuskan', previewed: 'Dipratinjau', approved: 'Disetujui',
    actions: 'Aksi', preview: 'Tandai sudah dipratinjau', request: 'Minta approval', approve: 'Setujui', reject: 'Tolak', cancel: 'Batalkan pesan',
    revise: 'Buat revisi (kontak sama)', noActions: 'Tidak ada aksi yang tersedia untuk Anda pada status ini.', rejectNote: 'Alasan penolakan (wajib, 3–1000 karakter)',
    cancelNote: 'Alasan pembatalan (wajib, 3–1000 karakter)', confirm: 'Konfirmasi', close: 'Batal', history: 'Riwayat', more: 'Muat lebih banyak',
    result: 'Hasil', reloadFirst: 'Muat ulang data sebelum melakukan aksi berikutnya.', none: '—', openRevision: 'Buka pesan revisi',
    terminal: 'Status akhir — pesan ini tidak dapat diubah lagi.',
  },
  en: {
    back: '← Client messages', refresh: 'Reload', loading: 'Loading…', revision: 'Revision', recipient: 'Recipient', party: 'Party',
    language: 'Language', template: 'Template', voyage: 'Voyage', body: 'Message body (exactly as approved; not editable)', facts: 'Message data',
    freshness: 'Data freshness', approval: 'Approval', status: 'Status', expires: 'Valid until', decided: 'Decided', previewed: 'Previewed', approved: 'Approved',
    actions: 'Actions', preview: 'Mark as previewed', request: 'Request approval', approve: 'Approve', reject: 'Reject', cancel: 'Cancel message',
    revise: 'Create revision (same contact)', noActions: 'No actions are available to you in this state.', rejectNote: 'Rejection reason (required, 3–1000 characters)',
    cancelNote: 'Cancel reason (required, 3–1000 characters)', confirm: 'Confirm', close: 'Back', history: 'History', more: 'Load more',
    result: 'Result', reloadFirst: 'Reload the data before the next action.', none: '—', openRevision: 'Open revision message',
    terminal: 'Final state — this message can no longer be changed.',
  },
}

const inputCls =
  'w-full bg-surface border border-border-muted rounded px-2.5 py-2 min-h-[36px] text-sm text-text-primary ' +
  'focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40'
const btnUtama = cn(btnCls, 'bg-accent-blue hover:bg-primary text-[#231a06]')
const btnKedua = cn(btnCls, 'border border-border-muted text-text-secondary hover:text-text-primary')
const btnBahaya = cn(btnCls, 'border border-status-danger/40 text-status-danger hover:bg-status-danger/10')
const TERMINAL = new Set(['EXPIRED', 'REJECTED', 'BLOCKED', 'CANCELED'])

type Dialog = { jenis: 'tolak' | 'batal'; catatan: string } | null

function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2 text-sm">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary break-words min-w-0">{children}</dd>
    </div>
  )
}

const teksNilai = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v))

export function ClientMessageWorkspace({ messageId, hasilAwal }: { messageId: string; hasilAwal: string | null }) {
  const t = useT(STR)
  const { lang } = useLang()
  const router = useRouter()
  const [d, setD] = useState<DetailPesan | null>(null)
  const [riwayat, setRiwayat] = useState<PeristiwaPesan[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasil, setHasil] = useState(hasilAwal && (HASIL_DIKENAL as readonly string[]).includes(hasilAwal) ? labelHasil(hasilAwal, lang) : '')
  const [busy, setBusy] = useState(false)
  const [perluMuatUlang, setPerluMuatUlang] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [revisiLain, setRevisiLain] = useState<string | null>(null)
  const kunci = useRef(false) // pengaman klik ganda SINKRON

  const p = `/${encodeURIComponent(messageId)}`

  /** Muat detail + halaman pertama riwayat. true bila keduanya berhasil. */
  const load = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    setError('')
    const [rd, rh] = await Promise.all([
      panggilApi<{ data: DetailPesan }>(p),
      panggilApi<{ data: Halaman<PeristiwaPesan> }>(`${p}/history?take=20`),
    ])
    let sukses = true
    if (rd.ok) setD(rd.data.data)
    else {
      sukses = false
      setError(pesanGalat(rd, lang))
    }
    if (rh.ok) {
      setRiwayat(rh.data.data.items)
      setCursor(rh.data.data.nextCursor)
    } else if (rd.ok) {
      sukses = false
      setError(pesanGalat(rh, lang))
    }
    setPerluMuatUlang(!sukses)
    setLoading(false)
    return sukses
  }, [p, lang])

  useEffect(() => {
    void load()
  }, [load])

  async function muatRiwayatLagi() {
    if (!cursor) return
    const r = await panggilApi<{ data: Halaman<PeristiwaPesan> }>(`${p}/history?take=20&cursor=${encodeURIComponent(cursor)}`)
    if (r.ok) {
      setRiwayat((lama) => [...lama, ...r.data.data.items])
      setCursor(r.data.data.nextCursor)
    } else setError(pesanGalat(r, lang))
  }

  /** Satu mutasi pada satu waktu; hasil bisnis (200 + hasil) ditampilkan, lalu data dimuat ulang. */
  async function aksi(path: string, body: Record<string, unknown>) {
    if (kunci.current || perluMuatUlang) return
    kunci.current = true
    setBusy(true)
    setHasil('')
    setError('')
    setRevisiLain(null)
    try {
      const r = await panggilApi<{ hasil: string; alasan?: string; messageId?: string }>(path, 'POST', body)
      if (r.ok) {
        setHasil(`${labelHasil(r.data.hasil, lang)}${r.data.alasan ? ` — ${jelaskan(r.data.alasan, lang)}` : ''}`)
        setDialog(null)
        const baru = r.data.messageId
        if ((r.data.hasil === 'DRAFT_DIBUAT' || r.data.hasil === 'SUDAH_ADA') && baru && baru !== messageId) {
          setRevisiLain(baru)
          router.push(`${RUTE_PESAN_KLIEN}/${encodeURIComponent(baru)}?hasil=${encodeURIComponent(r.data.hasil)}`)
          return
        }
      }
      if (!r.ok && r.tidakPasti) setPerluMuatUlang(true)
      await load()
      // load() mengosongkan galat — galat aksi ditetapkan SESUDAHNYA agar tetap terlihat.
      if (!r.ok) setError(pesanGalat(r, lang))
    } finally {
      kunci.current = false
      setBusy(false)
    }
  }

  if (loading && !d) {
    return (
      <p className="flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t.loading}</p>
    )
  }
  if (!d) {
    return (
      <div className="space-y-3">
        <Link href={RUTE_PESAN_KLIEN} className="text-sm text-accent-blue hover:underline">{t.back}</Link>
        <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-testid="galat-detail">{error}</p>
        <button type="button" className={btnKedua} onClick={() => void load()}>{t.refresh}</button>
      </div>
    )
  }

  const ada = (a: AksiPesan) => d.aksiTersedia.includes(a)
  const kunciAksi = busy || perluMuatUlang
  const f = d.fields

  return (
    <div className="space-y-5" data-testid="panel-pesan" data-message-id={d.id} data-state={d.state}>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={RUTE_PESAN_KLIEN} className="text-sm text-accent-blue hover:underline">{t.back}</Link>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className={btnKedua} data-testid="tombol-muat-ulang">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} aria-hidden="true" /> {t.refresh}
        </button>
      </div>
      <BelumDikirimBanner lang={lang} />
      <p className="text-[11px] font-mono text-text-secondary" data-testid="label-pengiriman-server">{d.labelPengiriman}</p>

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{LABEL_KELUARGA[lang][d.konteks.keluarga ?? ''] ?? d.konteks.keluarga ?? '—'}</span>
          <StateBadge state={d.state} lang={lang} />
          {d.reasonCode && <span className="text-xs text-text-secondary" data-testid="alasan-status">{jelaskan(d.reasonCode, lang)}</span>}
        </div>
        <dl className="space-y-1">
          <Baris label={t.revision}>{d.revision}</Baris>
          <Baris label={t.recipient}><span className="font-mono" data-testid="penerima">{d.penerimaTersamar}</span></Baris>
          <Baris label={t.party}>{d.partyType}</Baris>
          <Baris label={t.language}>{d.language}</Baris>
          <Baris label={t.template}>{`${d.templateId} v${d.templateVersion}`}</Baris>
          <Baris label={t.voyage}>{d.konteks.voyageId ?? t.none}</Baris>
          {d.previewedAt && <Baris label={t.previewed}>{fmtWaktu(d.previewedAt, lang)}</Baris>}
          {d.approvedAt && <Baris label={t.approved}>{fmtWaktu(d.approvedAt, lang)}</Baris>}
        </dl>
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">{t.body}</h3>
          <pre className="whitespace-pre-wrap break-words rounded border border-border-muted bg-surface p-3 text-sm text-text-primary" data-testid="isi-pesan">{d.body}</pre>
        </div>
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">{t.facts}</h3>
          <dl className="space-y-1" data-testid="data-pesan">
            {Object.entries(f).map(([k, v]) => (
              <Baris key={k} label={k}>{teksNilai(v)}</Baris>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">{t.freshness}</h3>
          <p className="text-sm text-text-primary" data-testid="freshness">
            {`${d.freshness.status ?? t.none} · ${d.freshness.aturan ?? t.none}`}
            {d.freshness.buktiRingkas.map((b, i) => (
              <span key={i} className="block text-[11px] font-mono text-text-secondary">{Object.values(b).join(' · ')}</span>
            ))}
          </p>
        </div>
        {d.approval && (
          <div data-testid="approval">
            <h3 className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">{t.approval}</h3>
            <dl className="space-y-1">
              <Baris label={t.status}><span data-testid="approval-status">{d.approval.status}</span></Baris>
              <Baris label={t.expires}>{d.approval.expiresAt ? fmtWaktu(d.approval.expiresAt, lang) : t.none}</Baris>
              {d.approval.decidedAt && <Baris label={t.decided}>{fmtWaktu(d.approval.decidedAt, lang)}</Baris>}
            </dl>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-3" aria-label={t.actions} data-testid="panel-aksi">
        <h3 className="text-sm font-medium text-text-primary">{t.actions}</h3>
        {TERMINAL.has(d.state) && <p className="text-xs text-text-secondary" data-testid="info-terminal">{t.terminal}</p>}
        {perluMuatUlang && <p role="alert" className="text-sm text-status-warning" data-testid="perlu-muat-ulang">{t.reloadFirst}</p>}
        <div className="flex flex-wrap gap-2">
          {ada('PRATINJAU') && (
            <button type="button" className={btnUtama} disabled={kunciAksi} data-aksi="PRATINJAU" onClick={() => void aksi(`${p}/preview`, { snapshotFingerprint: d.snapshotFingerprint })}>{t.preview}</button>
          )}
          {ada('MINTA_APPROVAL') && (
            <button type="button" className={btnUtama} disabled={kunciAksi} data-aksi="MINTA_APPROVAL" onClick={() => void aksi(`${p}/request-approval`, { snapshotFingerprint: d.snapshotFingerprint })}>{t.request}</button>
          )}
          {ada('SETUJUI') && d.approval && (
            <button type="button" className={btnUtama} disabled={kunciAksi} data-aksi="SETUJUI" onClick={() => void aksi(`/approvals/${encodeURIComponent(d.approval!.id)}/approve`, { proposalHash: d.approval!.proposalHash })}>{t.approve}</button>
          )}
          {ada('TOLAK') && d.approval && (
            <button type="button" className={btnBahaya} disabled={kunciAksi} data-aksi="TOLAK" onClick={() => setDialog({ jenis: 'tolak', catatan: '' })}>{t.reject}</button>
          )}
          {ada('BATALKAN') && (
            <button type="button" className={btnBahaya} disabled={kunciAksi} data-aksi="BATALKAN" onClick={() => setDialog({ jenis: 'batal', catatan: '' })}>{t.cancel}</button>
          )}
          {ada('BUAT_REVISI') && d.konteks.signalIds[0] && (
            <button type="button" className={btnKedua} disabled={kunciAksi} data-aksi="BUAT_REVISI" onClick={() => void aksi('', { signalId: d.konteks.signalIds[0], contactId: d.contactId })}>{t.revise}</button>
          )}
        </div>
        {d.aksiTersedia.length === 0 && <p className="text-sm text-text-secondary">{t.noActions}</p>}

        {dialog && (
          <form
            className="space-y-2 rounded border border-border-muted p-3"
            data-testid="dialog-catatan"
            onSubmit={(e) => {
              e.preventDefault()
              if (dialog.jenis === 'tolak' && d.approval) void aksi(`/approvals/${encodeURIComponent(d.approval.id)}/reject`, { proposalHash: d.approval.proposalHash, decisionNote: dialog.catatan })
              else if (dialog.jenis === 'batal') void aksi(`${p}/cancel`, { alasan: dialog.catatan })
            }}
          >
            <label className="block text-xs text-text-secondary">
              {dialog.jenis === 'tolak' ? t.rejectNote : t.cancelNote}
              <textarea className={cn(inputCls, 'mt-1')} rows={3} maxLength={1000} value={dialog.catatan} onChange={(e) => setDialog({ ...dialog, catatan: e.target.value })} autoFocus data-testid="input-catatan" />
            </label>
            <div className="flex gap-2">
              <button type="submit" className={btnBahaya} disabled={kunciAksi} data-testid="tombol-konfirmasi">{t.confirm}</button>
              <button type="button" className={btnKedua} onClick={() => setDialog(null)}>{t.close}</button>
            </div>
          </form>
        )}

        {hasil && <p role="status" className="text-sm text-text-primary" data-testid="hasil-aksi">{`${t.result}: ${hasil}`}</p>}
        {revisiLain && <Link href={`${RUTE_PESAN_KLIEN}/${encodeURIComponent(revisiLain)}`} className="text-sm text-accent-blue hover:underline">{t.openRevision}</Link>}
        {error && <p role="alert" className="rounded border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger" data-testid="galat-aksi">{error}</p>}
      </section>

      <section className="rounded-lg border border-card-border bg-surface/30 p-4 space-y-2" aria-label={t.history}>
        <h3 className="text-sm font-medium text-text-primary">{t.history}</h3>
        <ol className="space-y-1" data-testid="riwayat">
          {riwayat.map((e) => (
            <li key={e.id} className="text-[12px] font-mono text-text-secondary break-words" data-testid="peristiwa" data-peristiwa={e.peristiwa ?? ''}>
              {`${fmtWaktu(e.waktu, lang)} · ${e.objek} · ${e.peristiwa ?? t.none}${e.stateDari || e.stateKe ? ` · ${e.stateDari ?? t.none} → ${e.stateKe ?? t.none}` : ''}${e.alasan ? ` · ${jelaskan(e.alasan, lang)}` : ''} · ${e.aktor.nama ?? t.none}`}
            </li>
          ))}
        </ol>
        {cursor && <button type="button" className={btnKedua} onClick={() => void muatRiwayatLagi()} data-testid="riwayat-lebih">{t.more}</button>}
      </section>
    </div>
  )
}
