import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type SofEvent = {
  date: string // "30 Jun 2026"
  time: string // "08:30"
  desc: string
}

export type SofData = {
  tenant: EpdaTenant
  docNumber: string
  vesselName: string
  imo: string
  flag?: string
  port: string
  berth?: string
  operation: string
  cargo: string
  cargoQty?: string
  master?: string
  events: SofEvent[]
  remarks: string
  signRole: string
}

// ====== DATA CONTOH ======
export const SAMPLE_SOF: SofData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'SOF/2026/06/0044',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  berth: 'Jetty 3',
  operation: 'Loading',
  cargo: 'MGO',
  cargoQty: '6,000 KL',
  master: 'Capt. —',
  events: [
    { date: '30 Jun 2026', time: '06:00', desc: 'Vessel arrived at anchorage (EOSP)' },
    { date: '30 Jun 2026', time: '08:30', desc: 'Notice of Readiness tendered' },
    { date: '30 Jun 2026', time: '12:15', desc: 'Pilot on board' },
    { date: '30 Jun 2026', time: '13:40', desc: 'All fast / made fast alongside' },
    { date: '30 Jun 2026', time: '14:30', desc: 'Commenced loading' },
    { date: '01 Jul 2026', time: '02:10', desc: 'Completed loading' },
    { date: '01 Jul 2026', time: '03:30', desc: 'Documents on board, pilot embarked' },
    { date: '01 Jul 2026', time: '04:15', desc: 'Vessel sailed / departure' },
  ],
  remarks: 'No delays attributable to vessel. Weather fine throughout operation.',
  signRole: 'Port Agent',
}
