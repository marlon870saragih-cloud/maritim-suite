import { withTenant, jsonBody } from '@/services/http'
import { getCustomer, removeCustomer, updateCustomer } from '@/services/master/customer.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getCustomer(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const customer = await updateCustomer(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, customer })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeCustomer(ctx, params.id)
  return Response.json({ ok: true })
})
