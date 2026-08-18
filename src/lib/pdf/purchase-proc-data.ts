// PurchaseOrder/PurchaseRequisition (model v2) → ProcData, supaya mesin PDF
// LAMA (ProcurementDocument) dipakai ulang apa adanya (K119, pola persis K48).
// TIDAK ADA template PDF baru ditulis di Fase 7 — tata letak/kop/tanda tangan
// tidak berubah, bisa dibandingkan berdampingan dengan `GET /api/documents/po`.

import type { TenantContext } from '@/services/context'
import { forTenant } from '@/services/tenant-db'
import { getPurchaseOrder } from '@/services/ops/purchase.service'
import { epdaTenantForSession } from './tenant'
import { SAMPLE_PO, SAMPLE_PR, type ProcData, type ProcLine } from './procurement-data'

const tgl = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) : '—'

function toLine(it: { description: string; quantity: number; unit: string | null; unitPrice: number }): ProcLine {
  return { description: it.description, qty: it.quantity, unit: it.unit ?? '', unitPrice: it.unitPrice }
}

/** Pintu masuk 7i: PurchaseOrder/PR (v2) → ProcData siap-render. Dipanggil route `/api/purchase-orders/[id]/pdf`. */
export async function purchaseToProcData(ctx: TenantContext, id: string): Promise<ProcData> {
  const po = await getPurchaseOrder(ctx, id)
  const tenant = await epdaTenantForSession(ctx.tenantId)

  let party = po.vendor?.name ?? '—'
  let partyAddress: string | undefined
  let partyAttn: string | undefined
  if (po.vendorId) {
    const v = await forTenant(ctx).vendor.findFirst({
      where: { id: po.vendorId },
      select: { name: true, address: true, contactPerson: true },
    })
    if (v) {
      party = v.name
      partyAddress = v.address ?? undefined
      partyAttn = v.contactPerson ?? undefined
    }
  } else if (po.kind === 'PR') {
    // PR belum tentu punya vendor — party-nya adalah PEMINTA (K3: PR & PO satu tabel).
    const pembuat = await forTenant(ctx).user.findFirst({ where: { id: po.createdByUserId }, select: { name: true } })
    party = pembuat?.name ?? '—'
  }

  const sample = po.kind === 'PR' ? SAMPLE_PR : SAMPLE_PO

  return {
    tenant: tenant ?? sample.tenant,
    kind: po.kind === 'PR' ? 'pr' : 'po',
    docNumber: po.docNumber,
    docDate: tgl(po.issuedAt),
    currency: po.currency,
    vesselVoyage: po.voyage?.voyageNumber,
    party,
    partyAddress,
    partyAttn,
    deliveryTo: po.deliveryTo ?? undefined,
    neededBy: po.neededBy ? tgl(po.neededBy) : undefined,
    paymentTerms: po.terms ?? undefined,
    reason: po.notes ?? sample.reason,
    lines: po.items.map(toLine),
    taxPct: po.taxPct ?? 0,
    signRole: sample.signRole,
  }
}
