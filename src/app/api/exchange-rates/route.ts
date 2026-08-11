import { withTenant, jsonBody } from '@/services/http'
import { createExchangeRate, listExchangeRates } from '@/services/master/exchange-rate.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/exchange-rates?from=USD&to=IDR&limit=50
// Log kurs — tak ada endpoint update/delete, lihat catatan di exchange-rate.service.ts.
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const limit = url.searchParams.get('limit')
  const rates = await listExchangeRates(ctx, {
    fromCurrency: url.searchParams.get('from'),
    toCurrency: url.searchParams.get('to'),
    limit: limit ? Number(limit) : undefined,
  })
  return Response.json(rates)
})

// POST /api/exchange-rates → catat kurs baru (tidak mengubah yang lama).
export const POST = withTenant(async (ctx, req) => {
  const rate = await createExchangeRate(ctx, await jsonBody(req))
  return Response.json({ ok: true, rate }, { status: 201 })
})
