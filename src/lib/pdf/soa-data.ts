import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type SoaRow = {
  date: string // tgl invoice
  docNumber: string // no invoice
  ref?: string // vessel/voyage atau port call
  amount: number // nilai tagihan (total due)
  paid: number // sudah dibayar
}

export type SoaData = {
  tenant: EpdaTenant
  docNumber: string // no SOA
  statementDate: string
  period: string // mis. "Juni 2026"
  currency: string
  // Pihak (principal langganan)
  toName: string
  toAddress?: string
  toNpwp?: string
  toAttn?: string
  openingBalance: number // saldo awal periode
  rows: SoaRow[]
  notes: string
  signRole: string
}

export const rowBalance = (r: SoaRow) => (r.amount || 0) - (r.paid || 0)

export function computeSoaTotals(d: SoaData) {
  const billed = d.rows.reduce((s, r) => s + (r.amount || 0), 0)
  const paid = d.rows.reduce((s, r) => s + (r.paid || 0), 0)
  const outstanding = (d.openingBalance || 0) + billed - paid
  return { billed, paid, outstanding }
}

// ====== DATA CONTOH ======
export const SAMPLE_SOA: SoaData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'SOA/2026/06/0007',
  statementDate: '30 Jun 2026',
  period: 'Juni 2026',
  currency: 'IDR',
  toName: 'PT Soechi Lines Tbk',
  toAddress: 'Wisma BSG, Jl. Abdul Muis No. 40, Jakarta Pusat 10160',
  toNpwp: '01.234.567.8-091.000',
  toAttn: 'Finance Department',
  openingBalance: 0,
  rows: [
    { date: '08 Jun 2026', docNumber: 'INV/2026/06/0171', ref: 'MT Soechi Asia · Samarinda', amount: 71_116_222, paid: 71_116_222 },
    { date: '22 Jun 2026', docNumber: 'INV/2026/06/0188', ref: 'MT Soechi Asia · Samarinda', amount: 79_642_500, paid: 0 },
  ],
  notes: 'Mohon penyelesaian saldo terutang ke rekening perusahaan sebelum akhir bulan berjalan.',
  signRole: 'Finance Department',
}
