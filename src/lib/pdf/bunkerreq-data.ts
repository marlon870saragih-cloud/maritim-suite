import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Satu baris permintaan bunker (per grade).
export type BunkerLine = {
  grade: string // VLSFO / MGO / HSFO / B30 …
  quantityMt: number // jumlah (MT)
  sulphurPct: string // spesifikasi sulphur % m/m
  unitPrice: number // harga per MT (opsional, 0 = sembunyikan harga)
}

export type BunkerReqData = {
  tenant: EpdaTenant
  docNumber: string
  date: string
  currency: string
  // Kapal
  vesselName: string
  imo: string
  flag?: string
  port: string
  // Pemasok & pengiriman
  supplierName: string
  supplierAttn?: string
  deliveryDate: string // ETA bunkering
  deliveryMode: string // Barge / Pipeline / Truck
  deliveryPoint: string // alongside / anchorage / berth
  // Permintaan
  lines: BunkerLine[]
  requestedBy: string
  terms: string
  remarks: string
}

export const bunkerLineAmount = (l: BunkerLine) => Math.round((l.quantityMt || 0) * (l.unitPrice || 0))
export const bunkerTotal = (d: BunkerReqData) => (d.lines ?? []).reduce((s, l) => s + bunkerLineAmount(l), 0)
export const bunkerTotalMt = (d: BunkerReqData) => (d.lines ?? []).reduce((s, l) => s + (l.quantityMt || 0), 0)

// ====== DATA CONTOH ======
export const SAMPLE_BUNKERREQ: BunkerReqData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'BRQ/2026/06/0111',
  date: '28 Jun 2026',
  currency: 'IDR',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  supplierName: 'PT Pertamina Patra Niaga',
  supplierAttn: 'Marine Fuel Sales',
  deliveryDate: '30 Jun 2026, 16:00 WITA',
  deliveryMode: 'Barge',
  deliveryPoint: 'Alongside at anchorage',
  lines: [
    { grade: 'VLSFO (max 0.50% S)', quantityMt: 300, sulphurPct: '0.50', unitPrice: 8_500_000 },
    { grade: 'MGO (DMA, max 0.10% S)', quantityMt: 50, sulphurPct: '0.10', unitPrice: 11_200_000 },
  ],
  requestedBy: 'Port Agent',
  terms:
    'Mohon konfirmasi ketersediaan, harga, dan jadwal bunkering. Sertakan sertifikat kualitas (CoQ) & MARPOL sample saat serah terima.',
  remarks: 'Permintaan atas nama Owners. BDN akan diterbitkan saat serah terima.',
}
