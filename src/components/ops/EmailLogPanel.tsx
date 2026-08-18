'use client'

// Riwayat Email (K136-K138, Fase 7h) — baca saja + "Tandai terkirim"/tandai
// balasan. Baris DRAFTED lahir OTOMATIS dari EmailDraftDialog.tsx (K137);
// panel ini tidak punya cara menulis baris baru sendiri.

import { useEffect, useState } from 'react'
import { Check, Loader2, Mail, MailCheck } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import type { EntityType } from '@/services/ops/owner-guard'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Riwayat Email',
    empty: 'Belum ada draft email dibuat.',
    to: 'Kepada',
    markSent: 'Tandai terkirim', markNoResponse: 'Tandai tanpa balasan', markReplied: 'Tandai dibalas',
    status_DRAFTED: 'Draft', status_SENT_MANUAL: 'Terkirim (manual)', status_NO_RESPONSE: 'Tanpa balasan', status_REPLIED: 'Dibalas',
    sentAt: 'dikirim', errUpdate: 'Gagal memperbarui.', errConn: 'Gagal terhubung ke server.',
  },
  en: {
    title: 'Email History',
    empty: 'No email drafts yet.',
    to: 'To',
    markSent: 'Mark sent', markNoResponse: 'Mark no response', markReplied: 'Mark replied',
    status_DRAFTED: 'Draft', status_SENT_MANUAL: 'Sent (manual)', status_NO_RESPONSE: 'No response', status_REPLIED: 'Replied',
    sentAt: 'sent', errUpdate: 'Failed to update.', errConn: 'Failed to connect to server.',
  },
}

type EmailLogRow = {
  id: string
  template: string | null
  toAddress: string | null
  subject: string
  status: 'DRAFTED' | 'SENT_MANUAL' | 'NO_RESPONSE' | 'REPLIED'
  sentAt: string | null
  createdAt: string
}

const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function EmailLogPanel({ entityType, entityId, refreshKey }: { entityType: EntityType; entityId: string; refreshKey?: number }) {
  const t = useT(STR)
  const [rows, setRows] = useState<EmailLogRow[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setError('')
    try {
      const res = await fetch(`/api/email-logs?entityType=${entityType}&entityId=${entityId}`)
      if (!res.ok) {
        setError(t.errConn)
        return
      }
      setRows(await res.json())
    } catch {
      setError(t.errConn)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, refreshKey])

  async function tandai(id: string, status: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/email-logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error?.message ?? t.errUpdate)
        return
      }
      await load()
    } catch {
      alert(t.errConn)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
        <Mail className="w-3.5 h-3.5" /> {t.title} {rows && rows.length > 0 ? `(${rows.length})` : ''}
      </p>

      {error && <p className="text-status-danger text-xs">{error}</p>}

      {rows && rows.length === 0 ? (
        <p className="text-text-secondary text-sm">{t.empty}</p>
      ) : rows ? (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="border border-card-border/50 rounded-md px-3 py-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-text-primary truncate">{e.subject}</p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    {t.to}: {e.toAddress ?? '—'} · {fmt(e.createdAt)}
                    {e.sentAt && ` · ${t.sentAt} ${fmt(e.sentAt)}`}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-border-muted text-text-secondary">
                  {(t as Record<string, string>)['status_' + e.status]}
                </span>
              </div>

              {e.status === 'DRAFTED' && (
                <button
                  type="button"
                  onClick={() => tandai(e.id, 'SENT_MANUAL')}
                  disabled={busyId === e.id}
                  className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
                >
                  {busyId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {t.markSent}
                </button>
              )}
              {e.status === 'SENT_MANUAL' && (
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => tandai(e.id, 'REPLIED')}
                    disabled={busyId === e.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                  >
                    <MailCheck className="w-3.5 h-3.5" /> {t.markReplied}
                  </button>
                  <button
                    type="button"
                    onClick={() => tandai(e.id, 'NO_RESPONSE')}
                    disabled={busyId === e.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
                  >
                    {t.markNoResponse}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
