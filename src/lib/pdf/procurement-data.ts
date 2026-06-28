import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type ProcKind = 'pr' | 'po'

export type ProcLine = {
  description: string
  detail?: string
  qty: number
  unit: string // pcs, set, ltr, drum, dll
  unitPrice: number
}

export type ProcData = {
  tenant: EpdaTenant
  kind: ProcKind
  docNumber: string
  docDate: string
  currency: string
  vesselVoyage?: string // kapal tujuan barang
  // PR: peminta/departemen · PO: supplier
  party: string
  partyAddress?: string
  partyAttn?: string
  deliveryTo?: string // lokasi/kapal pengiriman
  neededBy?: string // PR: dibutuhkan tgl · PO: tgl kirim
  paymentTerms?: string // PO
  reason: string // PR: justifikasi · PO: catatan/instruksi
  lines: ProcLine[]
  taxPct: number // PPN (mis. PO 11; PR 0)
  signRole: string
}

export const procLineAmount = (l: ProcLine) => (l.qty || 0) * (l.unitPrice || 0)

export function computeProcTotals(d: ProcData) {
  const subtotal = d.lines.reduce((s, l) => s + procLineAmount(l), 0)
  const tax = Math.round((subtotal * (d.taxPct || 0)) / 100)
  const total = subtotal + tax
  return { subtotal, tax, total }
}

export const PROC_META: Record<
  ProcKind,
  {
    title: string
    titleId: string
    partyLabel: string
    reasonLabel: string
    totalLabel: string
    showTerms: boolean
  }
> = {
  pr: {
    title: 'PURCHASE REQUISITION',
    titleId: 'Purchase Requisition',
    partyLabel: 'Diminta oleh',
    reasonLabel: 'Justifikasi kebutuhan',
    totalLabel: 'Estimasi Total',
    showTerms: false,
  },
  po: {
    title: 'PURCHASE ORDER',
    titleId: 'Purchase Order',
    partyLabel: 'Kepada (Supplier)',
    reasonLabel: 'Catatan / instruksi',
    totalLabel: 'Total Order',
    showTerms: true,
  },
}

// ====== DATA CONTOH ======
export const SAMPLE_PR: ProcData = {
  tenant: SAMPLE_EPDA.tenant,
  kind: 'pr',
  docNumber: 'PR/2026/06/0051',
  docDate: '22 Jun 2026',
  currency: 'IDR',
  vesselVoyage: 'MT Soechi Asia · V.118',
  party: 'Departemen Operasi · TSM Samarinda',
  deliveryTo: 'Kapal di Pelabuhan Samarinda',
  neededBy: '27 Jun 2026',
  reason: 'Penggantian stok consumable & spare deck menjelang kedatangan kapal; stok kapal menipis.',
  lines: [
    { description: 'Manila rope 8" mooring', detail: 'tali tambat', qty: 2, unit: 'coil', unitPrice: 3_250_000 },
    { description: 'Marine grease EP-2', detail: 'gemuk dek', qty: 6, unit: 'kg', unitPrice: 95_000 },
    { description: 'Cotton waste / majun', detail: 'lap mesin', qty: 20, unit: 'kg', unitPrice: 22_000 },
  ],
  taxPct: 0,
  signRole: 'Operations Manager',
}

export const SAMPLE_PO: ProcData = {
  tenant: SAMPLE_EPDA.tenant,
  kind: 'po',
  docNumber: 'PO/2026/06/0033',
  docDate: '23 Jun 2026',
  currency: 'IDR',
  vesselVoyage: 'MT Soechi Asia · V.118',
  party: 'PT Mitra Bahari Supply',
  partyAddress: 'Jl. Yos Sudarso No. 12, Samarinda',
  partyAttn: 'Sales Dept',
  deliveryTo: 'Kapal di Pelabuhan Samarinda',
  neededBy: '26 Jun 2026',
  paymentTerms: 'Pembayaran 30 hari setelah barang diterima lengkap & sesuai. Harga sudah termasuk pengiriman ke kapal.',
  reason: 'Mengacu PR/2026/06/0051. Mohon konfirmasi ketersediaan & jadwal kirim.',
  lines: [
    { description: 'Manila rope 8" mooring', detail: 'tali tambat', qty: 2, unit: 'coil', unitPrice: 3_250_000 },
    { description: 'Marine grease EP-2', detail: 'gemuk dek', qty: 6, unit: 'kg', unitPrice: 95_000 },
    { description: 'Cotton waste / majun', detail: 'lap mesin', qty: 20, unit: 'kg', unitPrice: 22_000 },
  ],
  taxPct: 11,
  signRole: 'Procurement',
}
