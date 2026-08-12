// Fase 4b — memetakan Invoice (model v2) + item-itemnya ke bentuk InvoiceData
// yang SUDAH ADA, supaya mesin PDF lama (InvoiceDocument) bisa dipakai ulang
// apa adanya. Pola sama persis dengan disbursement-epda-data.ts (K48): berkas
// ini MENYENTUH DB, satu-satunya pintu masuk resmi untuk PDF Invoice v2.
//
// agencyAmountOverride/vatAmountOverride SELALU diisi (lihat invoice-data.ts)
// — subtotal/agencyAmount/taxAmount/grandTotal sudah di-snapshot dari FDA saat
// Invoice dibuat (K47); PDF tak pernah menghitung ulang uang, hanya menata.

import type { TenantContext } from '@/services/context'
import { forTenant } from '@/services/tenant-db'
import { notFound } from '@/services/errors'
import { getInvoice, type InvoiceWithItems } from '@/services/finance/invoice.service'
import { epdaTenantForSession } from './tenant'
import { SAMPLE_INVOICE, type InvoiceData, type InvoiceLine } from './invoice-data'

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

function toLine(it: InvoiceWithItems['items'][number]): InvoiceLine {
  // qty=1/unitPrice=amount (bukan it.quantity/it.unitPrice mentah): amount sudah
  // snapshot server (K11), menampilkan qty×unitPrice asli berisiko out-of-sync
  // sekian sen akibat pembulatan unitPrice informasional (lihat invoice.service.ts).
  return { description: it.description, qty: 1, unitPrice: it.amount }
}

/**
 * Pintu masuk 4b: Invoice + items (model v2) → InvoiceData siap-render.
 * Dipanggil oleh route `/api/invoices/[id]/pdf` — tidak menulis apa pun.
 */
export async function invoiceToInvoiceData(ctx: TenantContext, id: string): Promise<InvoiceData> {
  const inv = await getInvoice(ctx, id)

  const voyage = await forTenant(ctx).voyage.findFirst({
    where: { id: inv.voyageId ?? undefined, deletedAt: null },
    include: { vessel: true, port: true },
  })
  if (!voyage) throw notFound('Voyage')

  const sourceFda = inv.sourceDisbursementId
    ? await forTenant(ctx).disbursement.findFirst({
        where: { id: inv.sourceDisbursementId },
        select: { docNumber: true, agencyPct: true },
      })
    : null

  const tenant = await epdaTenantForSession(ctx.tenantId)

  const agencyAmount = inv.grandTotal - inv.subtotal - inv.taxAmount
  // Label % saja (uangnya sudah pasti lewat override) — diturunkan balik dari
  // angka snapshot bila sumber FDA-nya tak lagi ada (dokumen tetap harus bisa
  // dicetak walau EPDA/FDA asalnya sudah dihapus, lihat cleanup Fase 4 12 Ags).
  const agencyPct = sourceFda?.agencyPct ?? (inv.subtotal > 0 ? (agencyAmount / inv.subtotal) * 100 : 0)
  const vatPct = agencyAmount > 0 ? (inv.taxAmount / agencyAmount) * 100 : 0

  const paymentTerms = inv.dueDate
    ? `Payment due by ${tgl(inv.dueDate)} by bank transfer to the account below, quoting the invoice number as reference. This invoice settles the Final Disbursement Account for the above port call.`
    : 'Payment due upon receipt by bank transfer to the account below, quoting the invoice number as reference. This invoice settles the Final Disbursement Account for the above port call.'

  const data: InvoiceData = {
    tenant: tenant ?? SAMPLE_INVOICE.tenant,
    docNumber: inv.invoiceNumber,
    invoiceDate: tgl(inv.invoiceDate),
    dueDate: tgl(inv.dueDate),
    currency: inv.currency,

    billToName: inv.customer?.name ?? '—',
    billToAddress: undefined,
    billToAttn: undefined,
    billToNpwp: undefined,

    vesselVoyage: `${voyage.vessel?.name ?? '—'} · ${voyage.voyageNumber}`,
    portCall: voyage.port?.name ?? '—',
    refFda: sourceFda?.docNumber,

    lines: inv.items.map(toLine),
    agencyPct: Math.round(agencyPct * 100) / 100,
    vatPct: Math.round(vatPct * 100) / 100,
    agencyAmountOverride: agencyAmount,
    vatAmountOverride: inv.taxAmount,
    paymentTerms,
    signRole: tenant?.signerTitle ?? SAMPLE_INVOICE.signRole,
  }

  return data
}
