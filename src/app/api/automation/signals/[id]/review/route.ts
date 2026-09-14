import { jsonBody, withTenant } from '@/services/http'
import { reviewSinyal } from '@/services/automation/monitoring.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// POST /api/automation/signals/[id]/review { decision: ACKNOWLEDGE|DISMISS, note? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const sinyal = await reviewSinyal(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, sinyal })
})
