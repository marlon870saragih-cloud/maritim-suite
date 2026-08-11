import { withTenant, jsonBody } from '@/services/http'
import {
  getServiceRate,
  removeServiceRate,
  updateServiceRate,
} from '@/services/master/service-rate.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getServiceRate(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const rate = await updateServiceRate(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, rate })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeServiceRate(ctx, params.id)
  return Response.json({ ok: true })
})
