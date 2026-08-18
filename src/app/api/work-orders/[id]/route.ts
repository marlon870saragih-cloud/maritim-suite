import { withTenant, jsonBody } from '@/services/http'
import { getWorkOrder, updateWorkOrder, removeWorkOrder } from '@/services/ops/workorder.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) => Response.json(await getWorkOrder(ctx, params.id)))

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const wo = await updateWorkOrder(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, wo })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeWorkOrder(ctx, params.id)
  return Response.json({ ok: true })
})
