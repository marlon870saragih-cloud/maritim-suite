import { withTenant, jsonBody } from '@/services/http'
import { createWorkOrder, listWorkOrders } from '@/services/ops/workorder.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/work-orders?voyageId=&status=
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(await listWorkOrders(ctx, { voyageId: q.get('voyageId'), status: q.get('status') }))
})

// POST /api/work-orders { voyageId, vendorId, serviceId?, scope, plannedStart?, plannedEnd?, agreedAmount?, currency?, notes? }
export const POST = withTenant(async (ctx, req) => {
  const wo = await createWorkOrder(ctx, await jsonBody(req))
  return Response.json({ ok: true, wo }, { status: 201 })
})
