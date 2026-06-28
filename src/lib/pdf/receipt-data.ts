import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type ReceiptData = {
  tenant: EpdaTenant
  docNumber: string
  receiptDate: string // "22 Jun 2026"
  receivedFrom: string // pembayar (principal)
  amount: number // jumlah (IDR)
  currency: string
  forPayment: string // untuk pembayaran …
  refDoc?: string // ref. invoice/FDA
  place: string // tempat tanda tangan
  signName: string // nama penerima
  signRole: string // jabatan penerima
}

const SATUAN = [
  '', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas',
]

// Angka → kata (bahasa Indonesia). Dipakai untuk baris "terbilang" di kwitansi.
function terbilang(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n < 12) return SATUAN[n]
  if (n < 20) return terbilang(n - 10) + ' belas'
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '')
  if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '')
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '')
  if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '')
  if (n < 1_000_000) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '')
  if (n < 1_000_000_000)
    return terbilang(Math.floor(n / 1_000_000)) + ' juta' + (n % 1_000_000 ? ' ' + terbilang(n % 1_000_000) : '')
  if (n < 1_000_000_000_000)
    return (
      terbilang(Math.floor(n / 1_000_000_000)) + ' miliar' + (n % 1_000_000_000 ? ' ' + terbilang(n % 1_000_000_000) : '')
    )
  return (
    terbilang(Math.floor(n / 1_000_000_000_000)) +
    ' triliun' +
    (n % 1_000_000_000_000 ? ' ' + terbilang(n % 1_000_000_000_000) : '')
  )
}

/** "Tujuh puluh sembilan juta … rupiah" (huruf depan kapital). */
export function terbilangRupiah(n: number): string {
  const w = terbilang(n).trim().replace(/\s+/g, ' ')
  if (!w) return 'Nol rupiah'
  return w.charAt(0).toUpperCase() + w.slice(1) + ' rupiah'
}

// ====== DATA CONTOH ======
export const SAMPLE_RECEIPT: ReceiptData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'KW/2026/06/0188',
  receiptDate: '22 Jun 2026',
  receivedFrom: 'PT Soechi Lines Tbk',
  amount: 79_642_500,
  currency: 'IDR',
  forPayment: 'Pembayaran jasa keagenan kapal sesuai Invoice INV/2026/06/0188 — MT Soechi Asia, port call Samarinda.',
  refDoc: 'INV/2026/06/0188',
  place: 'Samarinda',
  signName: 'Finance Department',
  signRole: 'Penerima',
}
