'use client'

// Approval berjenjang (K42-K44, §12/6-7 docs/FASE-3-EPDA-ENGINE.md) — tombol
// keputusan (bila giliran pengguna sekarang) + riwayat hanya-baca di bawahnya.
// `bolehMemutuskanSekarang` datang dari server (approval.service.ts) — panel
// ini TIDAK PERNAH membandingkan peran sendiri, konsisten dengan aturan
// approval-policy.ts.
//
// Presentational murni (pola sama dengan ServicePickerDialog): fetch & update
// state `disb` tetap dipusatkan di DisbursementBuilder lewat handleMutation,
// supaya cuma ada SATU tempat yang menulis balik hasil server ke UI.

import { useState } from 'react'
import { CheckCircle2, History, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLang, useT, type Lang } from '@/lib/i18n'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Keputusan Approval', historyTitle: 'Riwayat Approval',
    approve: 'Setujui', requestRevision: 'Minta Revisi', reject: 'Tolak',
    notePlaceholder: 'Catatan (opsional)…',
    noHistory: 'Belum ada keputusan.',
    level: 'Level', errSave: 'Gagal menyimpan keputusan.', errConn: 'Gagal terhubung ke server.',
    confirmReject: 'Tolak dokumen ini? Status menjadi CANCELLED.',
  },
  en: {
    title: 'Approval Decision', historyTitle: 'Approval History',
    approve: 'Approve', requestRevision: 'Request Revision', reject: 'Reject',
    notePlaceholder: 'Note (optional)…',
    noHistory: 'No decisions yet.',
    level: 'Level', errSave: 'Failed to save decision.', errConn: 'Failed to connect to server.',
    confirmReject: 'Reject this document? Status becomes CANCELLED.',
  },
}

/** Terpisah dari STR (yang harus flat Record<string,string> untuk useT) — lihat DisbursementBuilder.tsx pola TARGET_LABEL yang sama. */
const DECISION_LABEL: Record<Lang, Record<string, string>> = {
  id: { APPROVED: 'Disetujui', REJECTED: 'Ditolak', REQUEST_REVISION: 'Minta Revisi' },
  en: { APPROVED: 'Approved', REJECTED: 'Rejected', REQUEST_REVISION: 'Revision Requested' },
}

const DECISION_COLOR: Record<string, string> = {
  APPROVED: 'bg-status-success/12 text-status-success border-status-success/30',
  REJECTED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
  REQUEST_REVISION: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
}

export type ApprovalRow = {
  id: string
  level: number
  userName: string | null
  userRole: string | null
  decision: string
  note: string | null
  createdAt: string
}

const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID')

export function ApprovalPanel({
  approvals,
  levelTarget,
  bolehMemutuskanSekarang,
  busy,
  error,
  onDecide,
}: {
  approvals: ApprovalRow[]
  levelTarget: number | null
  bolehMemutuskanSekarang: boolean
  busy: string | null
  error: string
  onDecide: (decision: 'APPROVED' | 'REJECTED' | 'REQUEST_REVISION', note: string) => void
}) {
  const t = useT(STR)
  const { lang } = useLang()
  const [note, setNote] = useState('')

  function decide(decision: 'APPROVED' | 'REJECTED' | 'REQUEST_REVISION') {
    if (decision === 'REJECTED' && !confirm(t.confirmReject)) return
    onDecide(decision, note)
    setNote('')
  }

  return (
    <div className="space-y-4">
      {bolehMemutuskanSekarang && levelTarget !== null && (
        <section className="bg-card-bg border border-card-border rounded-lg p-5 space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
            {t.title} — {t.level} {levelTarget}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
            rows={2}
            className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-none"
          />
          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => decide('APPROVED')}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium bg-status-success/90 hover:bg-status-success text-[#06231a] transition-colors disabled:opacity-50"
            >
              {busy === 'APPROVED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {t.approve}
            </button>
            <button
              type="button"
              onClick={() => decide('REQUEST_REVISION')}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium border border-accent-amber/50 text-accent-amber hover:bg-accent-amber/10 transition-colors disabled:opacity-50"
            >
              {busy === 'REQUEST_REVISION' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {t.requestRevision}
            </button>
            <button
              type="button"
              onClick={() => decide('REJECTED')}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded px-3.5 py-2 text-sm font-medium border border-status-danger/40 text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50"
            >
              {busy === 'REJECTED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              {t.reject}
            </button>
          </div>
        </section>
      )}

      {approvals.length > 0 && (
        <section className="bg-card-bg border border-card-border rounded-lg p-5">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> {t.historyTitle}
          </p>
          <ul className="space-y-2.5">
            {approvals.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 text-sm border-b border-card-border/40 pb-2.5 last:border-0 last:pb-0">
                <div>
                  <p className="text-text-primary">
                    {a.userName ?? '—'}
                    {a.userRole && <span className="text-text-secondary"> · {a.userRole}</span>}
                    <span className="text-text-secondary"> · {t.level} {a.level}</span>
                  </p>
                  {a.note && <p className="text-text-secondary text-xs mt-0.5">{a.note}</p>}
                  <p className="text-text-secondary text-[10px] font-mono mt-0.5">{fmtDate(a.createdAt)}</p>
                </div>
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full border font-mono uppercase tracking-wider whitespace-nowrap',
                    DECISION_COLOR[a.decision] ?? DECISION_COLOR.APPROVED,
                  )}
                >
                  {DECISION_LABEL[lang][a.decision] ?? a.decision}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
