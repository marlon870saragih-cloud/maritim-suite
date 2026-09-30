import { jejakDari, jsonBody, withTenant } from '@/services/http'
import { approveIntake } from '@/services/intake/intake.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/intakes/[id]/approve { version, duplicateDecision?, decisionReason?, duplicateConfirmed?, portalExposureAck? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const intake = await approveIntake(ctx, params.id, await jsonBody(req), jejakDari(req))
  return Response.json({ ok: true, intake })
})
