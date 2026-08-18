import { withTenant, jsonBody } from '@/services/http'
import { convertRequisitionToOrder } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/purchase-orders/[id]/convert-to-po { vendorId } — [id] = PR sumber (harus APPROVED).
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const po = await convertRequisitionToOrder(ctx, params.id, body.vendorId)
  return Response.json({ ok: true, po }, { status: 201 })
})
