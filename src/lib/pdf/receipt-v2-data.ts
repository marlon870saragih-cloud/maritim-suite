// Fase 4b — memetakan InvoicePayment (model v2) ke bentuk ReceiptData yang
// SUDAH ADA (kwitansi), dipakai ulang lewat ReceiptDocument. Pola sama
// disbursement-epda-data.ts/invoice-v2-data.ts (K48). `amount` di ReceiptData
// murni angka literal (bukan hasil rumus) — tak ada risiko hitung ulang di sini.

import type { TenantContext } from '@/services/context'
import { notFound } from '@/services/errors'
import { getInvoice } from '@/services/finance/invoice.service'
import { epdaTenantForSession } from './tenant'
import { SAMPLE_RECEIPT, type ReceiptData } from './receipt-data'

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

/**
 * Pintu masuk 4b: satu InvoicePayment (model v2) → ReceiptData siap-render.
 * Dipanggil oleh route `/api/invoices/[id]/payments/[paymentId]/pdf`.
 */
export async function paymentToReceiptData(
  ctx: TenantContext,
  invoiceId: string,
  paymentId: string,
): Promise<ReceiptData> {
  const inv = await getInvoice(ctx, invoiceId) // K44 aturan 1 — pintu masuk wajib
  const payment = inv.payments.find((p) => p.id === paymentId)
  if (!payment) throw notFound('Pembayaran')

  const tenant = await epdaTenantForSession(ctx.tenantId)

  const data: ReceiptData = {
    tenant: tenant ?? SAMPLE_RECEIPT.tenant,
    docNumber: `KW/${inv.invoiceNumber.replace(/^INV\//, '')}/${payment.id.slice(-4).toUpperCase()}`,
    receiptDate: tgl(payment.paymentDate),
    receivedFrom: inv.customer?.name ?? '—',
    amount: payment.amount,
    currency: payment.currency,
    forPayment: `Pembayaran atas Invoice ${inv.invoiceNumber}${payment.referenceNumber ? ` — ref. ${payment.referenceNumber}` : ''}.`,
    refDoc: inv.invoiceNumber,
    place: tenant?.companyAddress?.split(',').pop()?.trim() || 'Samarinda',
    signName: tenant?.signerName ?? SAMPLE_RECEIPT.signName,
    signRole: tenant?.signerTitle ?? SAMPLE_RECEIPT.signRole,
  }

  return data
}
