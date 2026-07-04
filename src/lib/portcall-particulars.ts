// Memetakan satu Port Call (+ kapal & principal) menjadi partikular dokumen.
// Inti Fase 3 "isi sekali, dipakai di mana-mana": data kapal/principal/call yang
// sudah diisi di Port Call dipakai ulang untuk prefill EPDA/FPDA & Invoice.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Tanggal → "30 Jun 2026" (UTC, selaras format EPDA). String kosong bila null. */
export function fmtDocDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return ''
  return `${String(dt.getUTCDate()).padStart(2, '0')} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`
}

const fmtNum = (n: number | null | undefined): string =>
  n == null ? '' : n.toLocaleString('en-US')

const fmtMeter = (n: number | null | undefined): string => (n == null ? '' : `${n} m`)

// Bentuk minimal record yang dibutuhkan mapper (subset relasi Prisma).
export type PortCallForDoc = {
  port: string
  portCode: string | null
  eta: Date | string | null
  etd: Date | string | null
  cargo: string | null
  cargoQty: string | null
  cargoUnit: string | null
  vessel: {
    name: string
    imoNumber: string | null
    flag: string | null
    vesselType: string | null
    callSign: string | null
    gt: number | null
    nrt: number | null
    loa: number | null
    maxDraft: number | null
  } | null
  principal: {
    name: string
    address: string | null
    npwp: string | null
    contactPerson: string | null
  } | null
}

/** Gabung kargo + jumlah + satuan → "Coal — 50,000 MT". */
function cargoLine(pc: PortCallForDoc): string {
  const qty = [pc.cargoQty, pc.cargoUnit].filter(Boolean).join(' ').trim()
  return [pc.cargo, qty].filter(Boolean).join(' — ')
}

/** Partikular untuk EPDA/FPDA (DisbursementForm). Semua nilai string siap pakai. */
export function portCallToParticulars(pc: PortCallForDoc) {
  const v = pc.vessel
  return {
    vesselName: v?.name ?? '',
    principal: pc.principal?.name ?? '',
    imo: v?.imoNumber ?? '',
    flag: v?.flag ?? '',
    vesselType: v?.vesselType ?? '',
    callSign: v?.callSign ?? '',
    port: pc.port ?? '',
    portCode: pc.portCode ?? '',
    gt: fmtNum(v?.gt),
    nrt: fmtNum(v?.nrt),
    eta: fmtDocDate(pc.eta),
    etd: fmtDocDate(pc.etd),
    loa: fmtMeter(v?.loa),
    draft: fmtMeter(v?.maxDraft),
    cargo: cargoLine(pc),
  }
}

/**
 * Partikular untuk SPK (SpkForm). Hanya field yang ada di Port Call: kapal,
 * GT/NRT, cargo, tanggal & port muat, principal. Pihak sub-agen (toCompany/
 * toContact/dst.) TIDAK ada di Port Call → tetap diisi manual.
 */
export function portCallToSpk(pc: PortCallForDoc) {
  const v = pc.vessel
  const gtNrt = [fmtNum(v?.gt), fmtNum(v?.nrt)].filter(Boolean).join(' / ')
  const loadPort = [pc.port, pc.portCode ? `(${pc.portCode})` : ''].filter(Boolean).join(' ')
  return {
    vesselName: v?.name ?? '',
    gtNrt,
    cargo: cargoLine(pc),
    loadingDate: fmtDocDate(pc.eta),
    loadPort,
    principal: pc.principal?.name ?? '',
  }
}

/** Header untuk Invoice (InvoiceForm). Bill-to dari principal, vessel dari kapal. */
export function portCallToInvoiceHead(pc: PortCallForDoc) {
  const callRef = [
    [pc.port, pc.portCode ? `(${pc.portCode})` : ''].filter(Boolean).join(' '),
    pc.eta ? `ETA ${fmtDocDate(pc.eta)}` : '',
  ]
    .filter(Boolean)
    .join(' — ')
  return {
    billToName: pc.principal?.name ?? '',
    billToAddress: pc.principal?.address ?? '',
    billToNpwp: pc.principal?.npwp ?? '',
    billToAttn: pc.principal?.contactPerson ?? '',
    vesselVoyage: pc.vessel?.name ?? '',
    portCall: callRef,
  }
}
