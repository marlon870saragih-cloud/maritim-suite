// Helper pelacak piutang (DA & Invoice Tracker): parse tanggal dokumen & bucket aging.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse "14 Jul 2026" → Date (UTC). null bila gagal. */
export function parseDocDate(s?: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/.exec(s.trim())
  if (!m) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const mon = MONTHS.indexOf(m[2].slice(0, 3))
  if (mon < 0) return null
  return new Date(Date.UTC(+m[3], mon, +m[1]))
}

export type AgingKey = 'current' | 'd30' | 'd60' | 'd90' | 'd90p'

export const AGING: { key: AgingKey; label: string; min: number; max: number }[] = [
  { key: 'current', label: 'Belum jatuh tempo', min: -Infinity, max: 0 },
  { key: 'd30', label: '1–30 hari', min: 1, max: 30 },
  { key: 'd60', label: '31–60 hari', min: 31, max: 60 },
  { key: 'd90', label: '61–90 hari', min: 61, max: 90 },
  { key: 'd90p', label: '> 90 hari', min: 91, max: Infinity },
]

/** Hitung hari lewat jatuh tempo (negatif = belum jatuh tempo). */
export function overdueDays(due: Date | null, now: Date): number {
  if (!due) return 0
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000)
}

export function bucketFor(days: number): AgingKey {
  for (const b of AGING) if (days >= b.min && days <= b.max) return b.key
  return 'current'
}
