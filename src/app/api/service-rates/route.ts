import { withTenant, jsonBody } from '@/services/http'
import { createServiceRate, listServiceRates } from '@/services/master/service-rate.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/service-rates?serviceId=xxx&portId=yyy
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const rates = await listServiceRates(ctx, {
    serviceId: url.searchParams.get('serviceId'),
    portId: url.searchParams.get('portId'),
  })
  return Response.json(rates)
})

// POST /api/service-rates
export const POST = withTenant(async (ctx, req) => {
  const rate = await createServiceRate(ctx, await jsonBody(req))
  return Response.json({ ok: true, rate }, { status: 201 })
})
