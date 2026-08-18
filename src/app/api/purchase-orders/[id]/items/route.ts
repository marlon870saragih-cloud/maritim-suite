import { withTenant, jsonBody } from '@/services/http'
import { addPurchaseOrderItem } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/purchase-orders/[id]/items { description, quantity, unit?, unitPrice }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const po = await addPurchaseOrderItem(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, po }, { status: 201 })
})
