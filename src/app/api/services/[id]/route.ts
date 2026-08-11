import { withTenant, jsonBody } from '@/services/http'
import {
  getServiceCatalog,
  removeServiceCatalog,
  updateServiceCatalog,
} from '@/services/master/service-catalog.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getServiceCatalog(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const service = await updateServiceCatalog(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, service })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeServiceCatalog(ctx, params.id)
  return Response.json({ ok: true })
})
