import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type AppointmentData = {
  tenant: EpdaTenant
  docNumber: string
  date: string
  // Kepada (principal yang menunjuk / dikonfirmasi)
  toName: string
  toAddress?: string
  toAttn?: string
  // Kapal & call
  vesselName: string
  imo: string
  flag?: string
  port: string
  eta?: string
  voyage?: string
  // Isi
  intro: string // paragraf pembuka
  scope: string[] // lingkup layanan
  validity: string // masa berlaku / periode
  signName: string
  signRole: string
}

// ====== DATA CONTOH (Agency Appointment / Letter of Appointment) ======
export const SAMPLE_APPOINTMENT: AppointmentData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'AA/2026/06/0014',
  date: '28 Jun 2026',
  toName: 'PT Soechi Lines Tbk',
  toAddress: 'Wisma BSG, Jl. Abdul Muis No. 40, Jakarta Pusat 10160',
  toAttn: 'Operations Department',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  eta: '30 Jun 2026',
  voyage: 'V.118',
  intro:
    'With reference to your nomination, we are pleased to confirm our acceptance of appointment as Port Agent for the above vessel at the captioned port. We shall attend the vessel and render the following services on your behalf:',
  scope: [
    'Husbanding & port formalities (CIQP, harbour master, port authority).',
    'Arrangement of pilotage, towage & mooring.',
    'Preparation & submission of arrival/departure documents (FAL forms, NOR, SOF).',
    'Handling of disbursements (EPDA/FPDA) and remittance reconciliation.',
    'Crew matters, supplies & general husbandry as instructed.',
  ],
  validity: 'This appointment is valid for the current port call and voyage stated above.',
  signName: 'Marlon Saragih',
  signRole: 'Branch Manager',
}
