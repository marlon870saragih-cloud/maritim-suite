import { withTenant, jsonBody } from '@/services/http'
import { createCurrency, listCurrencies } from '@/services/master/currency.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/currencies?semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const currencies = await listCurrencies(ctx, {
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(currencies)
})

// POST /api/currencies
export const POST = withTenant(async (ctx, req) => {
  const currency = await createCurrency(ctx, await jsonBody(req))
  return Response.json({ ok: true, currency }, { status: 201 })
})
