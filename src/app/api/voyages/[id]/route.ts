import { withTenant, jsonBody } from '@/services/http'
import { getVoyage, removeVoyage, updateVoyage } from '@/services/master/voyage.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getVoyage(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const voyage = await updateVoyage(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, voyage })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeVoyage(ctx, params.id)
  return Response.json({ ok: true })
})
