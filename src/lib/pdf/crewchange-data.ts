import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type CrewChangeRow = {
  name: string
  rank: string
  nationality: string
  passport: string
  action: string // 'Sign On' | 'Sign Off'
  remark?: string // mis. detail penerbangan / agen
}

export type CrewChangeData = {
  tenant: EpdaTenant
  docNumber: string
  // Kapal
  vesselName: string
  imo: string
  flag?: string
  // Tempat & waktu
  port: string
  date: string // "01 Jul 2026"
  // Ditujukan kepada (Imigrasi / Syahbandar / Principal)
  toName: string
  toAttn?: string
  // Daftar pergantian awak
  crew: CrewChangeRow[]
  agentName: string
  remarks: string
}

// ====== DATA CONTOH ======
export const SAMPLE_CREWCHANGE: CrewChangeData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'CCN/2026/06/0071',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  date: '01 Jul 2026',
  toName: 'Kantor Imigrasi Kelas I Samarinda',
  toAttn: 'Kepala Seksi Lalu Lintas Keimigrasian',
  crew: [
    { name: 'Budi Santoso', rank: 'Master', nationality: 'Indonesia', passport: 'C1234567', action: 'Sign On', remark: 'GA-560 arr. 30 Jun' },
    { name: 'Andre Wijaya', rank: 'Chief Officer', nationality: 'Indonesia', passport: 'C7654321', action: 'Sign On', remark: '' },
    { name: 'Sutomo', rank: 'Master', nationality: 'Indonesia', passport: 'B9988776', action: 'Sign Off', remark: 'GA-561 dep. 01 Jul' },
    { name: 'Reza Pratama', rank: 'Chief Officer', nationality: 'Indonesia', passport: 'B5544332', action: 'Sign Off', remark: '' },
  ],
  agentName: 'Port Agent',
  remarks:
    'Kindly grant the necessary clearance for the above crew changes. All seamen hold valid travel and seafarer documents.',
}
