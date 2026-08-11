import { withTenant, jsonBody } from '@/services/http'
import { getVendor, removeVendor, updateVendor } from '@/services/master/vendor.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getVendor(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const vendor = await updateVendor(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, vendor })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeVendor(ctx, params.id)
  return Response.json({ ok: true })
})
