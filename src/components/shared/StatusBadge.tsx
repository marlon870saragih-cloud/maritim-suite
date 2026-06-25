import { cn } from '@/lib/utils'

// Variant warna berdasarkan status chip dari Stitch DESIGN.md
const VARIANTS: Record<string, string> = {
  DRAFT: 'bg-surface-tertiary text-text-secondary border-border-muted',
  FINAL: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  SENT: 'bg-status-success/10 text-status-success border-status-success/20',
  PAID: 'bg-accent-teal/10 text-accent-teal border-accent-teal/20',
  OVERDUE: 'bg-status-danger/10 text-status-danger border-status-danger/20',
  CANCELLED: 'bg-surface-tertiary text-text-secondary border-border-muted',
}

// Label tampil dalam Bahasa Indonesia
const LABELS: Record<string, string> = {
  DRAFT: 'Draf',
  FINAL: 'Final',
  SENT: 'Terkirim',
  PAID: 'Lunas',
  OVERDUE: 'Jatuh Tempo',
  CANCELLED: 'Batal',
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 rounded text-xs font-mono border uppercase tracking-wider',
        VARIANTS[key] ?? VARIANTS.DRAFT
      )}
    >
      {LABELS[key] ?? status}
    </span>
  )
}
