import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type CargoItem = {
  blNo: string // No. Bill of Lading
  marks: string // marks & numbers
  packages: string // jumlah & jenis kemasan
  description: string // uraian barang
  weight: string // berat kotor
}

export type CargoDeclData = {
  tenant: EpdaTenant
  docNumber: string
  vesselName: string
  imo: string
  flag?: string
  port: string
  mode: string // 'Loading' | 'Discharging'
  voyage?: string
  master: string
  portOfLoading: string
  portOfDischarge: string
  items: CargoItem[]
  remarks: string
  signRole: string
}

// ====== DATA CONTOH (IMO FAL Form 2 — Cargo Declaration) ======
export const SAMPLE_CARGO: CargoDeclData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'CD/2026/06/0085',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  mode: 'Loading',
  voyage: 'V.118',
  master: 'Capt. Bambang S.',
  portOfLoading: 'Samarinda',
  portOfDischarge: 'Surabaya',
  items: [
    { blNo: 'SBY/001', marks: 'N/M', packages: 'In bulk', description: 'Marine Gas Oil (MGO)', weight: '5,100 MT' },
    { blNo: 'SBY/002', marks: 'N/M', packages: 'In bulk', description: 'Marine Gas Oil (MGO)', weight: '900 MT' },
  ],
  remarks: 'Cargo loaded in bulk into vessel tanks. Quantity as per shore figure / ullage report.',
  signRole: 'Port Agent',
}
