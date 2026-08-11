import { withTenant, jsonBody } from '@/services/http'
import { createVendor, listVendors } from '@/services/master/vendor.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/vendors?cari=pilot&semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const vendors = await listVendors(ctx, {
    cari: url.searchParams.get('cari'),
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(vendors)
})

// POST /api/vendors
export const POST = withTenant(async (ctx, req) => {
  const vendor = await createVendor(ctx, await jsonBody(req))
  return Response.json({ ok: true, vendor }, { status: 201 })
})
