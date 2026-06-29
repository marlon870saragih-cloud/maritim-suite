import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type SummaryDocRow = {
  label: string
  docNumber: string
  status: string
}

export type SummaryFinance = {
  epda: number
  fpda: number
  invoice: number
}

export type PortCallSummaryData = {
  tenant: EpdaTenant
  docNumber: string
  date: string // "01 Jul 2026"
  // Kapal & call
  vesselName: string
  imo: string
  flag?: string
  port: string
  portCode?: string
  eta: string
  etd: string
  gt?: string
  nrt?: string
  loa?: string
  draft?: string
  cargo: string
  principal: string
  // Agregasi
  documents: SummaryDocRow[]
  finance: SummaryFinance
  // Penutup
  remarks: string
  preparedBy: string
}

// ====== DATA CONTOH ======
export const SAMPLE_PCSUMMARY: PortCallSummaryData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'PCS/2026/06/0081',
  date: '01 Jul 2026',
  vesselName: 'MT Soechi Asia',
  imo: '9456231',
  flag: 'Indonesia',
  port: 'Samarinda',
  portCode: 'IDSRI',
  eta: '30 Jun 2026',
  etd: '01 Jul 2026',
  gt: '8,500',
  nrt: '4,200',
  loa: '120 m',
  draft: '7 m',
  cargo: 'MGO — 6,000 KL',
  principal: 'PT Soechi Lines Tbk',
  documents: [
    { label: 'EPDA', docNumber: 'EPDA/2026/06/0031', status: 'FINAL' },
    { label: 'FPDA', docNumber: 'FPDA/2026/06/0033', status: 'FINAL' },
    { label: 'Invoice', docNumber: 'INV/2026/06/0188', status: 'SENT' },
    { label: 'SOF', docNumber: 'SOF/2026/06/0044', status: 'DRAFT' },
  ],
  finance: { epda: 76_400_000, fpda: 79_642_500, invoice: 79_642_500 },
  remarks:
    'Port call diselesaikan tanpa kendala berarti. Seluruh dokumen clearance & keuangan telah diterbitkan.',
  preparedBy: 'Port Agent',
}
