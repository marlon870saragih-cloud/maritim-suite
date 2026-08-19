// Fase 8e / K164 — memetakan SubscriptionInvoice (Fase 8) → bentuk siap-render
// SubInvoiceDocument. Pola sama receipt-v2-data.ts (K48): satu pintu masuk,
// satu fungsi, dipanggil dari route PDF-nya sendiri.

import type { TenantContext } from '@/services/context'
import { getSubscriptionInvoiceDetail } from '@/services/saas/sub-invoice.service'
import { forTenant } from '@/services/tenant-db'
import { adalahGerbang, LABEL_GERBANG } from '@/lib/billing/gateway'
import { IDENTITAS_PENJUAL } from '@/lib/billing/seller-identity'

export type SubInvoiceLine = { description: string; amount: number }

export type SubInvoiceData = {
  /// ⚠️ K164 — identitas PENJUAL (Maritime Suite), BUKAN Tenant.logoUrl.
  /// Satu-satunya dokumen di seluruh app yang memakai kop ini.
  seller: typeof IDENTITAS_PENJUAL
  docNumber: string
  issuedDate: string
  billToName: string
  billToAddress?: string
  currency: string
  items: SubInvoiceLine[]
  subtotal: number
  taxAmount: number
  grandTotal: number
  paymentMethod: string
  paidDate: string
  gatewayRef?: string
}

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

export async function subInvoiceToData(ctx: TenantContext, id: string): Promise<SubInvoiceData> {
  const inv = await getSubscriptionInvoiceDetail(ctx, id)
  const tenant = await forTenant(ctx).tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { companyName: true, companyAddress: true },
  })

  const gerbang = adalahGerbang(inv.payment?.gateway) ? inv.payment.gateway : null
  const paymentMethod = [gerbang ? LABEL_GERBANG[gerbang] : null, inv.payment?.payMethod]
    .filter(Boolean)
    .join(' · ') || '—'

  return {
    seller: IDENTITAS_PENJUAL,
    docNumber: inv.invoiceNumber,
    issuedDate: tgl(inv.issuedAt),
    billToName: tenant?.companyName ?? '—',
    billToAddress: tenant?.companyAddress ?? undefined,
    currency: inv.currency,
    items: inv.items.map((i) => ({ description: i.description, amount: i.amount })),
    subtotal: inv.subtotal,
    taxAmount: inv.taxAmount,
    grandTotal: inv.grandTotal,
    paymentMethod,
    paidDate: tgl(inv.payment?.paidAt),
    gatewayRef: inv.payment?.gatewayRef ?? undefined,
  }
}
