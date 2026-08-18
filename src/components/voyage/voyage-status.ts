// Konstanta status voyage dipakai bersama daftar voyage & Voyage Workspace —
// warna badge harus sama di kedua tempat, jadi tinggal satu sumber.

import type { CargoRow } from './VoyageCargoPanel'
import type { VoyagePortCallRow } from './VoyagePortCallPanel'

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

// ------------------------------------------------------------------------
// K130/Fase 7g — WorkspaceVoyage + particularsForm() DIPINDAH ke sini (dari
// VoyageWorkspace.tsx) supaya VoyageEventDialog.tsx bisa memakainya tanpa
// impor melingkar (VoyageWorkspace → VoyageEventDialog → VoyageWorkspace).
// Berkas ini sudah murni/tanpa-DB, jadi tempat yang tepat untuk bentuk data
// bersama.

export type WorkspaceVoyage = {
  id: string
  voyageNumber: string
  status: VoyageStatusStr
  vesselId: string
  principalId: string | null
  customerId: string | null
  portId: string | null
  agencyType: string | null
  baseCurrency: string
  notes: string | null
  eta: string | Date | null
  etb: string | Date | null
  etc: string | Date | null
  etd: string | Date | null
  ata: string | Date | null
  atb: string | Date | null
  atd: string | Date | null
  vessel: { id: string; name: string; imoNumber: string | null } | null
  principal: { id: string; name: string } | null
  customer: { id: string; name: string } | null
  port: { id: string; name: string; unlocode: string | null } | null
  cargoes: CargoRow[]
  portCalls: VoyagePortCallRow[]
}

const toDateInput = (d: string | Date | null) => {
  if (!d) return ''
  const v = new Date(d)
  return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
}

/** Bentuk penuh form particulars — PATCH /api/voyages/:id membaca SELURUH field ini (lihat gotcha di VoyageWorkspace.tsx submit()). */
export function particularsForm(v: WorkspaceVoyage) {
  return {
    vesselId: v.vesselId,
    principalId: v.principalId ?? '',
    customerId: v.customerId ?? '',
    portId: v.portId ?? '',
    agencyType: v.agencyType ?? '',
    baseCurrency: v.baseCurrency,
    notes: v.notes ?? '',
    eta: toDateInput(v.eta),
    etb: toDateInput(v.etb),
    etc: toDateInput(v.etc),
    etd: toDateInput(v.etd),
    ata: toDateInput(v.ata),
    atb: toDateInput(v.atb),
    atd: toDateInput(v.atd),
  }
}
