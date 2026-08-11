import { withTenant, jsonBody } from '@/services/http'
import { setVoyageStatus } from '@/services/master/voyage.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// PATCH /api/voyages/:id/status { status } → transisi lifecycle tanpa kirim ulang field lain.
export const PATCH = withTenant(async (ctx, req, { params }: Ctx) => {
  const body = await jsonBody(req)
  const voyage = await setVoyageStatus(ctx, params.id, String(body.status ?? ''))
  return Response.json({ ok: true, voyage })
})
