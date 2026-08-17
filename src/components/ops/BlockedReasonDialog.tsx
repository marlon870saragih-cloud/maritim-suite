'use client'

// Dialog kecil "alasan BLOCKED", dipakai bersama TaskBoard (drag ke kolom
// Macet) dan TaskList/TaskStatusMenu (ganti status lewat dropdown) — satu
// tempat untuk aturan K91 "BLOCKED wajib alasan tak kosong", supaya tombol
// Konfirmasi cuma aktif kalau alasannya benar-benar terisi (bukan muncul lalu
// ditolak server).

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
    title: 'Alasan macet (BLOCKED)',
    desc: 'Status BLOCKED wajib disertai alasan — kolom macet tanpa alasan tidak pernah dibaca siapa pun.',
    placeholder: 'mis. menunggu dokumen dari principal…',
    cancel: 'Batal',
    confirm: 'Pindahkan ke Macet',
  },
  en: {
    title: 'Blocked reason',
    desc: 'BLOCKED status requires a reason — a stuck column with no reason never gets read by anyone.',
    placeholder: 'e.g. waiting on documents from principal…',
    cancel: 'Cancel',
    confirm: 'Move to Blocked',
  },
}

export function BlockedReasonDialog({
  open,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean
  reason: string
  onReasonChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const t = useT(STR)
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && !o && onCancel()}>
      <DialogContent className="bg-surface-secondary border-card-border text-text-primary max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-white">{t.title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={t.placeholder}
          rows={3}
          className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40 resize-none"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-1.5 rounded text-xs font-medium border border-border-muted text-text-secondary hover:text-white hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-status-danger/90 hover:bg-status-danger text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t.confirm}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
