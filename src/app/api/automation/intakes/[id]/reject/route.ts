import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { rejectIntake } from '@/services/intake/intake.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/intakes/[id]/reject { version, reason }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const intake = await rejectIntake(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, intake })
})
