// Automation Hub — voyage yang dipantau (PRD-002 Step 5B).
// Pagar tenant-allowlist + peran ada di service (requireAutomation).

import { jsonBody, withTenant } from '@/services/http'
import { listPemantauan, mulaiPemantauan } from '@/services/automation/monitoring.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/automation/monitored-voyages → { pemantauan, bisaDipantau }
export const GET = withTenant(async (ctx) => Response.json(await listPemantauan(ctx)))

// POST /api/automation/monitored-voyages { voyageId }
export const POST = withTenant(async (ctx, req) => {
  const hasil = await mulaiPemantauan(ctx, await jsonBody(req))
  return Response.json({ ok: true, ...hasil }, { status: 201 })
})
