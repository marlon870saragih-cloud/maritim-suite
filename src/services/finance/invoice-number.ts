// Penomoran Invoice — pola sama disbursement-number.ts, tanpa sufiks revisi
// (Invoice tak punya versioning di Fase 4; satu FDA FINAL = satu Invoice, K47).

import { formatDocNumber, monthWindow } from '@/lib/doc-number'
import type { TenantContext } from '../context'
import { forTenant } from '../tenant-db'

function prefixBulan(year: number, mm: string): string {
  const contoh = formatDocNumber('INVOICE', year, mm, 1)
  return contoh.slice(0, contoh.lastIndexOf('/') + 1)
}

function urutanDari(invoiceNumber: string): number {
  const ekor = invoiceNumber.slice(invoiceNumber.lastIndexOf('/') + 1)
  const n = Number(ekor)
  return Number.isFinite(n) ? n : 0
}

/** Nomor berikutnya: `INV/YYYY/MM/NNNN`, berurutan per tenant per bulan (pola nextDisbursementNumber). */
export async function nextInvoiceNumber(ctx: TenantContext): Promise<string> {
  const { year, mm } = monthWindow()
  const prefix = prefixBulan(year, mm)

  const terakhir = await forTenant(ctx).invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })

  return formatDocNumber('INVOICE', year, mm, (terakhir ? urutanDari(terakhir.invoiceNumber) : 0) + 1)
}
