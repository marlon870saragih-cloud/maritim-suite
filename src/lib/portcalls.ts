// Parser & tipe field port call — dipakai bersama oleh route POST & PATCH /api/portcalls.

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v)
  const t = v.trim()
  return t === '' ? null : t
}
const date = (v: unknown): Date | null => {
  const s = str(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export const PORTCALL_STATUS = ['UPCOMING', 'IN_PORT', 'DEPARTED', 'CANCELLED'] as const
export type PortCallStatusStr = (typeof PORTCALL_STATUS)[number]

export const STATUS_LABEL: Record<PortCallStatusStr, string> = {
  UPCOMING: 'Akan Tiba',
  IN_PORT: 'Di Pelabuhan',
  DEPARTED: 'Berangkat',
  CANCELLED: 'Batal',
}

export type PortCallInput = {
  vesselId: string
  principalId: string | null
  port: string
  portCode: string | null
  eta: Date | null
  etd: Date | null
  cargo: string | null
  cargoQty: string | null
  cargoUnit: string | null
  status: PortCallStatusStr
  notes: string | null
}

/** Ambil & rapikan field port call dari body request. */
export function portCallFields(body: Record<string, unknown>): PortCallInput {
  const status = str(body.status)
  return {
    vesselId: str(body.vesselId) ?? '',
    principalId: str(body.principalId),
    port: str(body.port) ?? '',
    portCode: str(body.portCode),
    eta: date(body.eta),
    etd: date(body.etd),
    cargo: str(body.cargo),
    cargoQty: str(body.cargoQty),
    cargoUnit: str(body.cargoUnit),
    status:
      status && (PORTCALL_STATUS as readonly string[]).includes(status)
        ? (status as PortCallStatusStr)
        : 'UPCOMING',
    notes: str(body.notes),
  }
}
