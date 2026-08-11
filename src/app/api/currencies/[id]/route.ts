import { withTenant, jsonBody } from '@/services/http'
import { getCurrency, removeCurrency, updateCurrency } from '@/services/master/currency.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await getCurrency(ctx, params.id)),
)

export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const currency = await updateCurrency(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, currency })
})

export const DELETE = withTenant(async (ctx, _req, { params }: Ctx) => {
  await removeCurrency(ctx, params.id)
  return Response.json({ ok: true })
})
