// Konstanta status voyage dipakai bersama daftar voyage & Voyage Workspace —
// warna badge harus sama di kedua tempat, jadi tinggal satu sumber.

export const VOYAGE_STATUSES = [
  'PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING', 'COMPLETED', 'DEPARTED', 'CLOSED', 'CANCELLED',
] as const
export type VoyageStatusStr = (typeof VOYAGE_STATUSES)[number]

/**
 * Urutan normal lifecycle. CANCELLED sengaja DI LUAR daftar ini: ia bisa terjadi
 * kapan saja dan bukan "tahap berikutnya" dari mana pun.
 */
export const VOYAGE_LIFECYCLE = [
  'PLANNED', 'CONFIRMED', 'ARRIVED', 'BERTHED', 'WORKING', 'COMPLETED', 'DEPARTED', 'CLOSED',
] as const satisfies readonly VoyageStatusStr[]

export const VOYAGE_STATUS_COLOR: Record<VoyageStatusStr, string> = {
  PLANNED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CONFIRMED: 'bg-accent-blue/12 text-accent-blue border-accent-blue/30',
  ARRIVED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  BERTHED: 'bg-accent-teal/12 text-accent-teal border-accent-teal/30',
  WORKING: 'bg-accent-amber/12 text-accent-amber border-accent-amber/30',
  COMPLETED: 'bg-status-success/12 text-status-success border-status-success/30',
  DEPARTED: 'bg-status-success/12 text-status-success border-status-success/30',
  CLOSED: 'bg-surface-tertiary text-text-secondary border-border-muted',
  CANCELLED: 'bg-status-danger/12 text-status-danger border-status-danger/30',
}

/** Status sesudah `status` pada jalur normal; null bila sudah CLOSED / di luar jalur (CANCELLED). */
export function nextVoyageStatus(status: VoyageStatusStr): VoyageStatusStr | null {
  const i = (VOYAGE_LIFECYCLE as readonly VoyageStatusStr[]).indexOf(status)
  if (i === -1) return null
  return (VOYAGE_LIFECYCLE as readonly VoyageStatusStr[])[i + 1] ?? null
}
