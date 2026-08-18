import { withTenant, jsonBody } from '@/services/http'
import { setWorkOrderStatus } from '@/services/ops/workorder.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const wo = await setWorkOrderStatus(ctx, params.id, body.status)
  return Response.json({ ok: true, wo })
})
