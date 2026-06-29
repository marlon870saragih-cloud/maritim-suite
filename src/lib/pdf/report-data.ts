import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

// Laporan pergerakan kapal: Arrival & Departure Report berbagi struktur, beda "kind".
export type ReportKind = 'ARRIVAL' | 'DEPARTURE'

export type ReportEvent = {
  date: string // "30 Jun 2026"
  time: string // "08:30"
  desc: string
}

export type ReportData = {
  tenant: EpdaTenant
  kind: ReportKind
  docNumber: string
  // Kapal
  vesselName: string
  imo: string
  flag?: string
  // Tempat
  port: string
  berth?: string
  otherPort?: string // arrival: pelabuhan asal; departure: pelabuhan tujuan
  voyageNo?: string
  // Kepada (principal/owner/charterer)
  toName: string
  toAttn?: string
  // Kargo & waktu
  cargo: string
  cargoQty?: string
  events: ReportEvent[]
  masterName: string
  remarks: string
}

// Label & teks per jenis laporan (dipakai dokumen PDF & form).
export const REPORT_META: Record<ReportKind, { title: string; otherPortLabel: string; intro: string }> = {
  ARRIVAL: {
    title: 'ARRIVAL REPORT',
    otherPortLabel: 'Last Port',
    intro: 'has arrived at the port and completed her inward movement as detailed below.',
  },
  DEPARTURE: {
    title: 'DEPARTURE REPORT',
    otherPortLabel: 'Next Port',
    intro: 'has completed cargo operations and departed the port as detailed below.',
  },
}

// ====== DATA CONTOH ======
export const SAMPLE_ARRIVAL: ReportData = {
  tenant: SAMPLE_EPDA.tenant,
  kind: 'ARRIVAL',
  docNumber: 'AR/2026/06/0051',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  berth: 'Jetty 3',
  otherPort: 'Balikpapan',
  voyageNo: 'V.118',
  toName: 'PT Soechi Lines Tbk',
  toAttn: 'Operations Department',
  cargo: 'MGO',
  cargoQty: '6,000 KL',
  events: [
    { date: '30 Jun 2026', time: '06:00', desc: 'End of Sea Passage (EOSP) / arrived at anchorage' },
    { date: '30 Jun 2026', time: '07:10', desc: 'Free pratique granted' },
    { date: '30 Jun 2026', time: '08:30', desc: 'Notice of Readiness tendered' },
    { date: '30 Jun 2026', time: '12:15', desc: 'Pilot on board' },
    { date: '30 Jun 2026', time: '13:40', desc: 'All fast / made fast alongside' },
  ],
  masterName: 'Capt. —',
  remarks: 'Vessel arrived in good order. No outstanding matters on arrival.',
}

export const SAMPLE_DEPARTURE: ReportData = {
  tenant: SAMPLE_EPDA.tenant,
  kind: 'DEPARTURE',
  docNumber: 'DR/2026/06/0052',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  berth: 'Jetty 3',
  otherPort: 'Surabaya',
  voyageNo: 'V.118',
  toName: 'PT Soechi Lines Tbk',
  toAttn: 'Operations Department',
  cargo: 'MGO',
  cargoQty: '6,000 KL',
  events: [
    { date: '01 Jul 2026', time: '02:10', desc: 'Cargo operations completed' },
    { date: '01 Jul 2026', time: '03:00', desc: 'Documents on board' },
    { date: '01 Jul 2026', time: '03:30', desc: 'Pilot on board' },
    { date: '01 Jul 2026', time: '03:50', desc: 'Unberthed / let go all lines' },
    { date: '01 Jul 2026', time: '04:15', desc: 'Dropped outward pilot — Commenced Sea Passage (COSP)' },
  ],
  masterName: 'Capt. —',
  remarks: 'Vessel departed in good order. Clearance obtained from all authorities.',
}
