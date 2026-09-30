import { withTenant, jsonBody, jejakDari } from '@/services/http'
import { listVoyageVessels, setVoyageVessels } from '@/services/master/voyage-vessel.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/voyages/:id/vessels → kapal-kapal voyage (kapal utama selalu ada, isPrimary=true).
export const GET = withTenant(async (ctx, _req, { params }: Ctx) =>
  Response.json(await listVoyageVessels(ctx, params.id)),
)

// PUT /api/voyages/:id/vessels  body { vessels: [{ vesselId, role: 'TUG'|'BARGE'|null }] } — ganti seluruh daftar.
export const PUT = withTenant(async (ctx, req, { params }: Ctx) => {
  const vessels = await setVoyageVessels(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, vessels })
})
