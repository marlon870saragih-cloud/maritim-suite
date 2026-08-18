// PurchaseOrder/PurchaseRequisition (K117, Fase 7i) — daftar & buat.

import { withTenant, jsonBody } from '@/services/http'
import { createPurchaseOrder, listPurchaseOrders } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/purchase-orders?voyageId=&kind=&status=&vendorId=
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listPurchaseOrders(ctx, {
      voyageId: q.get('voyageId'),
      kind: q.get('kind'),
      status: q.get('status'),
      vendorId: q.get('vendorId'),
    }),
  )
})

// POST /api/purchase-orders { kind, voyageId?, vendorId?, currency?, taxPct?, deliveryTo?, neededBy?, terms?, notes? }
export const POST = withTenant(async (ctx, req) => {
  const po = await createPurchaseOrder(ctx, await jsonBody(req))
  return Response.json({ ok: true, po }, { status: 201 })
})
