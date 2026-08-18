import { withTenant, jsonBody } from '@/services/http'
import { getPurchaseOrder, updatePurchaseOrder, removePurchaseOrder } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await getPurchaseOrder(ctx, params.id)))

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const po = await updatePurchaseOrder(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, po })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removePurchaseOrder(ctx, params.id)
  return Response.json({ ok: true })
})
