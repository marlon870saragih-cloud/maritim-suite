import { withTenant, jsonBody } from '@/services/http'
import { createCustomer, listCustomers } from '@/services/master/customer.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/customers?cari=soechi&semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const customers = await listCustomers(ctx, {
    cari: url.searchParams.get('cari'),
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(customers)
})

// POST /api/customers
export const POST = withTenant(async (ctx, req) => {
  const customer = await createCustomer(ctx, await jsonBody(req))
  return Response.json({ ok: true, customer }, { status: 201 })
})
