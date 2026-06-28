import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type NorData = {
  tenant: EpdaTenant
  docNumber: string
  // Kapal
  vesselName: string
  imo: string
  flag?: string
  // Tempat & operasi
  port: string
  berth?: string
  operation: string // 'Loading' | 'Discharging'
  cargo: string
  // Kepada (charterer / receiver / shipper / agent)
  toName: string
  toAttn?: string
  // Waktu
  arrivedDate: string // tiba (EOSP/anchorage) — "30 Jun 2026"
  arrivedTime: string // "08:30 WITA"
  noticeDate: string // NOR di-tender
  noticeTime: string
  masterName: string
  remarks: string
}

// ====== DATA CONTOH ======
export const SAMPLE_NOR: NorData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'NOR/2026/06/0031',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  berth: 'Anchorage area',
  operation: 'Loading',
  cargo: 'MGO 6,000 KL',
  toName: 'PT Soechi Lines Tbk',
  toAttn: 'Operations Department',
  arrivedDate: '30 Jun 2026',
  arrivedTime: '08:30 WITA',
  noticeDate: '30 Jun 2026',
  noticeTime: '09:00 WITA',
  masterName: 'Capt. —',
  remarks:
    'Vessel is in all respects ready to commence loading/discharging of cargo. Laytime to count as per Charter Party terms.',
}
