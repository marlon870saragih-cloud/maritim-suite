'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const VARIANTS: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  SENT: 'bg-status-success/10 text-status-success border-status-success/20',
  PAID: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20',
  CANCELLED: 'bg-surface-tertiary text-text-secondary border-border-muted',
}
const LABELS: Record<string, string> = {
  DRAFT: 'Draf',
  FINAL: 'Final',
  SENT: 'Terkirim',
  PAID: 'Lunas',
  CANCELLED: 'Batal',
}
const FLOW = ['DRAFT', 'FINAL', 'SENT', 'PAID', 'CANCELLED']

// Badge status dokumen yang bisa diklik untuk mengubah status (PATCH /api/documents/:id).
export function DocStatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [cur, setCur] = useState(status.toUpperCase())
  const [busy, setBusy] = useState(false)

  async function change(next: string) {
    if (next === cur || busy) return
    const prev = cur
    setCur(next) // optimistik
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      setCur(prev)
      alert('Gagal mengubah status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title="Ubah status dokumen"
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border uppercase tracking-wider transition-colors hover:brightness-110 disabled:opacity-60',
            VARIANTS[cur] ?? VARIANTS.DRAFT,
          )}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {LABELS[cur] ?? cur}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {FLOW.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => change(s)}
            className="cursor-pointer text-sm flex items-center justify-between"
          >
            {LABELS[s]}
            {s === cur ? <Check className="w-3.5 h-3.5 text-accent-teal" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
