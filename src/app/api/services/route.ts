import type { ServiceCategory } from '@prisma/client'
import { withTenant, jsonBody } from '@/services/http'
import { createServiceCatalog, listServiceCatalog } from '@/services/master/service-catalog.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/services?cari=pilot&kategori=MARINE_SERVICES&semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const kategori = url.searchParams.get('kategori')
  const services = await listServiceCatalog(ctx, {
    cari: url.searchParams.get('cari'),
    kategori: kategori as ServiceCategory | null,
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(services)
})

// POST /api/services
export const POST = withTenant(async (ctx, req) => {
  const service = await createServiceCatalog(ctx, await jsonBody(req))
  return Response.json({ ok: true, service }, { status: 201 })
})
