import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { linkExistingIntake } from '@/services/intake/intake.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/intakes/[id]/link { version, voyageId, reason? } — tidak membuat voyage
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const intake = await linkExistingIntake(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, intake })
})
