import { withTenant, jsonBody } from '@/services/http'
import { getPort, removePort, updatePort } from '@/services/master/port.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getPort(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const port = await updatePort(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, port })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removePort(ctx, params.id)
  return Response.json({ ok: true })
})
