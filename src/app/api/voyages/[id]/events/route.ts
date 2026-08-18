// Peristiwa satu voyage (K130, Fase 7g) — daftar & catat.

import { withTenant, jsonBody } from '@/services/http'
import { createVoyageEvent, listVoyageEvents } from '@/services/ops/voyage-event.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

// GET /api/voyages/[id]/events
export const GET = withTenant(async (ctx, _req, { params }: Ctx) => {
  return Response.json(await listVoyageEvents(ctx, params.id))
})

// POST /api/voyages/[id]/events { eventCode, occurredAt, portCallId?, description?, remarks? }
export const POST = withTenant(async (ctx, req, { params }: Ctx) => {
  const peristiwa = await createVoyageEvent(ctx, params.id, await jsonBody(req))
  return Response.json({ ok: true, peristiwa }, { status: 201 })
})
