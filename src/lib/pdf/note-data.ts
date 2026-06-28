import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type NoteKind = 'debit' | 'credit'

export type NoteLine = {
  description: string
  detail?: string
  qty: number
  unitPrice: number
}

export type NoteData = {
  tenant: EpdaTenant
  kind: NoteKind
  docNumber: string
  noteDate: string
  currency: string
  // Pihak yang dinota
  toName: string
  toAddress?: string
  toNpwp?: string
  // Referensi
  refDoc?: string // invoice/FDA yang disesuaikan
  vesselVoyage?: string
  reason: string // alasan penyesuaian
  // Baris penyesuaian
  lines: NoteLine[]
  vatPct: number // PPN atas subtotal (0 untuk menonaktifkan)
  signRole: string
}

export const noteLineAmount = (l: NoteLine) => (l.qty || 0) * (l.unitPrice || 0)

export function computeNoteTotals(d: NoteData) {
  const subtotal = d.lines.reduce((s, l) => s + noteLineAmount(l), 0)
  const vat = Math.round((subtotal * (d.vatPct || 0)) / 100)
  const total = subtotal + vat
  return { subtotal, vat, total }
}

// Label per arah penyesuaian.
export const NOTE_META: Record<
  NoteKind,
  { title: string; titleId: string; effect: string; accent: string }
> = {
  debit: {
    title: 'DEBIT NOTE',
    titleId: 'Nota Debit',
    effect: 'Jumlah berikut DITAMBAHKAN ke kewajiban pihak tertera (tagihan bertambah).',
    accent: '#B0413E', // merah-bata
  },
  credit: {
    title: 'CREDIT NOTE',
    titleId: 'Nota Kredit',
    effect: 'Jumlah berikut DIKURANGKAN dari kewajiban pihak tertera (pengembalian / koreksi).',
    accent: '#1E7A45', // hijau
  },
}

// ====== DATA CONTOH ======
const SAMPLE_BASE: Omit<NoteData, 'kind' | 'docNumber' | 'reason' | 'lines'> = {
  tenant: SAMPLE_EPDA.tenant,
  noteDate: '22 Jun 2026',
  currency: 'IDR',
  toName: 'PT Soechi Lines Tbk',
  toAddress: 'Wisma BSG, Jl. Abdul Muis No. 40, Jakarta Pusat 10160',
  toNpwp: '01.234.567.8-091.000',
  refDoc: 'INV/2026/06/0188',
  vesselVoyage: 'MT Soechi Asia · V.118',
  vatPct: 11,
  signRole: 'Finance Department',
}

export const SAMPLE_DEBIT: NoteData = {
  ...SAMPLE_BASE,
  kind: 'debit',
  docNumber: 'DN/2026/06/0042',
  reason: 'Biaya tambahan di luar FDA: overstay 1 etmal & shifting tak terjadwal pada port call Samarinda.',
  lines: [
    { description: 'Berthing dues (overstay)', detail: '1 etmal tambahan', qty: 1, unitPrice: 1_011_840 },
    { description: 'Shifting / pindah tambatan', detail: '1 movement tak terjadwal', qty: 1, unitPrice: 4_750_000 },
  ],
}

export const SAMPLE_CREDIT: NoteData = {
  ...SAMPLE_BASE,
  kind: 'credit',
  docNumber: 'CN/2026/06/0019',
  reason: 'Koreksi atas Invoice INV/2026/06/0188: tug assistance ditagih 4 unit, aktual 3 unit.',
  lines: [{ description: 'Koreksi tug assistance', detail: 'kelebihan 1 unit', qty: 1, unitPrice: 6_250_000 }],
}
