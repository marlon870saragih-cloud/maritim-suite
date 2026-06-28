import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type BdnData = {
  tenant: EpdaTenant
  docNumber: string
  deliveryDate: string // tanggal & waktu serah
  currency: string
  // Kapal penerima
  vesselName: string
  imo: string
  flag?: string
  port: string
  // Pemasok & sarana antar
  supplier: string
  bargeName?: string // tongkang / truk pengirim
  // Spesifikasi produk (MARPOL Annex VI)
  productGrade: string // MGO / HSFO / VLSFO / B30 …
  quantityMt: number // jumlah (MT)
  density15: string // kg/m³ at 15°C
  viscosity?: string // cSt @ 50°C
  sulphurPct: string // % m/m
  flashPoint?: string // °C
  waterPct?: string // % v/v
  pourPoint?: string // °C
  // Nilai (opsional — 0 menyembunyikan blok harga)
  pricePerMt: number
  // Serah terima
  remarks: string
  receiverName?: string // chief engineer / master penerima
  signRole: string
}

export const bdnAmount = (d: BdnData) => Math.round((d.quantityMt || 0) * (d.pricePerMt || 0))

// ====== DATA CONTOH ======
export const SAMPLE_BDN: BdnData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'BDN/2026/06/0027',
  deliveryDate: '22 Jun 2026, 14:30 WITA',
  currency: 'IDR',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  supplier: 'PT Tribuana Solusi Maritim',
  bargeName: 'TB Bahari 07 / TK Tribuana 12',
  productGrade: 'MGO (Marine Gas Oil)',
  quantityMt: 150.0,
  density15: '860.5',
  viscosity: '3.8',
  sulphurPct: '0.10',
  flashPoint: '64',
  waterPct: '0.02',
  pourPoint: '-6',
  pricePerMt: 11_500_000,
  remarks:
    'Bunker diserahkan dalam keadaan baik & sesuai spesifikasi. Sampel tersegel diserahkan ke kapal (MARPOL Annex VI Reg. 18).',
  receiverName: 'Chief Engineer',
  signRole: 'Supplier Representative',
}
