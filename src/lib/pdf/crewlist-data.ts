import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type CrewMember = {
  name: string
  rank: string // jabatan (Master, C/O, C/E, AB, dll)
  nationality: string
  passport: string
  dob: string // tgl lahir
  seamanBook?: string // buku pelaut
}

export type CrewListData = {
  tenant: EpdaTenant
  docNumber: string
  vesselName: string
  imo: string
  flag?: string
  callSign?: string
  port: string
  voyage?: string
  mode: string // 'Arrival' | 'Departure'
  masterName: string
  crew: CrewMember[]
  remarks: string
  signRole: string
}

// ====== DATA CONTOH (FAL Form 5 — Crew List) ======
export const SAMPLE_CREWLIST: CrewListData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'CL/2026/06/0052',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  callSign: 'PNXY',
  port: 'Samarinda',
  voyage: 'V.118',
  mode: 'Arrival',
  masterName: 'Capt. Bambang S.',
  crew: [
    { name: 'Bambang Santoso', rank: 'Master', nationality: 'Indonesia', passport: 'A1234567', dob: '12 Mar 1975', seamanBook: 'B0012345' },
    { name: 'Agus Widodo', rank: 'Chief Officer', nationality: 'Indonesia', passport: 'A2345678', dob: '04 Jul 1982', seamanBook: 'B0023456' },
    { name: 'Hendra Pratama', rank: 'Chief Engineer', nationality: 'Indonesia', passport: 'A3456789', dob: '21 Nov 1980', seamanBook: 'B0034567' },
    { name: 'Rudi Hartono', rank: 'Able Seaman', nationality: 'Indonesia', passport: 'A4567890', dob: '09 Feb 1990', seamanBook: 'B0045678' },
    { name: 'Joko Susilo', rank: 'Oiler', nationality: 'Indonesia', passport: 'A5678901', dob: '30 Jun 1992', seamanBook: 'B0056789' },
  ],
  remarks: 'All crew hold valid certificates as per STCW. No crew change at this port.',
  signRole: 'Port Agent',
}
