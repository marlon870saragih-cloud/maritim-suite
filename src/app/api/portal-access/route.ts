// Daftar akses portal aktif (K166/K168) — sisi INTERNAL, sesi staf biasa.

import { withTenant } from '@/services/http'
import { listPortalAccess } from '@/services/portal/access.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/portal-access?customerId=&vendorId=
export const GET = withTenant(async (ctx, req) => {
  const q = new URL(req.url).searchParams
  return Response.json(
    await listPortalAccess(ctx, { customerId: q.get('customerId'), vendorId: q.get('vendorId') }),
  )
})
