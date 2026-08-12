'use client'

// "Buat Revisi" (K37, §12/6 docs/FASE-3-EPDA-ENGINE.md) — dialog kecil, bukan
// halaman sendiri: hanya dua input (alasan revisi wajib, sakelar segarkan
// tarif & kurs mati bawaan). Sesudah berhasil, operator diarahkan langsung ke
// builder versi barunya (DRAFT, siap diedit).

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Buat Revisi',
    desc: 'Versi baru (DRAFT) dibuat dari dokumen ini. Dokumen sekarang tidak berubah — bisa diunduh apa adanya kapan pun.',
    noteLabel: 'Alasan revisi (wajib)',
    notePlaceholder: 'mis. ETD bergeser, satu jasa dibatalkan…',
    refreshLabel: 'Segarkan tarif & kurs',
    refreshDesc: 'Ambil ulang tarif & kurs terkini untuk baris dari katalog. Mati = semua baris disalin persis apa adanya.',
    cancel: 'Batal',
    submit: 'Buat Revisi',
    errNote: 'Alasan revisi wajib diisi.',
    errSave: 'Gagal membuat revisi.',
    errConn: 'Gagal terhubung ke server.',
  },
  en: {
    title: 'Create Revision',
    desc: 'A new version (DRAFT) is created from this document. This document does not change — still downloadable as-is anytime.',
    noteLabel: 'Revision reason (required)',
    notePlaceholder: 'e.g. ETD shifted, one service cancelled…',
    refreshLabel: 'Refresh rate & FX',
    refreshDesc: 'Re-fetch current catalog rate & exchange rate for catalog lines. Off = every line copied exactly as-is.',
    cancel: 'Cancel',
    submit: 'Create Revision',
    errNote: 'Revision reason is required.',
    errSave: 'Failed to create revision.',
    errConn: 'Failed to connect to server.',
  },
}

export function RevisionDialog({
  open,
  onOpenChange,
  disbursementId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  disbursementId: string
  onCreated: (newId: string) => void
}) {
  const t = useT(STR)
  const [note, setNote] = useState('')
  const [refresh, setRefresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!note.trim()) {
      setError(t.errNote)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/disbursements/${disbursementId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionNote: note, segarkanTarifKurs: refresh }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errSave)
        return
      }
      const body = await res.json()
      setNote('')
      setRefresh(false)
      onCreated(body.disbursement.id)
    } catch {
      setError(t.errConn)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-text-secondary mb-1">
              {t.noteLabel}
            </label>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
              rows={3}
              className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={refresh}
              onChange={(e) => setRefresh(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm text-text-primary">{t.refreshLabel}</span>
              <span className="block text-xs text-text-secondary">{t.refreshDesc}</span>
            </span>
          </label>

          {error && (
            <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="px-3.5 py-1.5 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t.submit}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
