import { withTenant, jsonBody } from '@/services/http'
import { setPurchaseOrderStatus } from '@/services/ops/purchase.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/purchase-orders/[id]/status { status } — APPROVED ditolak, lihat approvals/ di bawah.
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const po = await setPurchaseOrderStatus(ctx, params.id, body.status)
  return Response.json({ ok: true, po })
})
