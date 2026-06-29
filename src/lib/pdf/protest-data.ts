import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type ProtestData = {
  tenant: EpdaTenant
  docNumber: string
  // Kapal
  vesselName: string
  imo: string
  flag?: string
  // Tempat & waktu penerbitan
  port: string
  place: string
  date: string // "01 Jul 2026"
  // Ditujukan kepada pihak yang diprotes
  toName: string
  toAttn?: string
  // Isi
  subject: string
  statement: string // paragraf utama (multiline)
  holdResponsible: string // pihak yang dimintai tanggung jawab
  masterName: string
  remarks?: string
}

// ====== DATA CONTOH ======
export const SAMPLE_PROTEST: ProtestData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'LOP/2026/06/0061',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  place: 'Samarinda',
  date: '01 Jul 2026',
  toName: 'PT Terminal Operator Samarinda',
  toAttn: 'Terminal Superintendent',
  subject: 'Delay in commencement of cargo operations',
  statement:
    'I, the undersigned Master of MT Soechi Asia, hereby lodge this Letter of Protest against the delay in ' +
    'commencement of cargo operations. The vessel arrived and tendered Notice of Readiness on 30 Jun 2026 at ' +
    '08:30 hrs and was in all respects ready. However, loading did not commence until 30 Jun 2026 at 14:30 hrs, ' +
    'a delay of approximately 6 hours not attributable to the vessel.',
  holdResponsible: 'PT Terminal Operator Samarinda',
  masterName: 'Capt. —',
  remarks:
    'This protest is tendered without prejudice to any rights or claims of the Owners/Charterers and shall not ' +
    'be construed as a waiver of any such rights.',
}
