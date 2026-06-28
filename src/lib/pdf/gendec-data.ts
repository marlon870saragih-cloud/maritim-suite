import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type GenDecAttachment = { label: string; copies: string }

export type GenDecData = {
  tenant: EpdaTenant
  docNumber: string
  // Kapal
  vesselName: string
  imo: string
  callSign?: string
  flag?: string
  vesselType?: string
  grt?: string
  // Pelabuhan & voyage
  mode: string // 'Arrival' | 'Departure'
  port: string
  dateTime: string // tgl & jam tiba/berangkat
  berth?: string
  lastPort: string
  nextPort: string
  voyage?: string
  // Ringkasan
  cargoBrief: string
  crewCount: string
  passengerCount: string
  master: string
  // Dokumen lampiran (FAL)
  attachments: GenDecAttachment[]
  remarks: string
  signRole: string
}

// ====== DATA CONTOH (IMO FAL Form 1 — General Declaration) ======
export const SAMPLE_GENDEC: GenDecData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'GD/2026/06/0063',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  callSign: 'PNXY',
  flag: 'Indonesia',
  vesselType: 'Oil Tanker',
  grt: '8,432',
  mode: 'Arrival',
  port: 'Samarinda',
  dateTime: '30 Jun 2026, 08:30 WITA',
  berth: 'Jetty 3',
  lastPort: 'Balikpapan',
  nextPort: 'Surabaya',
  voyage: 'V.118',
  cargoBrief: 'MGO 6,000 KL (loading)',
  crewCount: '18',
  passengerCount: '0',
  master: 'Capt. Bambang S.',
  attachments: [
    { label: 'Cargo Declaration (FAL 2)', copies: '2' },
    { label: "Ship's Stores Declaration (FAL 3)", copies: '2' },
    { label: "Crew's Effects Declaration (FAL 4)", copies: '1' },
    { label: 'Crew List (FAL 5)', copies: '3' },
    { label: 'Passenger List (FAL 6)', copies: '—' },
    { label: 'Maritime Declaration of Health', copies: '1' },
  ],
  remarks: 'Vessel free pratique requested. All certificates valid.',
  signRole: 'Port Agent',
}
