'use client'

// "Terapkan checklist" (K95 pintu 2, Fase 7d). Memilih TaskTemplate (atau
// membiarkan API memilih otomatis lewat skor K93 — pilihTemplate() di
// task-template-match.ts, dipanggil SERVER, tidak ditiru di sini) lalu
// menerapkannya ke voyage ini. Hasil "N dibuat, M sudah ada" datang APA ADANYA
// dari respons API (task-template.service.ts → terapkanChecklist) — bukan
// dihitung ulang di klien.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ListChecks } from 'lucide-react'
import { useT, type Lang } from '@/lib/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { TaskRow } from './task-shared'

const STR: Record<Lang, Record<string, string>> = {
  id: {
    title: 'Terapkan Checklist', desc: 'Pilih checklist untuk diterapkan ke voyage ini, atau biarkan sistem memilih otomatis (sesuai pelabuhan/jenis keagenan/jenis kapal).',
    auto: '— pilih otomatis (rekomendasi sistem) —', apply: 'Terapkan', cancel: 'Tutup', applying: 'Menerapkan…',
    loading: 'Memuat daftar checklist…', empty: 'Belum ada checklist yang dibuat. Kelola di Settings › Checklist Tugas.',
    errLoad: 'Gagal memuat daftar checklist.', errApply: 'Gagal menerapkan checklist.', errConn: 'Gagal terhubung ke server.',
    items: 'butir', done: 'Selesai', doneTitle: 'Checklist diterapkan',
  },
  en: {
    title: 'Apply Checklist', desc: "Pick a checklist to apply to this voyage, or let the system auto-select (by port/agency type/vessel type).",
    auto: '— auto-select (system recommendation) —', apply: 'Apply', cancel: 'Close', applying: 'Applying…',
    loading: 'Loading checklists…', empty: 'No checklists created yet. Manage them under Settings › Task Checklists.',
    errLoad: 'Failed to load checklists.', errApply: 'Failed to apply checklist.', errConn: 'Failed to connect to server.',
    items: 'items', done: 'Done', doneTitle: 'Checklist applied',
  },
}

type TemplateOption = { id: string; name: string; items: { id: string }[] }
type ApplyResult = { dibuat: number; sudahAda: number; pesan: string }

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  voyageId,
  onApplied,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  voyageId: string
  onApplied: (result: { dibuat: number; sudahAda: number; pesan: string; tugasBaru?: TaskRow[] }) => void
}) {
  const t = useT(STR)
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ApplyResult | null>(null)

  useEffect(() => {
    if (!open) return
    let batal = false
    setLoading(true)
    setError('')
    setResult(null)
    setTemplateId('')
    fetch('/api/task-templates')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: TemplateOption[]) => {
        if (!batal) setTemplates(data)
      })
      .catch(() => !batal && setError(t.errLoad))
      .finally(() => !batal && setLoading(false))
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function apply() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/voyages/${voyageId}/tasks/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: templateId || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? t.errApply)
        return
      }
      const body = await res.json()
      onApplied(body)
      // Respons "N dibuat, M sudah ada" (K95) TETAP tampil di dialog sebelum
      // ditutup — router.refresh() menyegarkan daftar tugas di baliknya, tapi
      // operator tetap perlu MELIHAT pesannya, bukan cuma dialog yang lenyap.
      setResult({ dibuat: body.dibuat, sudahAda: body.sudahAda, pesan: body.pesan })
      router.refresh()
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
          <DialogTitle className="font-display text-white flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-accent-blue" /> {t.title}
          </DialogTitle>
          <DialogDescription className="text-text-secondary">{t.desc}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center text-center gap-2 py-4">
            <CheckCircle2 className="w-8 h-8 text-status-success" />
            <p className="text-white text-sm font-medium">{t.doneTitle}</p>
            <p className="text-text-secondary text-sm">{result.pesan}</p>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="text-text-secondary text-sm flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> {t.loading}
              </p>
            ) : templates && templates.length === 0 ? (
              <p className="text-text-secondary text-sm py-4">{t.empty}</p>
            ) : (
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full bg-surface border border-border-muted rounded px-2.5 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
              >
                <option value="">{t.auto}</option>
                {templates?.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.items.length} {t.items})
                  </option>
                ))}
              </select>
            )}

            {error && (
              <p className="text-status-danger text-xs bg-status-danger/10 border border-status-danger/30 rounded px-3 py-2">
                {error}
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {result ? (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors"
            >
              {t.done}
            </button>
          ) : (
            <>
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
                onClick={apply}
                disabled={busy || loading || (templates !== null && templates.length === 0)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-medium bg-accent-blue hover:bg-primary text-[#231a06] transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? t.applying : t.apply}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
