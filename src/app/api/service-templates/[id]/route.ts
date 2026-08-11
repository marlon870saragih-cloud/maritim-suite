import { withTenant, jsonBody } from '@/services/http'
import {
  getServiceTemplate,
  removeServiceTemplate,
  updateServiceTemplate,
} from '@/services/master/service-template.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getServiceTemplate(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const template = await updateServiceTemplate(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, template })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeServiceTemplate(ctx, params.id)
  return Response.json({ ok: true })
})
