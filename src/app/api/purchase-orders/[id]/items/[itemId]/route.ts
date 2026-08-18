import { withTenant, jsonBody } from '@/services/http'
import { updatePurchaseOrderItem, removePurchaseOrderItem } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; itemId: string } }

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const po = await updatePurchaseOrderItem(ctx, params.id, params.itemId, await jsonBody(req))
  return Response.json({ ok: true, po })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  const po = await removePurchaseOrderItem(ctx, params.id, params.itemId)
  return Response.json({ ok: true, po })
})
