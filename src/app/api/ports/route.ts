// ⭐ ROUTE RUJUKAN — pola untuk semua endpoint Master Data di Fase 1.
//
// Bandingkan dengan api/vessels/route.ts (pola lama): tidak ada lagi blok
// getServerSession + cek 401 + `where: { tenantId }` yang ditulis tangan.
// Semua itu ditangani withTenant() dan forTenant() di dalam service.

import { withTenant, jsonBody } from '@/services/http'
import { createPort, listPorts } from '@/services/master/port.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/ports?cari=samarinda&semua=1
export const GET = withTenant(async (ctx, req) => {
  const url = new URL(req.url)
  const ports = await listPorts(ctx, {
    cari: url.searchParams.get('cari'),
    termasukNonAktif: url.searchParams.get('semua') === '1',
  })
  return Response.json(ports)
})

// POST /api/ports
export const POST = withTenant(async (ctx, req) => {
  const port = await createPort(ctx, await jsonBody(req))
  return Response.json({ ok: true, port }, { status: 201 })
})
