import { SAMPLE_EPDA, type EpdaTenant } from './epda-data'

export type InvoiceLine = {
  description: string
  detail?: string
  qty: number
  unitPrice: number
  // Kena PPN? undefined/true = kena PPN; false = bebas PPN (mis. fresh water, sijil on/off).
  taxable?: boolean
}

export type InvoiceData = {
  tenant: EpdaTenant
  docNumber: string
  invoiceDate: string
  dueDate: string
  currency: string
  // Ditagihkan kepada
  billToName: string
  billToAddress?: string
  billToAttn?: string
  billToNpwp?: string
  // Referensi
  vesselVoyage: string
  portCall: string
  refFda?: string
  // Baris tagihan
  lines: InvoiceLine[]
  agencyPct: number
  vatPct: number
  paymentTerms: string
  signRole: string
}

export const lineAmount = (l: InvoiceLine) => (l.qty || 0) * (l.unitPrice || 0)
// Baris kena PPN kecuali ditandai taxable === false.
export const isTaxable = (l: InvoiceLine) => l.taxable !== false

// PPN dikenakan HANYA pada DPP = (jumlah baris kena PPN) + agency fee (jasa, kena PPN).
// Baris bebas PPN (fresh water, sijil on/off, dll) tetap masuk subtotal & total,
// tapi tidak dihitung dalam PPN.
export function computeInvoiceTotals(d: InvoiceData) {
  const subtotal = d.lines.reduce((s, l) => s + lineAmount(l), 0)
  const taxableLines = d.lines.reduce((s, l) => s + (isTaxable(l) ? lineAmount(l) : 0), 0)
  const agency = Math.round((subtotal * d.agencyPct) / 100)
  const dpp = taxableLines + agency // dasar pengenaan pajak
  const vat = Math.round((dpp * d.vatPct) / 100)
  const exemptTotal = subtotal - taxableLines
  const totalDue = subtotal + agency + vat
  const hasExempt = d.lines.some((l) => !isTaxable(l))
  return { subtotal, agency, dpp, vat, exemptTotal, totalDue, hasExempt }
}

// ====== DATA CONTOH (replika Invoice-Tribuana.pdf) ======
export const SAMPLE_INVOICE: InvoiceData = {
  tenant: SAMPLE_EPDA.tenant,
  docNumber: 'INV/2026/06/0188',
  invoiceDate: '22 Jun 2026',
  dueDate: '06 Jul 2026',
  currency: 'IDR',
  billToName: 'PT Soechi Lines Tbk',
  billToAddress: 'Wisma BSG, Jl. Abdul Muis No. 40, Jakarta Pusat 10160',
  billToAttn: 'Finance Department · ar@soechi.example',
  billToNpwp: '01.234.567.8-091.000',
  vesselVoyage: 'MT Soechi Asia · V.118',
  portCall: 'Samarinda',
  refFda: 'FDA/2026/06/0142',
  lines: [
    {
      description: 'Port authority & government charges',
      detail: 'Anchorage, berthing, light dues & VTS — as per FDA Sec. A',
      qty: 1,
      unitPrice: 6631680,
    },
    {
      description: 'Pilotage, towage & mooring',
      detail: '2 movements, 2 tugs — as per FDA Sec. B',
      qty: 1,
      unitPrice: 38100000,
    },
    {
      description: 'Clearance & documentation',
      detail: 'CIQP, SPB, cabotage report — as per FDA Sec. C',
      qty: 1,
      unitPrice: 5650000,
    },
    {
      description: 'Agency fee & disbursements',
      detail: 'Agency fee, transportation, communication & sundries',
      qty: 1,
      unitPrice: 19000000,
    },
    {
      description: 'Fresh water supply',
      detail: 'Air tawar ke kapal — bebas PPN',
      qty: 1,
      unitPrice: 3500000,
      taxable: false,
    },
  ],
  agencyPct: 2.5,
  vatPct: 11,
  paymentTerms:
    'Payment due within 14 days of invoice date by bank transfer to the account below, quoting the invoice number as reference. This invoice settles the Final Disbursement Account for the above port call; original receipts are attached.',
  signRole: 'Finance Department',
}
